# DentalFlow — intent.md

**Versión:** 0.4 (v0.3 más la administración de odontólogos y horarios, rama `feature/admin-odontologos`, 2026-11-24)

**Proyecto:** DentalFlow — Gestión de citas para una clínica odontológica

**Curso:** Laboratorio Ejecutivo en Claude Code (SINT-732), Universidad CENFOTEC

**Tipo de empresa:** Clínica odontológica **simulada** de una única sede en Costa Rica

**Estado de implementación:** No iniciado. Este archivo expresa objetivos, no funcionalidades ya construidas.

## 1. Contexto y usuarios

DentalFlow se propone para una clínica odontológica ficticia con varios profesionales. Se distinguen:

- **Paciente:** conoce la clínica en una **landing page pública** (servicios, contacto), consulta horarios disponibles y **envía una solicitud de cita** mediante el formulario de esa misma página, sin crear una cuenta. La solicitud no es una cita: queda pendiente hasta que el personal la apruebe.
- **Recepcionista (`receptionist`):** personal autenticado que registra citas telefónicas, aprueba o rechaza solicitudes y consulta la agenda. Sus permisos exactos están en la matriz de `spec.md` §1, aprobada mediante las decisiones D-04 y D-05 el 22 de noviembre de 2026.
- **Administrador (`admin`):** además de lo anterior, configura odontólogos y horarios y administra la conexión con Google Calendar.
- **Odontólogo:** es una entidad de agenda, **no** un usuario con portal propio en este MVP.

Los roles `admin` y `receptionist` existen desde el MVP y se autentican con Supabase Auth. No hay registro público de personal.

La clínica y todos los pacientes, odontólogos, correos y números de contacto utilizados en la demostración son ficticios.

## 2. Problema empresarial

**Proceso actual hipotético (no observado):** el paciente pide una cita por llamada o mensaje; recepción revisa manualmente los horarios de distintos odontólogos, anota la reserva en una agenda y comunica la confirmación. Esto podría ocasionar demoras, reservas superpuestas y dificultades para disponer de una agenda consolidada.

**Estado de la evidencia:** no hay mediciones ni observaciones de una clínica real. Tanto el proceso manual como sus tiempos iniciales son **supuestos de un caso simulado**. Se contrastarán con un ejercicio de tareas equivalente durante las pruebas.

## 3. Propuesta de solución

Aplicación web responsiva que permita:

1. Administrar odontólogos y horarios desde un módulo del panel **exclusivo del rol `admin`**: alta, edición, activación o desactivación y franjas semanales. Todos los odontólogos usan por defecto el **horario del proyecto**: lunes a viernes de 8:00 a 17:00 y sábados de 9:00 a 13:00 (domingo cerrado), que el administrador puede ajustar por odontólogo. La lista de odontólogos activos es la misma que alimenta los selectores (combobox) de la landing, de la reserva telefónica y del propio módulo.
2. Consultar horarios disponibles por odontólogo y fecha.
3. Registrar citas por **dos vías**:
   - **Reserva telefónica directa:** el personal autorizado registra la cita en el panel y queda confirmada de inmediato si el horario es válido y está libre.
   - **Solicitud pública con aprobación:** el paciente registra una solicitud (`appointment_requests`), que permanece **pendiente**; el personal la aprueba o rechaza. Al aprobar se vuelve a comprobar la disponibilidad y, si sigue libre, se crea la cita; si el horario ya fue ocupado, se informa el conflicto sin crear una cita duplicada.
4. Prevenir citas superpuestas y conservar los datos en Supabase PostgreSQL (Supabase Cloud como entorno principal). Las solicitudes pendientes **no bloquean** el horario por sí mismas.
5. Consultar, cancelar o completar citas desde un dashboard.
6. Conectar **de forma real** una cuenta personal de Google de demostración para crear eventos y retirar eventos de citas canceladas; sincronización **unidireccional** DentalFlow → Google Calendar, con desconexión y reconexión.
7. Mostrar recordatorios **simulados** dentro del dashboard, sin enviar mensajes reales.
8. Detectar fallos de servicios desde el backend y operar en **Modo Productivo** o **Modo Contingencia** (estados operativos del MVP definidos en `spec.md`; no equivalen a una certificación de preparación para producción clínica).
9. Presentar la clínica en una **landing page pública** en la ruta `/`: portada llamativa, tarjetas de servicios, datos de contacto ficticios (Oreamuno de Cartago, teléfono 2500 0002, correo ficticio), el **formulario de solicitud de cita** (el mismo flujo sin login de RF-08) y un acceso visible al sitio administrativo (`/login`). La landing es informativa y de captación: no agrega reglas de negocio ni confirma citas.

