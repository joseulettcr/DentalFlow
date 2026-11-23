-- DentalFlow — Comprobaciones de SOLO LECTURA después de aplicar la migración 20261123000000 (T-03).
-- Ejecutar completo en Supabase Dashboard > SQL Editor (una sola consulta, una fila por comprobación).
-- No modifica datos ni esquema. ok = true significa que el resultado es el esperado.

with fn as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'approve_appointment_request'
)
select 1 as n, 'Restricción appointments_no_overlap (EXCLUDE gist) presente' as comprobacion,
       count(*) = 1 as ok, coalesce(max(pg_get_constraintdef(oid)), 'no encontrada') as detalle
from pg_constraint
where conname = 'appointments_no_overlap' and conrelid = 'public.appointments'::regclass and contype = 'x'

union all
select 2, 'La exclusión solo cubre citas confirmadas y usa doctor_id + tstzrange [)',
       count(*) = 1, coalesce(max(pg_get_constraintdef(oid)), 'no encontrada')
from pg_constraint
where conname = 'appointments_no_overlap'
  and pg_get_constraintdef(oid) like '%doctor_id WITH =%'
  and pg_get_constraintdef(oid) like '%tstzrange(starts_at, ends_at%'
  and pg_get_constraintdef(oid) like '%status = ''confirmed''%'

union all
select 3, 'Existe public.approve_appointment_request(uuid, uuid), SECURITY INVOKER, search_path vacío',
       count(*) = 1 and bool_and(not prosecdef) and bool_and(coalesce(proconfig @> array['search_path=""'], false)),
       coalesce(max(proconfig::text), 'sin configuración')
from fn

union all
select 4, 'Solo service_role puede ejecutar la función (anon, authenticated y PUBLIC no)',
       exists (select 1 from fn
               where has_function_privilege('service_role'::name, oid, 'EXECUTE'::text)
                 and not has_function_privilege('anon'::name, oid, 'EXECUTE'::text)
                 and not has_function_privilege('authenticated'::name, oid, 'EXECUTE'::text)
                 and not has_function_privilege('public'::name, oid, 'EXECUTE'::text)),
       'EXECUTE por rol'

union all
select 5, 'Sin funciones en public ejecutables por anon/authenticated (se mantiene RB-08/P-10)',
       count(*) = 0, 'funciones expuestas: ' || count(*)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (has_function_privilege('anon'::name, p.oid, 'EXECUTE'::text)
    or has_function_privilege('authenticated'::name, p.oid, 'EXECUTE'::text))

union all
select 6, 'Sin cambios de datos: sin citas ni solicitudes sembradas (antes de ejecutar pruebas)',
       (select count(*) from public.appointments) = 0 and (select count(*) from public.appointment_requests) = 0,
       'citas: ' || (select count(*) from public.appointments)
         || ', solicitudes: ' || (select count(*) from public.appointment_requests)
order by n;
