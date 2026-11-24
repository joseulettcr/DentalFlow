-- T-08 · Migración 8 — Reserva telefónica directa (RF-04).
--
-- Contrato: spec.md RF-04 (CA-04a..f), RB-05, RB-10, RB-11 y CA-05b (auditoría).
-- No modifica las migraciones 1 a 7 (ya aplicadas). Agrega SOLO una función.
--
-- Por qué una función y no un INSERT desde el backend: la cita y su registro de auditoría deben guardarse en una
-- única transacción (si falla uno, no queda el otro), la clave de idempotencia debe resolverse de forma atómica
-- aunque dos envíos compitan, y el conflicto de horario debe salir como un error controlado. La garantía de
-- no superposición sigue siendo la restricción appointments_no_overlap (migración 6), incluso bajo concurrencia.
--
-- Errores controlados: SQLSTATE P0001; el MENSAJE es el código estable; DETAIL es el motivo interno.
--   IDEMPOTENCY_KEY_REUSED  misma clave con datos distintos                      -> 409
--   SLOT_UNAVAILABLE        el bloque ya tiene una cita confirmada del odontólogo -> 409
--   VALIDATION_ERROR        odontólogo inactivo o inicio en el pasado             -> 422
-- La validación de formato, franja semanal y ventana RB-03 la hace el backend con las reglas de disponibilidad.
-- SECURITY INVOKER + search_path vacío + EXECUTE solo para service_role (mismo criterio que las migraciones 6 y 7).

create or replace function public.create_phone_appointment(
  p_doctor_id       uuid,
  p_patient_name    text,
  p_patient_email   text,
  p_patient_phone   text,
  p_starts_at       timestamptz,
  p_idempotency_key uuid,
  p_actor_user_id   uuid default null
)
returns table (
  appointment_id     uuid,
  appointment_status text,
  replayed           boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.appointments%rowtype;
  v_id       uuid;
  v_ends     timestamptz := p_starts_at + interval '30 minutes';
begin
  -- (1) Idempotencia (CA-04d, RB-10): la clave ya existe.
  select * into v_existing from public.appointments a where a.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.source = 'admin_phone'
       and v_existing.doctor_id = p_doctor_id
       and v_existing.patient_name = p_patient_name
       and v_existing.patient_email = p_patient_email
       and v_existing.patient_phone is not distinct from p_patient_phone
       and v_existing.starts_at = p_starts_at then
      return query select v_existing.id, v_existing.status, true;
      return;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001', detail = 'same_key_different_data';
  end if;

  -- (2) Odontólogo activo e inicio en el futuro (la ventana de 1 hora a 30 días la valida el backend).
  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'doctor_inactive';
  end if;
  if p_starts_at <= now() then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'starts_in_past';
  end if;

  -- (3) Inserta confirmada. appointments_no_overlap decide quién gana si dos reservas compiten por el bloque.
  begin
    insert into public.appointments (
      doctor_id, patient_name, patient_email, patient_phone,
      starts_at, ends_at, status, source, idempotency_key, created_by_user_id
    ) values (
      p_doctor_id, p_patient_name, p_patient_email, p_patient_phone,
      p_starts_at, v_ends, 'confirmed', 'admin_phone', p_idempotency_key, p_actor_user_id
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001', detail = 'overlapping_confirmed_appointment';
    when unique_violation then
      -- Dos envíos con la misma clave compitieron: el segundo reutiliza la cita del primero.
      select * into v_existing from public.appointments a where a.idempotency_key = p_idempotency_key;
      if found
         and v_existing.source = 'admin_phone'
         and v_existing.doctor_id = p_doctor_id
         and v_existing.patient_name = p_patient_name
         and v_existing.patient_email = p_patient_email
         and v_existing.patient_phone is not distinct from p_patient_phone
         and v_existing.starts_at = p_starts_at then
        return query select v_existing.id, v_existing.status, true;
        return;
      end if;
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001', detail = 'same_key_different_data';
  end;

  -- (4) Auditoría en la misma transacción (CA-05b).
  insert into public.appointment_audit (appointment_id, action, actor_user_id, from_status, to_status)
  values (v_id, 'created', p_actor_user_id, null, 'confirmed');

  return query select v_id, 'confirmed'::text, false;
end;
$$;

comment on function public.create_phone_appointment(uuid, text, text, text, timestamptz, uuid, uuid) is
  'RF-04: crea una cita confirmada de origen telefónico con auditoría, idempotente. Solo service_role. Errores: IDEMPOTENCY_KEY_REUSED, SLOT_UNAVAILABLE, VALIDATION_ERROR (SQLSTATE P0001).';

revoke all on function public.create_phone_appointment(uuid, text, text, text, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_phone_appointment(uuid, text, text, text, timestamptz, uuid, uuid) to service_role;
