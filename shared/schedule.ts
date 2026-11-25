import type { Validation } from './request-validation'

// Horario semanal de los odontólogos (RF-02, RB-04). Reglas puras compartidas por el backend (valida) y la interfaz (avisos).

export interface ScheduleWindow {
  /** 0 = domingo … 6 = sábado (igual que weekly_schedules.weekday y extract(dow)). */
  weekday: number
  /** 'HH:MM' en hora local de la clínica (America/Costa_Rica), en punto o y media. */
  startTime: string
  endTime: string
}

/** Horario predeterminado del proyecto para TODOS los odontólogos: lunes a viernes 08:00–17:00 y sábados 09:00–13:00. */
export const DEFAULT_WEEKLY_SCHEDULE: readonly ScheduleWindow[] = [
  { weekday: 1, startTime: '08:00', endTime: '17:00' },
  { weekday: 2, startTime: '08:00', endTime: '17:00' },
  { weekday: 3, startTime: '08:00', endTime: '17:00' },
  { weekday: 4, startTime: '08:00', endTime: '17:00' },
  { weekday: 5, startTime: '08:00', endTime: '17:00' },
  { weekday: 6, startTime: '09:00', endTime: '13:00' },
]

export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
/** Orden de presentación: de lunes a domingo. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export const MAX_WINDOWS_PER_DAY = 6
const TIME = /^([01]\d|2[0-3]):(00|30)$/

const fail = (field: string, message: string): { ok: false; field: string; message: string } => ({ ok: false, field, message })
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/**
 * Valida y normaliza franjas (CA-02b): día 0 a 6, horas en punto o y media, fin posterior al inicio, sin
 * superposición dentro del mismo día. Devuelve las franjas ordenadas por día y hora.
 */
export function validateWindows(input: unknown): Validation<ScheduleWindow[]> {
  if (!Array.isArray(input)) return fail('windows', 'El horario debe ser una lista de franjas.')
  const windows: ScheduleWindow[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return fail('windows', 'Una franja no es válida.')
    const raw = item as Record<string, unknown>
    const weekday = raw.weekday
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return fail('weekday', 'El día de la semana no es válido.')
    }
    const day = WEEKDAY_NAMES[weekday]
    const startTime = text(raw.startTime)?.trim() ?? ''
    const endTime = text(raw.endTime)?.trim() ?? ''
    if (!TIME.test(startTime) || !TIME.test(endTime)) {
      return fail('time', `En ${day}, las horas deben tener el formato HH:MM y ser en punto o y media (por ejemplo, 08:00 o 08:30).`)
    }
    if (endTime <= startTime) return fail('time', `En ${day}, la hora de fin debe ser posterior a la hora de inicio.`)
    windows.push({ weekday, startTime, endTime })
  }

  windows.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
  for (let i = 1; i < windows.length; i++) {
    const prev = windows[i - 1]
    const cur = windows[i]
    if (prev.weekday === cur.weekday && cur.startTime < prev.endTime) {
      return fail('windows', `Las franjas de ${WEEKDAY_NAMES[cur.weekday]} se superponen (${prev.startTime}–${prev.endTime} y ${cur.startTime}–${cur.endTime}).`)
    }
  }
  const perDay = new Map<number, number>()
  for (const w of windows) perDay.set(w.weekday, (perDay.get(w.weekday) ?? 0) + 1)
  for (const [weekday, count] of perDay) {
    if (count > MAX_WINDOWS_PER_DAY) return fail('windows', `Hay demasiadas franjas en ${WEEKDAY_NAMES[weekday]} (máximo ${MAX_WINDOWS_PER_DAY}).`)
  }
  return { ok: true, value: windows }
}

export interface DoctorFields {
  fullName: string
  specialty: string
}

/** Nombre y especialidad del odontólogo (2 a 100 caracteres, igual que las restricciones de la tabla). */
export function validateDoctorFields(input: unknown): Validation<DoctorFields> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('body', 'El cuerpo de la solicitud no es válido.')
  const b = input as Record<string, unknown>
  const fullName = (text(b.fullName) ?? '').replace(/\s+/g, ' ').trim()
  if (fullName.length < 2 || fullName.length > 100) return fail('fullName', 'El nombre debe tener entre 2 y 100 caracteres.')
  const specialty = (text(b.specialty) ?? '').replace(/\s+/g, ' ').trim()
  if (specialty.length < 2 || specialty.length > 100) return fail('specialty', 'La especialidad debe tener entre 2 y 100 caracteres.')
  return { ok: true, value: { fullName, specialty } }
}

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
