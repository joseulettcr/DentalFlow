import { formatClinicDate, formatClinicTime } from '../../shared/clinic-time.js'
import { isUuid } from '../../shared/request-validation.js'
import {
  DEFAULT_WEEKLY_SCHEDULE,
  sameName,
  validateDoctorFields,
  validateWindows,
  type ScheduleWindow,
} from '../../shared/schedule.js'
import { failure, mapDomainError, type Outcome } from './http.js'
import type { RestGet, Rpc } from './supabase-rest.js'

// Administración de odontólogos y horarios (RF-02). Solo `admin` (permiso doctors.write, validado antes en withStaff).
// El horario predeterminado del proyecto vive en shared/schedule.ts; las escrituras son funciones PostgreSQL atómicas.

export interface AdminDoctor {
  id: string
  fullName: string
  specialty: string
  isActive: boolean
  windows: ScheduleWindow[]
}

interface DoctorRow { id: string; full_name: string; specialty: string; is_active: boolean }
interface ScheduleRow { doctor_id: string; weekday: number; start_time: string; end_time: string }

const hhmm = (time: string) => time.slice(0, 5)

async function loadDoctors(rest: RestGet): Promise<AdminDoctor[]> {
  const doctors = (await rest('doctors?select=id,full_name,specialty,is_active&order=full_name.asc')) as DoctorRow[]
  if (doctors.length === 0) return []
  const ids = doctors.map((d) => d.id).join(',')
  const schedules = (await rest(
    `weekly_schedules?select=doctor_id,weekday,start_time,end_time&doctor_id=in.(${ids})&order=weekday.asc,start_time.asc`,
  )) as ScheduleRow[]
  return doctors.map((d) => ({
    id: d.id,
    fullName: d.full_name,
    specialty: d.specialty,
    isActive: d.is_active,
    windows: schedules
      .filter((s) => s.doctor_id === d.id)
      .map((s) => ({ weekday: s.weekday, startTime: hhmm(s.start_time), endTime: hhmm(s.end_time) })),
  }))
}

/** Todos los odontólogos (activos e inactivos) con su horario, para el módulo administrativo. */
export async function listAdminDoctors(rest: RestGet): Promise<Outcome<{ doctors: AdminDoctor[] }>> {
  return { ok: true, status: 200, body: { doctors: await loadDoctors(rest) } }
}

const DUPLICATE = 'Ya existe un odontólogo con ese nombre.'

/** Alta (CA-02a): queda activo y con el horario predeterminado, salvo que se envíen franjas propias. */
export async function createDoctor(rest: RestGet, rpc: Rpc, body: unknown): Promise<Outcome<{ doctor: AdminDoctor }>> {
  const fields = validateDoctorFields(body)
  if (!fields.ok) return failure(422, 'VALIDATION_ERROR', fields.message)

  const rawWindows = typeof body === 'object' && body !== null ? (body as { windows?: unknown }).windows : undefined
  const windows = rawWindows === undefined ? { ok: true as const, value: [...DEFAULT_WEEKLY_SCHEDULE] } : validateWindows(rawWindows)
  if (!windows.ok) return failure(422, 'VALIDATION_ERROR', windows.message)

  const existing = await loadDoctors(rest)
  if (existing.some((d) => sameName(d.fullName, fields.value.fullName))) return failure(422, 'VALIDATION_ERROR', DUPLICATE)

  const created = await rpc('create_doctor', {
    p_full_name: fields.value.fullName,
    p_specialty: fields.value.specialty,
    p_windows: windows.value,
  })
  if (!created.ok) return mapDomainError(created)
  const row = (created.data as Array<{ doctor_id: string }>)[0]
  return {
    ok: true,
    status: 201,
    body: { doctor: { id: row.doctor_id, fullName: fields.value.fullName, specialty: fields.value.specialty, isActive: true, windows: windows.value } },
  }
}

/** Edición de datos y activación o desactivación (CA-02c): nunca se elimina, se conserva el historial. */
export async function updateDoctor(
  rest: RestGet,
  rpc: Rpc,
  doctorId: string,
  body: unknown,
): Promise<Outcome<{ doctor: { id: string; fullName: string; specialty: string; isActive: boolean } }>> {
  if (!isUuid(doctorId)) return failure(422, 'VALIDATION_ERROR', 'El identificador del odontólogo no es válido.')
  const fields = validateDoctorFields(body)
  if (!fields.ok) return failure(422, 'VALIDATION_ERROR', fields.message)
  const isActive = typeof body === 'object' && body !== null ? (body as { isActive?: unknown }).isActive : undefined
  if (typeof isActive !== 'boolean') return failure(422, 'VALIDATION_ERROR', 'Indica si el odontólogo está activo.')

  const others = (await loadDoctors(rest)).filter((d) => d.id !== doctorId)
  if (others.some((d) => sameName(d.fullName, fields.value.fullName))) return failure(422, 'VALIDATION_ERROR', DUPLICATE)

  const updated = await rpc('update_doctor', {
    p_doctor_id: doctorId,
    p_full_name: fields.value.fullName,
    p_specialty: fields.value.specialty,
    p_is_active: isActive,
  })
  if (!updated.ok) return mapDomainError(updated)
  return { ok: true, status: 200, body: { doctor: { id: doctorId, ...fields.value, isActive } } }
}

/** Texto del 409 de CA-02d: qué reservas requieren atención (fecha, hora y paciente; solo lo ve el personal admin). */
function conflictMessage(details: string | null): string {
  let items: Array<{ startsAt: string; patientName: string }> = []
  try {
    items = JSON.parse(details ?? '[]') as typeof items
  } catch {
    /* sin detalle legible */
  }
  const shown = items.slice(0, 5).map((i) => `${formatClinicDate(i.startsAt)} ${formatClinicTime(i.startsAt)} (${i.patientName})`)
  const more = items.length > shown.length ? ` y ${items.length - shown.length} más` : ''
  return `No se guardó el horario: ${items.length} cita(s) futura(s) confirmada(s) quedarían fuera. Cancélalas o ajusta el horario: ${shown.join('; ')}${more}.`
}

/** Reemplazo del horario semanal completo (CA-02b, CA-02d). Todo o nada. */
export async function setDoctorSchedule(
  rpc: Rpc,
  doctorId: string,
  body: unknown,
): Promise<Outcome<{ doctorId: string; windows: ScheduleWindow[] }>> {
  if (!isUuid(doctorId)) return failure(422, 'VALIDATION_ERROR', 'El identificador del odontólogo no es válido.')
  const raw = typeof body === 'object' && body !== null ? (body as { windows?: unknown }).windows : undefined
  const windows = validateWindows(raw)
  if (!windows.ok) return failure(422, 'VALIDATION_ERROR', windows.message)

  const result = await rpc('set_doctor_schedule', { p_doctor_id: doctorId, p_windows: windows.value })
  if (!result.ok) {
    if (result.message === 'SCHEDULE_CONFLICT') return failure(409, 'SCHEDULE_CONFLICT', conflictMessage(result.details))
    return mapDomainError(result)
  }
  return { ok: true, status: 200, body: { doctorId, windows: windows.value } }
}
