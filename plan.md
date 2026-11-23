# DentalFlow — plan.md

**Versión:** 0.2 — plan alineado con `intent.md` v0.2 y `spec.md` v0.2 (iteración T-00)

**Responsable previsto:** estudiante/desarrollador del proyecto (confirmar si el trabajo será grupal).

**Estado general:** **Planificación en curso**. Aún no se ha ejecutado ni validado código ni se han generado commits.

**Herramientas:** VS Code + Claude Code o Codex; Git/GitHub; React/TypeScript; Supabase Cloud; Google Calendar; Vercel.

## 1. Política de trabajo

- Implementar por **cortes verticales**: interfaz, API, base de datos y prueba del mismo requisito cuando corresponda.
- Dar al agente el contexto exacto (`intent.md`, `spec.md`, `plan.md`) y **solo una tarea por iteración**. Pedir primero análisis breve, después cambios acotados y finalmente evidencia de ejecución.
- No aceptar código solo por parecer correcto. Ejecutar pruebas, revisar diffs, verificar secretos y realizar commits descriptivos.
- Usar pruebas antes o junto con la implementación de reglas críticas (conflictos de agenda, aprobación de solicitudes, cambios de estado, autorización).
- Nunca marcar `Completada` una tarea sin ejecución verificable; registrar commit real o evidencia. No se inventarán hashes, resultados ni mediciones.
- Mantener `docs/uso-ia.md` con al menos tres ciclos completos de tarea, prompt, resultado del agente, revisión humana, corrección y commit.
- Entorno de datos: **Supabase Cloud**; no se requiere Docker ni Supabase local.

## 2. Fases y tareas verificables

**Estados permitidos:** `Pendiente`, `En curso`, `Completada`. Para este borrador solo la definición documental (T-00) está en curso; las tareas de implementación están pendientes. Las tareas `T-09A` y `T-14A` son nuevas en v0.2 (los identificadores existentes se conservan).

