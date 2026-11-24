import { todayInClinic } from '../../shared/clinic-time.js'
import { validateRequestInput } from '../../shared/request-validation.js'
import { getDayAvailability } from './availability-service.js'
import { failure, mapDomainError, type Outcome } from './http.js'
import type { RestGet, Rpc } from './supabase-rest.js'

// Reserva telefónica directa (RF-04): la cita queda CONFIRMADA de inmediato, sin solicitud pendiente.
// Reutiliza la validación y la disponibilidad de la solicitud pública (mismas reglas, CA-04f); el origen
// ('admin_phone') y el autor los fija el servidor, nunca el cliente. El resto lo garantiza PostgreSQL.

export interface PhoneAppointmentBody {
  appointmentId: string
  status: 'confirmed'
  doctorName: string
  startsAt: string
  endsAt: string
}

interface ExistingAppointment {
  id: string
  status: string
  source: string
  doctor_id: string
  patient_name: string
  patient_email: string
  patient_phone: string | null
  starts_at: string
  ends_at: string
  doctors?: { full_name?: string } | null
}

const iso = (value: string) => new Date(value).toISOString()

export async function createPhoneAppointment(
  deps: { rest: RestGet; rpc: Rpc; now: Date },
  actorUserId: string,
  body: unknown,
): Promise<Outcome<PhoneAppointmentBody>> {
  const { rest, rpc, now } = deps

  // (1) Validación de entrada (CA-04c): 422 sin tocar la base de datos. Campos desconocidos (p. ej. "source") se ignoran.
  const parsed = validateRequestInput(body)
  if (!parsed.ok) return failure(422, 'VALIDATION_ERROR', parsed.message)
  const input = parsed.value

  // (2) Idempotencia (CA-04d): mismo identificador y mismos datos devuelve la misma cita aunque el bloque cambie después.
  const existing = (await rest(
    `appointments?select=id,status,source,doctor_id,patient_name,patient_email,patient_phone,starts_at,ends_at,doctors(full_name)&idempotency_key=eq.${input.idempotencyKey}&limit=1`,
  )) as ExistingAppointment[]
  if (existing.length > 0) {
    const row = existing[0]
    const same =
      row.source === 'admin_phone' &&
      row.doctor_id === input.doctorId &&
      row.patient_name === input.patientName &&
      row.patient_email === input.patientEmail &&
      (row.patient_phone ?? null) === input.patientPhone &&
      Date.parse(row.starts_at) === Date.parse(input.startAt)
    if (!same) return failure(409, 'IDEMPOTENCY_KEY_REUSED', 'Esa clave ya se usó con datos distintos.')
    return {
      ok: true,
      status: 200,
      body: { appointmentId: row.id, status: 'confirmed', doctorName: row.doctors?.full_name ?? '', startsAt: iso(row.starts_at), endsAt: iso(row.ends_at) },
    }
  }

  // (3) Odontólogo activo, franja semanal y ventana RB-03 (422); bloque ocupado por cita confirmada (409).
  const day = await getDayAvailability(rest, { doctorId: input.doctorId, date: todayInClinic(new Date(input.startAt)), now })
  if (!day.ok) return failure(day.status, day.code, day.message)
  if (!day.all.some((slot) => slot.startAt === input.startAt)) {
    return failure(422, 'VALIDATION_ERROR', 'El horario seleccionado no está dentro del horario de atención o de la ventana de reserva.')
  }
  if (!day.free.some((slot) => slot.startAt === input.startAt)) {
    return failure(409, 'SLOT_UNAVAILABLE', 'Ese horario ya no está disponible. Elige otro.')
  }

  // (4) Alta atómica con auditoría. appointments_no_overlap resuelve las carreras (SQLSTATE 23P01 → SLOT_UNAVAILABLE).
  const created = await rpc('create_phone_appointment', {
    p_doctor_id: input.doctorId,
    p_patient_name: input.patientName,
    p_patient_email: input.patientEmail,
    p_patient_phone: input.patientPhone,
    p_starts_at: input.startAt,
    p_idempotency_key: input.idempotencyKey,
    p_actor_user_id: actorUserId,
  })
  if (!created.ok) return mapDomainError(created)
  const row = (created.data as Array<{ appointment_id: string; appointment_status: string; replayed: boolean }>)[0]
  return {
    ok: true,
    status: row.replayed ? 200 : 201,
    body: {
      appointmentId: row.appointment_id,
      status: 'confirmed',
      doctorName: day.doctorName,
      startsAt: input.startAt,
      endsAt: new Date(Date.parse(input.startAt) + 30 * 60_000).toISOString(),
    },
  }
}
