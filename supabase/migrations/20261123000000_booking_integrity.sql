-- T-03 · Migración 6 — Integridad de reservas: no superposición (RB-05) y aprobación atómica (RB-12).
--
-- Contrato: spec.md RF-04, RF-08, RF-09, RB-05, RB-11, RB-12, CA-04b, CA-09a..e.
-- No modifica las migraciones 1 a 5 (ya aplicadas); solo agrega una restricción y una función.

-- ---------------------------------------------------------------------------
-- 1. RB-05: dos citas CONFIRMADAS no pueden superponerse para el mismo odontólogo.
--    * Solo filas con status = 'confirmed': cancelar libera el bloque; las solicitudes
--      (appointment_requests) viven en otra tabla y nunca bloquean (RB-11).
--    * Odontólogos distintos pueden coincidir en horario (doctor_id with =).
--    * Rango semiabierto [): 08:00–08:30 y 08:30–09:00 NO se superponen.
--    * Falla con SQLSTATE 23P01 (exclusion_violation); el backend lo traduce a 409 SLOT_UNAVAILABLE.
--    btree_gist está en el esquema "extensions" (migración 1); la clase de operadores se resuelve por tipo.
-- ---------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'confirmed');

-- ---------------------------------------------------------------------------
-- 2. RB-12: aprobación atómica e idempotente de una solicitud pública.
--
--    Todo ocurre en la transacción del llamador (una función PL/pgSQL no abre transacciones propias):
--    cualquier error revierte TODO, de modo que la solicitud sigue 'pending' y no queda cita parcial (D-10).
--
--    Errores controlados (RAISE con SQLSTATE P0001; el MENSAJE es el código estable de spec.md §8,
--    el backend lo traduce a HTTP; DETAIL da el motivo interno):
--      NOT_FOUND                solicitud inexistente                        -> 404
--      REQUEST_ALREADY_DECIDED  la solicitud ya fue rechazada                -> 409
--      REQUEST_EXPIRED          el horario ya pasó (D-06)                    -> 409
--      SLOT_UNAVAILABLE         horario ocupado (exclusión 23P01), odontólogo
--                               inactivo o fuera de franja vigente (CA-09e)  -> 409
--    La ventana de 1 hora a 30 días NO se revalida aquí: solo al crear la solicitud (RB-03, D-06).
--
--    Idempotencia: si la solicitud ya está 'approved' devuelve la misma cita (already_approved = true)
--    sin insertar ni auditar de nuevo.
--
--    SECURITY INVOKER + search_path vacío: corre con los privilegios mínimos de service_role
--    (migración 5) y no puede ser secuestrada por objetos en otros esquemas.
-- ---------------------------------------------------------------------------
create or replace function public.approve_appointment_request(
  p_request_id    uuid,
  p_actor_user_id uuid default null
)
returns table (
  appointment_id   uuid,
  request_status   text,
  already_approved boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request     public.appointment_requests%rowtype;
  v_appointment public.appointments.id%type;
  v_local_start timestamp;
  v_local_end   timestamp;
begin
  -- (1) Bloqueo de la solicitud: serializa aprobaciones concurrentes de la misma solicitud.
  select * into v_request
  from public.appointment_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', detail = 'appointment_request_not_found';
  end if;

  -- (2) Idempotencia y estados finales.
  if v_request.status = 'approved' then
    return query select v_request.appointment_id, v_request.status, true;
    return;
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REQUEST_ALREADY_DECIDED' using errcode = 'P0001', detail = 'status=' || v_request.status;
  end if;

  -- (3) Revalidación (CA-09e). Solo "futuro"; no la ventana de 1 hora a 30 días (D-06).
  if v_request.requested_starts_at <= now() then
    raise exception 'REQUEST_EXPIRED' using errcode = 'P0001', detail = 'requested_starts_at_not_in_future';
  end if;

  if not exists (
    select 1 from public.doctors d where d.id = v_request.doctor_id and d.is_active
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001', detail = 'doctor_inactive';
  end if;

  -- Franja semanal vigente, en hora local de la clínica (weekday: 0 = domingo, como extract(dow)).
  v_local_start := v_request.requested_starts_at at time zone 'America/Costa_Rica';
  v_local_end   := v_request.requested_ends_at   at time zone 'America/Costa_Rica';

  if not exists (
    select 1
    from public.weekly_schedules w
    where w.doctor_id  = v_request.doctor_id
      and w.weekday    = extract(dow from v_local_start)::smallint
      and w.start_time <= v_local_start::time
      and w.end_time   >= v_local_end::time
      and v_local_end::date = v_local_start::date
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001', detail = 'outside_weekly_schedule';
  end if;

  -- (4)-(5) Inserta la cita. La restricción appointments_no_overlap decide quién gana ante
  --         concurrencia: la segunda transacción espera y luego falla con 23P01.
  begin
    insert into public.appointments (
      doctor_id, patient_name, patient_email, patient_phone,
      starts_at, ends_at, status, source, request_id, created_by_user_id
    ) values (
      v_request.doctor_id, v_request.patient_name, v_request.patient_email, v_request.patient_phone,
      v_request.requested_starts_at, v_request.requested_ends_at,
      'confirmed', 'public_request', v_request.id, p_actor_user_id
    )
    returning id into v_appointment;
  exception
    when exclusion_violation then
      raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001', detail = 'overlapping_confirmed_appointment';
  end;

  -- (6) Decisión y auditoría, en la misma transacción.
  update public.appointment_requests
  set status         = 'approved',
      appointment_id = v_appointment,
      decided_by     = p_actor_user_id,
      decided_at     = now()
  where id = v_request.id;

  insert into public.appointment_audit (appointment_id, request_id, action, actor_user_id, from_status, to_status)
  values
    (v_appointment, v_request.id, 'created',  p_actor_user_id, null,      'confirmed'),
    (v_appointment, v_request.id, 'approved', p_actor_user_id, 'pending', 'approved');

  return query select v_appointment, 'approved'::text, false;
end;
$$;

comment on function public.approve_appointment_request(uuid, uuid) is
  'RB-12: aprueba una solicitud pública de forma atómica e idempotente. Solo service_role. Errores: NOT_FOUND, REQUEST_ALREADY_DECIDED, REQUEST_EXPIRED, SLOT_UNAVAILABLE (SQLSTATE P0001, mensaje = código).';

-- ---------------------------------------------------------------------------
-- 3. Privilegios: solo el backend (service_role) puede ejecutarla (spec.md RB-12, P-10).
--    PUBLIC tiene EXECUTE por defecto en funciones nuevas; se retira explícitamente.
-- ---------------------------------------------------------------------------
revoke all on function public.approve_appointment_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_appointment_request(uuid, uuid) to service_role;
