# DentalFlow — spec.md

**Versión:** 0.2 — especificación objetivo (alineamiento T-00), no implementación validada

**Ámbito:** clínica odontológica simulada, una sede, zona horaria `America/Costa_Rica`

**Tecnología:** React + TypeScript + Vite; Vercel Functions (Node/TypeScript); Supabase Auth + PostgreSQL (**Supabase Cloud**, sin Docker obligatorio); Google Calendar API

**Fuente de verdad de citas:** Supabase PostgreSQL.

> Convención de estado: todo lo descrito aquí está **especificado, no implementado**. Las decisiones D-01 a D-10 (ver `plan.md` §10) fueron **aprobadas por el responsable del proyecto el 2026-11-22**; siguen sujetas a revisión si la implementación demuestra que son inviables.

## Cambios respecto de v0.1 (resumen de trazabilidad)

| Cambio | Detalle |
|---|---|
| `POST /api/appointments` (público y personal) | Reemplazado por `POST /api/public/appointment-requests` (público) y `POST /api/admin/appointments` (reserva telefónica). |
| RF-04 | Ahora es la **reserva telefónica directa** por personal. La reserva pública pasa a RF-08 (solicitud) y RF-09 (aprobación). |
| Nuevos | RF-08, RF-09, RF-10; RB-11, RB-12, RB-13; CA-06f, CA-06g; P-11 a P-16. |
| Datos | Nuevas `appointment_requests`, `appointment_audit`, `private.oauth_states`; columnas nuevas en `appointments`. |
| Códigos HTTP | Validación = `422` siempre; conflictos de estado = `409`. |
| Entorno | `supabase db reset/start/test db` (requieren Docker) reemplazados por migraciones sobre Supabase Cloud y pruebas de integración. |

## 1. Actores, fronteras y permisos

- **Visitante/paciente:** puede ver odontólogos activos, consultar horarios libres y **registrar una solicitud de cita**; no puede leer el directorio de pacientes, las solicitudes ni las reservas de otros, y no puede consultar el estado de su solicitud (ver limitación en §10).
- **Personal autenticado (`receptionist`):** registra citas telefónicas, aprueba o rechaza solicitudes, consulta citas y cambia estados, según la matriz.
- **Administrador (`admin`):** además, gestiona odontólogos y horarios y administra la conexión de Google Calendar. En v1 se habilitará inicialmente una sola cuenta `admin` y una `receptionist` de demostración, creadas manualmente; no se desarrollará un módulo de gestión de usuarios.
- **Google Calendar:** sistema externo de calendario, **no** fuente de disponibilidad ni de datos clínicos.

El paciente **no necesita login**. No se almacenan expedientes ni motivos clínicos. Los recordatorios se simulan; no sale ninguna notificación real al paciente.

### Matriz de permisos

Leyenda: **✔ confirmado** por el responsable del proyecto; **✔ (aprobado D-04/D-05)** = permiso o denegación propuesto por el asistente y aprobado por el responsable el 2026-11-22.

| Acción | Público | `receptionist` | `admin` |
|---|---|---|---|
| Ver odontólogos activos y horarios libres | ✔ | — | — |
| Crear solicitud de cita (`appointment_requests`) | ✔ | — | — |
| Crear cita telefónica directa | — | ✔ | ✔ |
| Listar solicitudes; aprobar o rechazar | — | ✔ (personal autorizado) | ✔ |
| Listar y consultar citas (incluye datos del paciente) | — | ✔ (aprobado D-04/D-05) | ✔ |
| Cancelar / completar cita | — | ✔ (aprobado D-04/D-05) | ✔ |
| Ver odontólogos y franjas (panel) | — | ✔ (aprobado D-04/D-05; solo lectura) | ✔ |
| Crear/editar odontólogos y franjas | — | ✔ (aprobado D-04/D-05; denegado) | ✔ |
| Conectar / desconectar / reconectar Google Calendar | — | ✔ (aprobado D-04/D-05; denegado) | ✔ |
| Ver estado de Google y de sincronización | — | ✔ (aprobado D-04/D-05) | ✔ |
| Reintentar sincronización de una cita | — | ✔ (aprobado D-04/D-05) | ✔ |
| Recordatorios simulados y estado del sistema (`system-status`) | — | ✔ (aprobado D-04/D-05) | ✔ |
| Crear/gestionar usuarios del personal | — | — | — (manual en Supabase) |

Regla de autorización: un usuario autenticado cuya cuenta no tenga fila en `staff_profiles`, o cuyo rol no alcance la acción, recibe `403 FORBIDDEN`; sin token válido, `401 UNAUTHENTICATED`.

## 2. Flujos de negocio extremo a extremo

### Flujo A — Reserva telefónica directa (personal)

1. El personal inicia sesión en el dashboard.
2. Elige odontólogo, fecha y bloque de 30 minutos disponible y registra los datos del paciente.
3. La API valida datos, horario y disponibilidad **al guardar**.
4. PostgreSQL confirma la cita (`source='admin_phone'`) sin permitir intervalos superpuestos del mismo odontólogo.
5. La cita aparece en el dashboard; el sistema intenta crear el evento en Google Calendar y deja visible el estado de sincronización.
6. Un intento sobre un bloque ya ocupado obtiene `409 SLOT_UNAVAILABLE` sin crear otra cita.

### Flujo B — Solicitud pública con aprobación