## 4. Objetivo de negocio e indicador

**Objetivo:** simplificar y centralizar el agendamiento de citas odontológicas, reduciendo tiempo operativo y evitando conflictos de horario.

Como la solicitud pública incluye una aprobación humana, el tiempo "hasta que la cita aparece confirmada" mezcla trabajo del paciente y del personal. El indicador se separa en dos mediciones (aprobado el 2026-11-22, decisión D-03 en `plan.md` §10):

- **Indicador principal (agendamiento por personal):** tiempo de agendamiento exitoso de una cita telefónica, desde que se inicia el registro hasta que la cita aparece confirmada en el sistema, frente al mismo caso en el flujo manual simulado.
  - **Línea base:** por medir en un flujo manual **simulado**; no se atribuye a ninguna empresa real. Como hipótesis orientativa, se puede contrastar un proceso de 10 minutos frente a otro de 3 minutos, sin presentar esos valores como mediciones.
  - **Meta:** reducir al menos un **50 % la mediana** de tiempo de reserva en el flujo digital respecto del manual simulado, utilizando el mismo conjunto de casos.
  - **Método:** ejecutar cinco casos de agendamiento equivalentes con datos sintéticos, cronometrar ambos flujos, calcular la mediana y documentar los resultados en `docs/negocio.md`.
- **Indicador complementario (solicitud pública):** tiempo que tarda el paciente en enviar una solicitud válida y tiempo de decisión del personal (aprobación/rechazo). Se reporta como dato descriptivo, sin meta comparativa con el flujo manual hasta que se defina una equivalencia.
- **Indicador de control adicional:** cero citas confirmadas con intervalos superpuestos para un mismo odontólogo en las pruebas de concurrencia y validación (incluida la aprobación concurrente o repetida de solicitudes).

Si la comparación no alcanza la meta, se reporta el resultado real de la prueba y se registra la causa. No se fabricarán cifras.

## 5. Alcance comprometido del MVP (v1)

- Aplicación React + TypeScript con **landing page pública** (servicios, contacto, formulario de solicitud sin login y acceso al sitio administrativo) y dashboard administrativo.
- Inicio y cierre de sesión del personal con Supabase Auth; dos roles (`admin`, `receptionist`); no hay registro público de personal.
- Registro, edición, activación/desactivación de odontólogos y configuración de franjas semanales de atención (`admin`), con el horario predeterminado de lunes a viernes de 8:00 a 17:00 y sábados de 9:00 a 13:00. Un odontólogo inactivo no se ofrece en ningún selector ni para nuevas solicitudes, pero su historial se conserva (nunca se elimina).
- Citas de **30 minutos**, en la zona horaria `America/Costa_Rica`. Las solicitudes públicas respetan una ventana de **1 hora a 30 días** de anticipación al momento de enviarse.
- Reserva telefónica directa por personal autorizado.
- Solicitud pública sin login (`appointment_requests`), estado pendiente, y aprobación/rechazo por personal autorizado, seguras frente a concurrencia y reintentos.
- Validación de disponibilidad de último momento y garantía transaccional contra superposiciones en PostgreSQL.
- Consulta de citas y cambios de estado: `confirmada`, `cancelada`, `completada`, con registro de auditoría de cambios.
- Integración Google Calendar real mediante OAuth 2.0 del administrador (cuenta personal de demostración): creación y eliminación de eventos, indicador de sincronización, reintento manual, desconexión y reconexión.
- Verificaciones de salud desde el backend y comportamiento definido en Modo Productivo y Modo Contingencia.
- Pantalla de recordatorios simulados para próximas citas en las siguientes 24 horas, identificada explícitamente como simulación.
- Datos sintéticos, pruebas automáticas y documentación de instalación y demo.
- Entorno de datos: **Supabase Cloud**. No se exige Docker ni Supabase local; las migraciones SQL se versionan en Git y deben ser reproducibles sobre una instancia nueva de Supabase Cloud.

