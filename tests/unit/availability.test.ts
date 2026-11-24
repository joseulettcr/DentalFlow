import { describe, expect, it } from 'vitest'
import { checkBookingDate, computeSlots, type WeeklyRange } from '../../shared/availability'
import { addDays, clinicLocalToUtc, formatClinicTime, isValidDateString, todayInClinic, weekdayOf } from '../../shared/clinic-time'

// Lunes 2026-11-23, 06:00 en Costa Rica (UTC-6 todo el año).
const NOW = new Date('2026-11-23T12:00:00Z')
const MONDAY = '2026-11-30'
const monday = (start: string, end: string): WeeklyRange => ({ weekday: 1, start_time: start, end_time: end })
const starts = (slots: Array<{ startAt: string }>) => slots.map((s) => formatClinicTime(s.startAt))

describe('zona horaria America/Costa_Rica (RB-02)', () => {
  it('hoy en la clínica usa el huso de Costa Rica, no el UTC', () => {
    expect(todayInClinic(new Date('2026-11-23T05:59:00Z'))).toBe('2026-11-22') // 23:59 del día anterior
    expect(todayInClinic(new Date('2026-11-23T06:00:00Z'))).toBe('2026-11-23')
  })
  it('convierte hora local a UTC (08:00 CR = 14:00Z)', () => {
    expect(clinicLocalToUtc(MONDAY, 8 * 60).toISOString()).toBe('2026-11-30T14:00:00.000Z')
    expect(formatClinicTime('2026-11-30T14:00:00.000Z')).toBe('08:00')
  })
  it('día de la semana 0 = domingo', () => {
    expect(weekdayOf('2026-11-29')).toBe(0)
    expect(weekdayOf(MONDAY)).toBe(1)
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  })
  it('valida fechas calendario', () => {
    expect(isValidDateString('2026-02-28')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '30-11-2026', '2026-1-5', '', 'hoy']) expect(isValidDateString(bad)).toBe(false)
  })
})

describe('checkBookingDate (CA-03c)', () => {
  it('acepta hoy y hasta 30 días', () => {
    expect(checkBookingDate('2026-11-23', NOW)).toEqual({ ok: true })
    expect(checkBookingDate('2026-12-23', NOW)).toEqual({ ok: true })
  })
  it('rechaza formato inválido, pasada y más allá de 30 días', () => {
    expect(checkBookingDate('2026-02-30', NOW)).toEqual({ ok: false, reason: 'format' })
    expect(checkBookingDate('2026-11-22', NOW)).toEqual({ ok: false, reason: 'past' })
    expect(checkBookingDate('2026-12-24', NOW)).toEqual({ ok: false, reason: 'too_far' })
  })
})

describe('computeSlots (RF-03)', () => {
  it('CA-03a: lunes 08:00–09:00 sin citas ofrece 08:00 y 08:30', () => {
    const slots = computeSlots({ date: MONDAY, ranges: [monday('08:00:00', '09:00:00')], busy: [], now: NOW })
    expect(starts(slots)).toEqual(['08:00', '08:30'])
    expect(slots[0]).toEqual({ startAt: '2026-11-30T14:00:00.000Z', endAt: '2026-11-30T14:30:00.000Z' })
  })

  it('espacio disponible vs ocupado por cita confirmada (CA-03b)', () => {
    const busy = [{ startsAt: '2026-11-30T14:00:00Z', endsAt: '2026-11-30T14:30:00Z' }]
    const slots = computeSlots({ date: MONDAY, ranges: [monday('08:00', '09:00')], busy, now: NOW })
    expect(starts(slots)).toEqual(['08:30'])
  })

  it('una cita de otro horario no oculta bloques distintos', () => {
    const busy = [{ startsAt: '2026-11-30T15:00:00Z', endsAt: '2026-11-30T15:30:00Z' }] // 09:00 CR
    const slots = computeSlots({ date: MONDAY, ranges: [monday('08:00', '09:00')], busy, now: NOW })
    expect(starts(slots)).toEqual(['08:00', '08:30'])
  })

  it('día sin horarios (sábado, domingo o sin franja) => lista vacía', () => {
    const ranges = [monday('08:00', '12:00')]
    expect(computeSlots({ date: '2026-11-28', ranges, busy: [], now: NOW })).toEqual([]) // sábado
    expect(computeSlots({ date: '2026-11-29', ranges, busy: [], now: NOW })).toEqual([]) // domingo
    expect(computeSlots({ date: MONDAY, ranges: [], busy: [], now: NOW })).toEqual([])
  })

  it('dos franjas el mismo día (08–12 y 13–17) => 16 bloques y sin bloque de almuerzo', () => {
    const slots = computeSlots({ date: MONDAY, ranges: [monday('08:00', '12:00'), monday('13:00', '17:00')], busy: [], now: NOW })
    expect(slots).toHaveLength(16)
    expect(starts(slots)).not.toContain('12:00')
    expect(starts(slots)).not.toContain('12:30')
    expect(starts(slots).at(-1)).toBe('16:30')
  })

  it('solo bloques alineados a :00/:30 que caben enteros en la franja', () => {
    const slots = computeSlots({ date: MONDAY, ranges: [monday('08:15', '09:15')], busy: [], now: NOW })
    expect(starts(slots)).toEqual(['08:30']) // 08:30–09:00; 09:00–09:30 excede la franja
  })

  it('anticipación mínima de 1 hora (RB-03) el mismo día', () => {
    const now = new Date('2026-11-23T14:10:00Z') // 08:10 CR; lunes de hoy
    const slots = computeSlots({ date: '2026-11-23', ranges: [monday('08:00', '11:00')], busy: [], now })
    expect(starts(slots)).toEqual(['09:30', '10:00', '10:30']) // desde 09:10 en adelante
  })

  it('no ofrece bloques más allá de 30 días desde ahora (RB-03)', () => {
    const now = new Date('2026-11-23T18:00:00Z') // 12:00 CR
    const day30 = '2026-12-23' // miércoles
    const slots = computeSlots({ date: day30, ranges: [{ weekday: 3, start_time: '08:00', end_time: '17:00' }], busy: [], now })
    expect(starts(slots).every((t) => t <= '12:00')).toBe(true)
    expect(starts(slots)).toContain('12:00')
    expect(starts(slots)).not.toContain('12:30')
  })
})
