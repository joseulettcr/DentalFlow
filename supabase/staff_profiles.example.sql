-- DentalFlow — Plantilla para enlazar cuentas de personal (NO se ejecuta automáticamente).
--
-- 1. Crea los usuarios en Supabase Dashboard > Authentication > Users > "Add user"
--    (marca "Auto Confirm User"). Usa correos ficticios, por ejemplo admin.demo@example.com
--    y recepcion.demo@example.com. La contraseña se entrega por un canal privado y
--    NUNCA se escribe en este archivo ni en el repositorio.
-- 2. Copia este archivo, reemplaza los correos y ejecútalo en SQL Editor.
--
-- Es idempotente: vuelve a asignar nombre y rol si el perfil ya existe.

insert into public.staff_profiles (user_id, display_name, role)
select u.id, 'Administrador Demo', 'admin'
from auth.users u
where u.email = 'REEMPLAZAR_CORREO_ADMIN@example.com'
on conflict (user_id) do update
  set display_name = excluded.display_name,
      role         = excluded.role;

insert into public.staff_profiles (user_id, display_name, role)
select u.id, 'Recepción Demo', 'receptionist'
from auth.users u
where u.email = 'REEMPLAZAR_CORREO_RECEPCION@example.com'
on conflict (user_id) do update
  set display_name = excluded.display_name,
      role         = excluded.role;

-- Comprobación (debe listar los dos perfiles con su rol):
select p.display_name, p.role, u.email
from public.staff_profiles p
join auth.users u on u.id = p.user_id
order by p.role;