1. El visitante consulta odontólogos y horarios libres (sin datos de pacientes).
2. Selecciona odontólogo, fecha y hora, e ingresa nombre, correo y teléfono opcional.
3. La API valida y registra una fila en `appointment_requests` con estado `pending`. **No** se crea una cita y **no** se bloquea el horario (RB-11).
4. El personal autorizado ve las solicitudes pendientes y las aprueba o rechaza.
5. Al aprobar, una función transaccional en PostgreSQL vuelve a comprobar disponibilidad y crea la cita en `appointments` (`source='public_request'`, `request_id` enlazado) (RB-12).
6. Si el horario sigue libre: la solicitud pasa a `approved`, la cita queda `confirmed` y se sincroniza con Google Calendar tras el commit.
7. Si el horario ya está ocupado: respuesta `409 SLOT_UNAVAILABLE`, no se crea cita y la solicitud permanece `pending` para que el personal la rechace.
8. Aprobar dos veces la misma solicitud (o concurrentemente) devuelve la misma cita; nunca crea otra.

### Flujo C — Cancelación y Google

1. El personal cancela una cita confirmada; el bloque se libera en DentalFlow y se registra en `appointment_audit`.
2. Se solicita eliminar el evento asociado en Google; si Google no responde, queda `delete_pending` visible.

## 3. Requisitos funcionales y criterios de aceptación

### RF-01 — Autenticación del personal

**Comportamiento:** login/logout con Supabase Auth; vistas `/admin/*` protegidas; roles `admin` y `receptionist`.

- **CA-01a:** dada una cuenta de personal válida, al iniciar sesión aparece el dashboard con las opciones permitidas por su rol.
- **CA-01b:** sin sesión, visitar `/admin/citas` redirige a `/login`; una petición directa a una API administrativa responde `401 UNAUTHENTICATED`.
- **CA-01c:** un usuario autenticado sin fila en `staff_profiles`, o con un rol que no alcanza la acción (matriz §1), recibe `403 FORBIDDEN`; el servidor no confía solamente en restricciones visuales del frontend.
- **CA-01d:** ninguna cuenta de personal puede crearse desde el formulario público.

### RF-02 — Odontólogos y horarios

**Comportamiento:** alta/edición de odontólogos, campo de especialidad y estado activo; configuración por día de semana de franjas de atención (por ejemplo, lunes 08:00–12:00 y 13:00–17:00). Escritura exclusiva de `admin` [P para `receptionist`: solo lectura].

- **CA-02a:** el administrador crea a `Dra. Ana Morales` y configura lunes 08:00–12:00; ese profesional aparece como elegible en la página pública.
- **CA-02b:** una franja con fin anterior o igual al inicio, o que se superpone con otra franja del mismo profesional/día, se rechaza con `422` y mensaje claro.
- **CA-02c:** un odontólogo inactivo no se ofrece para nuevas solicitudes ni citas, sin eliminar el historial.
- **CA-02d:** una edición que deje citas futuras confirmadas fuera del nuevo horario se rechaza con `409` y explica qué reservas requieren atención.
- **CA-02e:** un usuario `receptionist` que intente crear o editar odontólogos o franjas recibe `403 FORBIDDEN` y no se modifica nada.

### RF-03 — Consulta de disponibilidad

**Comportamiento:** odontólogo y fecha determinan una lista de horas locales disponibles en bloques exactos de 30 minutos.

- **CA-03a:** un lunes con horario 08:00–09:00 y sin citas ofrece 08:00 y 08:30, siempre que cumplan la anticipación mínima.
- **CA-03b:** después de confirmar 08:00–08:30, una nueva consulta no muestra 08:00 para ese odontólogo. Una solicitud **pendiente** no oculta el bloque (RB-11).
- **CA-03c:** una fecha válida y dentro de la ventana sin franjas (por ejemplo, sábado o domingo sin horario) responde `200` con `slots: []`; una fecha con formato inválido, pasada o más allá de 30 días responde `422 VALIDATION_ERROR`.
- **CA-03d:** solo se exponen identificador, nombre, especialidad y horas libres; nunca nombres ni correos de pacientes.

### RF-04 — Reserva telefónica directa por personal

**Comportamiento:** el personal registra una cita con nombre y correo del paciente, teléfono opcional, odontólogo y bloque; la cita queda `confirmed` si el horario es válido y libre; luego se sincroniza con Google.

- **CA-04a:** con datos válidos y bloque libre, la API devuelve `201` con ID de confirmación, odontólogo, fecha, hora y estado `confirmada`; la fila (`source='admin_phone'`, `created_by_user_id`) es recuperable desde otra sesión de personal.
- **CA-04b:** dos solicitudes concurrentes para el mismo odontólogo e intervalo producen **exactamente una cita confirmada**; la otra recibe `409 SLOT_UNAVAILABLE`.
- **CA-04c:** un correo inválido, nombre vacío, profesional inactivo, bloque fuera de horario o fecha pasada devuelve `422 VALIDATION_ERROR` con código estable y **no** crea registros.
- **CA-04d:** reenviar el mismo `idempotencyKey` y los mismos datos devuelve la misma cita sin duplicarla; reutilizar la clave con datos distintos devuelve `409 IDEMPOTENCY_KEY_REUSED`.
- **CA-04e:** una falla de Google Calendar no revierte una cita ya confirmada en PostgreSQL; queda `pending/failed` de sincronización y se informa al personal.
- **CA-04f:** una reserva telefónica respeta la misma validación de franjas y la ventana de reserva definida en RB-03.

