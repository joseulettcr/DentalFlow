import { describe, expect, it, vi } from 'vitest'
import { listActiveDoctors, listSlots } from '../../api/_lib/availability-service'
import type { RestGet } from '../../api/_lib/supabase-rest'
import { formatClinicTime } from '../../shared/clinic-time'

const NOW = new Date('2026-11-23T12:00:00Z')
const ACTIVE = 'a1000000-0000-4000-8000-000000000001'
const INACTIVE = 'a1000000-0000-4000-8000-000000000009'
const MONDAY = '2026-11-30'

interface World {
  doctors?: Array<{ id: string; full_name: string; specialty: string | null; is_active: boolean }>
  schedules?: Array<{ doctor_id: string; weekday: number; start_time: string; end_time: string }>
  appointments?: Array<{ doctor_id: string; status: string; starts_at: string; ends_at: string }>
  pendingRequests?: Array<{ doctor_id: string; requested_starts_at: string }>
}

/** Base simulada: interpreta solo los filtros que usa el servicio y registra cada consulta. */
function fakeRest(world: World) {
  const calls: string[] = []
  const rest: RestGet = async (path) => {
    calls.push(path)
    const [table, query = ''] = path.split('?')
    const q = new URLSearchParams(query)
    if (table === 'doctors') {
      let rows = world.doctors ?? []
      if (q.get('is_active') === 'eq.true') rows = rows.filter((d) => d.is_active)
      const id = q.get('id')
      if (id) rows = rows.filter((d) => `eq.${d.id}` === id)
      return rows
    }
    if (table === 'weekly_schedules') {
      let rows = world.schedules ?? []
      const doctor = q.get('doctor_id') ?? ''
      if (doctor.startsWith('eq.')) rows = rows.filter((s) => `eq.${s.doctor_id}` === doctor)
      if (doctor.startsWith('in.(')) rows = rows.filter((s) => doctor.slice(4, -1).split(',').includes(s.doctor_id))
      return rows
    }
    if (table === 'appointments') {
      return (world.appointments ?? [])
        .filter((a) => `eq.${a.doctor_id}` === q.get('doctor_id') && `eq.${a.status}` === q.get('status'))
        .map((a) => ({ starts_at: a.starts_at, ends_at: a.ends_at }))
    }
    throw new Error(`Consulta inesperada: ${path}`)
  }
  return { rest, calls }
}

const baseWorld: World = {
  doctors: [
    { id: ACTIVE, full_name: 'Dra. Ana Morales', specialty: 'Odontología general', is_active: true },
    { id: INACTIVE, full_name: 'Dr. Inactivo', specialty: null, is_active: false },
  ],
  schedules: [
    { doctor_id: ACTIVE, weekday: 1, start_time: '08:00:00', end_time: '09:00:00' },
    { doctor_id: INACTIVE, weekday: 1, start_time: '08:00:00', end_time: '09:00:00' },
  ],
}

describe('listActiveDoctors (T-05)', () => {
  it('devuelve solo odontólogos activos con su horario semanal, sin datos sensibles', async () => {
    const { rest } = fakeRest(baseWorld)
    const doctors = await listActiveDoctors(rest)
    expect(doctors).toEqual([
      {
        id: ACTIVE,
        fullName: 'Dra. Ana Morales',
        specialty: 'Odontología general',
        weeklySchedule: [{ weekday: 1, startTime: '08:00', endTime: '09:00' }],
      },
    ])
  })

  it('sin odontólogos activos => lista vacía y no consulta horarios', async () => {
    const { rest, calls } = fakeRest({ doctors: [{ id: INACTIVE, full_name: 'X', specialty: null, is_active: false }] })
    expect(await listActiveDoctors(rest)).toEqual([])
    expect(calls.some((c) => c.startsWith('weekly_schedules'))).toBe(false)
  })
})

