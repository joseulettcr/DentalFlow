-- T-09 · Migración 9 — Cancelar y completar citas (CA-05b, CA-05c, RB-06).
--
-- Contrato: spec.md RF-05 y RB-06. No modifica las migraciones 1 a 8 (ya aplicadas). Agrega SOLO una función.
--
-- Por qué una función y no un UPDATE desde el backend: el cambio de estado y su registro en appointment_audit deben
-- ser una única transacción; la fila se bloquea (FOR UPDATE) para que dos operaciones simultáneas sobre la misma cita
-- se serialicen (la repetida no duplica la auditoría) y las transiciones se validan contra el estado real, no contra
-- lo que el navegador creía.
--
-- Reglas:
--   cancelar  : confirmed -> cancelled (cancelled_at, cancelled_by). Libera el bloque: la restricción
--               appointments_no_overlap solo cubre status = 'confirmed' (migración 6).
--   completar : confirmed -> completed (completed_at, completed_by) solo si la cita ya terminó (ends_at <= now()).
--   repetir la misma acción sobre el estado ya alcanzado es idempotente (no cambia nada ni audita de nuevo).
--   cualquier otra transición (cancelada -> completar, completada -> cancelar, completar una cita futura) => INVALID_TRANSITION.
--
-- Errores controlados: SQLSTATE P0001; el MENSAJE es el código estable; DETAIL es el motivo interno.
--   NOT_FOUND            la cita no existe                      -> 404
--   INVALID_TRANSITION   transición no permitida                -> 409
--   VALIDATION_ERROR     acción distinta de cancel o complete   -> 422
-- SECURITY INVOKER + search_path vacío + EXECUTE solo para service_role (mismo criterio que las migraciones 6 a 8).

create or replace function public.change_appointment_status(
  p_appointment_id uuid,
  p_action         text,
  p_actor_user_id  uuid default null
)
returns table (
  appointment_status text,
  already_in_state   boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
begin
  if p_action is null or p_action not in ('cancel', 'complete') then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'invalid_action';
  end if;

  select * into v_appt from public.appointments a where a.id = p_appointment_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', detail = 'appointment_not_found';
  end if;

  if p_action = 'cancel' then
    if v_appt.status = 'cancelled' then
      return query select v_appt.status, true;
      return;
    end if;
    if v_appt.status <> 'confirmed' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001', detail = 'status=' || v_appt.status;
    end if;

    update public.appointments
    set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_user_id
    where id = v_appt.id;

    insert into public.appointment_audit (appointment_id, action, actor_user_id, from_status, to_status)
    values (v_appt.id, 'cancelled', p_actor_user_id, 'confirmed', 'cancelled');

    return query select 'cancelled'::text, false;
    return;
  end if;

  -- complete
  if v_appt.status = 'completed' then
    return query select v_appt.status, true;
    return;
  end if;
  if v_appt.status <> 'confirmed' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001', detail = 'status=' || v_appt.status;
  end if;
  if v_appt.ends_at > now() then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001', detail = 'not_finished_yet';
  end if;

  update public.appointments
  set status = 'completed', completed_at = now(), completed_by = p_actor_user_id
  where id = v_appt.id;

  insert into public.appointment_audit (appointment_id, action, actor_user_id, from_status, to_status)
  values (v_appt.id, 'completed', p_actor_user_id, 'confirmed', 'completed');

  return query select 'completed'::text, false;
end;
$$;

comment on function public.change_appointment_status(uuid, text, uuid) is
  'CA-05b/CA-05c: cancela o completa una cita con auditoría, atómico e idempotente. Solo service_role. Errores: NOT_FOUND, INVALID_TRANSITION, VALIDATION_ERROR (SQLSTATE P0001).';

revoke all on function public.change_appointment_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.change_appointment_status(uuid, text, uuid) to service_role;