### RF-05 — Dashboard y ciclo de vida de citas

**Comportamiento:** el panel muestra agenda por fecha/odontólogo, detalle, estados y acciones autorizadas.

- **CA-05a:** una cita creada por reserva telefónica o por aprobación de una solicitud aparece en la vista administrativa tras refrescar la página.
- **CA-05b:** el personal puede cancelar una cita confirmada, liberando el intervalo para una nueva reserva; la operación queda registrada en `appointment_audit` (actor, acción, estados anterior y nuevo, fecha) y en `cancelled_at`/`cancelled_by`.
- **CA-05c:** una cita confirmada que ya terminó puede marcarse `completada` (se registra `completed_at`/`completed_by`); no se completan citas futuras ni se reactivan canceladas desde la UI. Una transición inválida devuelve `409 INVALID_TRANSITION`.
- **CA-05d:** pacientes anónimos no pueden listar citas ni solicitudes ni alterar estados.

### RF-06 — Integración **real** con Google Calendar

**Comportamiento:** el administrador autoriza una cuenta personal de Google de demostración mediante OAuth 2.0 server-side; se crea un evento al confirmar una cita y se elimina al cancelarla; reintento manual, indicador de sincronización, desconexión y reconexión.

- **CA-06a:** el administrador conecta el calendario de prueba y ve `Conectado` sin que se expongan tokens en el navegador.
- **CA-06b:** al confirmar una cita (reserva telefónica o aprobación), se crea un evento **real** con odontólogo, fecha/hora y referencia interna, visible en el calendario autorizado. No se incluirá el nombre, correo ni teléfono del paciente en el evento.
- **CA-06c:** al cancelar una cita, el evento asociado se elimina, o queda una eliminación pendiente (`delete_pending`) si Google no responde.
- **CA-06d:** si Google devuelve un error o no hay conectividad, DentalFlow conserva la cita y registra `pending/failed`; el personal autorizado puede reintentar sin duplicar el evento.
- **CA-06e:** ninguna edición manual de eventos en Google modifica la agenda de DentalFlow: esta integración es **unidireccional**.
- **CA-06f (desconexión):** `admin` puede desconectar Google: el servidor intenta revocar el token en Google (mejor esfuerzo), elimina la conexión almacenada y muestra `No conectado`. Las citas existentes se conservan; los eventos ya creados no se eliminan automáticamente [aprobado, D-05]; las sincronizaciones posteriores quedan `pending` con `last_error_code='NOT_CONNECTED'`.
- **CA-06g (reconexión):** tras reconectar (o tras expiración/revocación del token), `admin` ve `Conectado` y el personal puede reintentar las sincronizaciones `pending/failed/delete_pending` sin crear eventos duplicados.
- **CA-06h (estado OAuth):** el parámetro `state` es aleatorio, se guarda con expiración corta y uso único; un `state` desconocido, expirado, ya usado o de otro usuario es rechazado y no se almacenan tokens.

### RF-07 — Recordatorios simulados

**Comportamiento:** sección administrativa con citas confirmadas de las próximas 24 horas y una vista previa del recordatorio.

- **CA-07a:** dada una cita confirmada dentro de las próximas 24 horas, la pantalla muestra una vista previa identificada como `SIMULACIÓN — NO ENVIADO`.
- **CA-07b:** no se llaman APIs de correo/SMS/WhatsApp ni se generan invitaciones Google para pacientes.
- **CA-07c:** una cita cancelada o fuera de la ventana de 24 horas no aparece en la lista de recordatorios simulados.

### RF-08 — Solicitud pública de cita (nuevo)

**Comportamiento:** el visitante registra una solicitud con nombre, correo, teléfono opcional, odontólogo y bloque; queda `pending`. No crea cita ni bloquea el horario.

- **CA-08a:** con datos válidos y bloque libre, la API devuelve `201` con `requestId`, `status='pending'`, odontólogo y horario solicitado; no existe fila en `appointments` y la consulta de disponibilidad sigue mostrando el bloque.
- **CA-08b:** un correo inválido, nombre vacío, profesional inactivo, bloque fuera de horario o ventana RB-03 incumplida devuelve `422 VALIDATION_ERROR` y no crea registros.
- **CA-08c:** si el bloque ya está ocupado por una cita confirmada al enviar la solicitud, la API devuelve `409 SLOT_UNAVAILABLE` y no crea la solicitud.
- **CA-08d:** reenviar el mismo `idempotencyKey` con los mismos datos devuelve la misma solicitud; reutilizar la clave con datos distintos devuelve `409 IDEMPOTENCY_KEY_REUSED`.
- **CA-08e:** más de 10 intentos desde la misma IP en 10 minutos reciben `429 RATE_LIMITED`; la IP no se guarda en claro.
- **CA-08f:** varias solicitudes pendientes para el mismo bloque pueden coexistir (RB-11); la respuesta pública nunca revela datos de otras solicitudes o pacientes. Tope de pendientes por correo [aprobado, D-08: máximo 3 pendientes por correo].

### RF-09 — Aprobación y rechazo de solicitudes (nuevo)

**Comportamiento:** el personal autorizado lista solicitudes y las aprueba o rechaza. La aprobación es una operación transaccional segura frente a concurrencia e intentos repetidos (RB-12).

