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
| `verification/t02_post_apply_checks.sql` | Comprobaciones de solo lectura posteriores a la aplicación (T-02) |
| `migrations/20261123000000_booking_integrity.sql` | T-03: `appointments_no_overlap` y `approve_appointment_request` |
| `verification/t03_post_apply_checks.sql` | Comprobaciones de solo lectura de T-03 |

Quedan **fuera de T-02**, a propósito: la restricción `EXCLUDE` de no superposición de citas (RB-05) y la función `approve_appointment_request` (RB-12), que son T-03 (ver su sección más abajo).

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
5. **Verificar:** ejecuta `verification/t02_post_apply_checks.sql` completo en el SQL Editor (es una sola consulta de solo lectura, con una fila por comprobación); las 17 filas deben mostrar `ok = true`. La fila 9 (RB-05 pendiente) dejará de cumplirse a propósito cuando se aplique T-03; usa entonces `verification/t03_post_apply_checks.sql`.
6. **Revisar la Data API** en *Dashboard > Settings > API*: el esquema `private` **no** debe figurar en *Exposed schemas*.

Las claves (`SUPABASE_SERVICE_ROLE_KEY`, etc.) van solo en `.env.local` y en las variables de entorno de Vercel; nunca en Git ni en variables `VITE_*`.

### Reproducir en un proyecto nuevo
Repite los pasos 1 a 6 sobre el proyecto nuevo (con `supabase link --project-ref <ref>`). Las migraciones no dependen de datos previos. No hay migraciones *down*: para repetir una prueba, crea otro proyecto o elimina las tablas manualmente desde el SQL Editor.

## Usuarios de demostración y login (T-04)

Las cuentas **no se crean automáticamente** (CA-01d: nunca desde la aplicación). Se crean a mano en el proyecto que uses (primero DentalFlow-Test):

1. *Dashboard > Authentication > Users > Add user > Create new user*: correo ficticio (por ejemplo `admin.demo@example.com` y `recepcion.demo@example.com`), contraseña propia y *Auto Confirm User* activado. La contraseña se entrega por un canal privado y no se escribe en el repositorio.
2. Copia `staff_profiles.example.sql`, reemplaza los dos correos y ejecútalo en el *SQL Editor*; debe listar los dos perfiles con roles `admin` y `receptionist`.
3. En `.env.local` (ignorado por Git) deben existir, para el **mismo** proyecto: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (esta última solo la lee el backend; nunca va en `VITE_*`). En Vercel se configuran como variables de entorno del proyecto.
4. `npm run dev` y abre `http://localhost:3000/login`.

Comprobación manual sugerida:

| Caso | Resultado esperado |
|---|---|
| Visitar `/admin/citas` sin sesión | Redirige a `/login` |
| Correo o contraseña incorrectos | Mensaje "Correo o contraseña incorrectos." |
| Ingresar como `admin` | Panel con las 10 opciones habilitadas |
| Ingresar como `receptionist` | Panel; "Crear o editar odontólogos y franjas" y "Conectar o desconectar Google Calendar" marcadas "solo administrador" |
| Cuenta creada en Auth pero **sin** fila en `staff_profiles` | Pantalla "Sin permiso" |
| Cerrar sesión | Vuelve a `/login`; `/admin/citas` ya no abre |
| `curl localhost:3000/api/admin/me` sin token | `401 UNAUTHENTICATED` |

## Solicitudes públicas y aprobación (migración `20261123010000_public_requests.sql`)

**Estado: escrita y validada en un Postgres local en memoria (31 comprobaciones); todavía NO aplicada a Supabase Cloud.** Solo agrega funciones; no modifica las migraciones 1 a 6.

| Función (solo `service_role`) | Propósito |
|---|---|
| `register_booking_attempt(key_hash)` | Límite persistente de 10 intentos por clave anonimizada cada 10 minutos (usa `private.booking_rate_limits`, que la Data API no expone) |
| `create_appointment_request(...)` | Alta atómica e idempotente de una solicitud `pending`: clave repetida con los mismos datos devuelve la misma; con datos distintos `IDEMPOTENCY_KEY_REUSED`; tope de 3 pendientes por correo (`RATE_LIMITED`); bloque con cita confirmada `SLOT_UNAVAILABLE` |
| `reject_appointment_request(id, actor, reason)` | Rechazo atómico y auditado; repetir es idempotente; una solicitud aprobada da `REQUEST_ALREADY_DECIDED` |

