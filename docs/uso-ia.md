
# DentalFlow — Evidencia de desarrollo asistido por IA

## 1. Información general

- Proyecto: DentalFlow
- Curso: Laboratorio Ejecutivo en Claude Code
- Universidad: CENFOTEC
- Agente principal: Claude Code
- Agente complementario: Codex u otro, únicamente si se utiliza; su participación se registra solo cuando existe evidencia de una ejecución real
- IDE: Visual Studio Code
- Metodología: Desarrollo incremental con pruebas y revisión humana

## 2. Objetivo

Documentar cómo se utiliza la inteligencia artificial para construir DentalFlow, incluyendo las instrucciones proporcionadas al agente, sus resultados, las verificaciones humanas y las correcciones realizadas.

Las evidencias se registrarán después de ejecutar cada tarea. No se incluirán resultados, pruebas ni commits que no hayan ocurrido.

## 3. Registro de ciclos

Los tres ciclos corresponden a IA-01, IA-02 e IA-03 de `plan.md` §6 y a las tareas reales del plan. La iteración documental T-00 se registra aparte (sección 3.1) y no cuenta como uno de los tres ciclos.

### 3.1 Iteración preparatoria T-00 — Alineamiento documental

- Estado: **Completada** (commit `30d89b1`, `docs: cerrar alineamiento documental T-00`, 2026-11-22)
- Tarea del plan: T-00
- Objetivo: alinear `intent.md`, `spec.md`, `plan.md` y este documento con las decisiones confirmadas (roles `admin`/`receptionist`, Supabase Cloud sin Docker, reservas telefónicas directas, solicitudes públicas con aprobación, integración Google con cuenta personal, Modo Productivo/Contingencia, recordatorios simulados y exclusiones) y resolver las inconsistencias detectadas entre los documentos.
- Prompt utilizado: instrucción de la iteración T-00 entregada a Claude Code en VS Code (rol de arquitecto de software y analista funcional; decisiones confirmadas; inconsistencias a resolver; restricciones: no crear código, no instalar dependencias, no modificar `.gitignore`, no hacer commit). El texto íntegro del prompt se conservará como evidencia fuera de este resumen, sin credenciales ni datos sensibles.
- Archivos modificados: `intent.md`, `spec.md`, `plan.md`, `docs/uso-ia.md`.
- Resultado: documentos actualizados a la versión 0.2 con nuevos requisitos (RF-08 a RF-10), reglas (RB-11 a RB-13), tablas (`appointment_requests`, `appointment_audit`, `private.oauth_states`), matriz de permisos, contratos HTTP con códigos `422`/`409`, tareas nuevas (T-09A, T-14A) y decisiones D-01 a D-10 incorporadas y aprobadas (ver `plan.md` §10). Es una especificación; en esta iteración no se implementó código.
- Revisión humana: el responsable revisó los documentos y **aprobó** las decisiones D-01 a D-10 el 2026-11-22 (en conversación, sin cambios); después creó el commit `30d89b1`.
- Pruebas ejecutadas: `git diff --check` sobre los documentos.
- Resultado de las pruebas: terminó sin errores (código de salida 0) tras la corrección de formato descrita abajo.
- Errores identificados: `git diff --check` reportó espacios finales en encabezados de los documentos Markdown.
- Correcciones realizadas: se eliminaron esos espacios finales antes del commit.
- Commit de Git: `30d89b1` (`docs: cerrar alineamiento documental T-00`).
- Aprendizaje obtenido: la verificación mecánica (`git diff --check`) detectó un problema de formato que la lectura de los documentos no había señalado.

### 3.2 Iteración T-01 — Corrección de `vercel dev` (no cuenta como ciclo IA-01 a IA-03)

- Estado: **Completada** (ver commit `feat: inicializar React, Vite y Vercel Functions`, hash `843d155`)
- Tarea del plan: T-01
- Objetivo: lograr que `npm run dev` inicie React y las Vercel Functions, manteniendo `npm run dev:frontend` solo para Vite.
- Prompt utilizado: instrucción "Corrección de T-01" entregada a Claude Code (error `DEV_RECURSIVE_INVOCATION` de Vercel CLI 66.6.0; restricciones: sin cambios de negocio, sin reinstalar dependencias, sin tocar GitHub ni Supabase, sin commit ni push durante la corrección).
- Archivos modificados: `package.json`, `vercel.json`; en el cierre de T-01 también `.gitignore`, `plan.md` y este documento.
- Resultado generado por Claude Code — causa raíz en dos partes:
  1. **Recursión:** el CLI rechaza el proyecto si el script `dev` de `package.json` es literalmente `vercel dev` (detección estática), aunque `devCommand` apuntara a otro script. Solución: `"dev": "npm run dev:vercel"` y `"dev:vercel": "vercel dev"`.
  2. **Puerto:** `vercel dev` asigna `$PORT` y espera que el servidor escuche ahí, pero `vite --host 127.0.0.1` ignora esa variable y quedó en 5173 (raíz y `/api/health` sin respuesta, comprobado con el `devCommand` original). Solución: `devCommand` = `vite --port $PORT` en `vercel.json`.