- **CA-09a:** al aprobar una solicitud `pending` con horario libre, se crea exactamente una cita `confirmed` (`source='public_request'`), la solicitud pasa a `approved`, queda `appointment_id` enlazado, se audita y luego se sincroniza con Google (el éxito de Google no condiciona la aprobación).
- **CA-09b:** si al aprobar el horario ya tiene una cita confirmada del mismo odontólogo, la API devuelve `409 SLOT_UNAVAILABLE`, no se crea cita y la solicitud permanece `pending` [D-10].
- **CA-09c:** aprobar dos veces la misma solicitud, o dos aprobaciones concurrentes, resulta en una sola cita; la repetición devuelve la misma cita.
- **CA-09d:** rechazar una solicitud `pending` la pasa a `rejected` (con motivo opcional corto, sin datos clínicos) y no crea cita; aprobar una solicitud `rejected` o rechazar una `approved` devuelve `409 REQUEST_ALREADY_DECIDED`.
- **CA-09e:** al aprobar se revalida: odontólogo activo, intervalo dentro de una franja vigente y horario aún en el futuro; si el horario ya pasó, `409 REQUEST_EXPIRED` [D-06]. La ventana de 1 hora–30 días se exige al **crear** la solicitud, no al aprobarla.
- **CA-09f:** personal no autorizado (`401/403`) y pacientes anónimos no pueden listar ni decidir solicitudes.

### RF-10 — Verificación de salud y modos operativos (nuevo)

**Comportamiento:** el backend verifica de forma segura el estado de Supabase y Google y la interfaz opera en Modo Productivo o Modo Contingencia (ver §6.1).

- **CA-10a:** con Supabase operativo, `GET /api/health` responde `200 {mode:"productive"}` sin exponer detalles internos.
- **CA-10b:** si Supabase no responde dentro del tiempo límite, las operaciones que requieren persistencia responden `503 SERVICE_UNAVAILABLE`, el formulario público muestra un aviso y deshabilita el envío, y nunca se confirma una cita o solicitud que no se haya guardado.
- **CA-10c:** si Google falla o no está conectado, las reservas y aprobaciones continúan, las citas confirmadas no se eliminan y el personal ve el estado de sincronización `pending/failed` con opción de reintento.
- **CA-10d:** `GET /api/admin/system-status` (personal) detalla el estado por componente; ninguna respuesta incluye tokens, claves, trazas ni URLs de conexión.

## 4. Reglas de negocio (RB)

| ID | Regla verificable |
|---|---|
| RB-01 | Duración fija de todas las citas: **30 minutos**. |
| RB-02 | Zona horaria de presentación y horario comercial: `America/Costa_Rica`; instantes se almacenan en UTC (`timestamptz`). |
| RB-03 | Al **crear** una solicitud pública o una cita telefónica se permite el horario desde `ahora + 1 hora` hasta `ahora + 30 días`; se valida de nuevo en el servidor. Al **aprobar** una solicitud solo se exige que el horario siga en el futuro (RF-09, D-06). |
| RB-04 | El intervalo debe pertenecer íntegramente a una franja semanal habilitada de un odontólogo activo. |
| RB-05 | Para un mismo odontólogo no pueden coexistir **dos citas confirmadas que se superpongan**, incluso con solicitudes concurrentes. |
| RB-06 | Cancelar libera el bloque. Completar aplica solo a citas confirmadas cuya hora de finalización ya pasó. |
| RB-07 | Una cita registrada en Supabase es válida aunque falle Google; el estado externo se muestra separado del estado de negocio. |
| RB-08 | Solo el personal autenticado y autorizado según la matriz de §1 puede consultar pacientes y solicitudes, decidir solicitudes, cancelar/completar citas, mantener horarios o gestionar Google. Conectar/desconectar Google es exclusivo de `admin`. |
| RB-09 | En la versión de demostración se utilizan exclusivamente datos ficticios. |
| RB-10 | Una clave de idempotencia identifica un único intento lógico de reserva o solicitud; reintentos con los mismos datos no crean filas nuevas; con datos distintos se rechazan con `409 IDEMPOTENCY_KEY_REUSED`. |
| RB-11 | Las solicitudes `pending` **no bloquean** el horario ni aparecen como ocupación en la consulta de disponibilidad. |
| RB-12 | La aprobación de una solicitud es **una sola transacción** PostgreSQL: bloquea la fila de la solicitud, valida su estado, revalida reglas, inserta la cita y actualiza la solicitud y la auditoría. Es idempotente y no produce dos citas por la misma solicitud. |
| RB-13 | Estados operativos: **Modo Productivo** (Supabase disponible) y **Modo Contingencia** (fallo detectado); en Contingencia no se confirman operaciones que requieran persistencia. No son una certificación de preparación para producción clínica. |

**Mecanismo obligatorio RB-05:** restricción PostgreSQL `EXCLUDE USING gist` sobre `doctor_id` y `tstzrange(starts_at, ends_at, '[)')` para filas con `status='confirmed'`, con extensión `btree_gist`. La validación en React **no sustituye** la garantía de base de datos. El backend interpreta el conflicto de exclusión como `409 SLOT_UNAVAILABLE`.

**Mecanismo obligatorio RB-12:** función PostgreSQL `approve_appointment_request(request_id, actor_user_id)` ejecutable solo por el rol de servicio del backend. Pasos: (1) `SELECT … FOR UPDATE` de la solicitud; (2) si `approved`, devolver la cita enlazada; si `rejected`, error de estado; (3) revalidar odontólogo activo, franja y horario futuro; (4) insertar en `appointments` con `request_id` único; (5) si la restricción de exclusión falla, abortar con `SLOT_UNAVAILABLE` sin cambiar la solicitud; (6) actualizar la solicitud a `approved` y registrar auditoría. La sincronización con Google ocurre **después** del commit.