La aprobación sigue siendo `approve_appointment_request` (T-03). El backend nunca duplica sus reglas: solo la llama por RPC y traduce el código (`SLOT_UNAVAILABLE`, `REQUEST_EXPIRED`, `REQUEST_ALREADY_DECIDED` → 409, `NOT_FOUND` → 404). El límite por correo responde `429 RATE_LIMITED` (decisión propuesta; `spec.md` no fija el código).

### Aplicar y probar (primero DentalFlow-Test, con autorización)
1. `supabase db push --dry-run` debe listar solo `20261123010000`; luego `supabase db push`.
2. Opcional: `npm run test:t07` (requiere `SUPABASE_DB_URL` de **pruebas**; usa datos ficticios y los elimina).
3. Opcional en `.env.local`: `RATE_LIMIT_SALT=<texto aleatorio>` (clave del HMAC de la IP; si falta se usa una derivada de la clave de servicio).

### Demostración en el navegador (`npm run dev`, proyecto con la migración aplicada)
1. Abre `/disponibilidad`, elige un odontólogo y una fecha de lunes a viernes dentro de 30 días, y pulsa un horario.
2. Completa nombre, correo (`@example.com`) y teléfono opcional y envía. Debe aparecer "Solicitud recibida", el **número de solicitud** y la aclaración de que aún no es una cita confirmada. El horario sigue apareciendo libre al volver a consultarlo.
3. Reenviar el mismo formulario sin cambios devuelve la misma solicitud (no crea otra).
4. Inicia sesión como `receptionist` o `admin`; en `/admin/citas`, "Solicitudes pendientes" muestra la solicitud. Pulsa **Aprobar**: aparece el aviso verde y la cita en "Citas confirmadas próximas"; la solicitud desaparece de pendientes.
5. Conflicto: haz dos solicitudes del mismo horario (con correos distintos), aprueba una y luego la otra: la segunda muestra "el horario ya está ocupado" y sigue pendiente; recházala con **Rechazar**.
6. Vuelve a `/disponibilidad`: el horario aprobado ya no aparece.

## Reserva telefónica directa (migración `20261123020000_phone_appointments.sql`)

**Estado: escrita y validada en un Postgres local en memoria (18 comprobaciones); todavía NO aplicada a Supabase Cloud.** Solo agrega una función; no modifica las migraciones 1 a 7.

**Por qué hace falta una migración:** la cita y su auditoría deben guardarse en una sola transacción, la clave de idempotencia debe resolverse de forma atómica aunque dos envíos compitan, y el conflicto de horario debe salir como error controlado. Un `INSERT` desde el backend no da esas garantías. La no superposición sigue siendo la restricción `appointments_no_overlap` (T-03).

`public.create_phone_appointment(doctor, nombre, correo, teléfono, inicio, clave_idempotencia, actor)` (solo `service_role`): crea la cita `confirmed` con `source = 'admin_phone'` y `created_by_user_id`, registra la auditoría (`created`), y devuelve la misma cita si la clave se repite con los mismos datos. Errores: `IDEMPOTENCY_KEY_REUSED` (409), `SLOT_UNAVAILABLE` (409), `VALIDATION_ERROR` (422: odontólogo inactivo o inicio en el pasado). El backend (`POST /api/admin/appointments`) valida primero formato, franja semanal, ventana de reserva y ocupación, con las mismas reglas de la disponibilidad pública.

### Aplicar y probar (primero DentalFlow-Test, con autorización)
1. `supabase db push --dry-run` debe listar solo `20261123020000`; luego `supabase db push`.
2. Opcional: `npm run test:t08` (requiere `SUPABASE_DB_URL` de **pruebas**; usa datos ficticios y los elimina; incluye 6 reservas simultáneas del mismo bloque).