- Revisión humana: el responsable pidió la corrección y el cierre de T-01; la revisión del diff antes del commit queda a su cargo.
- Pruebas ejecutadas: `npm run dev` (con `curl` a `/` y `/api/health`), `npm run dev:frontend`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Resultado de las pruebas: `/` responde 200 y `/api/health` responde 501 `NOT_IMPLEMENTED` (esperado hasta T-14A); `dev:frontend` sirve Vite en `127.0.0.1:5173` (200); lint, typecheck, test (1 de 1) y build terminan con exit 0. No se reejecutó `npm ci`.
- Errores identificados: (1) `DEV_RECURSIVE_INVOCATION`; (2) desajuste de puerto entre Vercel y Vite; (3) al cerrar T-01, la línea `.env*` de `.gitignore` (agregada al enlazar Vercel) también ignoraba `.env.example`.
- Correcciones realizadas: las dos de arriba más quitar `.env*` de `.gitignore`; `.env`, `.env.*` y `!.env.example` siguen protegiendo `.env.local` y dejan versionable `.env.example`.
- Commit de Git: `feat: inicializar React, Vite y Vercel Functions` (hash `843d155`).
- Aprendizaje obtenido: la comprobación del mensaje de error del CLI no basta; hay que reproducir el arranque y llamar a la API para descubrir el segundo problema (puerto).

### 3.3 Iteración T-02 — Modelo de datos en Supabase y prueba P-10 (no cuenta como ciclo IA-01 a IA-03)

- Estado: **Completada** (commit `feat(db): implementar esquema inicial Supabase y pruebas de seguridad`, hash `f572c2f`)
- Tarea del plan: T-02
- Objetivo: versionar el esquema inicial (siete tablas `public` y tres `private`), RLS con mínimo privilegio, seed sintético y pruebas de seguridad reproducibles.
- Prompts utilizados: instrucciones "T-02: Modelo de datos en Supabase", "T-02: Verificación de migraciones", "T-02: Prueba de seguridad P-10" y "Cierre de T-02" entregadas a Claude Code (restricciones: sin `supabase db push` por parte del asistente, sin credenciales en el repositorio, sin `service_role` en la prueba P-10, sin commit ni push hasta el cierre, sin simular resultados si no hay conexión).
- Archivos generados: cinco migraciones en `supabase/migrations/`, `supabase/seed.sql`, `supabase/staff_profiles.example.sql`, `supabase/verification/t02_post_apply_checks.sql`, `supabase/README.md`, `tests/integration/p10-anon-data-api.test.ts`, `vitest.integration.config.ts` y ajustes en `vite.config.ts`, `package.json`, `tsconfig.json`, `eslint.config.js`.
- Resultado generado por Claude Code: SQL escrito y revisado estáticamente; script de verificación reescrito como una sola consulta de 17 filas (el SQL Editor solo muestra el último resultado); prueba P-10 de solo lectura con control previo (`/auth/v1/health`) y salvaguarda contra claves secretas.
- Revisión humana: el responsable autorizó y ejecutó las migraciones, el seed y las verificaciones en Supabase Cloud (el asistente no tuvo credenciales ni conexión a la base de datos en ningún momento).
- Pruebas ejecutadas y resultados reales (informados por el responsable): migraciones aplicadas sin error en DentalFlow-Test y DentalFlow (desarrollo); ambos proyectos con 2 odontólogos y 20 franjas semanales; script SQL con 17 de 17 comprobaciones correctas en pruebas; `npm run test:p10` con 8 pruebas aprobadas; esquema `private` excluido de la Data API. El asistente ejecutó `lint`, `typecheck`, `test` y `build` localmente en el cierre (ver abajo).
- Errores identificados: (1) la primera versión del script de verificación usaba varias sentencias y el SQL Editor mostraba solo la última; (2) el asistente no podía conectarse a Supabase, por lo que no se emitió ningún resultado remoto propio.
- Correcciones realizadas: script convertido a una sola consulta; la verificación remota y la prueba P-10 las ejecutó el responsable.
- Límites conocidos: el script de verificación solo se ejecutó en el proyecto de pruebas; la fila 9 (RB-05 pendiente) dejará de cumplirse a propósito en T-03; no se probó todavía el rol `authenticated` con sesión (T-04/T-14).
- Commit de Git: `feat(db): implementar esquema inicial Supabase y pruebas de seguridad` (hash `f572c2f`).
- Aprendizaje obtenido: separar lo que el asistente puede verificar de lo que solo se puede comprobar en el entorno real evita registrar evidencia simulada; las pruebas contra servicios externos deben fallar de forma visible cuando faltan credenciales.

