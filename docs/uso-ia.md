
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

### Ciclo 1 (IA-01) — Restricción de solapamiento y aprobación atómica

- Estado: Pendiente
- Tarea del plan: T-03 (restricción `EXCLUDE USING gist`, función `approve_appointment_request` y pruebas de concurrencia contra Supabase Cloud)
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
