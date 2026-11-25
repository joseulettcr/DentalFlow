-- DentalFlow — Datos sintéticos de demostración (T-02).
--
-- Todos los datos son FICTICIOS (spec.md RB-09). No contiene pacientes, correos reales,
-- credenciales ni datos de personal: las cuentas de personal se crean aparte
-- (ver supabase/README.md y supabase/staff_profiles.example.sql).
--
-- Es idempotente: puede ejecutarse varias veces sin duplicar filas. Requiere que las
-- migraciones ya estén aplicadas.

-- Odontólogos (spec.md §10). Identificadores fijos para que la demo y las pruebas sean reproducibles.
insert into public.doctors (id, full_name, specialty, is_active)
values
  ('a1000000-0000-4000-8000-000000000001', 'Dra. Ana Morales', 'Odontología general', true),
  ('a1000000-0000-4000-8000-000000000002', 'Dr. Carlos Rojas', 'Ortodoncia',          true)
on conflict (id) do nothing;

-- Horarios semanales en hora local de America/Costa_Rica. Horario predeterminado del proyecto para TODOS los odontólogos
-- (el mismo de shared/schedule.ts):
--   lunes a viernes 08:00–17:00 y sábados 09:00–13:00; domingo cerrado.
-- La restricción de no superposición hace que repetir el seed no duplique franjas. Si una base ya tenía otro horario,
-- este seed no lo pisa: usa "Restablecer horario predeterminado" en /admin/odontologos.
insert into public.weekly_schedules (doctor_id, weekday, start_time, end_time)
select d.id, s.weekday, s.start_time, s.end_time
from (
  values
    ('a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000002'::uuid)
) as d (id)
cross join (
  select w as weekday, time '08:00' as start_time, time '17:00' as end_time from generate_series(1, 5) as w
  union all
  select 6, time '09:00', time '13:00'
) as s
on conflict do nothing;

-- Nota: no se siembran solicitudes ni citas. Sus fechas dependen del momento de la demo
-- (ventana de 1 hora a 30 días) y se crean por la aplicación con correos de dominio reservado
-- example.com, por ejemplo paciente1@example.com.