### 3.4 Iteración T-04 — Autenticación del personal y autorización por rol (no cuenta como ciclo IA-01 a IA-03)

- Estado: **Completada** (commit `feat(auth): implementar login del personal y autorización por rol`, hash `fff421c`)
- Tarea del plan: T-04
- Objetivo: login con Supabase Auth, roles `admin` y `receptionist` desde `staff_profiles`, rutas protegidas, cierre de sesión y autorización aplicada en el servidor (CA-01a a CA-01d).
- Prompts utilizados: "Cerrar T-03 e implementar T-04" y tres solicitudes de corrección posteriores (error de Vite en `/login`, mensaje "no configurado" y "No pudimos verificar tu sesión"). Restricciones: sin exponer `service_role` al frontend, sin tocar RLS, sin crear usuarios automáticamente, sin imprimir claves, sin commit ni push.
- Archivos creados o modificados: `shared/permissions.ts`, `api/_lib/staff-auth.ts`, `api/_lib/local-env.ts`, `api/admin/me.ts`, `src/auth/*`, `src/lib/*`, `src/pages/*`, `src/router.ts`, `src/App.tsx`, `src/styles.css`, `vercel.json`, `.env.example`, `tests/unit/*`, `package.json`/`package-lock.json` (`@supabase/supabase-js`), `tsconfig.json`, `supabase/README.md`.
- Resultado generado por Claude Code: el backend valida el token contra Supabase Auth, lee el rol de `staff_profiles` con `service_role` (solo servidor) y aplica la matriz de `spec.md` §1 (401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 503 `SERVICE_UNAVAILABLE`); React obtiene el rol de `/api/admin/me` y solo muestra opciones.
- Revisión humana: el responsable creó manualmente las dos cuentas de demostración y sus perfiles, ejecutó las correcciones y **validó manualmente el login con los roles `admin` y `receptionist`** (informado por él).
- Pruebas ejecutadas: `lint`, `typecheck`, `npm test` (43 pruebas), `build`; `curl` contra `vercel dev` real; verificación de presencia y formato de variables sin imprimir valores; consultas de solo lectura a Supabase con códigos HTTP y conteos.
- Resultado de las pruebas: 43 de 43 aprobadas; `/api/admin/me` sin token responde 401, con token falso 401 (tras la corrección 3) y la validación manual con ambos roles fue satisfactoria.
- Errores identificados (reales):
  1. **Regresión en Vite:** el rewrite de `vercel.json` `/((?!api/).*)` → `/index.html` devolvía HTML para `/src/main.tsx` y `/@vite/client`; Vite fallaba con "invalid JS syntax" en `index.html`.
  2. **Diagnóstico engañoso:** la interfaz mostraba "El inicio de sesión no está configurado" también cuando había sesión pero el backend respondía 503.
  3. **Variables no llegaban a las funciones:** `vercel dev` (proyecto enlazado y también con `--local`) no pasa `.env.local` a las Vercel Functions; Vite sí lo lee. `/api/admin/me` respondía 503 y React mostraba "No pudimos verificar tu sesión".
  4. **Perfiles ausentes:** `staff_profiles` del proyecto de desarrollo estaba vacía (0 filas), por lo que un usuario válido recibiría 403 hasta crear los perfiles.
- Correcciones realizadas: (1) rewrites limitados a `/login` y `/admin/:path*`; (2) nuevo estado `unconfigured` y redirección de `/login` al panel cuando hay sesión sin rol verificable; (3) `api/_lib/local-env.ts` completa solo las variables que faltan desde `.env.local` en desarrollo local (no corre en Vercel preview/producción ni en pruebas); (4) el responsable ejecutó la plantilla de perfiles en el proyecto de desarrollo.
- Límites conocidos: los estados de la interfaz se prueban por su lógica pura (sin jsdom); las pruebas de integración de RLS con sesión `authenticated` quedan para T-14; en Vercel (despliegue) las variables deben configurarse en el proyecto (T-18).
- Commit de Git: `feat(auth): implementar login del personal y autorización por rol` (hash `fff421c`).
- Aprendizaje obtenido: el comportamiento de `vercel dev` con variables de entorno y rewrites no es el de producción ni el de Vite solo; conviene verificar con peticiones reales y diferenciar "no configurado" de "servicio no disponible" para no ocultar la causa.

### 3.5 Iteración T-05 (parcial) y T-06 — Consulta de disponibilidad (no cuenta como ciclo IA-01 a IA-03)

