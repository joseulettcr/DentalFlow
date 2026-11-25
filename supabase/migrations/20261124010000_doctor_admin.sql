-- T-05 · Migración 10 — Administración de odontólogos y horarios (RF-02, CA-02a..e).
--
-- Contrato: spec.md RF-02 y RB-04. No modifica las migraciones 1 a 9 (ya aplicadas). Agrega SOLO funciones.
--
-- Por qué funciones y no escrituras sueltas desde el backend:
--   * Reemplazar el horario semanal completo es borrar e insertar varias filas: debe ser UNA transacción.
--   * CA-02d: antes de cambiar el horario hay que comprobar, con los datos reales, que ninguna cita futura
--     confirmada quede fuera de las nuevas franjas; si queda alguna, nada cambia.
--   * La no superposición de franjas la garantiza la restricción weekly_schedules_no_overlap (migración 2).
--
-- Errores controlados: SQLSTATE P0001; el MENSAJE es el código estable; DETAIL es el motivo interno.
--   NOT_FOUND          el odontólogo no existe                                          -> 404
--   VALIDATION_ERROR   franjas inválidas o superpuestas, formato de hora incorrecto      -> 422
--   SCHEDULE_CONFLICT  hay citas futuras confirmadas fuera del nuevo horario (DETAIL = JSON con inicio y paciente) -> 409
-- SECURITY INVOKER + search_path vacío + EXECUTE solo para service_role (mismo criterio que las migraciones 6 a 9).

-- ---------------------------------------------------------------------------
-- 1. Reemplaza el horario semanal de un odontólogo.
--    p_windows: arreglo JSON [{"weekday":1,"startTime":"08:00","endTime":"17:00"}, ...]; weekday 0 = domingo.
--    Un arreglo vacío deja al odontólogo sin franjas (no ofrece horarios) y es válido.
-- ---------------------------------------------------------------------------
create or replace function public.set_doctor_schedule(p_doctor_id uuid, p_windows jsonb)
returns table (window_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conflicts jsonb;
  v_count     integer;
begin
  if jsonb_typeof(p_windows) is distinct from 'array' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'windows_not_array';
  end if;

  -- Bloquea la fila del odontólogo: dos ediciones de horario del mismo odontólogo se serializan.
  perform 1 from public.doctors d where d.id = p_doctor_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', detail = 'doctor_not_found';
  end if;

  -- CA-02d: citas futuras confirmadas que quedarían fuera de las nuevas franjas (hora local de la clínica).
  begin
    select jsonb_agg(jsonb_build_object('startsAt', a.starts_at, 'patientName', a.patient_name) order by a.starts_at)
      into v_conflicts
    from public.appointments a
    where a.doctor_id = p_doctor_id
      and a.status = 'confirmed'
      and a.starts_at > now()
      and not exists (
        select 1
        from jsonb_to_recordset(p_windows) as w (weekday smallint, "startTime" text, "endTime" text)
        where w.weekday = extract(dow from (a.starts_at at time zone 'America/Costa_Rica'))::smallint
          and w."startTime"::time <= (a.starts_at at time zone 'America/Costa_Rica')::time
          and w."endTime"::time   >= (a.ends_at   at time zone 'America/Costa_Rica')::time
          and (a.ends_at at time zone 'America/Costa_Rica')::date = (a.starts_at at time zone 'America/Costa_Rica')::date
      );
  exception
    when invalid_datetime_format or invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'invalid_time_format';
  end;

  if v_conflicts is not null then
    raise exception 'SCHEDULE_CONFLICT' using errcode = 'P0001', detail = v_conflicts::text;
  end if;

  delete from public.weekly_schedules where doctor_id = p_doctor_id;

  begin
    insert into public.weekly_schedules (doctor_id, weekday, start_time, end_time)
    select p_doctor_id, w.weekday, w."startTime"::time, w."endTime"::time
    from jsonb_to_recordset(p_windows) as w (weekday smallint, "startTime" text, "endTime" text);
  exception
    when exclusion_violation then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'overlapping_windows';
    when check_violation or not_null_violation then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'invalid_window';
    when invalid_datetime_format or invalid_text_representation or datetime_field_overflow then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001', detail = 'invalid_time_format';
  end;

  select count(*)::integer into v_count from public.weekly_schedules s where s.doctor_id = p_doctor_id;
  return query select v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Alta de un odontólogo (activo) junto con su horario, en una sola transacción (CA-02a).
--    El horario inicial lo decide el backend (horario predeterminado del proyecto) y se pasa en p_windows.
--    Nombre y especialidad (2 a 100 caracteres) los valida la tabla: un valor inválido falla con 23514.
-- ---------------------------------------------------------------------------
create or replace function public.create_doctor(p_full_name text, p_specialty text, p_windows jsonb)
returns table (doctor_id uuid, window_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer;
begin
  insert into public.doctors (full_name, specialty, is_active)
  values (btrim(p_full_name), btrim(p_specialty), true)
  returning id into v_id;

  select s.window_count into v_count from public.set_doctor_schedule(v_id, p_windows) s;
  return query select v_id, v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Edición de datos y activación/desactivación (CA-02c). Nunca se elimina: is_active = false conserva el historial.
-- ---------------------------------------------------------------------------
create or replace function public.update_doctor(
  p_doctor_id uuid,
  p_full_name text,
  p_specialty text,
  p_is_active boolean
)
returns table (is_active boolean)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.doctors d
  set full_name = btrim(p_full_name),
      specialty = btrim(p_specialty),
      is_active = p_is_active
  where d.id = p_doctor_id;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001', detail = 'doctor_not_found';
  end if;

  return query select p_is_active;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privilegios: solo el backend (service_role).
-- ---------------------------------------------------------------------------
revoke all on function public.set_doctor_schedule(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_doctor(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_doctor(uuid, text, text, boolean) from public, anon, authenticated;

grant execute on function public.set_doctor_schedule(uuid, jsonb) to service_role;
grant execute on function public.create_doctor(text, text, jsonb) to service_role;
grant execute on function public.update_doctor(uuid, text, text, boolean) to service_role;
