
# DentalFlow — Evidencia de desarrollo asistido por IA

## 1. Información general

- Proyecto: DentalFlow
- Curso: Laboratorio Ejecutivo en Claude Code
- Universidad: CENFOTEC
- Agente principal: Claude Code
- Agente complementario: Codex (cuando corresponda)
- IDE: Visual Studio Code
- Metodología: Desarrollo incremental con pruebas y revisión humana

## 2. Objetivo

Documentar cómo se utiliza la inteligencia artificial para construir DentalFlow, incluyendo las instrucciones proporcionadas al agente, sus resultados, las verificaciones humanas y las correcciones realizadas.

Las evidencias se registrarán después de ejecutar cada tarea. No se incluirán resultados, pruebas ni commits que no hayan ocurrido.

## 3. Registro de ciclos

Los tres ciclos corresponden a IA-01, IA-02 e IA-03 de `plan.md` §6 y a las tareas reales del plan. La iteración documental T-00 se registra aparte (sección 3.1) y no cuenta como uno de los tres ciclos.

### 3.1 Iteración preparatoria T-00 — Alineamiento documental

- Estado: **En curso** (documentos actualizados; revisión humana, comprobaciones y commit pendientes)
- Tarea del plan: T-00
- Objetivo: alinear `intent.md`, `spec.md`, `plan.md` y este documento con las decisiones confirmadas (roles `admin`/`receptionist`, Supabase Cloud sin Docker, reservas telefónicas directas, solicitudes públicas con aprobación, integración Google con cuenta personal, Modo Productivo/Contingencia, recordatorios simulados y exclusiones) y resolver las inconsistencias detectadas entre los documentos.
- Prompt utilizado: instrucción de la iteración T-00 entregada a Claude Code en VS Code (rol de arquitecto de software y analista funcional; decisiones confirmadas; inconsistencias a resolver; restricciones: no crear código, no instalar dependencias, no modificar `.gitignore`, no hacer commit). El texto íntegro del prompt se conservará como evidencia fuera de este resumen, sin credenciales ni datos sensibles.
- Archivos modificados: `intent.md`, `spec.md`, `plan.md`, `docs/uso-ia.md`.
- Resultado: documentos actualizados a la versión 0.2 con nuevos requisitos (RF-08 a RF-10), reglas (RB-11 a RB-13), tablas (`appointment_requests`, `appointment_audit`, `private.oauth_states`), matriz de permisos, contratos HTTP con códigos `422`/`409`, tareas nuevas (T-09A, T-14A) y decisiones D-01 a D-10 incorporadas y aprobadas (ver `plan.md` §10). Es una especificación; nada de lo descrito está implementado.
- Revisión humana: el responsable **aprobó** las decisiones D-01 a D-10 el 2026-11-22 (en conversación, sin cambios). Una revisión independiente con Codex identificó dos inconsistencias editoriales: el texto que presentaba permisos de `receptionist` como pendientes y el que presentaba D-01 a D-10 como pendientes. Se solicitaron correcciones para resolverlas. La revisión final línea por línea del diff, su aceptación y el commit siguen **pendientes**.
- Pruebas ejecutadas: **pendiente de registrar** (comprobación `git diff --check` y revisión cruzada de consistencia).
- Resultado de las pruebas: pendiente.
- Errores identificados: pendiente.
- Correcciones realizadas: pendiente.
- Commit de Git: **pendiente** (no se ha creado ningún commit).
- Aprendizaje obtenido: pendiente.

### 3.2 Iteración T-01 — Corrección de `vercel dev` (no cuenta como ciclo IA-01 a IA-03)

- Estado: **Completada** (ver commit `feat: inicializar React, Vite y Vercel Functions`; hash en `git log`)
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
- Commit de Git: `feat: inicializar React, Vite y Vercel Functions` (hash: ver `git log`).
- Aprendizaje obtenido: la comprobación del mensaje de error del CLI no basta; hay que reproducir el arranque y llamar a la API para descubrir el segundo problema (puerto).

### 3.3 Iteración T-02 — Modelo de datos en Supabase y prueba P-10 (no cuenta como ciclo IA-01 a IA-03)

- Estado: **Completada** (commit `feat(db): implementar esquema inicial Supabase y pruebas de seguridad`; hash en `git log`)
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
- Commit de Git: `feat(db): implementar esquema inicial Supabase y pruebas de seguridad` (hash: ver `git log`).
- Aprendizaje obtenido: separar lo que el asistente puede verificar de lo que solo se puede comprobar en el entorno real evita registrar evidencia simulada; las pruebas contra servicios externos deben fallar de forma visible cuando faltan credenciales.

### 3.4 Iteración T-04 — Autenticación del personal y autorización por rol (no cuenta como ciclo IA-01 a IA-03)

- Estado: **Completada** (commit `feat(auth): implementar login del personal y autorización por rol`; hash en `git log`)
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
- Commit de Git: `feat(auth): implementar login del personal y autorización por rol` (hash: ver `git log`).
- Aprendizaje obtenido: el comportamiento de `vercel dev` con variables de entorno y rewrites no es el de producción ni el de Vite solo; conviene verificar con peticiones reales y diferenciar "no configurado" de "servicio no disponible" para no ocultar la causa.

### 3.5 Iteración T-05 (parcial) y T-06 — Consulta de disponibilidad (no cuenta como ciclo IA-01 a IA-03)