- Estado: **T-06 completada; T-05 en curso** (solo la parte de consulta; la administración de odontólogos y franjas está pendiente)
- Prompt utilizado: "Cerrar T-04 e implementar T-05/T-06" (solo lectura; sin crear citas ni aprobaciones).
- Archivos: `shared/clinic-time.ts`, `shared/availability.ts`, `api/_lib/availability-service.ts`, `api/_lib/supabase-rest.ts`, `api/public/doctors.ts`, `api/public/slots.ts`, `src/pages/AvailabilityPage.tsx`, `src/lib/availabilityApi.ts`, `vercel.json`, pruebas en `tests/unit/`.
- Resultado generado por Claude Code: cálculo puro de bloques de 30 minutos alineados a :00/:30 en `America/Costa_Rica`, ventana de reserva (1 hora a 30 días), exclusión de citas confirmadas, lectura exclusiva de columnas no sensibles, y página pública con estados de carga, vacío y error.
- Pruebas ejecutadas y resultados: 77 pruebas unitarias aprobadas (odontólogo activo/inactivo, fecha válida/inválida, día sin horarios, espacio ocupado/libre, consulta sin escritura ni datos de pacientes); contra el proyecto de desarrollo en modo lectura: 16 horarios un lunes para la Dra. Morales, 0 un sábado, 422 para entradas inválidas.
- Decisión de diseño: odontólogo inactivo o inexistente en `slots` → 422 (coherente con CA-02c/CA-04c/CA-08b).
- Pendiente de T-05: alta/edición de odontólogos y franjas por `admin` con sus validaciones y el `403` para `receptionist`.

### 3.6 Iteración T-UI — Dashboard y navegación administrativa (no cuenta como ciclo IA-01 a IA-03)

- Estado: **Completada** (commit `feat(ui): implementar dashboard y navegación administrativa por roles`, hash `2729a32`)
- Tarea del plan: T-UI
- Objetivo: separar la pantalla `/admin/citas`, que mezclaba permisos, cita telefónica, solicitudes y citas confirmadas, en un panel con barra lateral, encabezado con usuario y rol, y pantallas independientes, sin cambiar reglas de negocio ni contratos de API.
- Prompt utilizado: "T-UI: Dashboard y navegación administrativa" (restricciones: conservar el comportamiento validado, no tocar migraciones ni datos, no implementar odontólogos ni Google Calendar, sin dependencias nuevas, sin commit ni push durante la iteración).
- Archivos: `src/admin/routes.ts`, `src/components/{AdminLayout,AppLink}.tsx`, `src/pages/AdminDashboard.tsx`, `src/pages/admin/*` (inicio, nueva cita, solicitudes, citas, pendientes), `src/pages/PhoneBookingPanel.tsx` (solo el título), `src/auth/guard.ts` (el inicio del panel pasa a `/admin`), `src/styles.css`, `tests/unit/{admin-routes,auth-ui}.test.ts`; se eliminó `src/pages/RequestsPanel.tsx` (su lógica pasó a `RequestsPage` y `AppointmentsPage`).
- Resultado generado por Claude Code: mapa de rutas con permisos de la matriz de `spec.md` §1 (recepción no ve Odontólogos ni Configuración; por URL manual recibe "Sin acceso"), opciones sin funcionalidad marcadas "Pendiente", inicio con indicadores que reutilizan los endpoints existentes, estados de carga, error y vacío, y diseño responsive con menú en móvil.
- Revisión humana: el responsable validó manualmente el dashboard, la navegación por roles y los formularios independientes.
- Pruebas ejecutadas y resultados: 170 pruebas unitarias aprobadas (acceso por rol, URLs escritas a mano, protección de rutas, guardia de sesión), `lint`, `typecheck` y `build`; `vercel dev` con todas las rutas `/admin/*` respondiendo 200 y la API administrativa en 401 sin sesión. El diff contra el commit anterior confirma que `api/`, `shared/`, migraciones y `vercel.json` no cambiaron (contratos intactos).
- Límites conocidos: no hay pruebas de renderizado de componentes (no se agregó jsdom); el comportamiento visual se validó manualmente.
- Aprendizaje obtenido: mover la decisión de qué mostrar a un mapa de rutas puro permite probar el acceso por rol sin renderizar, y mantener la autorización real en el backend evita que la navegación sea una barrera de seguridad.

### 3.7 Iteración T-09 (parcial) — Cancelar y completar citas (no cuenta como ciclo IA-01 a IA-03)

