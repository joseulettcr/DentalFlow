# DentalFlow — Base de datos (Supabase Cloud)

Migraciones y datos sintéticos de **T-02**. Entorno principal: **Supabase Cloud**; no se requiere Docker ni Supabase local (`spec.md` §6, decisión D-02).

> Estado: T-02 completada (2026-11-23). Migraciones y seed aplicados en DentalFlow-Test y DentalFlow (desarrollo); verificación SQL 17/17 y P-10 (8 pruebas) aprobadas en pruebas. Evidencia detallada en `plan.md` (fila T-02) y `docs/uso-ia.md` §3.3.

## Contenido

| Archivo | Propósito |
|---|---|
| `migrations/20261122230000_extensions_and_schemas.sql` | `btree_gist`, esquema `private`, privilegios por defecto restrictivos, función `private.set_updated_at()` |
| `migrations/20261122230100_staff_doctors_schedules.sql` | `staff_profiles`, `doctors`, `weekly_schedules` (sin franjas superpuestas) |
| `migrations/20261122230200_requests_appointments.sql` | `appointment_requests`, `appointments`, `appointment_audit`, `calendar_sync` |
| `migrations/20261122230300_private_tables.sql` | `private.google_connections`, `private.oauth_states`, `private.booking_rate_limits` |
| `migrations/20261122230400_rls_and_grants.sql` | RLS en todas las tablas y privilegios mínimos por rol de base de datos |
| `seed.sql` | 2 odontólogos y sus horarios (datos ficticios, idempotente) |
| `staff_profiles.example.sql` | Plantilla para enlazar las cuentas `admin` y `receptionist` (no se ejecuta sola) |
| `verification/t02_post_apply_checks.sql` | Comprobaciones de solo lectura posteriores a la aplicación |

Quedan **fuera de T-02**, a propósito: la restricción `EXCLUDE` de no superposición de citas (RB-05) y la función `approve_appointment_request` (RB-12), que son T-03.

## Aplicar en Supabase Cloud

Requisitos: Supabase CLI instalada y el proyecto ya vinculado (`supabase link`). Usa un proyecto **nuevo y vacío** (D-02: uno de desarrollo y otro de pruebas).

1. **Revisar qué se aplicará** (no modifica nada):
   ```bash
   supabase db push --dry-run
   ```
   Debe listar las 5 migraciones `20261122230000` a `20261122230400`.
2. **Aplicar las migraciones** (modifica el proyecto remoto; hazlo solo con autorización):
   ```bash
   supabase db push
   ```
3. **Cargar el seed.** Opción A: pegar `seed.sql` en *Dashboard > SQL Editor* y ejecutarlo. Opción B: `supabase db push --include-seed` si tu versión de la CLI lo soporta (`supabase db push --help`). Es idempotente.
4. **Crear las cuentas de personal** en *Dashboard > Authentication > Users* (marca *Auto Confirm User*), con correos ficticios. La contraseña se entrega por un canal privado y no se guarda en el repositorio. Luego ejecuta una copia editada de `staff_profiles.example.sql` en el SQL Editor.
5. **Verificar:** ejecuta `verification/t02_post_apply_checks.sql` completo en el SQL Editor (es una sola consulta de solo lectura, con una fila por comprobación); las 17 filas deben mostrar `ok = true`. La fila 9 (RB-05 pendiente) dejará de cumplirse a propósito cuando se aplique T-03.
6. **Revisar la Data API** en *Dashboard > Settings > API*: el esquema `private` **no** debe figurar en *Exposed schemas*.

Las claves (`SUPABASE_SERVICE_ROLE_KEY`, etc.) van solo en `.env.local` y en las variables de entorno de Vercel; nunca en Git ni en variables `VITE_*`.

### Reproducir en un proyecto nuevo
Repite los pasos 1 a 6 sobre el proyecto nuevo (con `supabase link --project-ref <ref>`). Las migraciones no dependen de datos previos. No hay migraciones *down*: para repetir una prueba, crea otro proyecto o elimina las tablas manualmente desde el SQL Editor.

## Modelo de acceso (RLS)

| Rol de base de datos | Acceso |
|---|---|
| `anon` (visitante) | Ninguno. Los visitantes usan `/api/public/*`, que consulta con `service_role` y nunca devuelve datos de pacientes. |
| `authenticated` (personal con sesión) | Solo `SELECT` de **su propia** fila en `staff_profiles` (para conocer su rol). Sin acceso a pacientes, solicitudes ni citas por la Data API (P-10). |
| `service_role` (solo backend) | Privilegios mínimos por tabla; sin `DELETE` en solicitudes, citas, odontólogos ni sincronización; `appointment_audit` solo `SELECT` e `INSERT`. |

La diferencia entre `admin` y `receptionist` (matriz de `spec.md` §1) la aplica el **backend**, comprobando `staff_profiles.role` en cada llamada (RF-01, CA-01c). La base de datos deniega por defecto y no concede a ningún usuario autenticado acceso directo a datos de pacientes.

## Reglas de datos que aplica la base de datos

- Citas y solicitudes de **30 minutos** exactos, alineadas a `:00` o `:30` (RB-01).
- Estados válidos: solicitudes `pending | approved | rejected`; citas `confirmed | cancelled | completed`; origen `admin_phone | public_request`; sincronización `pending | synced | failed | delete_pending | deleted`.
- Coherencia: una solicitud aprobada enlaza su cita (y solo una, `UNIQUE`); `source = public_request` si y solo si hay `request_id`; las fechas de cancelación y finalización solo existen en su estado.
- Claves de idempotencia `UNIQUE` (RB-10); obligatoria en reservas telefónicas.
- Franjas semanales sin superposición por odontólogo y día (CA-02b).

**No** las aplica la base de datos, sino el backend: la ventana de reserva de 1 hora a 30 días (RB-03, depende del reloj), la pertenencia del intervalo a una franja activa (RB-04), los topes por correo y el límite de 10 intentos por IP.

## Prueba P-10 (anon no accede a pacientes ni solicitudes)

Prueba de integración de **solo lectura** ([tests/integration/p10-anon-data-api.test.ts](../tests/integration/p10-anon-data-api.test.ts)): con la clave pública envía `GET` a la Data API y exige que `appointments` y `appointment_requests` respondan `401/403` (tabla, columna `patient_email` y conteo), que el esquema `private` no sea accesible y que no se devuelvan filas. Incluye un control (`/auth/v1/health` = 200) para no confundir una URL o clave mal escritas con una denegación real, y se niega a correr con una clave `service_role` o `sb_secret_`. No escribe datos.

1. En *Dashboard > Settings > API* de **DentalFlow-Test** copia la *Project URL* y la clave **anon / publishable** (nunca la `service_role`).
2. Guárdalas en `.env.local` (ignorado por Git):
   ```bash
   VITE_SUPABASE_URL=https://wzglkfidjcgaukmezyhi.supabase.co
   VITE_SUPABASE_ANON_KEY=<clave anon o publishable>
   ```
3. Ejecuta:
   ```bash
   npm run test:p10
   ```
   Sin esas variables la prueba falla con un mensaje explícito (no se omite en silencio). `npm test` no la incluye porque requiere red y un proyecto Cloud.

Alcance: solo el rol `anon`. El rol `authenticated` (con sesión) se prueba en T-04/T-14.

## Otras pruebas que requieren las migraciones aplicadas

`verification/t02_post_apply_checks.sql` (SQL Editor) y las pruebas de integración de T-03 (concurrencia) y T-14 (RLS con sesión, límites de uso).
