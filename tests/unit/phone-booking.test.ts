import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import appointmentsHandler from '../../api/admin/appointments'
import { createPhoneAppointment } from '../../api/_lib/phone-booking-service'
import type { RestGet, Rpc, RpcResult } from '../../api/_lib/supabase-rest'

const NOW = new Date('2026-11-23T12:00:00Z') // lunes 06:00 en Costa Rica
const DOCTOR = 'a1000000-0000-4000-8000-000000000001'
const INACTIVE = 'a1000000-0000-4000-8000-000000000009'
const KEY = '5b6f8f2e-4a63-4c63-9a38-1d2f3a4b5c6d'
const APPT_ID = '0f9c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f'
const ACTOR = '11111111-2222-4333-8444-555555555555'
const START = '2026-11-30T14:00:00.000Z' // lunes 08:00 CR

const valid = (over: Record<string, unknown> = {}) => ({
  doctorId: DOCTOR,
  patientName: 'Paciente Ficticio',
  patientEmail: 'paciente.ficticio@example.com',
  patientPhone: '8888 0000',
  startAt: START,
  idempotencyKey: KEY,
  ...over,
})

function setup(world: { confirmed?: Array<{ starts_at: string; ends_at: string }>; existing?: Array<Record<string, unknown>> } = {}, rpcResult?: RpcResult) {
  const restCalls: string[] = []
  const rest: RestGet = async (path) => {
    restCalls.push(path)
    const [table, query = ''] = path.split('?')
    const q = new URLSearchParams(query)
    if (table === 'doctors') return `eq.${DOCTOR}` === q.get('id') ? [{ id: DOCTOR, full_name: 'Dra. Ana Morales' }] : []
    if (table === 'weekly_schedules') return [{ weekday: 1, start_time: '08:00:00', end_time: '09:00:00' }]
    if (table === 'appointments' && q.has('idempotency_key')) return world.existing ?? []
    if (table === 'appointments') return world.confirmed ?? []
    throw new Error(`Consulta inesperada: ${path}`)
  }
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpc: Rpc = async (name, args) => {
    rpcCalls.push({ name, args })
    return rpcResult ?? { ok: true, data: [{ appointment_id: APPT_ID, appointment_status: 'confirmed', replayed: false }] }
  }
  return { create: (body: unknown) => createPhoneAppointment({ rest, rpc, now: NOW }, ACTOR, body), rpcCalls, restCalls }
}