- Estado: **En curso** (cancelación implementada y validada manualmente; finalización implementada y probada solo de forma automatizada; filtros e historial pendientes)
- Tarea del plan: T-09 (parte de gestión del estado de las citas)
- Objetivo: permitir que `admin` y `receptionist` cancelen o completen citas desde `/admin/citas`, con transiciones válidas según `spec.md` (CA-05b, CA-05c, RB-06), auditoría atómica y control de operaciones repetidas.
- Prompt utilizado: "Cierre T-UI y gestión de citas" (restricciones: reutilizar esquema y permisos, migración nueva sin aplicar si hacía falta, sin pruebas destructivas en Desarrollo, sin Google Calendar ni recordatorios, sin commit ni push durante la iteración).
- Archivos: `supabase/migrations/20261124000000_appointment_status.sql`, `api/_lib/appointment-status-service.ts`, `api/admin/appointments/[id].ts`, `api/admin/appointments.ts` (parámetro opcional `?scope=completable`), `api/_lib/{http,requests-service}.ts`, `src/lib/adminApi.ts`, `src/pages/admin/AppointmentsPage.tsx`, `src/pages/AdminDashboard.tsx`, `tests/unit/appointment-status.test.ts`, `tests/integration/t09-appointment-status.test.ts`, `supabase/README.md`, `package.json`.
- Resultado generado por Claude Code: función SQL `change_appointment_status` (fila bloqueada, transición validada contra el estado real, auditoría en la misma transacción, repetición idempotente, `INVALID_TRANSITION`/`NOT_FOUND`/`VALIDATION_ERROR` como códigos estables), endpoint `PATCH` con permiso `appointments.cancel_complete` exigido en el servidor, y la pantalla Citas con las secciones "Próximas citas" y "Por cerrar (ya terminaron)", confirmación en línea antes de cancelar y mensajes de resultado.
- Revisión humana: el responsable validó manualmente en DentalFlow Desarrollo **la cancelación**: permite desistir de la cancelación, cambia el estado a `cancelled`, registra la auditoría y libera el horario para nuevas reservas. **La finalización de citas no ha sido validada manualmente.**
- Pruebas ejecutadas y resultados: 193 pruebas unitarias aprobadas (cancelación, finalización, transiciones inválidas, operación repetida, 401/403/404/422, el backend no llama a la base de datos sin permiso); 21 comprobaciones de la migración en Postgres local (PGlite): persistencia, auditoría con actor y estados, repetición sin auditoría extra, liberación del bloque y roles `anon`/`authenticated` sin acceso; `lint`, `typecheck` y `build`; el servidor de desarrollo respondió 401 sin sesión a `PATCH` y `GET ?scope=completable`.
- Resultado de las pruebas: todas aprobadas. `npm run test:t09` (integración con concurrencia real contra Supabase de pruebas) fue preparado y **no se ha ejecutado**; la concurrencia de esta función queda cubierta solo por el bloqueo de fila (`FOR UPDATE`) y por la validación manual de la cancelación.
- Errores identificados: (1) `vercel dev` pidió volver a iniciar sesión en Vercel (credenciales vencidas) durante las pruebas locales, lo que impidió levantar un servidor nuevo; se usó un servidor ya abierto que recompila `api/`; (2) `spec.md` no define si repetir una cancelación es un error o una operación idempotente.
- Correcciones realizadas: (1) sin cambios de código; la sesión de Vercel debe renovarse (`vercel login`); (2) se eligió idempotencia (200 con `alreadyInState`), coherente con aprobar y rechazar solicitudes; pendiente de confirmación formal.
- Límites conocidos: no hay filtros por fecha y odontólogo ni historial de citas canceladas o completadas; el listado "por cerrar" y la acción Completar requieren una cita ya terminada, por lo que su prueba manual necesita datos preparados en el entorno de pruebas.
- Commit de Git: `feat(appointments): gestionar estados de citas (cancelar y completar)` (hash `985b578`).

### 3.8 Iteración LP — Landing page pública (RF-11; no cuenta como ciclo IA-01 a IA-03)

- Estado: **En desarrollo en la rama `feature/landing-page`** (sin fusionar a `main`; sin validación manual en navegador)
- Tarea del plan: T-LP
- Objetivo: convertir `/` en una landing llamativa de la Clínica Dental Flow con tarjetas de servicios, contacto ficticio (Oreamuno de Cartago, teléfono 2500 0002, correo ficticio), el formulario de solicitud sin login y el acceso al sitio administrativo, sin cambiar reglas de negocio ni APIs.
- Prompt utilizado: solicitud del responsable de crear una rama desde `main`, actualizar `intent.md`, `spec.md` y `plan.md` (v0.3, RF-11, P-17, T-LP) e implementar la landing.
- Archivos: `intent.md`, `spec.md`, `plan.md`, `index.html`, `src/pages/LandingPage.tsx`, `src/landing/{content.ts,icons.tsx}`, `src/pages/AvailabilityPage.tsx` (prop `embedded`; mismo flujo), `src/App.tsx`, `src/styles.css`, `tests/unit/landing.test.ts`, `README.md`, `docs/demo.md`.
- Resultado generado por Claude Code: landing con identidad propia (azul tinta, aguamarina y coral; ilustración de un diente; tipografías Outfit y Nunito Sans con alternativa del sistema), seis tarjetas de servicios ilustrativos sin precios, pasos "cómo funciona", formulario incrustado que reutiliza `AvailabilityPage` y enlaces a `/login`.
- Pruebas ejecutadas y resultados: 205 pruebas unitarias aprobadas (11 nuevas: contenido y contacto ficticio, coherencia del horario con el seed, sin precios, menú con secciones existentes, formulario solo con APIs públicas, `/disponibilidad` conservada y render real del componente con `react-dom/server`); `lint`, `typecheck` y `build` sin errores; las rutas `/`, `/disponibilidad`, `/login` y `/admin` responden 200 en el servidor de desarrollo.
- Revisión humana: **pendiente** (apariencia, textos y comportamiento en navegador).
- Límites conocidos: no hay captura de pantalla ni prueba visual automatizada (no hay navegador disponible en el entorno de desarrollo); las tipografías se cargan desde Google Fonts y, sin conexión, se usan las del sistema.
- Commit de Git: ver `git log` de la rama `feature/landing-page`.

