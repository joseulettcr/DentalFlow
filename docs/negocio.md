# DentalFlow — Caso de negocio

> Caso **simulado**. No hay una clínica real, ni observaciones ni mediciones de una operación real. Todo lo que se describe como proceso actual es una **hipótesis del caso**, y los beneficios son **esperados, no demostrados**. Las secciones de medición están en blanco a propósito hasta que se ejecuten los ejercicios.

## 1. Problema de negocio

Una clínica odontológica pequeña con varios odontólogos agenda sus citas de forma manual: el paciente llama o escribe, recepción revisa a mano la disponibilidad de cada profesional, anota la reserva y avisa. Con ese proceso se esperan estos riesgos:

- **Demoras** en responder porque la persona de recepción es el único punto de acceso a la agenda.
- **Doble reserva** del mismo odontólogo en el mismo horario cuando dos personas agendan casi a la vez.
- **Agenda dispersa**: la información de las citas no está en un solo lugar y es difícil saber qué se agendó, quién lo hizo y qué se canceló.
- **Poca trazabilidad** de cancelaciones y cambios.

DentalFlow busca centralizar el agendamiento, evitar conflictos de horario y dejar registro de cada cambio.

## 2. Usuarios y roles

| Usuario | Qué hace en DentalFlow | Acceso |
|---|---|---|
| **Paciente** | Consulta horarios libres y envía una **solicitud** de cita desde un formulario público. No crea cuenta. La solicitud **no es una cita** hasta que el personal la apruebe | Público (`/disponibilidad`) |
| **Recepcionista** (`receptionist`) | Registra citas telefónicas, aprueba o rechaza solicitudes, consulta la agenda, cancela y completa citas | Inicio de sesión |
| **Administrador** (`admin`) | Todo lo anterior y, a futuro, la administración de odontólogos, horarios e integraciones | Inicio de sesión |
| **Odontólogo** | Es una entidad de la agenda, **sin** portal ni cuenta propia | — |

Las cuentas del personal las crea manualmente el responsable en Supabase; no hay registro público de personal. La matriz detallada de permisos está en [spec.md](../spec.md) §1.

## 3. Proceso manual que se mejora

**Proceso actual (hipotético):**

1. El paciente llama o escribe pidiendo una cita.
2. Recepción revisa la agenda de cada odontólogo (cuaderno u hoja de cálculo).
3. Propone un horario, lo anota y confirma al paciente.
4. Si se cancela, hay que acordarse de liberar el horario.

**Con DentalFlow:**

| Vía | Pasos |
|---|---|
| **Reserva telefónica** (personal) | El personal elige odontólogo, fecha y un horario libre, escribe los datos del paciente y confirma: la cita queda confirmada al instante. Si otra persona tomó el horario, el sistema lo rechaza sin duplicar |
| **Solicitud pública** (paciente) | El paciente elige un horario libre y envía sus datos → queda una solicitud **pendiente** → el personal la aprueba (se crea la cita) o la rechaza. Si el horario ya fue ocupado, no se puede aprobar y se informa |
| **Cancelar o completar** | El personal cancela (el horario queda libre) o marca como completada una cita que ya terminó; ambos cambios quedan en una bitácora de auditoría |

Las solicitudes pendientes **no bloquean** el horario; solo lo bloquea una cita confirmada.

## 4. Beneficios esperados (no medidos)

- **Menor tiempo de agendamiento** al ver la disponibilidad real de todos los odontólogos en una sola pantalla.
- **Cero dobles reservas** por diseño: una restricción de la base de datos impide dos citas confirmadas superpuestas para un mismo odontólogo, incluso con solicitudes simultáneas.
- **Trazabilidad**: quién aprobó, canceló o completó cada cita, y cuándo.
- **Un solo canal de agenda**, útil para que cualquier persona de recepción continúe el trabajo de otra.

Estos puntos son objetivos del diseño. Que se cumplan **en la práctica** se comprobará con las mediciones de la sección 5; aquí no se afirma ningún porcentaje ni tiempo.

## 5. Indicadores y cómo se medirán

Definidos en [intent.md](../intent.md) §4 (decisión D-03):

| Indicador | Definición | Método | Resultado |
|---|---|---|---|
| **Principal** | Tiempo de agendamiento de una cita telefónica, desde que se inicia el registro hasta que aparece confirmada, frente al mismo caso en un flujo manual **simulado** | Cinco casos equivalentes con datos sintéticos, cronometrados en ambos flujos; se compara la **mediana**. Meta de diseño: reducirla al menos 50 % | **Pendiente de medir** |
| **Complementario** | Tiempo que tarda el paciente en enviar una solicitud válida y tiempo de decisión del personal | Descriptivo, sin meta comparativa | **Pendiente de medir** |
| **Control** | Citas confirmadas con intervalos superpuestos para un mismo odontólogo | Pruebas de concurrencia (T-03, T-08, T-09) | Esperado 0. Las pruebas de T-03 se ejecutaron en el proyecto de pruebas (17 aprobadas, informado por el responsable); las de T-08 y T-09 están escritas y **no se han ejecutado** |

Plantilla para registrar los cinco casos (sin valores inventados):

| Caso | Flujo manual simulado (min:s) | Flujo DentalFlow (min:s) |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| **Mediana** | | |

Si el resultado no alcanza la meta, se reporta tal como salga y se documenta la causa.

## 6. Alcance del MVP

**Incluido y funcionando** (ver estado de validación en el [README](../README.md)): consulta pública de disponibilidad, solicitud pública con idempotencia y límites de uso, aprobación y rechazo, cita telefónica, cancelación y finalización con auditoría, inicio de sesión con dos roles, dashboard con navegación por rol y datos sintéticos.

**Comprometido en el plan pero aún no implementado:** administración de odontólogos y horarios, sincronización con Google Calendar, recordatorios simulados, salud del sistema con Modo Productivo/Contingencia, filtros e historial de citas, despliegue en Vercel.

## 7. Limitaciones

- **Caso simulado**: sin clínica, usuarios ni datos reales; mediciones por hacer.
- **Sin notificación al paciente**: no hay correo, SMS ni WhatsApp; el paciente no puede consultar el estado de su solicitud y la clínica debe contactarlo por un medio manual (limitación aprobada, D-07).
- **Agenda simple**: horario semanal fijo; sin feriados, vacaciones ni bloqueos; todas las citas duran 30 minutos.
- **Sin datos clínicos**, pagos ni facturación.
- **Sin sincronización con calendarios externos** por ahora, y los recordatorios, cuando existan, serán simulados.
- **Solicitudes pendientes sin vencimiento**: si no se atienden, quedan pendientes.
- **No apto para producción clínica**: faltan evaluaciones de seguridad, privacidad, operación y costos.

## 8. Costos y adopción

Los costos iniciales y recurrentes (servicios en la nube, tiempo de desarrollo y operación) **no se han calculado**; se documentarán con sus supuestos y sin cifras inventadas antes de la entrega. Ruta de adopción propuesta: (1) piloto con usuarios y datos sintéticos; (2) ajustes según tiempos, errores y retroalimentación; (3) evaluación de seguridad, privacidad, operación y costos antes de cualquier uso con una clínica real.