## 5. Datos, entradas y validaciones

### Modelo relacional objetivo

| Tabla | Campos principales | Observaciones |
|---|---|---|
| `staff_profiles` | `user_id` (FK `auth.users`), `display_name`, `role` (`admin`/`receptionist`) | Usuarios creados por configuración protegida, no por registro público. |
| `doctors` | `id`, `full_name`, `specialty`, `is_active`, `created_at` | No contiene datos clínicos. |
| `weekly_schedules` | `id`, `doctor_id`, `weekday` (0–6; 0=domingo), `start_time`, `end_time` | Admite varias franjas por día; se prohíbe superposición de franjas. |
| `appointment_requests` | `id`, `doctor_id`, `patient_name`, `patient_email`, `patient_phone` (nullable), `requested_starts_at`, `requested_ends_at`, `status` (`pending`/`approved`/`rejected`), `idempotency_key` (única), `appointment_id` (nullable, FK), `decided_by` (nullable), `decided_at` (nullable), `rejection_reason` (nullable, ≤200), `created_at` | Solicitud pública; no bloquea horario. Sin notas médicas. |
| `appointments` | `id`, `doctor_id`, `patient_name`, `patient_email`, `patient_phone` (nullable), `starts_at`, `ends_at`, `status` (`confirmed`/`cancelled`/`completed`), `source` (`admin_phone`/`public_request`), `request_id` (nullable, **única**, FK), `created_by_user_id` (nullable), `idempotency_key` (única, nullable cuando `source='public_request'`), `created_at`, `updated_at`, `cancelled_at`, `cancelled_by` (nullable), `completed_at` (nullable), `completed_by` (nullable) | Fuente de verdad. Sin notas médicas. |
| `appointment_audit` | `id`, `appointment_id` (nullable), `request_id` (nullable), `action` (`created`, `approved`, `rejected`, `cancelled`, `completed`), `actor_user_id` (nullable), `from_status`, `to_status`, `occurred_at` | Registro de cambios; solo escritura desde servidor. |
| `calendar_sync` | `appointment_id` (única), `event_id` (nullable), `state`, `last_error_code` (nullable), `last_attempt_at` (nullable), `attempt_count` | Estado `pending`, `synced`, `failed`, `delete_pending`, `deleted`. |
| `private.google_connections` | `id`, `calendar_id`, `refresh_token_ciphertext`, `connected_by`, `updated_at` | Esquema **no expuesto** por Data API; token cifrado, servidor exclusivamente. |
| `private.oauth_states` | `state_hash`, `user_id`, `created_at`, `expires_at`, `used_at` (nullable) | Estado OAuth temporal: expira en ~10 minutos, uso único, no expuesto por Data API. |
| `private.booking_rate_limits` | clave hash anonimizada, ventana, contador | Controles del endpoint público persistidos en DB; sin depender de memoria de Vercel Functions. |

**Restricciones adicionales:** FK, `CHECK (ends_at > starts_at)`, `CHECK` de estados y fuentes, índices por `(doctor_id, starts_at)` y `(status, starts_at)`, unicidad de idempotencia, unicidad de `appointments.request_id`. Las migraciones serán versionadas en `supabase/migrations/` y deberán poder aplicarse sobre un proyecto Supabase Cloud nuevo.

### Validación de entrada

- `patient_name`: 2–100 caracteres luego de trim.
- `patient_email`: sintaxis válida, 254 caracteres máximo.
- `patient_phone`: opcional; hasta 25 caracteres; datos sintéticos en la demo.
- `doctorId`: UUID válido y profesional activo.
- `date` y `startAt`: formato ISO, rango permitido y alineación a bloques de 30 minutos.
- `idempotencyKey`: UUID creado por el cliente por intento de reserva o solicitud.
- `rejectionReason`: opcional, hasta 200 caracteres, sin datos clínicos.
- Límites de longitud de campos y validación compartida mediante esquemas TypeScript (p. ej. Zod), reforzados por restricciones de base de datos.
- Protección antiabuso del formulario público: límite objetivo de **10 intentos por IP cada 10 minutos**, aplicado de modo persistente/atómico en servidor; responder `429` al exceso. No exponer IP cruda en logs o tablas de producto.

## 6. Arquitectura y componentes

```text
Paciente (sin login)       Personal (Supabase Auth: admin / receptionist)
         \                    /
           React + TypeScript (Vite)
                      |
           HTTPS /api (Vercel Functions)
                      |
        Validación + lógica de reservas/aprobación
             /                  \
  Supabase PostgreSQL       Google Calendar API
  (Supabase Cloud,          (sincronización externa,
   fuente de verdad)         unidireccional)
             |
        Supabase Auth
```