| ID | Fase | Tarea concreta | Depende de | Entregable | Criterio de finalización (DoD) | Estado |
|---|---|---|---|---|---|---|
| T-00 | Definir | Revisar y alinear `intent.md`, `spec.md`, `plan.md` y `docs/uso-ia.md`; fijar supuestos y reglas; resolver decisiones D-01 a D-10 | — | Cuatro documentos alineados | Decisiones validadas por revisión humana e incorporadas al repo con commit real | En curso |
| T-01 | Preparar | Crear React + Vite + TypeScript, Vercel Functions (`npm run dev` con `vercel dev`, D-01), lint, typecheck, Vitest y `.env.example` | T-00 | Estructura y scripts | Instala y abre localmente; scripts ejecutan sin error; sin Docker ni Supabase local requeridos | Pendiente |
| T-02 | Datos | Crear migraciones `doctors`, `weekly_schedules`, `appointments`, `appointment_requests`, `appointment_audit`, `staff_profiles`, tablas privadas (`google_connections`, `oauth_states`, `booking_rate_limits`) y seed sintético | T-01 | SQL versionado en `supabase/migrations/`, seed | Las migraciones y el seed se aplican sobre un proyecto Supabase Cloud nuevo y reproducen el esquema y datos | Pendiente |
| T-03 | Datos | Implementar exclusión de intervalos y la función transaccional de aprobación de solicitudes (RB-05, RB-12); pruebas de integración de concurrencia | T-02 | Constraint, función SQL y pruebas | Dos reservas simultáneas no producen duplicidad; aprobación repetida/concurrente produce una sola cita | Pendiente |
| T-04 | Seguridad | Integrar Supabase Auth, roles `admin`/`receptionist` y comprobación de permisos en APIs administrativas | T-02 | Login/logout y middleware | Acceso 401/403 verificable según matriz de `spec.md` §1; sin creación pública de staff | Pendiente |
| T-05 | Agenda | API y UI de odontólogos activos/inactivos y franjas semanales (escritura solo `admin`) | T-02, T-04 | CRUD/schedules | Horarios inválidos rechazados; `receptionist` recibe 403 al editar; reglas en tests | Pendiente |
| T-06 | Disponibilidad | Construir cálculo de bloques de 30 min y endpoint público (200 vacío vs 422) | T-03, T-05 | `/api/public/slots`, selector | Horas libres correctas, sin datos de pacientes; pendientes no bloquean | Pendiente |
| T-07 | Reserva | Implementar formulario público y API de **solicitudes** (`appointment_requests`) con idempotencia y rate limit persistente (RF-08) | T-02, T-06 | Registro de solicitudes pendientes | Solicitud persiste como `pending` sin crear cita; errores `409`/`422`/`429`; pruebas | Pendiente |
| T-08 | Reserva | Incorporar reserva telefónica directa desde el dashboard con API transaccional e idempotencia (RF-04) | T-03, T-04, T-06 | Formulario administrativo | Personal registra cita confirmada con las mismas reglas de horario; `409` en conflicto | Pendiente |
| T-09A | Gestión | Listar, aprobar y rechazar solicitudes con la función transaccional (RF-09, RB-12) | T-03, T-04, T-07, T-08 | UI y API de solicitudes | Aprobación crea una sola cita; conflicto → `409` sin duplicado; repetición idempotente; pruebas P-12/P-13 | Pendiente |
| T-09 | Gestión | Listar y filtrar citas, cancelar/completar con auditoría y proteger transiciones | T-08, T-09A | Dashboard funcional | Consulta persistida y estados correctos; `appointment_audit` registrado; tests | Pendiente |
| T-10 | Integración | Configurar Google Cloud/OAuth de prueba con cuenta personal, `state` persistido con expiración, credenciales privadas, almacenamiento cifrado, desconexión y reconexión | T-04 | Conexión real, status y desconexión | Admin conecta, desconecta y reconecta de modo seguro; `state` inválido rechazado; tokens ocultos | Pendiente |
| T-11 | Integración | `events.insert` con ID estable tras reserva telefónica o aprobación, seguimiento de estado y reintento | T-08, T-09A, T-10 | Evento real Google | Una cita crea un evento sin duplicidad; falla recuperable | Pendiente |
| T-12 | Integración | Borrar evento al cancelar y recuperar fallos parciales | T-09, T-11 | Cancelación sincronizada | Google elimina evento o lo deja en cola visible para reintento | Pendiente |
| T-13 | Recordatorios | Pantalla `SIMULACIÓN — NO ENVIADO` para próximas 24 h | T-09 | Vista previa funcional | Muestra solo citas confirmadas en ventana; sin envíos | Pendiente |
| T-14 | Seguridad | Validar RLS, grants, secretos, rate limiting persistente y errores de API | T-02, T-07, T-11 | Tests seguridad, controles | Roles anon bloqueados en datos sensibles; 429 probado | Pendiente |
| T-14A | Resiliencia | Health checks desde backend y Modos Productivo/Contingencia (RF-10, RB-13) | T-07, T-11 | `/api/health`, `system-status`, avisos en UI | Fallo simulado de Supabase → 503 sin escritura; fallo de Google → citas conservadas y banner | Pendiente |
| T-15 | Calidad | Ejecutar pruebas de flujo completo, regla crítica, entrada inválida y regresión (P-01 a P-16) | T-09, T-12, T-13, T-14, T-14A | Suite de pruebas/evidencia | Comandos repetibles pasan; registrar fallos/correcciones | Pendiente |
| T-16 | Evidencia IA | Consolidar tres ciclos (IA-01, IA-02, IA-03) en `docs/uso-ia.md` con revisión humana y commits | T-03, T-07, T-09A, T-11 | Documento de uso de IA | Tres ciclos auténticos y trazables | Pendiente |
| T-17 | Entrega | Crear `README.md`, `docs/negocio.md`, `docs/demo.md` y datos de demo | T-15 | Documentación completa | Instalación, mediciones (indicador dividido), costos, límites y demo reproducibles | Pendiente |
| T-18 | Despliegue | Configurar Vercel, variables de entorno y OAuth redirect de demo | T-12, T-14, T-14A | URL desplegada o contingencia local | Flujo end-to-end validado en entorno de demo | Pendiente |
| T-19 | Demo | Ensayar demo de 12 min, caso inválido, falla externa, pruebas y repositorio | T-16, T-17, T-18 | Guion y evidencias | Ensayo dentro de tiempo; commit/tag final registrado | Pendiente |

## 3. Dependencias y hitos

| Hito | Tareas | Resultado que debe funcionar |
|---|---|---|
| H0 — Contrato | T-00, T-01 | Repositorio reproducible y alcance aceptado. |
| H1 — Agenda segura | T-02 a T-06 | Login con roles, odontólogos, horarios y consulta pública de bloques. |
| H2 — Reserva end-to-end | T-07, T-08, T-09A, T-09 | Paciente solicita, personal aprueba o registra citas telefónicas, el dashboard las muestra y se impide doble reserva. |
| H3 — Integración real y resiliencia | T-10 a T-13, T-14A | Google Calendar refleja reservas/cancelaciones, recordatorios simulados diferenciados y modos operativos definidos. |
| H4 — Validación y entrega | T-14 a T-19 | Pruebas, controles, tres ciclos IA, datos, documentación y demo. |