### Ciclo 1 (IA-01) — Restricción de solapamiento y aprobación atómica

- Estado: **Completada** (commit `feat(db): garantizar integridad de reservas y aprobación atómica`, hash `a4e714e`)
- Tarea del plan: T-03 (restricción `EXCLUDE USING gist`, función `approve_appointment_request` y pruebas de concurrencia contra Supabase Cloud)
- Objetivo: impedir citas confirmadas superpuestas por odontólogo (RB-05) y garantizar que aprobar una solicitud pública sea atómico e idempotente (RB-12), sin modificar las migraciones 1 a 5.
- Prompt utilizado: instrucción "T-03: Reglas de integridad de reservas" entregada a Claude Code (rol de ingeniero senior de PostgreSQL; restricciones: migración nueva, sin `db push`, sin frontend ni APIs, sin datos reales, sin commit ni push, sin declarar exitosas pruebas no ejecutadas).
- Archivos creados o modificados: `supabase/migrations/20261123000000_booking_integrity.sql`, `supabase/verification/t03_post_apply_checks.sql`, `tests/integration/t03-booking-integrity.test.ts`, `supabase/README.md`, `spec.md` (CA-09e), `package.json` y `package-lock.json` (`pg`, `@types/pg`, script `test:t03`), `vitest.integration.config.ts`.
- Resultado generado por Claude Code: `appointments_no_overlap` (`EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')`) y `public.approve_appointment_request(uuid, uuid)`: `SELECT … FOR UPDATE`, devuelve la misma cita si ya está aprobada, revalida futuro, odontólogo activo y franja semanal, inserta cita, actualiza solicitud y audita en una transacción; `SECURITY INVOKER`, `search_path` vacío, `EXECUTE` solo para `service_role`; errores `P0001` con el código estable como mensaje.
- Revisión humana: el responsable revisó el diseño, aprobó usar `SLOT_UNAVAILABLE` (con `DETAIL`) para odontólogo inactivo o fuera de franja, autorizó y aplicó la migración en DentalFlow-Test y DentalFlow (desarrollo) y ejecutó las pruebas.
- Pruebas ejecutadas: validación previa del asistente en PGlite (Postgres local en memoria; 19 escenarios secuenciales y las 6 comprobaciones SQL, sin concurrencia real ni roles de Supabase); en Supabase Cloud, `npm run test:t03` ejecutado por el responsable contra DentalFlow-Test.
- Resultado de las pruebas: PGlite, 19 de 19 aprobados. DentalFlow-Test, **17 pruebas aprobadas** (informado por el responsable): 5 de RB-05 (mismo horario `23P01`, odontólogos distintos, bloques contiguos, cita cancelada, solicitudes pendientes), 10 de RB-12 (aprobación, repetida, 5 concurrentes, 2 solicitudes del mismo bloque, horario ocupado, doctores distintos, rechazada, expirada, fuera de franja, inexistente) y 2 de privilegios (`anon`, `authenticated`). Migración aplicada en ambos proyectos. No se informó la ejecución de `t03_post_apply_checks.sql` en Supabase.
- Errores identificados: (1) la comprobación 3 de `t03_post_apply_checks.sql` comparaba `proconfig` como texto y fallaba por el escape de comillas; (2) `spec.md` no definía el código para odontólogo inactivo o fuera de franja al aprobar.
- Correcciones realizadas: (1) se comparó con `proconfig @> array['search_path=""']`, verificado en PGlite; (2) el responsable aprobó `SLOT_UNAVAILABLE` y se registró en CA-09e.
- Commit de Git: `feat(db): garantizar integridad de reservas y aprobación atómica` (hash `a4e714e`).
- Aprendizaje obtenido: la exclusión en PostgreSQL es la garantía real ante concurrencia y la función solo debe traducirla a un error estable; validar primero en un Postgres local detectó fallos sin tocar Supabase, pero la concurrencia solo se demuestra con conexiones independientes contra el servicio real.