### Validación manual en el navegador (`npm run dev`, proyecto con la migración aplicada)
1. Inicia sesión como `receptionist` o `admin` y abre `/admin/citas`.
2. En **Nueva cita telefónica** elige odontólogo, una fecha de lunes a viernes dentro de 30 días y un horario libre; escribe nombre, correo (`@example.com`) y teléfono opcional; pulsa **Confirmar cita**.
3. Debe aparecer el aviso "Cita confirmada…", la cita en **Citas confirmadas próximas** (etiquetada "reserva telefónica") y el horario ya no debe aparecer libre ni en este formulario ni en `/disponibilidad`.
4. Conflicto: en otra pestaña con sesión, reserva el mismo horario antes de confirmar en la primera; la segunda muestra "Ese horario ya no está disponible" y refresca los horarios.
5. Una solicitud pública pendiente de ese mismo horario sigue existiendo; al aprobarla muestra "el horario ya está ocupado".
6. Sin sesión, `curl -X POST localhost:3000/api/admin/appointments` responde `401`.

## Cancelar y completar citas (migración `20261124000000_appointment_status.sql`)

**Estado: escrita y validada en un Postgres local en memoria (21 comprobaciones); todavía NO aplicada a Supabase Cloud.** Solo agrega una función; no modifica las migraciones 1 a 8.

**Por qué hace falta una migración:** el cambio de estado y su registro en `appointment_audit` deben ser una sola transacción, y la fila se bloquea (`FOR UPDATE`) para que dos operaciones simultáneas sobre la misma cita se serialicen. Un `UPDATE` desde el backend no da esas garantías.

`public.change_appointment_status(cita, acción, actor)` (solo `service_role`):

| Acción | Permitida desde | Resultado | Si no |
|---|---|---|---|
| `cancel` | `confirmed` | `cancelled` (`cancelled_at`, `cancelled_by`), libera el bloque (`appointments_no_overlap` solo cubre `confirmed`) | `completed` → `INVALID_TRANSITION` |
| `complete` | `confirmed` **y ya terminada** | `completed` (`completed_at`, `completed_by`) | cancelada o aún no terminada → `INVALID_TRANSITION` |

Repetir la misma acción sobre el estado ya alcanzado es idempotente (200, `alreadyInState: true`, sin nueva auditoría). Cita inexistente → `NOT_FOUND` (404); acción inválida → `VALIDATION_ERROR` (422). Cancelar una cita confirmada cuya hora ya pasó está permitido (no se realizó).

API: `PATCH /api/admin/appointments/:id` con `{ "action": "cancel" | "complete" }` (permiso `appointments.cancel_complete`, validado en el servidor). `GET /api/admin/appointments` conserva su comportamiento y acepta el parámetro opcional `?scope=completable` (confirmadas ya terminadas, candidatas a completar).

### Aplicar y probar (primero DentalFlow-Test, con autorización)
1. `supabase db push --dry-run` debe listar solo `20261124000000`; luego `supabase db push`.
2. Opcional: `npm run test:t09` (requiere `SUPABASE_DB_URL` de **pruebas**, y las migraciones 8 y 9; datos ficticios que se eliminan; incluye 5 cancelaciones simultáneas y la carrera cancelar contra completar).

### Validación manual en el navegador (proyecto con la migración aplicada)
1. Crea en `/admin/nueva-cita` una cita futura (por ejemplo, de mañana).
2. En `/admin/citas`, sección **Próximas citas**, pulsa **Cancelar**: aparece la confirmación "¿Cancelar la cita de …?"; pulsa **No, volver** (no pasa nada) y luego **Cancelar** otra vez y **Sí, cancelar cita**. Debe aparecer el aviso verde y la cita desaparecer de la lista.
3. En `/disponibilidad` (o en Nueva cita) el horario cancelado vuelve a aparecer libre y se puede reservar de nuevo.
4. **Completar:** solo aplica a citas que ya terminaron, que la interfaz muestra en **Por cerrar (ya terminaron)**. Para probarlo sin esperar, en el SQL Editor de **pruebas** (no en Desarrollo) inserta una cita confirmada con fecha pasada o ajusta temporalmente una de prueba; luego pulsa **Completar** y comprueba que desaparece de la lista.
5. Verifica la auditoría: `select action, from_status, to_status, actor_user_id, occurred_at from public.appointment_audit order by occurred_at desc limit 5;` debe mostrar `cancelled` o `completed` con el actor.
6. Sin sesión, `curl -X PATCH localhost:3000/api/admin/appointments/<id>` responde `401`.

