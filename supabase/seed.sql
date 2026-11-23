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

-- Horarios semanales, lunes (1) a viernes (5), en hora local de America/Costa_Rica:
--   Dra. Ana Morales: 08:00–12:00 y 13:00–17:00
--   Dr. Carlos Rojas: 09:00–12:00 y 14:00–17:00
-- La restricción de no superposición hace que repetir el seed no duplique franjas.
insert into public.weekly_schedules (doctor_id, weekday, start_time, end_time)
select s.doctor_id, w.weekday, s.start_time, s.end_time
from (
  values
    ('a1000000-0000-4000-8000-000000000001'::uuid, time '08:00', time '12:00'),
    ('a1000000-0000-4000-8000-000000000001'::uuid, time '13:00', time '17:00'),
    ('a1000000-0000-4000-8000-000000000002'::uuid, time '09:00', time '12:00'),
    ('a1000000-0000-4000-8000-000000000002'::uuid, time '14:00', time '17:00')
) as s (doctor_id, start_time, end_time)
cross join generate_series(1, 5) as w (weekday)
on conflict do nothing;

-- Nota: no se siembran solicitudes ni citas. Sus fechas dependen del momento de la demo
-- (ventana de 1 hora a 30 días) y se crean por la aplicación con correos de dominio reservado
-- example.com, por ejemplo paciente1@example.com.