describe('createPhoneAppointment (RF-04)', () => {
  it('creación válida => 201 confirmada, con actor y datos normalizados (CA-04a)', async () => {
    const t = setup()
    expect(await t.create(valid())).toEqual({
      ok: true,
      status: 201,
      body: { appointmentId: APPT_ID, status: 'confirmed', doctorName: 'Dra. Ana Morales', startsAt: START, endsAt: '2026-11-30T14:30:00.000Z' },
    })
    expect(t.rpcCalls).toHaveLength(1)
    expect(t.rpcCalls[0].name).toBe('create_phone_appointment')
    expect(t.rpcCalls[0].args).toEqual({
      p_doctor_id: DOCTOR,
      p_patient_name: 'Paciente Ficticio',
      p_patient_email: 'paciente.ficticio@example.com',
      p_patient_phone: '8888 0000',
      p_starts_at: START,
      p_idempotency_key: KEY,
      p_actor_user_id: ACTOR,
    })
  })

  it('el origen y el autor los decide el servidor: campos extra del cliente se ignoran', async () => {
    const t = setup()
    await t.create(valid({ source: 'public_request', status: 'completed', created_by_user_id: 'otro', request_id: 'x' }))
    expect(Object.keys(t.rpcCalls[0].args).sort()).toEqual(
      ['p_actor_user_id', 'p_doctor_id', 'p_idempotency_key', 'p_patient_email', 'p_patient_name', 'p_patient_phone', 'p_starts_at'],
    )
    expect(t.rpcCalls[0].args.p_actor_user_id).toBe(ACTOR)
  })

  it.each([
    ['correo inválido', { patientEmail: 'no-es-correo' }],
    ['nombre vacío', { patientName: '  ' }],
    ['teléfono inválido', { patientPhone: 'abc' }],
    ['horario no alineado', { startAt: '2026-11-30T14:10:00Z' }],
    ['sin clave de idempotencia', { idempotencyKey: undefined }],
    ['odontólogo no UUID', { doctorId: 'x' }],
  ])('campos inválidos (%s) => 422 sin escribir nada (CA-04c)', async (_name, over) => {
    const t = setup()
    expect(await t.create(valid(over))).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
    expect(t.rpcCalls).toEqual([])
  })

  it('odontólogo inactivo, fecha pasada, fuera de franja y fuera de ventana => 422 (CA-04c, CA-04f)', async () => {
    for (const over of [
      { doctorId: INACTIVE },
      { startAt: '2026-11-22T14:00:00.000Z' }, // pasada
      { startAt: '2026-11-30T16:00:00.000Z' }, // 10:00 CR, franja 08–09
      { startAt: '2026-11-29T14:00:00.000Z' }, // domingo
      { startAt: '2026-12-28T14:00:00.000Z' }, // más de 30 días
    ]) {
      const t = setup()
      expect(await t.create(valid(over))).toMatchObject({ ok: false, status: 422 })
      expect(t.rpcCalls).toEqual([])
    }
  })

  it('horario ocupado por cita confirmada => 409 SLOT_UNAVAILABLE sin llamar a la función de alta', async () => {
    const t = setup({ confirmed: [{ starts_at: START, ends_at: '2026-11-30T14:30:00Z' }] })
    expect(await t.create(valid())).toMatchObject({ ok: false, status: 409, code: 'SLOT_UNAVAILABLE' })
    expect(t.rpcCalls).toEqual([])
  })

  it('carrera: la restricción de PostgreSQL gana y se traduce a 409 SLOT_UNAVAILABLE', async () => {
    const t = setup({}, { ok: false, code: 'P0001', message: 'SLOT_UNAVAILABLE', details: 'overlapping_confirmed_appointment' })
    expect(await t.create(valid())).toMatchObject({ ok: false, status: 409, code: 'SLOT_UNAVAILABLE' })
  })

  it('mismos datos y misma clave => misma cita (200) sin llamar a la función (CA-04d)', async () => {
    const existing = [{
      id: APPT_ID, status: 'confirmed', source: 'admin_phone', doctor_id: DOCTOR, patient_name: 'Paciente Ficticio',
      patient_email: 'paciente.ficticio@example.com', patient_phone: '8888 0000', starts_at: '2026-11-30T14:00:00+00:00',
      ends_at: '2026-11-30T14:30:00+00:00', doctors: { full_name: 'Dra. Ana Morales' },
    }]
    const t = setup({ existing, confirmed: [{ starts_at: START, ends_at: '2026-11-30T14:30:00Z' }] })
    expect(await t.create(valid())).toMatchObject({ ok: true, status: 200, body: { appointmentId: APPT_ID } })
    expect(t.rpcCalls).toEqual([])
  })

  it('misma clave con datos distintos => 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const existing = [{
      id: APPT_ID, status: 'confirmed', source: 'admin_phone', doctor_id: DOCTOR, patient_name: 'Otra Persona',
      patient_email: 'otra@example.com', patient_phone: null, starts_at: START, ends_at: '2026-11-30T14:30:00.000Z', doctors: null,
    }]
    expect(await setup({ existing }).create(valid())).toMatchObject({ ok: false, status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  it('una clave ya usada por una cita de otro origen no se reutiliza', async () => {
    const existing = [{
      id: APPT_ID, status: 'confirmed', source: 'public_request', doctor_id: DOCTOR, patient_name: 'Paciente Ficticio',
      patient_email: 'paciente.ficticio@example.com', patient_phone: '8888 0000', starts_at: START, ends_at: '2026-11-30T14:30:00.000Z', doctors: null,
    }]
    expect(await setup({ existing }).create(valid())).toMatchObject({ ok: false, status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  it('las solicitudes pendientes no bloquean la reserva telefónica (RB-11): ni se consultan', async () => {
    const t = setup()
    expect(await t.create(valid())).toMatchObject({ ok: true, status: 201 })
    expect(t.restCalls.some((c) => c.includes('appointment_requests'))).toBe(false)
  })
})

// --- Nivel HTTP: autenticación y permisos en el servidor ---------------------------------------------------------

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
function fakeResponse() {
  const res = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> }
  const api = {
    status(code: number) { res.statusCode = code; return api },
    json(payload: unknown) { res.body = payload; return api },
    setHeader(name: string, value: string) { res.headers[name] = value; return api },
  }
  return { res, api: api as unknown as VercelResponse }
}
const req = (method: string, opts: { auth?: string; body?: unknown } = {}) =>
  ({ method, query: {}, body: opts.body, headers: opts.auth ? { authorization: opts.auth } : {} }) as unknown as VercelRequest

function mockSupabase(role: string | null, rpcReply?: Response) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/auth/v1/user')) return json(200, { id: ACTOR })
    if (url.includes('/rest/v1/staff_profiles')) return json(200, role ? [{ role, display_name: 'Persona Demo' }] : [])
    if (url.includes('/rest/v1/rpc/')) return rpcReply ?? json(200, [{ appointment_id: APPT_ID, appointment_status: 'confirmed', replayed: false }])
    if (url.includes('/rest/v1/doctors')) return json(200, [{ id: DOCTOR, full_name: 'Dra. Ana Morales' }])
    if (url.includes('/rest/v1/weekly_schedules')) return json(200, [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: '08:00:00', end_time: '17:00:00' })))
    return json(200, [])
  }))
  return { calls, rpcCalls: () => calls.filter((c) => c.url.includes('/rpc/')) }
}

