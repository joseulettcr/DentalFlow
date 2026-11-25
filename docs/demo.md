# DentalFlow — Guion de demostración (12 minutos)

**Presentación:** 25 de noviembre de 2026. **Caso:** clínica odontológica simulada; todos los datos son ficticios.

> **Qué se muestra y qué no.** Se demuestra únicamente lo implementado y validado (ver [README](../README.md)). **Google Calendar, recordatorios simulados, administración de odontólogos y el Modo Contingencia con banner no están implementados** y no se presentan como funcionando. Aparecen en "Limitaciones y próximos pasos".

## 1. Preparación (hacerla antes, no durante la demo)

**Entorno:** un proyecto Supabase con las 9 migraciones aplicadas (en particular las 7, 8 y 9) y el seed cargado; `.env.local` completo; `vercel login` y `vercel link` vigentes (la sesión de Vercel venció durante el desarrollo: renovarla antes). Arranque: `npm run dev` y abrir `http://localhost:3000`.

**Cuentas** (creadas por el responsable; **las contraseñas se entregan por un canal privado y no se escriben aquí**; los correos de abajo son **ejemplos** de dominio reservado, no credenciales; ajustarlos si se crearon otros):

| Cuenta | Rol | Uso en la demo |
|---|---|---|
| `admin.demo@example.com` (ejemplo) | `admin` | Mostrar que el administrador ve todo el menú |
| `recepcion.demo@example.com` (ejemplo) | `receptionist` | Recorrido principal |

**Datos sintéticos** (del seed y para escribir en vivo):

| Dato | Valor |
|---|---|
| Odontólogos | Dra. Ana Morales (Odontología general, lun–vie 08:00–12:00 y 13:00–17:00) · Dr. Carlos Rojas (Ortodoncia, lun–vie 09:00–12:00 y 14:00–17:00) |
| Paciente 1 (solicitud) | Paciente Demo Uno · `paciente.uno@example.com` · 8888 0001 |
| Paciente 2 (conflicto) | Paciente Demo Dos · `paciente.dos@example.com` · 8888 0002 |
| Paciente telefónico | Paciente Demo Telefónico · `paciente.telefono@example.com` · 8888 0003 |
| Caso inválido | correo `paciente-sin-arroba` |

**Elegir de antemano** un día hábil dentro de los próximos 30 días y tres horarios libres de la Dra. Morales (por ejemplo, 10:00, 10:30 y 11:00). Usar siempre horarios que no se hayan usado en ensayos previos; si hace falta repetir, **cancelar desde la interfaz** las citas de prueba o escoger otra fecha, sin tocar la base de datos.

**Lista de comprobación (15 minutos antes):**

- [ ] `npm run dev` responde y la landing (`/`) carga odontólogos en la sección de solicitud.
- [ ] Inicio de sesión con `recepcion.demo` y con `admin.demo` funciona; no hay solicitudes pendientes ni citas del ensayo en los horarios elegidos.
- [ ] Una terminal lista con `npm test` (no necesita red) en el directorio del proyecto.
- [ ] Pestañas abiertas: `/` (landing), `/login`; archivos `intent.md`, `spec.md`, `plan.md` y `docs/uso-ia.md` a mano.
- [ ] Capturas o video corto de un ensayo exitoso, guardados fuera de la red (ver contingencias).

## 2. Cronograma

| Min | Bloque | Qué se muestra |
|---|---|---|
| 0:00–1:30 | Contexto y problema | Clínica simulada, proceso manual, riesgo de doble reserva |
| 1:30–2:30 | Arquitectura | Navegador → Vercel Functions → Supabase; reglas en PostgreSQL |
| 2:30–4:30 | Solicitud pública | `/disponibilidad`, sin login |
| 4:30–6:00 | Aprobación | Panel de recepción |
| 6:00–7:30 | Reserva telefónica | `/admin/nueva-cita` |
| 7:30–9:00 | Cancelación y liberación | `/admin/citas` y `/disponibilidad` |
| 9:00–10:00 | Entrada inválida y prueba ejecutable | Caso inválido, conflicto, `npm test`, una corrección hecha con el agente |
| 10:00–12:00 | Documentos, evidencia de IA y cierre | `intent.md`, `spec.md`, `plan.md`, un ciclo de `docs/uso-ia.md`; indicador, costos, limitaciones y adopción |

## 3. Guion

### 0:00–1:30 · Contexto y problema
**Decir:** "DentalFlow es un caso simulado de clínica con dos odontólogos. Hoy se agenda por teléfono: recepción revisa a mano la agenda, y con dos personas agendando a la vez puede haber doble reserva. Los beneficios son esperados, no medidos; el indicador y el método están en `docs/negocio.md`." Mencionar los roles: paciente (solicita), recepcionista y administrador (deciden).

