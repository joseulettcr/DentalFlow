import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import listRequestsHandler from '../../api/admin/appointment-requests/index'
import approveHandler from '../../api/admin/appointment-requests/[id]/approve'
import rejectHandler from '../../api/admin/appointment-requests/[id]/reject'
import appointmentsHandler from '../../api/admin/appointments'
import publicRequestHandler from '../../api/public/appointment-requests'
import { addDays, todayInClinic } from '../../shared/clinic-time'

const USER_ID = '11111111-2222-4333-8444-555555555555'
const REQUEST_ID = '0f9c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f'
const DOCTOR = 'a1000000-0000-4000-8000-000000000001'

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
const req = (method: string, opts: { auth?: string; query?: Record<string, string>; body?: unknown; ip?: string } = {}) =>
  ({
    method,
    query: opts.query ?? {},
    body: opts.body,
    headers: { ...(opts.auth ? { authorization: opts.auth } : {}), ...(opts.ip ? { 'x-forwarded-for': opts.ip } : {}) },
  }) as unknown as VercelRequest

interface Net { role?: string | null; rpc?: (name: string, body: unknown) => Response; rest?: (path: string) => Response }

/** Simula Supabase: Auth, staff_profiles, RPC y PostgREST. Registra cada llamada. */
function mockSupabase(net: Net = {}) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method: init?.method ?? 'GET', body })
    if (url.includes('/auth/v1/user')) return json(200, { id: USER_ID })
    if (url.includes('/rest/v1/staff_profiles')) {
      return json(200, net.role === null || net.role === undefined ? [] : [{ role: net.role, display_name: 'Persona Demo' }])
    }
    if (url.includes('/rest/v1/rpc/')) return (net.rpc ?? (() => json(200, [])))(url.split('/rpc/')[1], body)
    return (net.rest ?? (() => json(200, [])))(url.split('/rest/v1/')[1])
  }))
  const rpcCalls = () => calls.filter((c) => c.url.includes('/rest/v1/rpc/') && !c.url.includes('register_booking_attempt'))
  return { calls, rpcCalls }
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example-ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-public')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const adminHandlers = [
  ['listar solicitudes', listRequestsHandler, 'GET'],
  ['aprobar', approveHandler, 'POST'],
  ['rechazar', rejectHandler, 'POST'],
  ['listar citas', appointmentsHandler, 'GET'],
] as const

describe('acceso no autorizado a APIs administrativas', () => {
  it.each(adminHandlers)('%s sin sesión => 401 y no toca la base de datos', async (_name, handler, method) => {
    const net = mockSupabase({ role: 'admin' })
    const { res, api } = fakeResponse()
    await handler(req(method, { query: { id: REQUEST_ID } }), api)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
    expect(net.calls).toEqual([])
  })

  it.each(adminHandlers)('%s con usuario autenticado SIN perfil de personal => 403 y sin RPC', async (_name, handler, method) => {
    const net = mockSupabase({ role: null })
    const { res, api } = fakeResponse()
    await handler(req(method, { auth: 'Bearer t', query: { id: REQUEST_ID } }), api)
    expect(res.statusCode).toBe(403)
    expect(net.rpcCalls()).toEqual([])
    expect(net.calls.filter((c) => c.url.includes('appointment')).length).toBe(0)
  })
})