### Ciclo 2 (IA-02) — Solicitudes, reservas y aprobación

- Estado: **Completada** (T-07, T-08 y T-09A; commits `feat(requests): implementar disponibilidad, solicitudes públicas y aprobación de citas` (hash `17c621a`) y `feat(appointments): implementar reserva telefónica directa` (hash `60b8adf`))
- Tarea del plan: T-07, T-08 y T-09A (solicitud pública, reserva telefónica, aprobación/rechazo, validaciones, idempotencia y permisos por rol)
- Objetivo: dos vías hacia una cita confirmada sin duplicar en el frontend las reglas de la base de datos: (a) paciente solicita → personal revisa → aprueba o rechaza; (b) personal registra una cita telefónica confirmada de inmediato. En ambas, `appointments_no_overlap` impide la doble reserva.
- Prompts utilizados: "Implementar solicitudes públicas y aprobación de citas" y "Cierre del flujo público e implementación de citas telefónicas" (restricciones: sin Google Calendar ni recordatorios, sin modificar migraciones existentes, migración nueva sin aplicar, sin pruebas destructivas contra Desarrollo, sin push, commits solo a pedido).
- Archivos creados o modificados:
  - Solicitudes y aprobación: `supabase/migrations/20261123010000_public_requests.sql`, `shared/request-validation.ts`, `api/_lib/{http,requests-service,supabase-rest}.ts`, `api/public/appointment-requests.ts`, `api/admin/appointment-requests/*`, `src/pages/{AvailabilityPage,RequestsPanel,AdminDashboard}.tsx`, `src/lib/{adminApi,availabilityApi}.ts`, `tests/integration/t07-public-requests.test.ts`.
  - Reserva telefónica: `supabase/migrations/20261123020000_phone_appointments.sql`, `api/_lib/phone-booking-service.ts`, `api/admin/appointments.ts` (GET y POST), `src/pages/PhoneBookingPanel.tsx`, `src/lib/adminApi.ts`, `tests/unit/phone-booking.test.ts`, `tests/integration/t08-phone-appointments.test.ts`, `supabase/README.md`.
- Resultado generado por Claude Code: funciones SQL transaccionales (límite persistente por IP anonimizada, alta idempotente de solicitud con tope de pendientes, rechazo auditado, cita telefónica con auditoría); endpoints público y administrativos con permisos validados en el servidor (el origen y el autor los fija el servidor); formulario con número de solicitud, panel de aprobación y sección "Nueva cita telefónica".
- Revisión humana: el responsable aplicó las migraciones 7 y 8 en DentalFlow Desarrollo y validó manualmente (1) el flujo público: la solicitud queda registrada, la recepcionista la aprueba, la cita aparece en el dashboard y el horario desaparece de la disponibilidad pública; (2) la cita telefónica: la recepcionista la registra, queda confirmada, aparece en el listado administrativo y el horario deja de estar disponible.
- Pruebas ejecutadas: 161 pruebas unitarias aprobadas (solicitud válida, datos inválidos, repetidas/idempotentes, aprobación, rechazo, conflicto de horario, acceso no autorizado 401/403, aprobación repetida sin duplicar, cita telefónica válida/inválida/ocupada/carrera/idempotente, las pendientes no bloquean); 31 comprobaciones de la migración 7 y 18 de la migración 8 en Postgres local (PGlite); `vercel dev` con las rutas administrativas respondiendo 401 sin sesión.
- Resultado de las pruebas: todas aprobadas. `npm run test:t07` y `npm run test:t08` (integración con concurrencia real contra Supabase de pruebas) fueron preparados y **no se han ejecutado**; la concurrencia real de estas dos funciones queda cubierta solo por la restricción ya probada en T-03 (17 pruebas) y por la validación manual.
- Errores identificados: (1) el límite de uso vive en el esquema `private`, que la Data API no expone, por lo que hizo falta una migración con funciones; (2) el código HTTP del tope de pendientes por correo no estaba definido en `spec.md` (se propuso 429 `RATE_LIMITED`); (3) un `INSERT` desde el backend no garantiza que cita y auditoría se guarden juntas ni resuelve la idempotencia sin carreras, lo que justificó la migración 8; (4) la lógica de selección de horario quedó duplicada entre `AvailabilityPage` y `PhoneBookingPanel`.
- Correcciones realizadas: (1) y (3) migraciones nuevas sin tocar las anteriores; (2) decisión documentada, pendiente de confirmación formal; (4) se dejó sin refactorizar a propósito para no arriesgar el flujo público ya validado (deuda técnica registrada).
- Commit de Git: `17c621a` (solicitudes públicas, disponibilidad y aprobación) y `60b8adf` (reserva telefónica).
- Aprendizaje obtenido: delegar la decisión en funciones transaccionales de PostgreSQL y traducir sus códigos de error en el backend mantiene las reglas en un solo lugar y hace verificables la idempotencia y los conflictos; la validación local en un Postgres en memoria detecta errores de SQL antes de tocar Supabase, pero no sustituye las pruebas de concurrencia reales.