- **Frontend:** SPA React + TypeScript, Vite, rutas públicas y `/admin`, diseño responsivo y estados vacíos/error.
- **Backend:** funciones Node/TypeScript en carpeta raíz `api/`, desplegables como Vercel Functions. No se permite acceso desde el navegador a secretos Google ni a una clave privilegiada de Supabase.
- **Ejecución local:** `npm run dev` levanta frontend y funciones `api/` con la CLI de Vercel (`vercel dev`) [aprobado, D-01]; se conecta a Supabase Cloud. No se requiere Docker.
- **Autorización:** Supabase Auth para el personal. El backend verifica la identidad de cada llamada privilegiada y comprueba el rol en `staff_profiles` según la matriz de §1. Los permisos de lectura/escritura y RLS se prueban explícitamente.
- **Persistencia:** Supabase Cloud PostgreSQL, migraciones SQL, datos de demostración, regla de no superposición y función de aprobación en BD.
- **Integración:** módulo aislado para OAuth y llamadas Google Calendar; sin dependencia de Google en la lógica de disponibilidad.
- **Despliegue:** Vercel (previsto) para React/API; Supabase Cloud para datos y autenticación. Documentar rewrites SPA sin interceptar `/api/*`.

### 6.1 Modo Productivo y Modo Contingencia

Estados operativos del MVP. **No** certifican preparación para producción clínica. Las verificaciones se hacen en el backend con tiempo límite corto (≈2 s) y caché breve; el frontend no consulta Supabase ni Google directamente para decidir el modo. Google no recibe un ping en cada petición: su estado se infiere del último resultado de sincronización y de la validez de la conexión.

| Condición | Modo | Funciona normalmente | Deshabilitado | Mensaje al usuario |
|---|---|---|---|---|
| Supabase y Google operativos | Productivo | Todo el alcance del MVP | — | Ninguno |
| Google caído, revocado o no conectado; Supabase operativo | Productivo con Google degradado (Contingencia parcial) [D-09] | Solicitudes públicas, reservas telefónicas, aprobaciones, cancelaciones, dashboard, recordatorios simulados | Solo la sincronización con Google (queda `pending/failed/delete_pending`) | Banner al personal: "Google Calendar no disponible; las citas están guardadas y se sincronizarán al reintentar." |
| Supabase caído o sin respuesta | Contingencia | Páginas estáticas, mensajes de estado | Consultar horarios, enviar solicitudes, iniciar sesión, reservar, aprobar, cancelar, completar y listar; las respuestas son `503 SERVICE_UNAVAILABLE` | Público: "El servicio no está disponible; intente más tarde." Personal: aviso de contingencia. No se muestra una cita como confirmada ni se guarda solo en el navegador. |

Reglas: una falla de Supabase impide nuevas operaciones que necesiten persistencia; una falla de Google no elimina citas confirmadas ni revierte reservas; al recuperarse el servicio, el modo vuelve a Productivo en la siguiente verificación. `GET /api/health` (público) solo expone el modo; el detalle por componente está en `GET /api/admin/system-status` (personal).

### Google Calendar: contrato operativo

1. Cuenta personal de Google **dedicada a demostración** y calendario de prueba precreado (recomendado un calendario secundario); identificador configurable `GOOGLE_CALENDAR_ID`. La cuenta debe figurar como usuario de prueba en la pantalla de consentimiento OAuth.
2. OAuth 2.0 de aplicación web con flujo de código en backend y solicitud de acceso offline. Scope propuesto de mínimo privilegio: `https://www.googleapis.com/auth/calendar.events`.
3. **`state`:** se genera aleatorio al iniciar la conexión (`POST /api/admin/google/connect`), se guarda su hash en `private.oauth_states` ligado al `user_id` del administrador con expiración (~10 minutos) y uso único; el callback lo valida, lo marca usado y rechaza `state` ausente, desconocido, expirado o reutilizado.
4. Token de refresco almacenado **cifrado** del lado del servidor (cifrado a nivel de aplicación [aprobado, D-09: AES-256-GCM]); clave de cifrado y secreto OAuth en variables privadas de entorno. **Nunca** en `VITE_*`, repo, logs o respuestas HTTP.
5. `events.insert`: `start`/`end` en RFC3339, zona `America/Costa_Rica`, título `Cita odontológica — [odontólogo]`, descripción con ID interno, sin datos del paciente y `reminders.useDefault=false` sin overrides. No agregar asistentes ni invitar al paciente.
6. `events.delete` para citas canceladas. El `event_id` es determinístico a partir del UUID de la cita, transformado a un formato aceptado por Google, y persiste en `calendar_sync` para permitir reintentos idempotentes. Si la creación devuelve conflicto de ID, consultar el evento existente y verificar correspondencia antes de marcar `synced`. Esto previene eventos duplicados.
7. Tras guardar o aprobar la cita se intenta sincronizar dentro de la petición; si Google falla, registrar `failed`/`pending` y permitir **Reintentar**. No depender de un proceso en segundo plano inexistente.
8. **Desconexión:** `POST /api/admin/google/disconnect` (solo `admin`) revoca el token en mejor esfuerzo y elimina la conexión (CA-06f). **Reconexión:** repetir el flujo de conexión; luego reintentar sincronizaciones pendientes (CA-06g).
9. Si el token expira, se revoca o caduca por modo de pruebas, mostrar `Reconectar Google Calendar` sin perder citas.
10. Integración **solo DentalFlow → Google**. Si se edita el evento externamente, no cambia la disponibilidad de DentalFlow.

**Riesgo de demostración:** en apps OAuth externas con pantalla de consentimiento en estado `Testing`, Google puede expirar el *refresh token* en aproximadamente **7 días**. Revisar conexión el día de la demo y utilizar la cuenta de prueba autorizada.

## 7. Contratos HTTP propuestos (v1)

Respuestas JSON. Cualquier error conocido devuelve `{ "error": { "code": "...", "message": "..." } }` y nunca rastros internos o secretos.

