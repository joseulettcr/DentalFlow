-- T-02 · Migración 3/5 — Solicitudes públicas, citas, auditoría y sincronización Google.
--
-- Contrato: spec.md §4 (RB), §5 (modelo relacional), RF-04, RF-05, RF-06, RF-08, RF-09.
--
-- IMPORTANTE (alcance): la restricción EXCLUDE de no superposición de citas confirmadas
-- (RB-05) y la función transaccional approve_appointment_request (RB-12) pertenecen a
-- T-03 y NO se crean aquí. Esta migración deja la tabla "appointments" lista para ellas
-- (columnas starts_at, ends_at, doctor_id, status e índices).
--
-- Sin notas médicas ni datos clínicos en ninguna tabla.

-- ---------------------------------------------------------------------------
-- appointment_requests: solicitud pública. NO es una cita y NO bloquea el horario (RB-11).
-- La columna appointment_id se agrega al final porque appointments también referencia
-- a esta tabla (dependencia circular).
-- ---------------------------------------------------------------------------
create table public.appointment_requests (
  id                  uuid primary key default gen_random_uuid(),
  doctor_id           uuid not null references public.doctors (id) on delete restrict,
  patient_name        text not null,
  patient_email       text not null,
  patient_phone       text,
  requested_starts_at timestamptz not null,
  requested_ends_at   timestamptz not null,
  status              text not null default 'pending',
  idempotency_key     uuid not null,
  decided_by          uuid references auth.users (id) on delete set null,
  decided_at          timestamptz,
  rejection_reason    text,
  created_at          timestamptz not null default now(),

  constraint appointment_requests_idempotency_key_key unique (idempotency_key),
  constraint appointment_requests_status_valid
    check (status in ('pending', 'approved', 'rejected')),
  constraint appointment_requests_patient_name_len
    check (char_length(btrim(patient_name)) between 2 and 100),
  constraint appointment_requests_patient_email_format
    check (
      char_length(patient_email) <= 254
      and patient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
  constraint appointment_requests_patient_phone_len
    check (patient_phone is null or char_length(patient_phone) <= 25),
  -- RB-01: duración fija de 30 minutos, alineada a bloques de :00 o :30 (instante UTC;
  -- America/Costa_Rica no usa horario de verano, el desfase es de horas completas).
  constraint appointment_requests_duration_30min
    check (requested_ends_at = requested_starts_at + interval '30 minutes'),
  constraint appointment_requests_block_alignment
    check (
      extract(minute from (requested_starts_at at time zone 'UTC')) in (0, 30)
      and extract(second from (requested_starts_at at time zone 'UTC')) = 0
    ),
  constraint appointment_requests_rejection_reason_len
    check (rejection_reason is null or char_length(rejection_reason) <= 200),
  -- Coherencia de la decisión: pending sin decisión; approved/rejected con autor y fecha.
  constraint appointment_requests_decision_consistency
    check (
      (status = 'pending'  and decided_at is null and decided_by is null)
      or (status in ('approved', 'rejected') and decided_at is not null)
    ),
  constraint appointment_requests_rejection_reason_only_rejected
    check (rejection_reason is null or status = 'rejected')
);

create index appointment_requests_status_created_idx
  on public.appointment_requests (status, created_at);
create index appointment_requests_doctor_start_idx
  on public.appointment_requests (doctor_id, requested_starts_at);
-- Apoya el tope de solicitudes pendientes por correo (D-08).
create index appointment_requests_pending_email_idx
  on public.appointment_requests (lower(patient_email))
  where status = 'pending';

comment on table public.appointment_requests is
  'Solicitudes públicas de cita (RF-08). Pendientes no bloquean horario (RB-11). Contiene datos personales ficticios en la demo.';

-- ---------------------------------------------------------------------------
-- appointments: fuente de verdad de las citas confirmadas.
-- ---------------------------------------------------------------------------
create table public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  doctor_id          uuid not null references public.doctors (id) on delete restrict,
  patient_name       text not null,
  patient_email      text not null,
  patient_phone      text,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             text not null default 'confirmed',
  source             text not null,
  request_id         uuid references public.appointment_requests (id) on delete restrict,
  created_by_user_id uuid references auth.users (id) on delete set null,
  idempotency_key    uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  cancelled_by       uuid references auth.users (id) on delete set null,
  completed_at       timestamptz,
  completed_by       uuid references auth.users (id) on delete set null,

  constraint appointments_idempotency_key_key unique (idempotency_key),
  -- Una solicitud origina como máximo una cita (RB-12).
  constraint appointments_request_id_key unique (request_id),
  constraint appointments_status_valid
    check (status in ('confirmed', 'cancelled', 'completed')),
  constraint appointments_source_valid
    check (source in ('admin_phone', 'public_request')),
  constraint appointments_patient_name_len
    check (char_length(btrim(patient_name)) between 2 and 100),
  constraint appointments_patient_email_format
    check (
      char_length(patient_email) <= 254
      and patient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
  constraint appointments_patient_phone_len
    check (patient_phone is null or char_length(patient_phone) <= 25),
  constraint appointments_ends_after_starts
    check (ends_at > starts_at),
  constraint appointments_duration_30min
    check (ends_at = starts_at + interval '30 minutes'),
  constraint appointments_block_alignment
    check (
      extract(minute from (starts_at at time zone 'UTC')) in (0, 30)
      and extract(second from (starts_at at time zone 'UTC')) = 0
    ),
  -- source y request_id deben ser coherentes: solo las citas de origen público enlazan solicitud.
  constraint appointments_source_request_consistency
    check ((source = 'public_request') = (request_id is not null)),
  -- Reserva telefónica: la clave de idempotencia es obligatoria (RB-10, CA-04d).
  constraint appointments_admin_phone_idempotency
    check (source <> 'admin_phone' or idempotency_key is not null),
  constraint appointments_cancelled_consistency
    check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint appointments_cancelled_by_only_cancelled
    check (cancelled_by is null or status = 'cancelled'),
  constraint appointments_completed_consistency
    check ((status = 'completed') = (completed_at is not null)),
  constraint appointments_completed_by_only_completed
    check (completed_by is null or status = 'completed')
);

create index appointments_doctor_start_idx
  on public.appointments (doctor_id, starts_at);
create index appointments_status_start_idx
  on public.appointments (status, starts_at);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function private.set_updated_at();

comment on table public.appointments is
  'Citas (fuente de verdad). La restricción de no superposición RB-05 y la aprobación atómica RB-12 se agregan en T-03.';

-- Cierre de la dependencia circular: solicitud aprobada -> cita creada.
alter table public.appointment_requests
  add column appointment_id uuid references public.appointments (id) on delete restrict;

alter table public.appointment_requests
  add constraint appointment_requests_appointment_id_key unique (appointment_id);

-- Una solicitud aprobada debe enlazar su cita; el resto no.
alter table public.appointment_requests
  add constraint appointment_requests_approved_has_appointment
    check ((status = 'approved') = (appointment_id is not null));

-- ---------------------------------------------------------------------------
-- appointment_audit: registro de cambios de solicitudes y citas (CA-05b). Solo anexa filas.
-- ---------------------------------------------------------------------------
create table public.appointment_audit (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete restrict,
  request_id     uuid references public.appointment_requests (id) on delete restrict,
  action         text not null,
  actor_user_id  uuid references auth.users (id) on delete set null,
  from_status    text,
  to_status      text,
  occurred_at    timestamptz not null default now(),

  constraint appointment_audit_action_valid
    check (action in ('created', 'approved', 'rejected', 'cancelled', 'completed')),
  constraint appointment_audit_has_subject
    check (appointment_id is not null or request_id is not null)
);

create index appointment_audit_appointment_idx
  on public.appointment_audit (appointment_id, occurred_at);
create index appointment_audit_request_idx
  on public.appointment_audit (request_id, occurred_at);

comment on table public.appointment_audit is
  'Auditoría de solicitudes y citas. El backend solo puede insertar y leer (ver migración 5).';

-- ---------------------------------------------------------------------------
-- calendar_sync: estado de la sincronización unidireccional DentalFlow -> Google.
-- Un registro por cita. El estado de Google es independiente del estado de negocio (RB-07).
-- ---------------------------------------------------------------------------
create table public.calendar_sync (
  appointment_id  uuid primary key references public.appointments (id) on delete restrict,
  event_id        text,
  state           text not null default 'pending',
  last_error_code text,
  last_attempt_at timestamptz,
  attempt_count   integer not null default 0,

  constraint calendar_sync_state_valid
    check (state in ('pending', 'synced', 'failed', 'delete_pending', 'deleted')),
  constraint calendar_sync_attempt_count_nonneg
    check (attempt_count >= 0),
  constraint calendar_sync_last_error_code_len
    check (last_error_code is null or char_length(last_error_code) <= 100)
);

create index calendar_sync_state_idx
  on public.calendar_sync (state);

comment on table public.calendar_sync is
  'Estado de sincronización con Google Calendar por cita. No almacena datos del paciente.';
