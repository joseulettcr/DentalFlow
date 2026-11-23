
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

- Estado: Pendiente
- Tarea del plan: T-07, T-08 y T-09A (solicitud pública, reserva telefónica, aprobación/rechazo, validaciones, idempotencia y permisos por rol)
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