**Convención de códigos:** `422` = validación de entrada o semántica; `409` = conflicto de estado o recurso; `401` sin sesión; `403` sin permiso; `404` no encontrado; `429` límite excedido; `503` servicio de persistencia no disponible.

| Método/ruta | Actor | Entrada | Salida / códigos |
|---|---|---|---|
| `GET /api/health` | Público | — | `200 {mode}` (`productive`/`contingency`); sin detalles. |
| `GET /api/public/doctors` | Público | — | `200` odontólogos activos (sin contactos); `503`. |
| `GET /api/public/slots?doctorId=UUID&date=YYYY-MM-DD` | Público | ID, fecha | `200 { doctorId, date, slots:[{startAt,endAt}] }` (lista vacía si no hay franjas); `422` fecha/ID inválido, pasada o fuera de 30 días; `503`. |
| `POST /api/public/appointment-requests` | Público | `{doctorId,patientName,patientEmail,patientPhone?,startAt,idempotencyKey}` | `201 {requestId,status:"pending",doctorName,startsAt,endsAt}`; `409 SLOT_UNAVAILABLE`/`IDEMPOTENCY_KEY_REUSED`; `422`; `429`; `503`. |
| `POST /api/admin/appointments` | Personal | `{doctorId,patientName,patientEmail,patientPhone?,startAt,idempotencyKey}` | `201 {appointmentId,status,startsAt,endsAt,doctorName,syncState}`; `409 SLOT_UNAVAILABLE`/`IDEMPOTENCY_KEY_REUSED`; `422`; `401/403`; `503`. |
| `GET /api/admin/appointments?date=...&doctorId=...` | Personal | Filtros opcionales | `200` citas y estados; `401/403`. |
| `PATCH /api/admin/appointments/:id` | Personal | `{action:"cancel"\|"complete"}` | `200` cita actualizada; `409 INVALID_TRANSITION`; `404`. |
| `GET /api/admin/appointment-requests?status=pending` | Personal | Filtro opcional | `200` solicitudes; `401/403`. |
| `POST /api/admin/appointment-requests/:id/approve` | Personal | — | `200 {appointmentId,requestStatus:"approved",syncState}` (idempotente); `409 SLOT_UNAVAILABLE`/`REQUEST_ALREADY_DECIDED`/`REQUEST_EXPIRED`; `404`; `401/403`. |
| `POST /api/admin/appointment-requests/:id/reject` | Personal | `{reason?}` | `200 {requestStatus:"rejected"}`; `409 REQUEST_ALREADY_DECIDED`; `422`; `404`; `401/403`. |
| `POST /api/admin/login` | — | **No se crea**: el cliente usa el SDK de Supabase Auth. | — |
| `GET /api/admin/doctors` | Personal | — | `200`; `401/403`. |
| `POST /api/admin/doctors` / `PATCH /api/admin/doctors/:id` | Admin | Datos del odontólogo | `200/201`; `422`; `401/403`. |
| `PUT /api/admin/doctors/:id/schedules` | Admin | `{windows:[{weekday,startTime,endTime}]}` | `200` agenda; `409` si rompe citas futuras; `422`; `401/403`. |
| `POST /api/admin/google/connect` | Admin | JWT en cabecera | `200 {authorizationUrl}`; el servidor guarda `state` en `private.oauth_states`. |
| `GET /api/admin/google/callback` | Google OAuth | `code`, `state` | Validación de `state` (existencia, expiración, uso único, usuario), intercambio seguro y redirect al panel; `state` inválido → redirect con error sin guardar tokens. |
| `GET /api/admin/google/status` | Personal | — | `200 {connected,calendarId}`; nunca tokens. |
| `POST /api/admin/google/disconnect` | Admin | — | `200 {connected:false}`; `401/403`. |
| `POST /api/admin/appointments/:id/sync` | Personal | — | `200 {syncState}` o estado de error; reintento idempotente; `401/403`. |
| `GET /api/admin/reminder-previews` | Personal | — | `200` vistas previas marcadas como simulación. |
| `GET /api/admin/system-status` | Personal | — | `200 {mode, supabase, google}`; sin secretos. |