## 6. Exclusiones explícitas de la primera versión

- Expedientes médicos, diagnósticos, odontogramas o datos clínicos sensibles.
- Pagos, facturación, aseguradoras y cotizaciones.
- Precios, tarifas, paquetes, pagos en línea, reseñas, blog o contenido comercial real en la landing: los **servicios son ilustrativos** de una clínica simulada y no condicionan la disponibilidad, que depende solo de odontólogos y horarios.
- Registro/login de pacientes, autogestión de cancelaciones o reprogramación por pacientes, y consulta pública del estado de una solicitud.
- Notificación real al paciente sobre el resultado de su solicitud (sin correo, SMS ni WhatsApp). Limitación documentada: el paciente no dispone de un canal automático de respuesta (decisión D-07, aprobada).
- Reprogramación directa de una cita: en v1 se cancela y se crea una nueva.
- Portal de odontólogos, múltiples sucursales y permisos complejos más allá de los roles `admin` y `receptionist`.
- Gestión de usuarios del personal desde la aplicación (se crean manualmente en Supabase).
- Duración variable por tratamiento, vacaciones, feriados y bloqueos excepcionales; se documenta como limitación de agenda.
- Sincronización bidireccional, lectura de eventos creados manualmente en Google y prevención de conflictos con eventos externos de Google. La disponibilidad se decide solo con los horarios y citas de DentalFlow.
- Recordatorios reales por correo, SMS o WhatsApp; no se envían invitaciones a pacientes desde Google Calendar.
- WhatsApp, chatbots o servicios de IA **dentro** del producto (la IA se utiliza para construirlo, no como funcionalidad). Quedan para futuras versiones.

## 7. Beneficio esperado y adopción

**Beneficio esperado (no demostrado todavía):** menor tiempo de agendamiento, agenda única por profesional, trazabilidad de las reservas y menor riesgo de doble reserva.

**Ruta de adopción propuesta:** (1) piloto con usuarios y datos sintéticos; (2) ajustes según tiempos, errores y retroalimentación; (3) evaluación de seguridad, privacidad, operación y costos antes de implementar con una clínica real.

**Responsable de supervisión humana:** estudiante/desarrollador del proyecto. Revisa reglas de negocio, cambios generados por Claude Code o Codex, pruebas, permisos y comportamiento de las integraciones antes de aceptar commits.

## 8. Riesgos y supuestos por validar

- La cuenta personal de Google de demostración permitirá autorizar el alcance OAuth requerido; una aplicación OAuth en modo de pruebas puede necesitar reconexión por caducidad del token (aprox. 7 días). Se recomienda un calendario dedicado de demostración para no mezclar eventos con el calendario personal.
- Se dispondrá de conectividad a Supabase Cloud y Google Calendar durante pruebas y demo. Si Supabase falla, el sistema entra en Modo Contingencia y no confirma operaciones que necesiten persistencia; si Google falla, las citas ya confirmadas se conservan y la sincronización queda pendiente.
- Una solicitud pública puede no poder aprobarse si otro usuario ocupó el horario mientras estaba pendiente; el personal debe resolverla (rechazo u otra cita).
- La gestión semanal fija es suficiente para demostrar el caso de negocio, aunque no modela horarios reales complejos.
- El despliegue en Vercel es previsto, pero la aplicación también deberá ejecutarse localmente.
- El uso inicial es **exclusivamente demostrativo** con datos sintéticos; no se considera lista para producción clínica.

## 9. Definición de éxito del proyecto académico

Se considera demostrable el producto cuando: un administrador configura la agenda; un paciente envía una solicitud para un bloque libre que queda pendiente en Supabase sin bloquear el horario; el personal la aprueba y la cita persiste y aparece en el dashboard; el evento se observa en Google Calendar; y un segundo intento (otra reserva o aprobación) sobre el mismo bloque se rechaza sin duplicar la cita. Además, el personal puede registrar una cita telefónica directa. Se muestran pruebas reproducibles, una entrada inválida, tres ciclos de uso de IA revisados por el estudiante, documentación y métricas de la simulación.

---

**Fuente académica de estructura:** `Proyecto_Final_LE_Claude_Code.pdf`, páginas 1–6. Las decisiones técnicas y metas de DentalFlow son propuestas del proyecto, no instrucciones textuales del docente.