// Fecha futura válida dentro de la ventana, calculada respecto al reloj real porque el handler usa `new Date()`.
function nextWeekdayStart(): string {
  const d = new Date(Date.now() + 3 * 86_400_000)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(16, 0, 0, 0) // 10:00 hora de Costa Rica
  return d.toISOString()
}

describe('POST /api/admin/appointments (autorización en servidor)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example-ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-public')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sin sesión => 401 y no toca la base de datos', async () => {
    const net = mockSupabase('admin')
    const { res, api } = fakeResponse()
    await appointmentsHandler(req('POST', { body: valid() }), api)
    expect(res.statusCode).toBe(401)
    expect(net.calls).toEqual([])
  })

  it('usuario autenticado sin perfil de personal => 403 y sin RPC', async () => {
    const net = mockSupabase(null)
    const { res, api } = fakeResponse()
    await appointmentsHandler(req('POST', { auth: 'Bearer t', body: valid() }), api)
    expect(res.statusCode).toBe(403)
    expect(net.rpcCalls()).toEqual([])
  })

  it.each(['admin', 'receptionist'])('%s crea la cita: 201 y la función recibe al autor', async (role) => {
    const net = mockSupabase(role)
    const { res, api } = fakeResponse()
    await appointmentsHandler(req('POST', { auth: 'Bearer t', body: valid({ startAt: nextWeekdayStart() }) }), api)
    expect(res.statusCode).toBe(201)
    expect(res.body).toMatchObject({ appointmentId: APPT_ID, status: 'confirmed', doctorName: 'Dra. Ana Morales' })
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(net.rpcCalls()).toHaveLength(1)
    expect(net.rpcCalls()[0].url).toContain('/rpc/create_phone_appointment')
    expect(net.rpcCalls()[0].body).toMatchObject({ p_actor_user_id: ACTOR })
  })

  it('datos inválidos => 422 y ninguna escritura', async () => {
    const net = mockSupabase('receptionist')
    const { res, api } = fakeResponse()
    await appointmentsHandler(req('POST', { auth: 'Bearer t', body: valid({ patientEmail: 'x' }) }), api)
    expect(res.statusCode).toBe(422)
    expect(net.rpcCalls()).toEqual([])
  })

  it('función SQL no instalada (migración sin aplicar) => 503', async () => {
    mockSupabase('admin', json(404, { code: 'PGRST202', message: 'Could not find the function' }))
    const { res, api } = fakeResponse()
    await appointmentsHandler(req('POST', { auth: 'Bearer t', body: valid({ startAt: nextWeekdayStart() }) }), api)
    expect(res.statusCode).toBe(503)
    expect(JSON.stringify(res.body)).not.toMatch(/PGRST|function|service-secret/)
  })

  it('GET sigue listando (permiso appointments.read) y otros métodos => 405', async () => {
    mockSupabase('receptionist')
    const get = fakeResponse()
    await appointmentsHandler(req('GET', { auth: 'Bearer t' }), get.api)
    expect(get.res.statusCode).toBe(200)
    const del = fakeResponse()
    await appointmentsHandler(req('DELETE', { auth: 'Bearer t' }), del.api)
    expect(del.res.statusCode).toBe(405)
  })
})