**Códigos de error estables:** `VALIDATION_ERROR` (422), `SLOT_UNAVAILABLE`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_TRANSITION`, `REQUEST_ALREADY_DECIDED`, `REQUEST_EXPIRED` (409), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `RATE_LIMITED` (429), `SERVICE_UNAVAILABLE` (503).

**Autenticación de APIs administrativas:** `Authorization: Bearer <Supabase access_token>` (excepto callback OAuth, protegido mediante `state` temporal ligado a una sesión de conexión iniciada por el administrador). Verificar siempre token y rol en servidor.

## 8. Errores, consistencia y privacidad

- **Dos reservas o aprobaciones simultáneas del mismo bloque:** PostgreSQL impide la superposición; una resulta exitosa, la otra `409 SLOT_UNAVAILABLE`, sin doble escritura.
- **Aprobación repetida o concurrente de la misma solicitud:** una sola cita; las repeticiones devuelven la misma cita.
- **Google no disponible:** cita confirmada en Supabase; interfaz informa `Google pendiente/error` y ofrece reintento.
- **Eliminar evento inexistente:** tratar `404` como resultado ya eliminado si se valida la correspondencia de la reserva.
- **Sesión expirada:** `401`; redirección a login, nunca ejecutar una operación como administrador anónimo.
- **Supabase no disponible:** `503 SERVICE_UNAVAILABLE`, sin confirmar falsamente una cita o solicitud ni guardar solo en React (Modo Contingencia, §6.1).
- **Solicitud inválida/rate limit:** `422/429` sin filtrar datos o trazas internas.
- **RLS y permisos:** habilitar RLS y restringir grants en todas las tablas expuestas; la clave secreta de Supabase solo está en backend. El backend aplica controles de autorización incluso si usa una cuenta de servicio que omite RLS. Las tablas con datos de pacientes (`appointments`, `appointment_requests`) no son accesibles por `anon` ni `authenticated` directamente.
- **Privacidad:** no usar datos reales de pacientes, no agregar datos personales a eventos Google y no exhibir listados de pacientes ni de solicitudes al usuario público.

## 9. Pruebas, calidad y definición de terminado

**Comandos que el repositorio deberá implementar y documentar** (no se afirma que funcionen hasta crear el código):

```bash
npm ci
npm run dev                  # vercel dev: frontend + api/ contra Supabase Cloud (según README)
npm run lint
npm run typecheck
npm test                     # Vitest: reglas de negocio + validaciones
npm run test:integration     # Vitest contra un proyecto Supabase Cloud de pruebas (BD, concurrencia, RLS)
```

Las migraciones de `supabase/migrations/` se aplican a un proyecto Supabase Cloud nuevo (procedimiento exacto en el README; aprobado en D-02: dos proyectos Supabase Cloud, desarrollo y pruebas, y `supabase db push` sin Docker). No se requiere Docker.

**Comprobaciones mínimas verificables:**

- `P-01`: login válido, acceso denegado sin sesión (`401`) y sin permiso (`403`).
- `P-02`: horarios inválidos se rechazan y horarios válidos generan bloques correctos.
- `P-03`: creación válida persiste y aparece en dashboard tras recarga.
- `P-04`: dos reservas telefónicas concurrentes en mismo bloque → una confirmada, otra `409` (restricción SQL).
- `P-05`: fecha pasada, correo inválido y odontólogo inactivo → no se escribe cita ni solicitud (`422`).
- `P-06`: Google Calendar crea un evento real y guarda ID de evento.
- `P-07`: fallo simulado de Google conserva la cita y el reintento crea un solo evento.
- `P-08`: cancelar libera bloque y borra/encola eliminación del evento Google.
- `P-09`: recordatorios de 24 horas se etiquetan `SIMULACIÓN — NO ENVIADO`.
- `P-10`: pruebas de RLS: roles `anon` y `authenticated` no acceden a pacientes ni solicitudes directamente por Data API.
- `P-11`: solicitud pública válida queda `pending`, no crea cita y el bloque sigue disponible; idempotencia y `429`.
- `P-12`: aprobación concurrente y repetida de la misma solicitud → una sola cita.
- `P-13`: aprobación con horario ya ocupado → `409 SLOT_UNAVAILABLE`, sin cita duplicada, solicitud sigue `pending`.
- `P-14`: matriz de roles: `receptionist` y `admin` obtienen lo permitido y `403` en lo denegado (CA-02e, desconexión Google).
- `P-15`: desconexión y reconexión de Google; `state` expirado, reutilizado o desconocido rechazado; sin tokens en respuestas.
- `P-16`: simulación de fallo de Supabase → `503`, ninguna escritura ni confirmación falsa; fallo de Google → citas conservadas.

**Criterio de salida:** todos los casos principales pasan, al menos una prueba automatizada ejecutada y documentada, `npm run lint` y `npm run typecheck` sin errores, migraciones y seed reproducibles sobre un proyecto Supabase Cloud nuevo, instalación descrita y demo ensayada. Registrar fallos encontrados, corrección humana y evidencia de tres ciclos de uso de IA.

## 10. Datos de demo y límites conocidos

**Datos iniciales sintéticos sugeridos:**

- `Dra. Ana Morales` (Odontología general), lunes a viernes 08:00–12:00 y 13:00–17:00.
- `Dr. Carlos Rojas` (Ortodoncia), lunes a viernes 09:00–12:00 y 14:00–17:00.
- Una cuenta `admin` y una `receptionist` de demostración suministradas **por canal privado**, nunca comprometidas al repo.
- Una cuenta personal de Google dedicada a la demo y un calendario secundario de prueba (por ejemplo, "DentalFlow Demo").
- Pacientes y correos de prueba ficticios (dominio reservado `example.com`).

**Limitaciones:** horarios semanales sin feriados/vacaciones, sin conflictos contra eventos creados directamente en Google, sin recordatorios reales, sin datos clínicos, sin pagos y sin requisitos de producción clínica completados. El paciente no recibe notificación automática ni puede consultar el estado de su solicitud: la clínica debe contactarlo por un canal manual (limitación asumida y aprobada, D-07). Las solicitudes pendientes no bloquean horarios, por lo que pueden quedar sin aprobar por conflicto.

## 11. Referencias de implementación

- Consigna académica: `Proyecto_Final_LE_Claude_Code.pdf`, pp. 1–6.
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Google Calendar eventos: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Google Calendar scopes: https://developers.google.com/workspace/calendar/api/auth
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- Vercel + Vite: https://vercel.com/docs/frameworks/frontend/vite

> La presente especificación es el **contrato de implementación propuesto**. Si una simplificación afecta un criterio de aceptación, actualizar `intent.md`, `spec.md` y `plan.md` antes de considerarla acordada.
