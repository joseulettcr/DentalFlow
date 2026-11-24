// Utilidades de fecha y hora de la clínica (RB-02): zona America/Costa_Rica, instantes en UTC.
// Funciones puras, compartidas por el backend (cálculo) y la interfaz (presentación).

export const CLINIC_TZ = 'America/Costa_Rica'
export const SLOT_MINUTES = 30

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Fecha calendario válida en formato YYYY-MM-DD (rechaza 2026-02-30, 2026-13-01, etc.). */
export function isValidDateString(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Fecha de hoy en la clínica (no en el huso del servidor ni del navegador). */
export function todayInClinic(now: Date): string {
  const p = Object.fromEntries(partsFormat.formatToParts(now).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

export function addDays(date: string, days: number): string {
  const match = DATE_RE.exec(date)
  if (!match) throw new Error('Fecha inválida')
  const t = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  return t.toISOString().slice(0, 10)
}

/** Día de la semana de una fecha calendario: 0 = domingo … 6 = sábado (igual que weekly_schedules.weekday). */
export function weekdayOf(date: string): number {
  const match = DATE_RE.exec(date)
  if (!match) throw new Error('Fecha inválida')
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()
}

function offsetAt(ms: number): number {
  const p = Object.fromEntries(partsFormat.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** Hora local de la clínica (fecha + minutos desde medianoche) a instante UTC. */
export function clinicLocalToUtc(date: string, minutesFromMidnight: number): Date {
  const match = DATE_RE.exec(date)
  if (!match) throw new Error('Fecha inválida')
  const guess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, minutesFromMidnight)
  let utc = guess - offsetAt(guess)
  utc = guess - offsetAt(utc) // segunda pasada por si el desfase cambia en ese instante
  return new Date(utc)
}

/** 'HH:mm' en hora de la clínica para un instante ISO. */
export function formatClinicTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** 'HH:MM[:SS]' → minutos desde medianoche. */
export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time)
  if (!match) throw new Error('Hora inválida')
  return Number(match[1]) * 60 + Number(match[2])
}

/** 'lun 30 nov' en hora de la clínica para un instante ISO. */
export function formatClinicDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', { timeZone: CLINIC_TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
}