### 1:30–2:30 · Arquitectura resumida
**Decir:** "El navegador solo usa la clave pública. Las funciones de Vercel son el único lugar con privilegios: validan la sesión, leen el rol y aplican permisos. La regla crítica, que dos citas confirmadas no se superpongan, la impone PostgreSQL con una restricción; no depende de React. Aprobar, rechazar, reservar y cancelar son funciones transaccionales: cambian el estado y la auditoría juntos y se pueden repetir sin duplicar."

### 2:30–4:30 · Solicitud pública
1. Abrir `/` (la **landing**) **sin iniciar sesión**: mostrar la portada, las tarjetas de servicios y el contacto ficticio; pulsar **Solicitar cita** (o bajar a esa sección). El mismo formulario existe también en `/disponibilidad`.
2. Elegir *Dra. Ana Morales*, el día preparado; mostrar los horarios libres.
3. Elegir 10:00 y completar el formulario con **Paciente Demo Uno**.
4. Enviar. **Resultado esperado:** "Solicitud recibida", un **número de solicitud** y el aviso de que **todavía no es una cita confirmada**.
5. **Decir:** "Queda `pending` en Supabase. No bloquea el horario: sigue apareciendo libre." Volver a consultar la fecha para mostrarlo.

### 4:30–6:00 · Aprobación administrativa
1. Abrir `/login` e iniciar sesión como **recepcionista**; el panel muestra el contador de solicitudes pendientes.
2. Ir a **Solicitudes**: aparece la solicitud con odontólogo, fecha, hora y datos del paciente (solo visibles para el personal).
3. Pulsar **Aprobar**. **Resultado esperado:** aviso "Aprobada: cita confirmada…".
4. Ir a **Citas**: la cita aparece confirmada. Volver a `/disponibilidad`: el horario de las 10:00 **ya no está libre**.
5. **Decir:** "La aprobación llama a una función de PostgreSQL que vuelve a comprobar la disponibilidad; el frontend no decide nada."

### 6:00–7:30 · Reserva telefónica
1. Ir a **Nueva cita**; elegir *Dra. Ana Morales*, la misma fecha y el horario de 10:30.
2. Completar **Paciente Demo Telefónico** y pulsar **Confirmar cita**.
3. **Resultado esperado:** "Cita confirmada…", el horario desaparece de la lista y aparece en **Citas** marcada como reserva telefónica.
4. **Decir:** "Aquí no hay solicitud intermedia: la cita queda confirmada al instante, con las mismas reglas."

### 7:30–9:00 · Cancelación y liberación del horario
1. En **Citas**, sobre la cita de 10:30, pulsar **Cancelar**; mostrar la confirmación y elegir primero **No, volver** (no pasa nada).
2. Pulsar **Cancelar** de nuevo y **Sí, cancelar cita**. **Resultado esperado:** aviso de cancelación y la cita desaparece.
3. Volver a `/disponibilidad` o **Nueva cita**: el horario de 10:30 **vuelve a estar libre**.
4. **Decir:** "Cada cambio queda en la tabla de auditoría con quién y cuándo." (Opcional: mostrar la consulta de auditoría de [supabase/README.md](../supabase/README.md) si hay tiempo.)

### 9:00–10:00 · Entrada inválida y comprobación ejecutable
- **Entrada inválida:** en `/disponibilidad`, enviar una solicitud con el correo `paciente-sin-arroba`. **Resultado esperado:** mensaje de validación y no se crea nada.
- **Conflicto (opcional, requiere preparación):** antes del bloque de aprobación, abrir una **segunda pestaña** en `/disponibilidad`, elegir el mismo horario de 10:00 y completar el formulario con *Paciente Demo Dos* **sin enviarlo**. Después de aprobar la primera solicitud, enviar esta: el sistema responde que el horario ya no está disponible y no crea nada. (Un horario ocupado ya no aparece en la lista, por eso hace falta la segunda pestaña.)
- **Pruebas automáticas:** ejecutar `npm test` en la terminal (segundos, sin red). **Resultado esperado:** 193 pruebas aprobadas en 13 archivos (cifra al 24 de noviembre de 2026; actualizarla si cambia). Mencionar que `lint`, `typecheck` y `build` también pasan.
- **Corrección hecha con el agente:** contar un caso **real** documentado en `docs/uso-ia.md` §3.4: una regla de reescritura de Vercel servía HTML en lugar de JavaScript y rompía Vite; el agente la reprodujo y se corrigió limitándola a las rutas de la aplicación.