**Orden de priorización ante falta de tiempo:** no sacrificar H1/H2 ni la documentación/pruebas para añadir estética; Google Calendar es un compromiso acordado del MVP y requiere un bloque específico de integración y contingencia. Recordatorios se mantienen como **simulación**, nunca se presentan como enviados.

## 4. Matriz de trazabilidad requisito → tarea → comprobación

Las columnas `Evidencia/commit` están vacías porque aún no existen implementaciones verificadas.

| Requisito | Tarea(s) | Prueba / comprobación | Evidencia / commit real |
|---|---|---|---|
| RF-01 | T-04, T-14 | P-01, P-14: login, `401` sin sesión y `403` sin permiso | Pendiente |
| RF-02 | T-05 | P-02, P-14: franja válida, inválida, protección de citas futuras y `403` a `receptionist` | Pendiente |
| RF-03 | T-06 | P-02/P-03: slots exactos, bloque ocupado oculto, 200 vacío vs 422 y sin PII | Pendiente |
| RF-04 | T-03, T-08 | P-03/P-04/P-05: persistencia, simultaneidad, idempotencia y entradas inválidas | Pendiente |
| RF-05 | T-09 | P-03/P-08: consulta, cancelación con auditoría y transición a completada | Pendiente |
| RF-06 | T-10, T-11, T-12 | P-06/P-07/P-08/P-15: conexión, evento real, recuperación, eliminación, desconexión y `state` | Pendiente |
| RF-07 | T-13 | P-09: vista de 24 h y no envío | Pendiente |
| RF-08 | T-07, T-14 | P-05/P-11: solicitud pendiente sin bloqueo, idempotencia, `429` | Pendiente |
| RF-09 | T-03, T-09A | P-12/P-13: aprobación concurrente/repetida y conflicto | Pendiente |
| RF-10 | T-14A | P-16: Contingencia (`503`) y degradación de Google | Pendiente |
| RB-05 (no solapar) | T-03, T-08, T-09A | P-04/P-13: garantía concurrente directamente en PostgreSQL | Pendiente |
| RB-11 (pendientes no bloquean) | T-06, T-07 | P-11 | Pendiente |
| RB-12 (aprobación atómica) | T-03, T-09A | P-12/P-13 | Pendiente |
| RB-13 (modos operativos) | T-14A | P-16 | Pendiente |
| Seguridad | T-04, T-14 | P-01/P-10/P-14 y prueba `429`; revisión de secretos | Pendiente |

## 5. Plan de pruebas y comandos

