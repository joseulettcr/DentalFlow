-- T-02 · Migración 2/5 — Personal, odontólogos y horarios semanales.
--
-- Contrato: spec.md §1 (roles), §5 (staff_profiles, doctors, weekly_schedules), RF-01, RF-02.
-- Los datos no contienen información clínica.

-- ---------------------------------------------------------------------------
-- staff_profiles: personal autenticado (Supabase Auth). Roles: admin | receptionist.
-- Las cuentas se crean manualmente (Dashboard > Authentication) y luego se enlazan aquí;
-- no existe registro público de personal (CA-01d).
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role         text not null,
  created_at   timestamptz not null default now(),

  constraint staff_profiles_display_name_len
    check (char_length(btrim(display_name)) between 2 and 100),
  constraint staff_profiles_role_valid
    check (role in ('admin', 'receptionist'))
);

comment on table public.staff_profiles is
  'Personal autorizado. role: admin | receptionist. La autorización la aplica el backend según la matriz de spec.md §1.';

-- ---------------------------------------------------------------------------
-- doctors: entidad de agenda (no es un usuario con portal en el MVP).
-- Nunca se eliminan: is_active=false conserva el historial (CA-02c).
-- ---------------------------------------------------------------------------
create table public.doctors (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  specialty  text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),

  constraint doctors_full_name_len
    check (char_length(btrim(full_name)) between 2 and 100),
  constraint doctors_specialty_len
    check (char_length(btrim(specialty)) between 2 and 100)
);

comment on table public.doctors is
  'Odontólogos (entidad de agenda). Sin datos clínicos. is_active=false los oculta de nuevas solicitudes y citas.';

-- ---------------------------------------------------------------------------
-- weekly_schedules: franjas semanales por odontólogo. weekday 0..6 (0 = domingo).
-- Varias franjas por día; se prohíbe superposición (CA-02b).
-- ---------------------------------------------------------------------------
create table public.weekly_schedules (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors (id) on delete cascade,
  weekday    smallint not null,
  start_time time not null,
  end_time   time not null,

  constraint weekly_schedules_weekday_range
    check (weekday between 0 and 6),
  constraint weekly_schedules_end_after_start
    check (end_time > start_time),

  -- Dos franjas del mismo odontólogo y día no pueden solaparse. Las horas locales se
  -- proyectan sobre una fecha fija para poder usar un rango (tsrange).
  constraint weekly_schedules_no_overlap
    exclude using gist (
      doctor_id with =,
      weekday   with =,
      tsrange(
        date '2000-01-01' + start_time,
        date '2000-01-01' + end_time,
        '[)'
      ) with &&
    )
);

create index weekly_schedules_doctor_weekday_idx
  on public.weekly_schedules (doctor_id, weekday);

comment on table public.weekly_schedules is
  'Franjas semanales de atención en hora local de America/Costa_Rica (spec.md RB-02, RB-04).';
