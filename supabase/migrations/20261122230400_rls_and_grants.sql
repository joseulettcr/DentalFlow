-- T-02 · Migración 5/5 — Row Level Security y privilegios (mínimo privilegio).
--
-- Contrato: spec.md §8 (RLS y permisos), RB-08, P-10.
--
-- Modelo de acceso:
--   * anon:          sin acceso directo a ninguna tabla. Los visitantes usan únicamente la API
--                    del backend (/api/public/*), que consulta con service_role y nunca expone
--                    datos de pacientes (CA-03d).
--   * authenticated: sin acceso a pacientes, solicitudes ni citas por la Data API. Su única
--                    excepción es leer SU PROPIA fila de staff_profiles, para que la interfaz
--                    conozca su rol (admin | receptionist) y muestre las opciones permitidas.
--   * service_role:  usado solo por el backend (nunca en el navegador). Obtiene únicamente los
--                    privilegios que necesita. La autorización fina por rol (admin vs
--                    receptionist, matriz de spec.md §1) la aplica el backend con la fila de
--                    staff_profiles; la base de datos deniega por defecto.

-- ---------------------------------------------------------------------------
-- 1. Habilitar RLS en todas las tablas (sin políticas = denegar todo a roles sujetos a RLS).
-- ---------------------------------------------------------------------------
alter table public.staff_profiles        enable row level security;
alter table public.doctors               enable row level security;
alter table public.weekly_schedules      enable row level security;
alter table public.appointment_requests  enable row level security;
alter table public.appointments          enable row level security;
alter table public.appointment_audit     enable row level security;
alter table public.calendar_sync         enable row level security;

alter table private.google_connections   enable row level security;
alter table private.oauth_states         enable row level security;
alter table private.booking_rate_limits  enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Retirar cualquier privilegio heredado para anon y authenticated.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Única excepción: el personal autenticado lee su propio perfil.
-- ---------------------------------------------------------------------------
grant select on public.staff_profiles to authenticated;

create policy staff_profiles_select_own
  on public.staff_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. service_role (solo backend): privilegios mínimos por tabla.
--    Se parte de cero para no depender de los privilegios por defecto de Supabase.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public  from service_role;
revoke all on all tables in schema private from service_role;

-- El personal se crea manualmente (Dashboard / SQL Editor); el backend solo lo consulta.
grant select                         on public.staff_profiles       to service_role;
-- Los odontólogos no se eliminan: se desactivan para conservar el historial.
grant select, insert, update         on public.doctors              to service_role;
grant select, insert, update, delete on public.weekly_schedules     to service_role;
-- Solicitudes, citas y sincronización: sin DELETE (se cancelan/rechazan, no se borran).
grant select, insert, update         on public.appointment_requests to service_role;
grant select, insert, update         on public.appointments         to service_role;
grant select, insert, update         on public.calendar_sync        to service_role;
-- Auditoría de solo anexar: sin UPDATE ni DELETE, ni siquiera para el backend.
grant select, insert                 on public.appointment_audit    to service_role;

grant select, insert, update, delete on private.google_connections  to service_role;
grant select, insert, update, delete on private.oauth_states        to service_role;
grant select, insert, update, delete on private.booking_rate_limits to service_role;
