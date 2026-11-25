# DentalFlow

Aplicación web para gestionar las citas de una **clínica odontológica simulada** de una sola sede en Costa Rica. El paciente consulta horarios y envía una **solicitud**; el personal la aprueba o la rechaza, registra citas telefónicas y gestiona su estado. Proyecto académico del curso *Laboratorio Ejecutivo en Claude Code* (SINT-732, CENFOTEC), desarrollado de forma incremental con Claude Code y revisión humana.

**Autor:** Jose Ulett V. (estudiante, proyecto individual) · **Agente de programación:** Claude Code (VS Code) · **Fecha de presentación:** 25 de noviembre de 2026.

> Todos los datos (pacientes, correos, odontólogos) son **ficticios**. No es un producto listo para producción clínica ni almacena datos clínicos.

Documentos de referencia: [intent.md](intent.md) (objetivo y alcance) · [spec.md](spec.md) (requisitos y reglas) · [plan.md](plan.md) (tareas y estado) · [docs/uso-ia.md](docs/uso-ia.md) (evidencia del uso de IA) · [docs/negocio.md](docs/negocio.md) · [docs/demo.md](docs/demo.md) (guion de 12 minutos) · [supabase/README.md](supabase/README.md) (base de datos).

## Tecnologías

| Capa | Tecnología |
|---|---|
| Interfaz | React 19, TypeScript, Vite 7 |
| Backend | Vercel Functions (`api/`), TypeScript |
| Datos y autenticación | Supabase Cloud: PostgreSQL 17 y Supabase Auth |
| Pruebas y calidad | Vitest, ESLint, `tsc` |
| Herramientas | Vercel CLI (`vercel dev`), Supabase CLI para aplicar migraciones |

No se requiere Docker ni Supabase local.

## Arquitectura en pocas líneas

- El **navegador** usa solo la clave pública de Supabase (inicio de sesión). Nunca recibe la clave `service_role`.
- Las **Vercel Functions** son el único lugar con privilegios: validan el token del personal, leen su rol en `staff_profiles` y aplican la matriz de permisos antes de cualquier operación.
- **PostgreSQL** es la fuente de verdad de las reglas críticas: la restricción `appointments_no_overlap` impide dos citas confirmadas superpuestas para un mismo odontólogo, y funciones transaccionales (`approve_appointment_request`, `create_appointment_request`, `reject_appointment_request`, `create_phone_appointment`, `change_appointment_status`) hacen cada decisión y su auditoría en una sola transacción, de forma idempotente.
- Todas las tablas tienen RLS activo y sin políticas para `anon`: los visitantes solo usan `/api/public/*`.

## Funcionalidades implementadas

| Área | Qué hace hoy |
|---|---|
| Autenticación y roles | Inicio y cierre de sesión con Supabase Auth; roles `admin` y `receptionist` desde `staff_profiles`; rutas `/admin/*` protegidas; autorización validada en el servidor (401/403/503) |
| Disponibilidad pública | `/disponibilidad`: elegir odontólogo y fecha y ver horarios libres de 30 minutos (hora de Costa Rica, ventana de 1 hora a 30 días) |
| Solicitud pública | Formulario sin login que crea una solicitud `pending` con número de solicitud; idempotencia, tope de 3 pendientes por correo y límite de 10 intentos por IP (anonimizada) en 10 minutos. No crea cita ni bloquea el horario |
| Solicitudes (personal) | `/admin/solicitudes`: aprobar (crea una cita confirmada, sin duplicados, aunque se repita o compita) o rechazar con motivo opcional; el conflicto de horario se informa y la solicitud sigue pendiente |
| Cita telefónica | `/admin/nueva-cita`: el personal registra una cita confirmada de inmediato; mismas reglas de horario, idempotencia y control de doble reserva |
| Gestión de citas | `/admin/citas`: ver citas próximas y por cerrar; **Cancelar** (con confirmación, libera el horario) y **Completar** (solo citas ya terminadas); auditoría en `appointment_audit` |
| Panel | Inicio con solicitudes pendientes y citas próximas; menú por rol (recepción no ve las opciones administrativas) |
| Seguridad | RLS deny-by-default, `service_role` solo en el backend, funciones SQL solo ejecutables por `service_role`, prueba P-10 de que `anon` no lee pacientes por la Data API |

### Estado de validación

| Funcionalidad | Pruebas automatizadas | Validación manual |
|---|---|---|
| Login, roles y rutas protegidas | Sí | Sí (`admin` y `receptionist`) |
| Disponibilidad, solicitud pública y aprobación | Sí | Sí |
| Cita telefónica | Sí | Sí |
| Dashboard y navegación por roles | Sí | Sí |
| Cancelación de citas | Sí | Sí |
| **Finalización de citas** | Sí | **No** |

Las pruebas de integración contra Supabase (`test:t07`, `test:t08`, `test:t09`) están escritas pero **todavía no se han ejecutado**; `test:p10` y `test:t03` sí se ejecutaron (ver [docs/uso-ia.md](docs/uso-ia.md)).

## Funcionalidades pendientes (no implementadas)

- **Administración de odontólogos y horarios** (alta, edición, activación y franjas por `admin`): hoy solo existe la **consulta**; `/admin/odontologos` aparece marcada como *Pendiente*. Los odontólogos salen del seed.
- **Google Calendar** (OAuth, crear y eliminar eventos, reintento, desconexión): sin implementar; `/admin/configuracion` aparece como *Pendiente*.
- **Recordatorios simulados** (`SIMULACIÓN — NO ENVIADO`, próximas 24 horas).
- **Salud del sistema y Modo Productivo/Contingencia** (`/api/health`, estado del sistema, avisos en la interfaz). Hoy, si Supabase falla, las APIs responden `503` sin escribir nada, pero no hay banner ni modo explícito.
- Filtros por fecha y odontólogo en el listado de citas, e historial de citas canceladas o completadas.
- Despliegue en Vercel y variables de entorno del proyecto; pruebas de flujo completo P-01 a P-16.