- Estado: **T-06 completada; T-05 en curso** (solo la parte de consulta; la administración de odontólogos y franjas está pendiente)
- Prompt utilizado: "Cerrar T-04 e implementar T-05/T-06" (solo lectura; sin crear citas ni aprobaciones).
- Archivos: `shared/clinic-time.ts`, `shared/availability.ts`, `api/_lib/availability-service.ts`, `api/_lib/supabase-rest.ts`, `api/public/doctors.ts`, `api/public/slots.ts`, `src/pages/AvailabilityPage.tsx`, `src/lib/availabilityApi.ts`, `vercel.json`, pruebas en `tests/unit/`.
- Resultado generado por Claude Code: cálculo puro de bloques de 30 minutos alineados a :00/:30 en `America/Costa_Rica`, ventana de reserva (1 hora a 30 días), exclusión de citas confirmadas, lectura exclusiva de columnas no sensibles, y página pública con estados de carga, vacío y error.
- Pruebas ejecutadas y resultados: 77 pruebas unitarias aprobadas (odontólogo activo/inactivo, fecha válida/inválida, día sin horarios, espacio ocupado/libre, consulta sin escritura ni datos de pacientes); contra el proyecto de desarrollo en modo lectura: 16 horarios un lunes para la Dra. Morales, 0 un sábado, 422 para entradas inválidas.
- Decisión de diseño: odontólogo inactivo o inexistente en `slots` → 422 (coherente con CA-02c/CA-04c/CA-08b).
- Pendiente de T-05: alta/edición de odontólogos y franjas por `admin` con sus validaciones y el `403` para `receptionist`.

### Ciclo 1 (IA-01) — Restricción de solapamiento y aprobación atómica

- Estado: **Completada** (commit `feat(db): garantizar integridad de reservas y aprobación atómica`; hash en `git log`)
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
- Commit de Git: `feat(db): garantizar integridad de reservas y aprobación atómica` (hash: ver `git log`).
- Aprendizaje obtenido: la exclusión en PostgreSQL es la garantía real ante concurrencia y la función solo debe traducirla a un error estable; validar primero en un Postgres local detectó fallos sin tocar Supabase, pero la concurrencia solo se demuestra con conexiones independientes contra el servicio real.

### Ciclo 2 (IA-02) — Solicitudes, reservas y aprobación

- Estado: **En curso** (T-07 y T-09A completadas; T-08, reserva telefónica, en desarrollo y todavía sin commit)
- Tarea del plan: T-07, T-08 y T-09A (solicitud pública, reserva telefónica, aprobación/rechazo, validaciones, idempotencia y permisos por rol)
- Objetivo: flujo paciente solicita → personal revisa → aprueba o rechaza → cita confirmada, sin duplicar en el frontend las reglas de la función `approve_appointment_request`.
- Prompt utilizado: "Implementar solicitudes públicas y aprobación de citas" (restricciones: sin Google Calendar ni recordatorios, sin tocar T-03 ni sus migraciones, sin commit ni push, sin ampliar el alcance).
- Archivos creados o modificados (parte pública y aprobación): `supabase/migrations/20261123010000_public_requests.sql`, `shared/request-validation.ts`, `api/_lib/{http,requests-service,supabase-rest}.ts`, `api/public/appointment-requests.ts`, `api/admin/appointment-requests/*`, `api/admin/appointments.ts`, `src/pages/{AvailabilityPage,RequestsPanel,AdminDashboard}.tsx`, `src/lib/{adminApi,availabilityApi}.ts`, `tests/unit/*`, `tests/integration/t07-public-requests.test.ts`, `supabase/README.md`, `.env.example`.
- Resultado generado por Claude Code: tres funciones SQL (límite persistente por IP anonimizada, alta idempotente de solicitud con tope de 3 pendientes por correo, rechazo auditado); endpoints público y administrativos con permisos validados en servidor; formulario con número de solicitud y panel de aprobación con avisos de resultado y conflicto.
- Revisión humana: el responsable aplicó la migración en DentalFlow Desarrollo y **validó manualmente el flujo completo**: el paciente crea una solicitud que queda registrada en Supabase, la recepcionista la aprueba, la cita confirmada aparece en el dashboard y el horario ocupado desaparece de la disponibilidad pública.
- Pruebas ejecutadas: 139 pruebas unitarias (solicitud válida, datos inválidos, repetidas/idempotentes, aprobación, rechazo, conflicto de horario, acceso no autorizado 401/403, aprobación repetida sin duplicar); 31 comprobaciones de la migración en Postgres local (PGlite); `vercel dev` con las rutas administrativas respondiendo 401 sin sesión.
- Resultado de las pruebas: todas aprobadas. `npm run test:t07` (integración con concurrencia real contra DentalFlow-Test) fue preparado y **no se ha ejecutado**.
- Errores identificados: (1) el límite de uso vive en el esquema `private`, que la Data API no expone, por lo que hizo falta una migración con funciones; (2) el código HTTP del tope de pendientes por correo no estaba definido en `spec.md` (se propuso 429 `RATE_LIMITED`).
- Correcciones realizadas: (1) migración nueva sin tocar las anteriores; (2) decisión documentada, pendiente de confirmación del responsable.
- Commit de Git: `feat(requests): implementar disponibilidad, solicitudes públicas y aprobación de citas` (hash: ver `git log`; la parte de reserva telefónica se registrará en su propio commit).
- Aprendizaje obtenido: delegar la decisión en funciones transaccionales de PostgreSQL y traducir sus códigos de error en el backend mantiene las reglas en un solo lugar y hace verificables la idempotencia y los conflictos.

### Ciclo 3 (IA-03) — Integración Google Calendar y validación

- Estado: Pendiente
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
