// Validación de la solicitud pública (RF-08, CA-08b). Pura: la usa el backend y puede usarla la interfaz para avisos.
// Reglas alineadas con las restricciones CHECK de appointment_requests (migración 3).

export interface RequestInput {
  doctorId: string
  patientName: string
  patientEmail: string
  patientPhone: string | null
  /** Instante UTC normalizado (ISO 8601). */
  startAt: string
  idempotencyKey: string
}

export type Validation<T> = { ok: true; value: T } | { ok: false; field: string; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^\+?[0-9()\s-]+$/
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

export const REASON_MAX = 200

const fail = (field: string, message: string): { ok: false; field: string; message: string } => ({ ok: false, field, message })
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

export function validateRequestInput(body: unknown): Validation<RequestInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('body', 'El cuerpo de la solicitud no es válido.')
  const b = body as Record<string, unknown>

  const doctorId = text(b.doctorId)?.trim() ?? ''
  if (!UUID.test(doctorId)) return fail('doctorId', 'Selecciona un odontólogo válido.')

  const patientName = (text(b.patientName) ?? '').replace(/\s+/g, ' ').trim()
  if (patientName.length < 2 || patientName.length > 100) return fail('patientName', 'Escribe tu nombre completo (entre 2 y 100 caracteres).')

  const patientEmail = (text(b.patientEmail) ?? '').trim().toLowerCase()
  if (patientEmail.length > 254 || !EMAIL.test(patientEmail)) return fail('patientEmail', 'Escribe un correo electrónico válido.')

  let patientPhone: string | null = null
  if (b.patientPhone !== undefined && b.patientPhone !== null && b.patientPhone !== '') {
    const phone = text(b.patientPhone)?.trim()
    const digits = phone?.replace(/\D/g, '').length ?? 0
    if (!phone || phone.length > 25 || !PHONE.test(phone) || digits < 7) return fail('patientPhone', 'El teléfono no es válido (usa solo números, espacios, + o guiones).')
    patientPhone = phone
  }

  const startRaw = text(b.startAt)?.trim() ?? ''
  const start = new Date(startRaw)
  if (!ISO_WITH_ZONE.test(startRaw) || Number.isNaN(start.getTime())) return fail('startAt', 'El horario seleccionado no es válido.')
  if ((start.getUTCMinutes() !== 0 && start.getUTCMinutes() !== 30) || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    return fail('startAt', 'El horario debe comenzar en punto o y media.')
  }

  const idempotencyKey = text(b.idempotencyKey)?.trim().toLowerCase() ?? ''
  if (!UUID.test(idempotencyKey)) return fail('idempotencyKey', 'Falta la clave de idempotencia (UUID).')

  return { ok: true, value: { doctorId: doctorId.toLowerCase(), patientName, patientEmail, patientPhone, startAt: start.toISOString(), idempotencyKey } }
}

/** Motivo opcional de rechazo (CA-09d): texto corto, sin datos clínicos. */
export function validateReason(value: unknown): Validation<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return fail('reason', 'El motivo no es válido.')
  const reason = value.trim()
  if (reason.length > REASON_MAX) return fail('reason', `El motivo no puede superar ${REASON_MAX} caracteres.`)
  return { ok: true, value: reason === '' ? null : reason }
}

export const isUuid = (value: string): boolean => UUID.test(value)
