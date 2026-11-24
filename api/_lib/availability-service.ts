import {
  addDays,
  clinicLocalToUtc,
} from '../../shared/clinic-time.js'
import { checkBookingDate, computeSlots, type BusyInterval, type Slot, type WeeklyRange } from '../../shared/availability.js'
import type { RestGet } from './supabase-rest.js'

// Consultas de SOLO LECTURA (T-05/T-06). Solo se piden columnas no sensibles: de las citas únicamente
// starts_at/ends_at (CA-03d); nunca appointment_requests (RB-11) ni datos de pacientes.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DoctorDto {
  id: string
  fullName: string
  specialty: string | null
  weeklySchedule: Array<{ weekday: number; startTime: string; endTime: string }>
}

export type ServiceFailure = { ok: false; status: 422 | 404; code: 'VALIDATION_ERROR' | 'NOT_FOUND'; message: string }

const hhmm = (time: string) => time.slice(0, 5)

interface DoctorRow { id: string; full_name: string; specialty: string | null }
interface ScheduleRow extends WeeklyRange { doctor_id: string }

export async function listActiveDoctors(rest: RestGet): Promise<DoctorDto[]> {
  const doctors = (await rest('doctors?select=id,full_name,specialty&is_active=eq.true&order=full_name.asc')) as DoctorRow[]
  if (doctors.length === 0) return []
  const ids = doctors.map((d) => d.id).join(',')
  const schedules = (await rest(
    `weekly_schedules?select=doctor_id,weekday,start_time,end_time&doctor_id=in.(${ids})&order=weekday.asc,start_time.asc`,
  )) as ScheduleRow[]
  return doctors.map((d) => ({
    id: d.id,
    fullName: d.full_name,
    specialty: d.specialty,
    weeklySchedule: schedules
      .filter((s) => s.doctor_id === d.id)
      .map((s) => ({ weekday: s.weekday, startTime: hhmm(s.start_time), endTime: hhmm(s.end_time) })),
  }))
}

const DATE_MESSAGES = {
  format: 'La fecha debe tener el formato AAAA-MM-DD y ser una fecha válida.',
  past: 'La fecha no puede ser anterior a hoy.',
  too_far: 'Solo se puede consultar hasta 30 días hacia adelante.',
} as const

export type DayAvailability =
  | { ok: true; doctorId: string; doctorName: string; date: string; all: Slot[]; free: Slot[] }
  | ServiceFailure

/**
 * Disponibilidad de un día para un odontólogo: `all` = bloques que la agenda ofrece (franjas + ventana de reserva),
 * `free` = los que además no tienen cita confirmada. Permite distinguir "fuera de horario" (422) de "ocupado" (409).
 */
export async function getDayAvailability(
  rest: RestGet,
  input: { doctorId: string; date: string; now: Date },
): Promise<DayAvailability> {
  const { doctorId, date, now } = input
  if (!UUID.test(doctorId)) {
    return { ok: false, status: 422, code: 'VALIDATION_ERROR', message: 'El identificador del odontólogo no es válido.' }
  }
  const check = checkBookingDate(date, now)
  if (!check.ok) return { ok: false, status: 422, code: 'VALIDATION_ERROR', message: DATE_MESSAGES[check.reason] }

  // CA-02c: un odontólogo inactivo (o inexistente) no se ofrece.
  const doctors = (await rest(`doctors?select=id,full_name&id=eq.${doctorId}&is_active=eq.true&limit=1`)) as Array<{ id: string; full_name?: string }>
  if (doctors.length === 0) {
    return { ok: false, status: 422, code: 'VALIDATION_ERROR', message: 'El odontólogo no está disponible para nuevas citas.' }
  }

  const ranges = (await rest(
    `weekly_schedules?select=weekday,start_time,end_time&doctor_id=eq.${doctorId}`,
  )) as WeeklyRange[]

  // Solo citas CONFIRMADAS del día. Las solicitudes pendientes no bloquean (RB-11) y ni siquiera se consultan.
  const from = clinicLocalToUtc(date, 0).toISOString()
  const to = clinicLocalToUtc(addDays(date, 1), 0).toISOString()
  const confirmed = (await rest(
    `appointments?select=starts_at,ends_at&doctor_id=eq.${doctorId}&status=eq.confirmed&starts_at=gte.${from}&starts_at=lt.${to}`,
  )) as Array<{ starts_at: string; ends_at: string }>
  const busy: BusyInterval[] = confirmed.map((a) => ({ startsAt: a.starts_at, endsAt: a.ends_at }))

  return {
    ok: true,
    doctorId,
    doctorName: doctors[0].full_name ?? '',
    date,
    all: computeSlots({ date, ranges, busy: [], now }),
    free: computeSlots({ date, ranges, busy, now }),
  }
}

export async function listSlots(
  rest: RestGet,
  input: { doctorId: string; date: string; now: Date },
): Promise<{ ok: true; doctorId: string; date: string; slots: Slot[] } | ServiceFailure> {
  const day = await getDayAvailability(rest, input)
  if (!day.ok) return day
  return { ok: true, doctorId: day.doctorId, date: day.date, slots: day.free }
}
