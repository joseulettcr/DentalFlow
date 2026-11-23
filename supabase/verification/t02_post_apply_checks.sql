-- DentalFlow — Comprobaciones de SOLO LECTURA después de aplicar las migraciones y el seed (T-02).
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor (el editor muestra solo el resultado de
-- la última sentencia, por eso todo es UNA sola consulta con una fila por comprobación).
-- No modifica datos ni esquema. ok = true significa que el resultado es el esperado.
--
-- Conteos esperados (de las migraciones 1 a 5): 10 tablas, 16 claves foráneas,
-- 40 restricciones CHECK, 4 UNIQUE específicas, 12 índices secundarios.

with expected_tables (schema_name, table_name) as (
  values
    ('public',  'staff_profiles'),
    ('public',  'doctors'),
    ('public',  'weekly_schedules'),
    ('public',  'appointment_requests'),
    ('public',  'appointments'),
    ('public',  'appointment_audit'),
    ('public',  'calendar_sync'),
    ('private', 'google_connections'),
    ('private', 'oauth_states'),
    ('private', 'booking_rate_limits')
),
expected_oids as (
  select e.schema_name, e.table_name, c.oid as rel_oid, c.relrowsecurity
  from expected_tables e
  left join pg_namespace n on n.nspname = e.schema_name
  left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name and c.relkind = 'r'
),
privilege_probe as (
  -- Todas las combinaciones rol x tabla x privilegio que NO deberían existir.
  select r.role_name, e.schema_name, e.table_name, p.priv
  from expected_tables e
  cross join (values ('anon'), ('authenticated')) as r (role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                     ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv)
  where has_table_privilege(r.role_name::name, format('%I.%I', e.schema_name, e.table_name)::text, p.priv::text)
    and not (r.role_name = 'authenticated' and e.schema_name = 'public'
             and e.table_name = 'staff_profiles' and p.priv = 'SELECT')
),
checks (n, comprobacion, ok, detalle) as (
  -- 1. Existencia de las diez tablas
  select 1, 'Existen las 10 tablas (7 public + 3 private)',
         count(*) filter (where rel_oid is null) = 0,
         'faltantes: ' || coalesce(string_agg(schema_name || '.' || table_name, ', ')
                                   filter (where rel_oid is null), 'ninguna')
  from expected_oids

  union all
  -- 2. RLS activado en todas
  select 2, 'RLS habilitado en las 10 tablas',
         count(*) filter (where not coalesce(relrowsecurity, false)) = 0,
         'sin RLS: ' || coalesce(string_agg(schema_name || '.' || table_name, ', ')
                                 filter (where not coalesce(relrowsecurity, false)), 'ninguna')
  from expected_oids

  union all
  -- 3. Clave primaria en cada tabla
  select 3, 'Cada tabla tiene clave primaria',
         count(*) filter (where not exists (
           select 1 from pg_constraint k where k.conrelid = o.rel_oid and k.contype = 'p')) = 0,
         'sin PK: ' || coalesce(string_agg(o.schema_name || '.' || o.table_name, ', ')
                               filter (where not exists (
                                 select 1 from pg_constraint k where k.conrelid = o.rel_oid and k.contype = 'p')), 'ninguna')
  from expected_oids o

  union all
  -- 4. Relaciones (claves foráneas)
  select 4, '16 claves foráneas entre las tablas del modelo',
         count(*) = 16, 'encontradas: ' || count(*)
  from pg_constraint k
  where k.contype = 'f' and k.conrelid in (select rel_oid from expected_oids)

  union all
  -- 5. Restricciones CHECK (estados válidos, duración, coherencia)
  select 5, '40 restricciones CHECK',
         count(*) = 40, 'encontradas: ' || count(*)
  from pg_constraint k
  where k.contype = 'c' and k.conrelid in (select rel_oid from expected_oids)

  union all
  -- 6. Unicidades clave (idempotencia y una cita por solicitud)
  select 6, 'UNIQUE: 2 claves de idempotencia, request_id y appointment_id',
         count(*) = 4,
         'encontradas: ' || coalesce(string_agg(conname, ', ' order by conname), 'ninguna')
  from pg_constraint
  where contype = 'u'
    and conname in ('appointment_requests_idempotency_key_key', 'appointments_idempotency_key_key',
                    'appointments_request_id_key', 'appointment_requests_appointment_id_key')

  union all
  -- 7. Índices secundarios
  select 7, '12 índices secundarios definidos',
         count(*) = 12, 'encontrados: ' || count(*)
  from pg_indexes
  where indexname in (
    'weekly_schedules_doctor_weekday_idx', 'appointment_requests_status_created_idx',
    'appointment_requests_doctor_start_idx', 'appointment_requests_pending_email_idx',
    'appointments_doctor_start_idx', 'appointments_status_start_idx',
    'appointment_audit_appointment_idx', 'appointment_audit_request_idx',
    'calendar_sync_state_idx', 'google_connections_single_row_idx',
    'oauth_states_expires_idx', 'booking_rate_limits_window_idx')

  union all
  -- 8. Exclusión de franjas semanales presente
  select 8, 'Restricción weekly_schedules_no_overlap (EXCLUDE) presente',
         count(*) = 1, 'encontradas: ' || count(*)
  from pg_constraint
  where conname = 'weekly_schedules_no_overlap' and contype = 'x'

  union all
  -- 9. RB-05 todavía NO implementada (alcance de T-03). Dejará de cumplirse al aplicar T-03.
  select 9, 'RB-05 pendiente: appointments aún sin EXCLUDE (esperado hasta T-03)',
         count(*) = 0, 'exclusiones en appointments: ' || count(*)
  from pg_constraint
  where conrelid = 'public.appointments'::regclass and contype = 'x'

  union all
  -- 10. Políticas RLS: solo la lectura del propio perfil
  select 10, 'Única política RLS: staff_profiles_select_own',
         count(*) = 1 and bool_and(policyname = 'staff_profiles_select_own'),
         'políticas: ' || coalesce(string_agg(tablename || '.' || policyname, ', '), 'ninguna')
  from pg_policies
  where schemaname in ('public', 'private')

  union all
  -- 11. anon y authenticated: sin privilegios inesperados sobre ninguna tabla
  select 11, 'anon/authenticated sin privilegios (salvo SELECT propio en staff_profiles)',
         count(*) = 0,
         'inesperados: ' || coalesce(string_agg(role_name || ' ' || priv || ' ' || schema_name || '.' || table_name, '; '), 'ninguno')
  from privilege_probe

  union all
  -- 12. Datos de pacientes: ni a nivel de tabla ni de columna
  select 12, 'anon/authenticated NO pueden leer appointments ni appointment_requests',
         not (
           has_any_column_privilege('anon'::name,          'public.appointments'::text,         'SELECT'::text) or
           has_any_column_privilege('authenticated'::name, 'public.appointments'::text,         'SELECT'::text) or
           has_any_column_privilege('anon'::name,          'public.appointment_requests'::text, 'SELECT'::text) or
           has_any_column_privilege('authenticated'::name, 'public.appointment_requests'::text, 'SELECT'::text)
         ),
         'incluye privilegios por columna'

  union all
  -- 13. Funciones del esquema public no ejecutables por roles de la API
  select 13, 'Sin funciones en public ejecutables por anon/authenticated',
         count(*) = 0, 'funciones expuestas: ' || count(*)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon'::name, p.oid, 'EXECUTE'::text)
      or has_function_privilege('authenticated'::name, p.oid, 'EXECUTE'::text))

  union all
  -- 14. service_role: auditoría de solo anexar y sin DELETE en datos de negocio
  select 14, 'service_role: auditoría solo SELECT/INSERT; sin DELETE en citas, solicitudes, odontólogos, sincronización',
         has_table_privilege('service_role'::name, 'public.appointment_audit'::text, 'SELECT'::text)
           and has_table_privilege('service_role'::name, 'public.appointment_audit'::text, 'INSERT'::text)
           and not has_table_privilege('service_role'::name, 'public.appointment_audit'::text, 'UPDATE'::text)
           and not has_table_privilege('service_role'::name, 'public.appointment_audit'::text, 'DELETE'::text)
           and not has_table_privilege('service_role'::name, 'public.appointments'::text, 'DELETE'::text)
           and not has_table_privilege('service_role'::name, 'public.appointment_requests'::text, 'DELETE'::text)
           and not has_table_privilege('service_role'::name, 'public.doctors'::text, 'DELETE'::text)
           and not has_table_privilege('service_role'::name, 'public.calendar_sync'::text, 'DELETE'::text),
         'ver migración 5'

  union all
  -- 15. El esquema private no figura entre los esquemas expuestos de la Data API
  select 15, 'Esquema private NO expuesto por la Data API',
         not exists (
           select 1 from pg_roles r, unnest(r.rolconfig) as cfg
           where r.rolname = 'authenticator'
             and cfg like 'pgrst.db_schemas=%'
             and cfg ~ '(^|[=,[:space:]])private([,[:space:]]|$)'),
         coalesce((select cfg from pg_roles r, unnest(r.rolconfig) as cfg
                   where r.rolname = 'authenticator' and cfg like 'pgrst.db_schemas=%' limit 1),
                  'pgrst.db_schemas no definido en este rol (revisar Dashboard > Settings > API)')

  union all
  -- 16. Seed: datos sintéticos esperados
  select 16, 'Seed: 2 odontólogos y 20 franjas semanales',
         (select count(*) from public.doctors) = 2 and (select count(*) from public.weekly_schedules) = 20,
         'odontólogos: ' || (select count(*) from public.doctors)
           || ', franjas: ' || (select count(*) from public.weekly_schedules)

  union all
  -- 17. Sin solicitudes ni citas sembradas
  select 17, 'Sin solicitudes ni citas sembradas',
         (select count(*) from public.appointment_requests) = 0
           and (select count(*) from public.appointments) = 0,
         'solicitudes: ' || (select count(*) from public.appointment_requests)
           || ', citas: ' || (select count(*) from public.appointments)
)
select n, comprobacion, ok, detalle
from checks
order by n;
