import { todayInClinic } from '../../shared/clinic-time.js'
import { isUuid, validateReason, validateRequestInput } from '../../shared/request-validation.js'
import { getDayAvailability } from './availability-service.js'
import { failure, mapDomainError, type Outcome } from './http.js'
import type { RestGet, Rpc } from './supabase-rest.js'

// Solicitudes públicas (RF-08) y su revisión por el personal (RF-09). La aprobación y el rechazo NO duplican reglas
// aquí: delegan en las funciones PostgreSQL (approve_appointment_request, reject_appointment_request).

const iso = (value: string) => new Date(value).toISOString()

export interface PublicRequestBody {
  requestId: string
  status: 'pending'
  doctorName: string
  startsAt: string
  endsAt: string
}

interface ExistingRow {
  id: string
  status: string
  doctor_id: string
  patient_name: string
  patient_email: string
  patient_phone: string | null
  requested_starts_at: string
  requested_ends_at: string
  doctors?: { full_name?: string } | null
}

export async function createPublicRequest(
  deps: { rest: RestGet; rpc: Rpc; now: Date; clientHash: string },
  body: unknown,
): Promise<Outcome<PublicRequestBody>> {
  const { rest, rpc, now, clientHash } = deps

  // (1) Límite persistente por IP anonimizada (CA-08e): se cuenta cada intento, también los inválidos.
  const attempt = await rpc('register_booking_attempt', { p_key_hash: clientHash })
  if (!attempt.ok) return mapDomainError(attempt)
  if (attempt.data !== true) return failure(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.')

  // (2) Validación de entrada (CA-08b): 422 sin tocar la base de datos.
  const parsed = validateRequestInput(body)
  if (!parsed.ok) return failure(422, 'VALIDATION_ERROR', parsed.message)
  const input = parsed.value

  // (3) Idempotencia (CA-08d, RB-10): reintento con la misma clave devuelve la misma solicitud aunque el bloque cambie después.
  const existing = (await rest(
    `appointment_requests?select=id,status,doctor_id,patient_name,patient_email,patient_phone,requested_starts_at,requested_ends_at,doctors(full_name)&idempotency_key=eq.${input.idempotencyKey}&limit=1`,
  )) as ExistingRow[]
  if (existing.length > 0) {
    const row = existing[0]
    const same =
      row.doctor_id === input.doctorId &&
      row.patient_name === input.patientName &&
      row.patient_email === input.patientEmail &&
      (row.patient_phone ?? null) === input.patientPhone &&
      Date.parse(row.requested_starts_at) === Date.parse(input.startAt)
    if (!same) return failure(409, 'IDEMPOTENCY_KEY_REUSED', 'Esa clave de solicitud ya se usó con datos distintos.')
    return {
      ok: true,
      status: 200,
      body: { requestId: row.id, status: 'pending', doctorName: row.doctors?.full_name ?? '', startsAt: iso(row.requested_starts_at), endsAt: iso(row.requested_ends_at) },
    }
  }

  // (4) Franja semanal, ventana de reserva y odontólogo activo (RB-03, RB-04): fuera de agenda => 422; ocupado => 409 (CA-08c).
  const day = await getDayAvailability(rest, { doctorId: input.doctorId, date: todayInClinic(new Date(input.startAt)), now })
  if (!day.ok) return failure(day.status, day.code, day.message)
  if (!day.all.some((slot) => slot.startAt === input.startAt)) {
    return failure(422, 'VALIDATION_ERROR', 'El horario seleccionado no está disponible para solicitudes.')
  }
  if (!day.free.some((slot) => slot.startAt === input.startAt)) {
    return failure(409, 'SLOT_UNAVAILABLE', 'Ese horario ya no está disponible. Elige otro.')
  }

  // (5) Alta atómica: no crea cita ni bloquea el horario (RB-11).
  const created = await rpc('create_appointment_request', {
    p_doctor_id: input.doctorId,
    p_patient_name: input.patientName,
    p_patient_email: input.patientEmail,
    p_patient_phone: input.patientPhone,
    p_starts_at: input.startAt,
    p_idempotency_key: input.idempotencyKey,
  })
  if (!created.ok) return mapDomainError(created)
  const row = (created.data as Array<{ request_id: string; request_status: string; replayed: boolean }>)[0]
  const startMs = Date.parse(input.startAt)
  return {
    ok: true,
    status: row.replayed ? 200 : 201,
    body: { requestId: row.request_id, status: 'pending', doctorName: day.doctorName, startsAt: input.startAt, endsAt: new Date(startMs + 30 * 60_000).toISOString() },
  }
}

// ---------------------------------------------------------------------------
// Personal (los permisos se comprueban antes, en withStaff).
// ---------------------------------------------------------------------------

export interface RequestListItem {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  doctorId: string
  doctorName: string
  patientName: string
  patientEmail: string
  patientPhone: string | null
  startsAt: string
  endsAt: string
  createdAt: string
  appointmentId: string | null
  rejectionReason: string | null
}

interface RequestRow {
  id: string
  status: RequestListItem['status']
  doctor_id: string
  patient_name: string
  patient_email: string
  patient_phone: string | null
  requested_starts_at: string
  requested_ends_at: string
  created_at: string
  appointment_id: string | null
  rejection_reason: string | null
  doctors?: { full_name?: string } | null
}

const STATUSES = ['pending', 'approved', 'rejected'] as const

export async function listRequests(rest: RestGet, statusParam: string): Promise<Outcome<{ requests: RequestListItem[] }>> {
  const status = statusParam === '' ? 'pending' : statusParam
  if (status !== 'all' && !(STATUSES as readonly string[]).includes(status)) {
    return failure(422, 'VALIDATION_ERROR', 'El estado debe ser pending, approved, rejected o all.')
  }
  const filter = status === 'all' ? '' : `&status=eq.${status}`
  const rows = (await rest(
    `appointment_requests?select=id,status,doctor_id,patient_name,patient_email,patient_phone,requested_starts_at,requested_ends_at,created_at,appointment_id,rejection_reason,doctors(full_name)${filter}&order=requested_starts_at.asc&limit=100`,
  )) as RequestRow[]
  return {
    ok: true,
    status: 200,
    body: {
      requests: rows.map((r) => ({
        id: r.id,
        status: r.status,
        doctorId: r.doctor_id,
        doctorName: r.doctors?.full_name ?? '',
        patientName: r.patient_name,
        patientEmail: r.patient_email,
        patientPhone: r.patient_phone,
        startsAt: iso(r.requested_starts_at),
        endsAt: iso(r.requested_ends_at),
        createdAt: iso(r.created_at),
        appointmentId: r.appointment_id,
        rejectionReason: r.rejection_reason,
      })),
    },
  }
}

export interface AppointmentListItem {
  id: string
  doctorName: string
  patientName: string
  patientEmail: string
  startsAt: string
  endsAt: string
  status: string
  source: string
}

export async function listUpcomingAppointments(rest: RestGet, now: Date): Promise<Outcome<{ appointments: AppointmentListItem[] }>> {
  const rows = (await rest(
    `appointments?select=id,patient_name,patient_email,starts_at,ends_at,status,source,doctors(full_name)&status=eq.confirmed&starts_at=gte.${now.toISOString()}&order=starts_at.asc&limit=50`,
  )) as Array<{ id: string; patient_name: string; patient_email: string; starts_at: string; ends_at: string; status: string; source: string; doctors?: { full_name?: string } | null }>
  return {
    ok: true,
    status: 200,
    body: {
      appointments: rows.map((a) => ({
        id: a.id,
        doctorName: a.doctors?.full_name ?? '',
        patientName: a.patient_name,
        patientEmail: a.patient_email,
        startsAt: iso(a.starts_at),
        endsAt: iso(a.ends_at),
        status: a.status,
        source: a.source,
      })),
    },
  }
}

export async function approveRequest(
  rpc: Rpc,
  requestId: string,
  actorUserId: string,
): Promise<Outcome<{ appointmentId: string; requestStatus: 'approved'; alreadyApproved: boolean }>> {
  if (!isUuid(requestId)) return failure(422, 'VALIDATION_ERROR', 'El identificador de la solicitud no es válido.')
  const result = await rpc('approve_appointment_request', { p_request_id: requestId, p_actor_user_id: actorUserId })
  if (!result.ok) return mapDomainError(result)
  const row = (result.data as Array<{ appointment_id: string; request_status: string; already_approved: boolean }>)[0]
  return { ok: true, status: 200, body: { appointmentId: row.appointment_id, requestStatus: 'approved', alreadyApproved: row.already_approved } }
}

export async function rejectRequest(
  rpc: Rpc,
  requestId: string,
  actorUserId: string,
  body: unknown,
): Promise<Outcome<{ requestStatus: 'rejected'; alreadyRejected: boolean }>> {
  if (!isUuid(requestId)) return failure(422, 'VALIDATION_ERROR', 'El identificador de la solicitud no es válido.')
  const raw = typeof body === 'object' && body !== null ? (body as { reason?: unknown }).reason : undefined
  const reason = validateReason(raw)
  if (!reason.ok) return failure(422, 'VALIDATION_ERROR', reason.message)
  const result = await rpc('reject_appointment_request', { p_request_id: requestId, p_actor_user_id: actorUserId, p_reason: reason.value })
  if (!result.ok) return mapDomainError(result)
  const row = (result.data as Array<{ request_status: string; already_rejected: boolean }>)[0]
  return { ok: true, status: 200, body: { requestStatus: 'rejected', alreadyRejected: row.already_rejected } }
}

/**
 * Citas confirmadas cuya hora de fin ya pasó: son las que el personal puede marcar como completadas (CA-05c).
 * Complementa listUpcomingAppointments; mismo formato de respuesta.
 */
export async function listCompletableAppointments(rest: RestGet, now: Date): Promise<Outcome<{ appointments: AppointmentListItem[] }>> {
  const rows = (await rest(
    `appointments?select=id,patient_name,patient_email,starts_at,ends_at,status,source,doctors(full_name)&status=eq.confirmed&ends_at=lte.${now.toISOString()}&order=starts_at.desc&limit=50`,
  )) as Array<{ id: string; patient_name: string; patient_email: string; starts_at: string; ends_at: string; status: string; source: string; doctors?: { full_name?: string } | null }>
  return {
    ok: true,
    status: 200,
    body: {
      appointments: rows.map((a) => ({
        id: a.id,
        doctorName: a.doctors?.full_name ?? '',
        patientName: a.patient_name,
        patientEmail: a.patient_email,
        startsAt: iso(a.starts_at),
        endsAt: iso(a.ends_at),
        status: a.status,
        source: a.source,
      })),
    },
  }
}