**Los siguientes comandos son contrato de ejecución a implementar, no resultados actuales:**

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration   # contra proyecto Supabase Cloud de pruebas
# Arranque local frontend + funciones: npm run dev (vercel dev), documentado en README.
```

Las migraciones SQL (`supabase/migrations/`) se aplican a un proyecto Supabase Cloud nuevo; según D-02 (aprobada) se usan dos proyectos (desarrollo y pruebas) y `supabase db push` sin Docker. No se requiere Docker.

Además de las pruebas automáticas, documentar los siguientes casos de aceptación manual:

1. Abrir `/login`, acceder como `admin` y crear odontólogo con horario para una fecha futura.
2. Desde ventana privada enviar una **solicitud** pública con correo `paciente1@example.com`; comprobar que queda pendiente y que el bloque sigue libre.
3. Iniciar sesión como `receptionist` en otra sesión, ver la solicitud pendiente y **aprobarla**; comprobar persistencia, cita confirmada y horario ocupado.
4. Intentar reservar o aprobar el mismo bloque; mostrar `409 SLOT_UNAVAILABLE` o mensaje visible equivalente.
5. Registrar una **cita telefónica** directa en otro horario como `receptionist`.
6. Abrir el calendario Google autorizado y comprobar **evento real** y ausencia de nombre de paciente en el evento.
7. Cancelar desde dashboard; confirmar disponibilidad liberada y eliminación del evento, o estado recuperable en Google si se inyecta un fallo.
8. Mostrar recordatorio simulado etiquetado `NO ENVIADO`.
9. Mostrar el comportamiento de Modo Contingencia (simulado/controlado) sin presentar una reserva falsa.
10. Ejecutar comando de prueba y enseñar su salida real, sin inventar capturas.

## 6. Tres ciclos mínimos de IA a documentar

Se registrarán **después de ejecutar**, no de manera anticipada. Estos ciclos coinciden con los Ciclos 1 a 3 de `docs/uso-ia.md`:

| Ciclo | Alcance para pedir al agente | Revisión humana requerida | Evidencia futura |
|---|---|---|---|
| IA-01 | Restricción de solapamiento, función de aprobación atómica y tests de BD (T-03) | Revisar condición de exclusión, transacciones, bloqueo de fila y concurrencia | Prompt, diff, prueba, corrección, commit |
| IA-02 | Solicitud pública, reserva telefónica y aprobación/rechazo con validaciones (T-07/T-08/T-09A) | Revisar seguridad, errores, idempotencia, permisos por rol y datos expuestos | Prompt, diff, prueba, corrección, commit |
| IA-03 | OAuth Google y sincronización/reintento/desconexión (T-10/T-11/T-12) | Revisar secretos, alcance OAuth, `state`, idempotencia, manejo de fallos | Prompt, diff, prueba, corrección, commit |

La iteración T-00 (documental) se registra por separado en `docs/uso-ia.md` y **no cuenta** como uno de los tres ciclos.

### Plantilla de prompt por tarea (para Claude Code o Codex)

```text
Contexto: Estás trabajando en el repositorio DentalFlow. Lee intent.md,
spec.md y plan.md antes de cambiar archivos.
Tarea: Implementa únicamente T-XX y los RF/RB vinculados en plan.md.
Restricciones: No agregues funciones fuera de alcance. No expongas
SUPABASE_SECRET_KEY, secretos OAuth ni datos de pacientes. No cambies
pruebas para ocultar defectos. Conserva la lógica de reservas y la
aprobación de solicitudes (RB-12) en el servidor con garantía en
PostgreSQL. No dependas de Docker ni de Supabase local: el entorno es
Supabase Cloud.
Criterio de aceptación: [copiar exactamente CA/P pertinentes].
Verificación: Ejecuta [comando del test específico], luego typecheck/lint.
Entrega: Resume archivos modificados, decisiones, pruebas ejecutadas,
resultado real y cualquier limitación. Si falta una credencial o no puedes
verificar algo, indícalo explícitamente; no declares éxito sin evidencia.
No hagas commit sin revisión humana.
```

## 7. Documentación académica final que no debe olvidarse

- `README.md`: problema, autores, agente, instalación, comandos, datos sintéticos, ejecución, pruebas y guía de demo.
- `docs/uso-ia.md`: tres ciclos auténticos con tarea/prompt/agente/revisión/corrección/commit.
- `docs/negocio.md`: mediana manual vs. digital sobre **cinco casos simulados equivalentes** (más indicador complementario de solicitud pública), costos iniciales y recurrentes con supuestos, límites, controles, piloto, ajuste y ampliación.
- `docs/demo.md`: pasos cronometrados para 12 minutos, evidencia Google real, caso inválido, prueba automatizada y plan ante caída Google/Supabase.
- `supabase/migrations/`, `supabase/seed.sql`, `tests/`, `.env.example` sin secretos, fuente, dependencias y commits descriptivos.
- Entrega: enlace GitHub accesible al profesor + identificador de commit o tag **real**.

## 8. Preparación de demo (referencia de 12 minutos)

| Minutos | Qué mostrar |
|---|---|
| 0–2 | Problema de clínica **simulada**, actores y roles, indicador y supuestos. |
| 2–8 | Login; horario doctor; solicitud pública; aprobación por personal; cita en dashboard (Supabase); evento **real** de Google Calendar. |
| 8–10 | Duplicidad o entrada inválida; test ejecutable; fallo/corrección de agente. |
| 10–12 | Abrir `intent.md`, `spec.md`, `plan.md`, `docs/uso-ia.md`; indicador, costo, limitaciones y adopción. |
| 12–15 | Preguntas (si el docente conserva 3 min adicionales). |

**Contingencia:** disponer de seed en Supabase Cloud y de la verificación de estado del sistema. Si Google falla, mostrar la cita conservada con sincronización en error y el reintento; complementar con evento/evidencia de una ejecución previa claramente identificado, sin hacerlo pasar por una operación en vivo. Si Supabase falla, el sistema opera en Modo Contingencia: no se simula una reserva ni una solicitud como si estuviera persistida. Recordar reconectar Google antes de la demo (caducidad del token en modo de pruebas).

## 9. Registro de decisiones y avances

| Fecha | Decisión/avance | Responsable | Evidencia |
|---|---|---|---|
| 2026-11-21 | Clínica simulada; pacientes y personal crean citas; Google Calendar real; recordatorios simulados; React/Supabase/Vercel previstos. | Solicitante | Conversación de definición; aún sin commit |
| 2026-11-21 | Propuesta v0.1: paciente sin login, slots de 30 min, sincronización unidireccional, máximo 30 días, validación anti-solapamiento DB. | Asistente (propuesta) | Documentos iniciales, pendientes de incorporar al repositorio |
| 2026-11-22 | Decisiones confirmadas: roles `admin` y `receptionist`; Supabase Cloud sin Docker; reservas telefónicas directas; solicitudes públicas con aprobación (`appointment_requests`); Google con cuenta personal; Modo Productivo/Contingencia; recordatorios simulados; exclusiones (expedientes, pagos, WhatsApp, chatbots, IA en el producto). | Solicitante | Instrucción de la iteración T-00 |
| 2026-11-22 | Actualización documental v0.2 de `intent.md`, `spec.md`, `plan.md` y `docs/uso-ia.md`. Pendiente de revisión humana, comprobación `git diff --check` y commit. T-00 sigue **En curso**. | Asistente (propuesta) | Sin commit |
| 2026-11-22 | Aprobación de las decisiones D-01 a D-10 tal como se proponen (§10) y registro en los documentos. T-00 sigue **En curso** hasta el commit real. | Responsable del proyecto | Aprobación en conversación; sin commit |

**Próxima actualización:** reemplazar `Pendiente` por estados reales después de trabajar cada tarea; registrar ID de commit y resultados de pruebas, y ajustar los documentos cuando la implementación difiera del contrato.

## 10. Decisiones D-01 a D-10

**Aprobadas por el responsable del proyecto el 2026-11-22**, tal como se proponen en la tabla (sin modificaciones). Se revisarán si la implementación las hace inviables.

| ID | Decisión | Propuesta / recomendación |
|---|---|---|
| D-01 | Ejecución local de frontend y API | `npm run dev` = `vercel dev` (requiere Vercel CLI y sesión) frente a un servidor local propio. Se recomienda `vercel dev`. |
| D-02 | Pruebas de BD y aplicación de migraciones en Supabase Cloud | Uno o dos proyectos (desarrollo y pruebas); aplicar con `supabase db push` (sin Docker) o editor SQL. Se recomienda dos proyectos y `db push`. |
| D-03 | Indicador de negocio | Indicador principal: cita telefónica directa vs flujo manual; complementario: tiempos de solicitud y aprobación, sin meta comparativa. |
| D-04 | Matriz de permisos de `receptionist` | Marcada **P** en `spec.md` §1: ver citas con datos de pacientes, cancelar/completar, solo lectura de odontólogos. Confirmados: crear citas telefónicas y aprobar/rechazar solicitudes. |
| D-05 | Google: reintento por `receptionist` y eventos al desconectar | `receptionist` puede reintentar; desconectar no borra eventos ya creados. |
| D-06 | Revalidación al aprobar | Solo exigir horario futuro (no 1 h ni 30 días); si ya pasó, `409 REQUEST_EXPIRED`. |
| D-07 | Canal de respuesta al paciente | Sin notificación ni consulta de estado; limitación documentada, contacto manual. |
| D-08 | Rechazo y topes | Motivo opcional ≤200 caracteres; tope de solicitudes pendientes por correo (propuesta: 3) además del rate limit. |
| D-09 | Modos operativos y cifrado de token | Falla solo de Google = Contingencia parcial (no un tercer modo); cifrado de aplicación (AES-256-GCM) en lugar de Supabase Vault. |
| D-10 | Conflicto al aprobar | La solicitud queda `pending` (el personal decide rechazarla) en lugar de un estado `conflict`. |

Código HTTP: no se propone desviarse de `422` (validación) y `409` (conflictos de estado); por tanto no requiere consulta.

---

**Consigna base:** `Proyecto_Final_LE_Claude_Code.pdf`, especialmente páginas 1–6. Buenas prácticas de trabajo incremental y comprobación: https://code.claude.com/docs/en/best-practices