describe('listSlots (T-06)', () => {
  const ask = (rest: RestGet, doctorId: string, date: string) => listSlots(rest, { doctorId, date, now: NOW })
  const times = (r: Awaited<ReturnType<typeof ask>>) => (r.ok ? r.slots.map((s) => formatClinicTime(s.startAt)) : r)

  it('espacio disponible', async () => {
    const { rest } = fakeRest(baseWorld)
    expect(times(await ask(rest, ACTIVE, MONDAY))).toEqual(['08:00', '08:30'])
  })

  it('espacio ocupado por cita confirmada del mismo odontólogo', async () => {
    const { rest } = fakeRest({ ...baseWorld, appointments: [{ doctor_id: ACTIVE, status: 'confirmed', starts_at: '2026-11-30T14:00:00Z', ends_at: '2026-11-30T14:30:00Z' }] })
    expect(times(await ask(rest, ACTIVE, MONDAY))).toEqual(['08:30'])
  })

  it('una cita cancelada o de otro odontólogo no ocupa el espacio', async () => {
    const { rest } = fakeRest({
      ...baseWorld,
      appointments: [
        { doctor_id: ACTIVE, status: 'cancelled', starts_at: '2026-11-30T14:00:00Z', ends_at: '2026-11-30T14:30:00Z' },
        { doctor_id: INACTIVE, status: 'confirmed', starts_at: '2026-11-30T14:30:00Z', ends_at: '2026-11-30T15:00:00Z' },
      ],
    })
    expect(times(await ask(rest, ACTIVE, MONDAY))).toEqual(['08:00', '08:30'])
  })

  it('las solicitudes pendientes no bloquean y ni siquiera se consultan (RB-11)', async () => {
    const { rest, calls } = fakeRest({ ...baseWorld, pendingRequests: [{ doctor_id: ACTIVE, requested_starts_at: '2026-11-30T14:00:00Z' }] })
    expect(times(await ask(rest, ACTIVE, MONDAY))).toEqual(['08:00', '08:30'])
    expect(calls.some((c) => c.includes('appointment_requests'))).toBe(false)
  })

  it('día sin horarios => 200 con lista vacía (CA-03c)', async () => {
    const { rest } = fakeRest(baseWorld)
    const result = await ask(rest, ACTIVE, '2026-11-28') // sábado
    expect(result).toMatchObject({ ok: true, slots: [] })
  })

  it('odontólogo inactivo o inexistente => 422', async () => {
    const { rest } = fakeRest(baseWorld)
    expect(await ask(rest, INACTIVE, MONDAY)).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
    expect(await ask(rest, 'a1000000-0000-4000-8000-0000000000ff', MONDAY)).toMatchObject({ ok: false, status: 422 })
  })

  it.each([
    ['identificador no UUID', 'no-es-uuid', MONDAY],
    ['fecha con formato inválido', ACTIVE, '30/11/2026'],
    ['fecha inexistente', ACTIVE, '2026-02-30'],
    ['fecha pasada', ACTIVE, '2026-11-22'],
    ['más de 30 días', ACTIVE, '2026-12-24'],
  ])('%s => 422 sin consultar la base de datos', async (_name, doctorId, date) => {
    const { rest, calls } = fakeRest(baseWorld)
    expect(await ask(rest, doctorId, date)).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
    expect(calls).toEqual([])
  })

  it('consulta sin modificar registros ni leer datos de pacientes (CA-03d)', async () => {
    const world = { ...baseWorld, appointments: [{ doctor_id: ACTIVE, status: 'confirmed', starts_at: '2026-11-30T14:00:00Z', ends_at: '2026-11-30T14:30:00Z' }] }
    const spy = vi.fn(fakeRest(world).rest)
    await listSlots(spy, { doctorId: ACTIVE, date: MONDAY, now: NOW })
    await listActiveDoctors(spy)
    const paths = spy.mock.calls.map((c) => c[0])
    expect(paths.length).toBeGreaterThan(0)
    // RestGet solo ofrece lectura (no hay verbos de escritura) y ninguna ruta toca columnas de pacientes.
    for (const p of paths) expect(p).not.toMatch(/patient|email|phone|idempotency|appointment_requests|appointment_audit/)
    expect(paths.find((p) => p.startsWith('appointments'))).toContain('select=starts_at,ends_at')
  })
})
