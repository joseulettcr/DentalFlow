-- T-07/T-09A · Migración 7 — Funciones de apoyo para solicitudes públicas y su decisión.
--
-- Contrato: spec.md RF-08 (CA-08a..f), RF-09 (CA-09d), RB-10, RB-11, D-08.
-- No modifica las migraciones 1 a 6 (ya aplicadas). Agrega SOLO funciones:
--   * register_booking_attempt  — límite persistente de 10 intentos por IP cada 10 minutos (usa private.booking_rate_limits,
--                                 que la Data API no expone; por eso vive en una función ejecutable solo por service_role).
--   * create_appointment_request — alta atómica e idempotente de una solicitud 'pending' (no crea cita, no bloquea horario).
--   * reject_appointment_request — rechazo atómico con auditoría.
-- La aprobación sigue siendo public.approve_appointment_request (migración 6), sin cambios.
--
-- Errores controlados: SQLSTATE P0001; el MENSAJE es el código estable; DETAIL es el motivo interno.
-- SECURITY INVOKER + search_path vacío + EXECUTE solo para service_role (mismo criterio que la migración 6).

-- ---------------------------------------------------------------------------
-- 1. Límite persistente por clave anonimizada (nunca la IP en claro; el hash lo calcula el backend).
--    Ventanas fijas de 10 minutos; el upsert es atómico. Devuelve false cuando se superan 10 intentos.
-- ---------------------------------------------------------------------------
create or replace function public.register_booking_attempt(p_key_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window  timestamptz := date_bin('10 minutes', now(), timestamptz '2000-01-01 00:00:00+00');
  v_counter integer;
begin
  -- Limpieza barata de ventanas viejas para que la tabla no crezca sin límite.
  delete from private.booking_rate_limits where window_start < now() - interval '1 hour';

  insert into private.booking_rate_limits as b (key_hash, window_start, counter)
  values (p_key_hash, v_window, 1)
  on conflict (key_hash, window_start) do update set counter = b.counter + 1
  returning b.counter into v_counter;

  return v_counter <= 10;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Alta de solicitud pública (RF-08).
--    * Idempotente (RB-10): misma clave y mismos datos => devuelve la misma solicitud (replayed = true);
--      misma clave con datos distintos => IDEMPOTENCY_KEY_REUSED.
--    * Tope de 3 solicitudes pendientes por correo (D-08) => RATE_LIMITED (detalle pending_cap).
--    * Bloque ya ocupado por una cita confirmada => SLOT_UNAVAILABLE (CA-08c). Las solicitudes pendientes NO bloquean (RB-11).
--    * Odontólogo inactivo => VALIDATION_ERROR.
--    La validación de formato, franja semanal y ventana de reserva (RB-03/RB-04) las hace el backend antes de llamar.
-- ---------------------------------------------------------------------------
create or replace function public.create_appointment_request(
  p_doctor_id       uuid,
  p_patient_name    text,
  p_patient_email   text,
  p_patient_phone   text,
  p_starts_at       timestamptz,
  p_idempotency_key uuid
)
returns table (
  request_id     uuid,
  request_status text,
  replayed       boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.appointment_requests%rowtype;
  v_id       uuid;
  v_ends     timestamptz := p_starts_at + interval '30 minutes';
begin
  -- (1) Idempotencia: la clave ya existe.
  select * into v_existing from public.appointment_requests r where r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.doctor_id = p_doctor_id
       and v_existing.patient_name = p_patient_name
       and v_existing.patient_email = p_patient_email
       and v_existing.patient_phone is not distinct from p_patient_phone
       and v_existing.requested_starts_at = p_starts_at then
      return query select v_existing.id, v_existing.status, true;
      return;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001', detail = 'same_key_different_data';
  end if;

  -- (2) Odontólogo activo.
  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'doctor_inactive';
  end if;

  -- (3) Tope de pendientes por correo (D-08), serializado por correo para que dos envíos simultáneos no lo superen.
  perform pg_advisory_xact_lock(hashtext(lower(p_patient_email)));
  if (select count(*) from public.appointment_requests r
      where r.status = 'pending' and lower(r.patient_email) = lower(p_patient_email)) >= 3 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001', detail = 'pending_cap';
  end if;

  -- (4) Bloque ya ocupado por una cita confirmada del mismo odontólogo (CA-08c).
  if exists (
    select 1 from public.appointments a
    where a.doctor_id = p_doctor_id
      and a.status = 'confirmed'
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_starts_at, v_ends, '[)')
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001', detail = 'overlapping_confirmed_appointment';
  end if;

  -- (5) Inserta. Si dos envíos con la misma clave compiten, el segundo reutiliza la fila del primero.
  begin
    insert into public.appointment_requests (
      doctor_id, patient_name, patient_email, patient_phone,
      requested_starts_at, requested_ends_at, status, idempotency_key
    ) values (
      p_doctor_id, p_patient_name, p_patient_email, p_patient_phone,
      p_starts_at, v_ends, 'pending', p_idempotency_key
    )
    returning id into v_id;
  exception
    when unique_violation then
      select * into v_existing from public.appointment_requests r where r.idempotency_key = p_idempotency_key;
      if found
         and v_existing.doctor_id = p_doctor_id
         and v_existing.patient_name = p_patient_name
         and v_existing.patient_email = p_patient_email
         and v_existing.patient_phone is not distinct from p_patient_phone
         and v_existing.requested_starts_at = p_starts_at then
        return query select v_existing.id, v_existing.status, true;
        return;
      end if;
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001', detail = 'same_key_different_data';
  end;

  return query select v_id, 'pending'::text, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rechazo de una solicitud (CA-09d). Atómico y auditado.
--    pending -> rejected (motivo opcional <= 200). Repetir el rechazo es idempotente.
--    Rechazar una solicitud ya aprobada => REQUEST_ALREADY_DECIDED. Inexistente => NOT_FOUND.
-- ---------------------------------------------------------------------------
create or replace function public.reject_appointment_request(
  p_request_id    uuid,
  p_actor_user_id uuid default null,
  p_reason        text default null
)
returns table (
  request_status   text,
  already_rejected boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.appointment_requests%rowtype;
  v_reason  text := nullif(btrim(p_reason), '');
begin
  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'reason_too_long';
  end if;

  select * into v_request from public.appointment_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', detail = 'appointment_request_not_found';
  end if;

  if v_request.status = 'rejected' then
    return query select v_request.status, true;
    return;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_ALREADY_DECIDED' using errcode = 'P0001', detail = 'status=' || v_request.status;
  end if;

  update public.appointment_requests
  set status           = 'rejected',
      decided_by       = p_actor_user_id,
      decided_at       = now(),
      rejection_reason = v_reason
  where id = v_request.id;

  insert into public.appointment_audit (request_id, action, actor_user_id, from_status, to_status)
  values (v_request.id, 'rejected', p_actor_user_id, 'pending', 'rejected');

  return query select 'rejected'::text, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privilegios: solo el backend (service_role).
-- ---------------------------------------------------------------------------
revoke all on function public.register_booking_attempt(text) from public, anon, authenticated;
revoke all on function public.create_appointment_request(uuid, text, text, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.reject_appointment_request(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.register_booking_attempt(text) to service_role;
grant execute on function public.create_appointment_request(uuid, text, text, text, timestamptz, uuid) to service_role;
grant execute on function public.reject_appointment_request(uuid, uuid, text) to service_role;