## Requisitos para ejecutar localmente

- Node.js 20.12 o superior (desarrollado con Node 24) y npm.
- Un proyecto **Supabase Cloud** propio y vacío (recomendado uno de pruebas y otro de desarrollo).
- Supabase CLI instalada (solo para aplicar las migraciones con `supabase db push`; alternativa: pegar los SQL en el *SQL Editor*).
- Cuenta de Vercel y `vercel login` + `vercel link`, porque `npm run dev` usa `vercel dev` para servir la interfaz y las funciones juntas.

## Puesta en marcha

```bash
git clone https://github.com/joseulettcr/DentalFlow.git
cd DentalFlow
npm install
cp .env.example .env.local        # completar con los valores de TU proyecto (ver tabla)
```

1. **Base de datos.** Aplica las migraciones de [supabase/migrations/](supabase/migrations/) en orden (`supabase link --project-ref <ref>` y `supabase db push`, o pegarlas una a una en el *SQL Editor*), carga [supabase/seed.sql](supabase/seed.sql) (2 odontólogos y sus horarios) y revisa en *Settings > API* que el esquema `private` **no** figure como expuesto. Detalle en [supabase/README.md](supabase/README.md).
2. **Cuentas de personal.** Crea dos usuarios en *Authentication > Users* (con *Auto Confirm User*) y enlázalos con `public.staff_profiles` usando [supabase/staff_profiles.example.sql](supabase/staff_profiles.example.sql) (un `admin` y un `receptionist`). Las contraseñas no se guardan en el repositorio.
3. **Ejecutar.**

```bash
npm run dev            # interfaz + funciones (vercel dev) → http://localhost:3000
npm run dev:frontend   # solo la interfaz (las APIs no responden)
```

Rutas: `/` · `/disponibilidad` (pública) · `/login` · `/admin`, `/admin/nueva-cita`, `/admin/solicitudes`, `/admin/citas`, `/admin/odontologos` y `/admin/configuracion` (personal).

### Variables de entorno (archivo `.env.local`, ignorado por Git)

| Variable | Uso | Secreta |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (navegador y backend) | No |
| `VITE_SUPABASE_ANON_KEY` | Clave pública *anon* o *publishable* | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio; **solo backend**, nunca en una variable `VITE_*` | **Sí** |
| `RATE_LIMIT_SALT` | Opcional: texto aleatorio que anonimiza la IP del límite de solicitudes | Sí |
| `SUPABASE_DB_URL` | Solo para las pruebas de integración: conexión Postgres del proyecto **de pruebas** | **Sí** |
| `SUPABASE_TEST_PROJECT_REF` | Opcional: ref del proyecto de pruebas permitido para esas pruebas | No |
| `GOOGLE_*` | Reservadas para Google Calendar (aún sin uso) | Sí |

En un despliegue de Vercel estas variables se configuran en el proyecto; `.env.local` solo aplica en local.

## Cómo reproducir las pruebas

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # pruebas unitarias (no necesitan red ni Supabase)
npm run build       # compilación de producción
```

`npm test` ejecuta las pruebas unitarias de reglas de disponibilidad, validaciones, servicios, endpoints (con Supabase simulado), permisos y navegación. Resultado al 24 de noviembre de 2026: **193 pruebas aprobadas en 13 archivos**; `lint`, `typecheck` y `build` sin errores.

Pruebas de **integración** (requieren un proyecto Supabase **de pruebas** con las migraciones aplicadas; escriben datos ficticios y los eliminan, y se niegan a correr contra otro proyecto):

| Comando | Qué comprueba | Necesita |
|---|---|---|
| `npm run test:p10` | El rol anónimo no puede leer citas ni solicitudes por la Data API (solo lectura) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `npm run test:t03` | No superposición de citas y aprobación atómica, con concurrencia real | `SUPABASE_DB_URL` |
| `npm run test:t07` | Solicitudes públicas, idempotencia, límites y decisión | `SUPABASE_DB_URL` + migración 7 |
| `npm run test:t08` | Cita telefónica, 6 reservas simultáneas del mismo bloque | `SUPABASE_DB_URL` + migración 8 |
| `npm run test:t09` | Cancelar y completar, auditoría y concurrencia | `SUPABASE_DB_URL` + migración 9 |

Además hay scripts SQL de solo lectura en [supabase/verification/](supabase/verification/) para comprobar el esquema aplicado.

## Estructura

```
api/            Vercel Functions: public/* (visitantes) y admin/* (personal)
shared/         Reglas puras compartidas: permisos, horarios y validaciones
src/            Interfaz React (auth, páginas públicas y panel administrativo)
supabase/       Migraciones, seed, scripts de verificación y README de la base de datos
tests/          unit/ (sin red) e integration/ (contra Supabase de pruebas)
docs/           Evidencia de IA, negocio y guion de demostración
```

## Uso de IA

El producto se construyó con **Claude Code** en VS Code, con tareas pequeñas, pruebas y revisión humana antes de cada commit. La evidencia (prompts, resultados, errores, correcciones y commits) está en [docs/uso-ia.md](docs/uso-ia.md).