### 10:00–12:00 · Documentos, evidencia de IA y cierre
1. **Abrir `intent.md`, `spec.md` y `plan.md`** (los tres documentos obligatorios): señalar en `intent.md` el problema, el indicador y las exclusiones; en `spec.md` un requisito con su criterio de aceptación (por ejemplo, CA-09b: aprobar un horario ocupado devuelve 409 y la solicitud sigue pendiente); en `plan.md` la tabla de trazabilidad y el estado real de cada tarea, incluidas las pendientes.
2. **Abrir `docs/uso-ia.md`** y mostrar solo lo que existe: **IA-01** (T-03: restricción de no superposición y aprobación atómica; 17 pruebas aprobadas en el proyecto de pruebas) e **IA-02** (T-07, T-08, T-09A; validada manualmente). **IA-03 no está realizada**: decirlo y explicar la propuesta de su nota de alcance. Mostrar, de un ciclo, el prompt, la revisión humana y el commit.
3. **Indicador:** el principal (mediana de tiempo de agendamiento, meta de reducir al menos 50 %) está **definido pero pendiente de medir**; si ya se cronometraron los cinco casos, mostrar la tabla de `docs/negocio.md`; si no, decirlo. No presentar cifras que no existan.
4. **Costos y adopción:** los costos aún no están estimados (`docs/negocio.md` §8): decirlo y mencionar los tres pasos de adopción (piloto con datos sintéticos, ajustes, ampliación controlada) y que requiere evaluación de seguridad y privacidad antes de usarse con una clínica real.
5. **Limitaciones y próximos pasos:** caso simulado y sin mediciones; sin notificación al paciente; horario semanal fijo; la finalización de citas solo tiene pruebas automatizadas. Próximos pasos: administración de odontólogos y horarios, Google Calendar, recordatorios simulados, salud del sistema con Modo Contingencia, filtros e historial de citas y despliegue en Vercel.

**Seguridad (decir durante el recorrido o en las preguntas):** un usuario sin sesión recibe 401 en cualquier API administrativa y sin permiso 403; el rol `anon` no puede leer pacientes por la API de datos (prueba P-10, ejecutada en el proyecto de pruebas); la clave de servicio nunca llega al navegador. La restricción de PostgreSQL decide quién gana si dos reservas compiten; las pruebas de concurrencia de aprobación (T-03) se ejecutaron y las de reserva telefónica y cancelación están escritas pero **aún no se han ejecutado contra Supabase**.

## 4. Plan de contingencia

| Falla | Qué hacer |
|---|---|
| **Sin internet o Supabase no responde** | El sistema responde `503` y **no escribe ni confirma nada**, y esa es la conducta correcta de contingencia (no existe todavía un banner ni un "Modo Contingencia" visible; no decir que existe). Continuar con: `npm test` (funciona sin red), el código y `docs/uso-ia.md`, y mostrar las **capturas o el video del ensayo**, identificándolos claramente como grabados |
| **`vercel dev` pide iniciar sesión** | Ejecutar `vercel login` antes de la demo. Si ocurre en vivo: usar las capturas del ensayo y mostrar pruebas y documentos |
| **Un horario ya está ocupado por un ensayo** | Usar otro horario o fecha; o cancelar la cita de prueba desde **Citas** |
| **Falla el inicio de sesión de una cuenta** | Probar con la otra cuenta (`admin.demo`) |
| **Un paso tarda demasiado** | Saltar el conflicto opcional y la consulta de auditoría; priorizar solicitud, aprobación, cita telefónica y cancelación |

## 5. Evidencia académica pendiente (completar antes del 25)

- [ ] **IA-03** no existe. La consigna exige tres ciclos con revisión, corrección y commit, pero no exige Google Calendar. Completarla con trabajo real según la propuesta de `docs/uso-ia.md` (revisión y endurecimiento de T-UI + T-09, o una funcionalidad nueva pequeña); si no se completa, declararla como no realizada.
- [ ] **Mediciones** del indicador en `docs/negocio.md`: cronometrar cinco casos manual frente a DentalFlow y llenar la tabla; sin ello, el beneficio sigue siendo una hipótesis.
- [ ] **Pruebas de integración sin ejecutar** (`test:t07`, `test:t08`, `test:t09`): correrlas en el proyecto de pruebas y registrar el resultado real.
- [ ] **Validación manual de la finalización de citas**, que hoy solo tiene pruebas automatizadas.
- [ ] **Ensayo cronometrado** de esta demo y **capturas o video** del ensayo como respaldo.
- [ ] **Costos** iniciales y recurrentes con sus supuestos (`docs/negocio.md` §8).
- [ ] **Hashes de commit**: cada iteración de `docs/uso-ia.md` y cada tarea de `plan.md` debe citar el hash real (`git log`).
- [ ] **Enlace GitHub y commit o tag final** de la entrega.
- [ ] Si se ejecuta una revisión con Codex u otra herramienta, registrarla en `docs/uso-ia.md` con su salida real; no atribuir revisiones que no ocurrieron.
