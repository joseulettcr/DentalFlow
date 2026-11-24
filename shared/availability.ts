import {
  SLOT_MINUTES,
  addDays,
  clinicLocalToUtc,
  isValidDateString,
  timeToMinutes,
  todayInClinic,
  weekdayOf,
} from './clinic-time.js'

// Cálculo de disponibilidad (RF-03, RB-01..RB-04, RB-11). Puro: no lee ni escribe nada.

export const MIN_NOTICE_MINUTES = 60 // RB-03: desde ahora + 1 hora
export const MAX_DAYS_AHEAD = 30 // RB-03: hasta ahora + 30 días

export interface WeeklyRange {
  weekday: number
  start_time: string
  end_time: string
}
export interface BusyInterval {
  startsAt: string
  endsAt: string
}
export interface Slot {
  startAt: string
  endAt: string
}

export type DateCheck = { ok: true } | { ok: false; reason: 'format' | 'past' | 'too_far' }

/** CA-03c: formato inválido, fecha pasada o más allá de 30 días => no válida. */
export function checkBookingDate(date: string, now: Date): DateCheck {
  if (!isValidDateString(date)) return { ok: false, reason: 'format' }
  const today = todayInClinic(now)
  if (date < today) return { ok: false, reason: 'past' }
  if (date > addDays(today, MAX_DAYS_AHEAD)) return { ok: false, reason: 'too_far' }
  return { ok: true }
}

/**
 * Bloques de 30 minutos alineados a :00/:30 que caben íntegros en alguna franja semanal del día,
 * no chocan con citas confirmadas y respetan la ventana de reserva. Una franja o cita de otro día
 * de la semana se ignora. Las solicitudes pendientes no se reciben aquí a propósito (RB-11).
 */
export function computeSlots(input: { date: string; ranges: WeeklyRange[]; busy: BusyInterval[]; now: Date }): Slot[] {
  const { date, ranges, busy, now } = input
  const weekday = weekdayOf(date)
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60_000
  const latest = now.getTime() + MAX_DAYS_AHEAD * 86_400_000
  const busyMs = busy.map((b) => [Date.parse(b.startsAt), Date.parse(b.endsAt)] as const)

  const starts = new Set<number>()
  for (const range of ranges) {
    if (range.weekday !== weekday) continue
    const open = timeToMinutes(range.start_time)
    const close = timeToMinutes(range.end_time)
    for (let m = Math.ceil(open / SLOT_MINUTES) * SLOT_MINUTES; m + SLOT_MINUTES <= close; m += SLOT_MINUTES) {
      starts.add(clinicLocalToUtc(date, m).getTime())
    }
  }

  return [...starts]
    .sort((a, b) => a - b)
    .filter((start) => start >= earliest && start <= latest)
    .filter((start) => {
      const end = start + SLOT_MINUTES * 60_000
      return !busyMs.some(([bs, be]) => bs < end && be > start)
    })
    .map((start) => ({
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + SLOT_MINUTES * 60_000).toISOString(),
    }))
}