## Modelo de acceso (RLS)

| Rol de base de datos | Acceso |
|---|---|
| `anon` (visitante) | Ninguno. Los visitantes usan `/api/public/*`, que consulta con `service_role` y nunca devuelve datos de pacientes. |
| `authenticated` (personal con sesión) | Solo `SELECT` de **su propia** fila en `staff_profiles` (para conocer su rol). Sin acceso a pacientes, solicitudes ni citas por la Data API (P-10). |
| `service_role` (solo backend) | Privilegios mínimos por tabla; sin `DELETE` en solicitudes, citas, odontólogos ni sincronización; `appointment_audit` solo `SELECT` e `INSERT`. |

La diferencia entre `admin` y `receptionist` (matriz de `spec.md` §1) la aplica el **backend**, comprobando `staff_profiles.role` en cada llamada (RF-01, CA-01c). La base de datos deniega por defecto y no concede a ningún usuario autenticado acceso directo a datos de pacientes.

## T-03 — Integridad de reservas (migración `20261123000000_booking_integrity.sql`)

**Estado: completada (2026-11-23). Aplicada en DentalFlow-Test y DentalFlow (desarrollo); `npm run test:t03` con 17 pruebas aprobadas en pruebas (informado por el responsable).** No modifica las migraciones 1 a 5.

- **RB-05:** `appointments_no_overlap`, `EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')`. Falla con SQLSTATE `23P01` (el backend lo traduce a `409 SLOT_UNAVAILABLE`). Odontólogos distintos pueden coincidir; cancelar libera el bloque; las solicitudes pendientes viven en otra tabla y nunca bloquean (RB-11).
- **RB-12:** `public.approve_appointment_request(p_request_id uuid, p_actor_user_id uuid default null)` devuelve `(appointment_id, request_status, already_approved)`. Bloquea la solicitud con `SELECT … FOR UPDATE`, es idempotente (repetir devuelve la misma cita), revalida futuro, odontólogo activo y franja semanal, inserta la cita, actualiza la solicitud y audita, todo en la transacción del llamador. `SECURITY INVOKER`, `search_path` vacío, `EXECUTE` solo para `service_role`.
- **Errores controlados** (`SQLSTATE P0001`, el *mensaje* es el código; `DETAIL` el motivo interno): `NOT_FOUND` → 404; `REQUEST_ALREADY_DECIDED` (rechazada) → 409; `REQUEST_EXPIRED` (horario pasado) → 409; `SLOT_UNAVAILABLE` → 409 (detalles `overlapping_confirmed_appointment`, `doctor_inactive`, `outside_weekly_schedule`). Ante cualquier error la solicitud sigue `pending` (D-10) y no queda cita parcial.
- **Decisión aprobada (2026-11-23, registrada en `spec.md` CA-09e):** odontólogo inactivo o fuera de franja al aprobar → `SLOT_UNAVAILABLE` con el motivo en `DETAIL`.

### Procedimiento (primero en DentalFlow-Test, con autorización)
1. `supabase db push --dry-run` debe listar solo `20261123000000`; luego `supabase db push` contra DentalFlow-Test.
2. Ejecutar `verification/t03_post_apply_checks.sql` en el SQL Editor: 6 filas con `ok = true`.
3. Agregar a `.env.local` la cadena de conexión Postgres de **DentalFlow-Test** (*Dashboard > Connect*, modo sesión o directa; contiene la contraseña, nunca va a Git):
   ```bash
   SUPABASE_DB_URL=postgresql://postgres.<ref>:<contraseña>@<host>:5432/postgres
   ```
   La prueba se niega a correr si la URL no contiene el *ref* de pruebas (`wzglkfidjcgaukmezyhi`, o `SUPABASE_TEST_PROJECT_REF`).
4. `npm run test:t03`. Inserta solo datos ficticios (`@example.com`, fechas de 2031) y los elimina al terminar. Incluye concurrencia real (5 aprobaciones simultáneas de una solicitud y 2 solicitudes del mismo bloque, cada una en su propia conexión).
5. Solo después, repetir los pasos 1 y 2 en DentalFlow (desarrollo).

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
