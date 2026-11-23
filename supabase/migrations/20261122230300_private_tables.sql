-- T-02 · Migración 4/5 — Tablas del esquema "private" (solo backend).
--
-- Contrato: spec.md §5 (private.google_connections, private.oauth_states,
-- private.booking_rate_limits) y §6 (Google Calendar: contrato operativo).
--
-- Este esquema no debe estar en "Exposed schemas" de la Data API. Aun así se habilita RLS
-- sin políticas y se otorgan privilegios únicamente a service_role (migración 5).

-- ---------------------------------------------------------------------------
-- google_connections: una única conexión de Google en v1 (cuenta personal de demostración).
-- El refresh token se guarda cifrado a nivel de aplicación (AES-256-GCM, D-09); la clave de
-- cifrado vive en variables de entorno del servidor, nunca en la base de datos ni en Git.
-- ---------------------------------------------------------------------------
create table private.google_connections (
  id                       uuid primary key default gen_random_uuid(),
  calendar_id              text not null,
  refresh_token_ciphertext text not null,
  connected_by             uuid references auth.users (id) on delete set null,
  updated_at               timestamptz not null default now(),

  constraint google_connections_calendar_id_len
    check (char_length(calendar_id) between 1 and 255)
);

-- Garantiza una sola fila (índice único sobre una constante).
create unique index google_connections_single_row_idx
  on private.google_connections ((true));

create trigger google_connections_set_updated_at
  before update on private.google_connections
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- oauth_states: parámetro "state" del flujo OAuth (RF-06, CA-06h). Se guarda solo su hash;
-- expira en pocos minutos y se usa una sola vez.
-- ---------------------------------------------------------------------------
create table private.oauth_states (
  state_hash text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,

  constraint oauth_states_expires_after_created
    check (expires_at > created_at),
  constraint oauth_states_state_hash_len
    check (char_length(state_hash) between 32 and 128)
);

create index oauth_states_expires_idx
  on private.oauth_states (expires_at);

-- ---------------------------------------------------------------------------
-- booking_rate_limits: contador persistente del límite del formulario público
-- (10 intentos por IP cada 10 minutos, RF-08, CA-08e). La clave es un hash anonimizado;
-- nunca se guarda la IP en claro.
-- ---------------------------------------------------------------------------
create table private.booking_rate_limits (
  key_hash     text not null,
  window_start timestamptz not null,
  counter      integer not null default 0,

  primary key (key_hash, window_start),
  constraint booking_rate_limits_counter_nonneg
    check (counter >= 0),
  constraint booking_rate_limits_key_hash_len
    check (char_length(key_hash) between 32 and 128)
);

create index booking_rate_limits_window_idx
  on private.booking_rate_limits (window_start);