describe('flujo de decisión con personal autorizado', () => {
  it.each(['admin', 'receptionist'])('%s puede aprobar: la función SQL recibe solicitud y actor', async (role) => {
    const net = mockSupabase({
      role,
      rpc: () => json(200, [{ appointment_id: 'ap-1', request_status: 'approved', already_approved: false }]),
    })
    const { res, api } = fakeResponse()
    await approveHandler(req('POST', { auth: 'Bearer t', query: { id: REQUEST_ID } }), api)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ appointmentId: 'ap-1', requestStatus: 'approved', alreadyApproved: false })
    expect(net.rpcCalls()).toHaveLength(1)
    expect(net.rpcCalls()[0].url).toContain('/rpc/approve_appointment_request')
    expect(net.rpcCalls()[0].body).toEqual({ p_request_id: REQUEST_ID, p_actor_user_id: USER_ID })
  })

  it('aprobar con el horario ocupado => 409 SLOT_UNAVAILABLE (la solicitud sigue pendiente en SQL)', async () => {
    mockSupabase({ role: 'receptionist', rpc: () => json(400, { code: 'P0001', message: 'SLOT_UNAVAILABLE', details: 'overlapping_confirmed_appointment' }) })
    const { res, api } = fakeResponse()
    await approveHandler(req('POST', { auth: 'Bearer t', query: { id: REQUEST_ID } }), api)
    expect(res.statusCode).toBe(409)
    expect(res.body).toMatchObject({ error: { code: 'SLOT_UNAVAILABLE' } })
  })

  it('aprobar dos veces devuelve la misma cita (sin duplicar)', async () => {
    mockSupabase({ role: 'admin', rpc: () => json(200, [{ appointment_id: 'ap-1', request_status: 'approved', already_approved: true }]) })
    const { res, api } = fakeResponse()
    await approveHandler(req('POST', { auth: 'Bearer t', query: { id: REQUEST_ID } }), api)
    expect(res.body).toMatchObject({ appointmentId: 'ap-1', alreadyApproved: true })
  })

  it('rechazo con motivo', async () => {
    const net = mockSupabase({ role: 'receptionist', rpc: () => json(200, [{ request_status: 'rejected', already_rejected: false }]) })
    const { res, api } = fakeResponse()
    await rejectHandler(req('POST', { auth: 'Bearer t', query: { id: REQUEST_ID }, body: { reason: 'Sin cupo' } }), api)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ requestStatus: 'rejected', alreadyRejected: false })
    expect(net.rpcCalls()[0].body).toEqual({ p_request_id: REQUEST_ID, p_actor_user_id: USER_ID, p_reason: 'Sin cupo' })
  })

  it('función SQL no instalada (migración sin aplicar) => 503, no un error del usuario', async () => {
    mockSupabase({ role: 'admin', rpc: () => json(404, { code: 'PGRST202', message: 'Could not find the function' }) })
    const { res, api } = fakeResponse()
    await approveHandler(req('POST', { auth: 'Bearer t', query: { id: REQUEST_ID } }), api)
    expect(res.statusCode).toBe(503)
    expect(JSON.stringify(res.body)).not.toMatch(/PGRST|function|service-secret/)
  })

  it('métodos incorrectos => 405', async () => {
    mockSupabase({ role: 'admin' })
    const { res, api } = fakeResponse()
    await approveHandler(req('GET', { auth: 'Bearer t', query: { id: REQUEST_ID } }), api)
    expect(res.statusCode).toBe(405)
  })

  it('el listado devuelve solicitudes con datos del paciente solo al personal', async () => {
    mockSupabase({
      role: 'receptionist',
      rest: () => json(200, [{
        id: REQUEST_ID, status: 'pending', doctor_id: DOCTOR, patient_name: 'Paciente Ficticio', patient_email: 'p@example.com', patient_phone: null,
        requested_starts_at: '2026-11-30T14:00:00+00:00', requested_ends_at: '2026-11-30T14:30:00+00:00', created_at: '2026-11-23T12:00:00+00:00',
        appointment_id: null, rejection_reason: null, doctors: { full_name: 'Dra. Ana Morales' },
      }]),
    })
    const { res, api } = fakeResponse()
    await listRequestsHandler(req('GET', { auth: 'Bearer t' }), api)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ requests: [{ id: REQUEST_ID, doctorName: 'Dra. Ana Morales', patientName: 'Paciente Ficticio', startsAt: '2026-11-30T14:00:00.000Z' }] })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })
})

describe('endpoint público de solicitudes', () => {
  const tomorrow = () => addDays(todayInClinic(new Date()), 1)

  it('solo POST (405) y no exige sesión', async () => {
    mockSupabase()
    const { res, api } = fakeResponse()
    await publicRequestHandler(req('GET'), api)
    expect(res.statusCode).toBe(405)
  })

  it('no guarda la IP en claro: envía solo un hash HMAC de 64 hex', async () => {
    const net = mockSupabase({ rpc: (name) => json(200, name === 'register_booking_attempt' ? false : []) })
    const { res, api } = fakeResponse()
    await publicRequestHandler(req('POST', { ip: '203.0.113.77', body: { doctorId: DOCTOR } }), api)
    expect(res.statusCode).toBe(429) // intento 11
    const attempt = net.calls.find((c) => c.url.includes('register_booking_attempt'))
    const hash = (attempt?.body as { p_key_hash: string }).p_key_hash
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(net.calls)).not.toContain('203.0.113.77')
  })

  it('datos inválidos => 422 y ninguna escritura', async () => {
    const net = mockSupabase({ rpc: (name) => json(200, name === 'register_booking_attempt' ? true : []) })
    const { res, api } = fakeResponse()
    await publicRequestHandler(req('POST', { body: { doctorId: DOCTOR, patientName: '', patientEmail: 'x', startAt: 'no', idempotencyKey: 'no' } }), api)
    expect(res.statusCode).toBe(422)
    expect(net.calls.some((c) => c.url.includes('create_appointment_request'))).toBe(false)
  })

  it('Supabase caído => 503 y mensaje genérico', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, {})))
    const { res, api } = fakeResponse()
    await publicRequestHandler(req('POST', { body: { doctorId: DOCTOR, startAt: `${tomorrow()}T14:00:00Z` } }), api)
    expect(res.statusCode).toBe(503)
    expect(JSON.stringify(res.body)).not.toMatch(/service-secret|supabase\.co/)
  })
})