### Ciclo 3 (IA-03) — Integración Google Calendar y validación

- Estado: **Pendiente** (no existe todavía; no se ha ejecutado ninguna iteración que lo acredite)
#### Nota de alcance y propuesta (2026-11-24) — no es evidencia, es plan

**Qué exige la consigna académica** (`Proyecto_Final_LE_Claude_Code.pdf`, pp. 3 y 5): `docs/uso-ia.md` debe tener "al menos tres ciclos: tarea, prompt o extracto relevante, resultado del agente, revisión humana, corrección y commit asociado", y la rúbrica pide "tres ciclos de trabajo; revisión, corrección e iteración humanas vinculadas a commits". La consigna **no exige** Google Calendar. Que IA-03 fuera Google (T-10 a T-12) es una propuesta del propio proyecto (`plan.md` §6), no un requisito del docente.

**Estado de los candidatos ya realizados.** Las iteraciones T-UI (§3.6, `2729a32`) y gestión de estados de citas (§3.7, `985b578`) tienen prompt, resultado, validación manual y commit, pero **todavía no tienen un ciclo de revisión y corrección propio**: en T-UI no se registró ningún defecto corregido, y lo anotado en T-09 es una decisión de especificación y un problema de entorno, no una corrección del código generado. Por eso, tal como están documentadas, **no deben presentarse como IA-03**. Tampoco se ha realizado una revisión independiente adicional del código.

**Propuesta alternativa válida (si Google Calendar no se implementa).** IA-03 = "Revisión y endurecimiento de la gestión de citas y del dashboard (T-UI + T-09)", ejecutada como trabajo real. Evidencia concreta que habría que generar:

1. **Validar manualmente la finalización de citas** (hoy solo tiene pruebas automatizadas) preparando datos en el proyecto de pruebas, y ejecutar `npm run test:t09` (y `test:t08`, `test:t07`) registrando el resultado real.
2. **Pedir una revisión** con la pregunta de la consigna (p. 6): "Contrasta este flujo con los requisitos. Identifica fallos de reglas, datos y manejo de errores. Propón cómo reproducirlos antes de corregirlos y registra el resultado", sobre el diff de `2729a32..985b578`. Registrar quién la ejecutó (por ejemplo, la revisión de código de Claude Code o Codex, **solo si realmente se ejecuta**) y guardar la salida.
3. **Triaje humano** de cada hallazgo: aceptar, descartar con motivo o aplazar. Si no hay hallazgos aceptables, registrarlo tal cual (no inventar defectos) y usar la alternativa B.
4. **Reproducir cada hallazgo aceptado con una prueba que falle**, corregir, y confirmar que pasa.
5. **Commit específico** por corrección, con su hash, y actualizar este ciclo con prompt, resultado, revisión, corrección y commit.

**Alternativa B** (si la revisión no produce correcciones reales): una iteración de **funcionalidad nueva** y pequeña que sí exige prompt, revisión y corrección, por ejemplo T-14A (salud del sistema y Modo Contingencia, que además responde al requisito de la consigna de "manejar la caída de servicios externos") o T-13 (recordatorios simulados), documentada solo después de ejecutarla.

**Limitación explícita:** no es posible determinar hoy si habrá tiempo para completar IA-03 antes del 25 de noviembre de 2026. Si no se completa, este ciclo debe seguir marcado como pendiente o no realizado, con la causa, y el proyecto lo declarará como limitación.


- Tarea del plan: T-10, T-11 y T-12 (OAuth con `state` persistido, sincronización, reintento, desconexión/reconexión y cancelación)
- Objetivo:
- Prompt utilizado:
- Archivos creados o modificados:
- Resultado generado por Claude Code:
- Revisión humana:
- Pruebas ejecutadas:
- Resultado de las pruebas:
- Errores identificados:
- Correcciones realizadas:
- Commit de Git:
- Aprendizaje obtenido:

## 4. Principios de supervisión humana

1. Revisar los cambios propuestos por Claude Code.
2. Validar que cada implementación respete intent.md, spec.md y plan.md.
3. Ejecutar las pruebas antes de aceptar una tarea.
4. Corregir errores mediante nuevas iteraciones controladas.
5. Registrar evidencia verificable y asociarla con commits.
6. No incluir credenciales ni información sensible en los prompts o repositorios.
