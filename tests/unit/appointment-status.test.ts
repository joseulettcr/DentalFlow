import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import byIdHandler from '../../api/admin/appointments/[id]'
import listHandler from '../../api/admin/appointments'
import { changeAppointmentStatus } from '../../api/_lib/appointment-status-service'
import { listCompletableAppointments } from '../../api/_lib/requests-service'
import type { Rpc } from '../../api/_lib/supabase-rest'

const APPT = '0f9c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f'
const ACTOR = '11111111-2222-4333-8444-555555555555'

const rpcOk = (row: { appointment_status: string; already_in_state: boolean }): Rpc => vi.fn(async () => ({ ok: true as const, data: [row] }))
const rpcError = (message: string): Rpc => vi.fn(async () => ({ ok: false as const, code: 'P0001', message, details: null }))

describe('changeAppointmentStatus (CA-05b, CA-05c)', () => {
  it('cancelación exitosa: llama a la función SQL con cita, acción y actor', async () => {
    const rpc = rpcOk({ appointment_status: 'cancelled', already_in_state: false })
    expect(await changeAppointmentStatus(rpc, APPT, ACTOR, { action: 'cancel' })).toEqual({
      ok: true, status: 200, body: { appointmentId: APPT, status: 'cancelled', alreadyInState: false },
    })
    expect(rpc).toHaveBeenCalledWith('change_appointment_status', { p_appointment_id: APPT, p_action: 'cancel', p_actor_user_id: ACTOR })
  })

  it('finalización exitosa', async () => {
    const rpc = rpcOk({ appointment_status: 'completed', already_in_state: false })
    expect(await changeAppointmentStatus(rpc, APPT, ACTOR, { action: 'complete' })).toMatchObject({ ok: true, body: { status: 'completed', alreadyInState: false } })
  })

  it('operación repetida: 200 marcada como ya aplicada (sin cambios)', async () => {
    const rpc = rpcOk({ appointment_status: 'cancelled', already_in_state: true })
    expect(await changeAppointmentStatus(rpc, APPT, ACTOR, { action: 'cancel' })).toMatchObject({ ok: true, body: { alreadyInState: true } })
  })

  it.each([
    ['completar una cancelada', 'INVALID_TRANSITION', 409],
    ['cancelar una completada', 'INVALID_TRANSITION', 409],
    ['completar una cita que aún no terminó', 'INVALID_TRANSITION', 409],
    ['cita inexistente', 'NOT_FOUND', 404],
  ])('transición inválida o inexistente (%s) => HTTP %i con código estable', async (_name, message, status) => {
    expect(await changeAppointmentStatus(rpcError(message), APPT, ACTOR, { action: 'complete' })).toMatchObject({ ok: false, status, code: message })
  })

  it.each([
    ['acción desconocida', { action: 'borrar' }],
    ['sin acción', {}],
    ['cuerpo ausente', undefined],
    ['acción no texto', { action: 5 }],
  ])('entrada inválida (%s) => 422 sin llamar a la base de datos', async (_name, body) => {
    const rpc = rpcOk({ appointment_status: 'cancelled', already_in_state: false })
    expect(await changeAppointmentStatus(rpc, APPT, ACTOR, body)).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('identificador inválido => 422', async () => {
    const rpc = rpcOk({ appointment_status: 'cancelled', already_in_state: false })
    expect(await changeAppointmentStatus(rpc, 'no-uuid', ACTOR, { action: 'cancel' })).toMatchObject({ ok: false, status: 422 })
    expect(rpc).not.toHaveBeenCalled()
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
const req = (method: string, opts: { auth?: string; body?: unknown; query?: Record<string, string> } = {}) =>
  ({ method, query: { id: APPT, ...(opts.query ?? {}) }, body: opts.body, headers: opts.auth ? { authorization: opts.auth } : {} }) as unknown as VercelRequest

function mockSupabase(role: string | null, rpcReply?: Response, restReply?: (path: string) => Response) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/auth/v1/user')) return json(200, { id: ACTOR })
    if (url.includes('/rest/v1/staff_profiles')) return json(200, role ? [{ role, display_name: 'Persona Demo' }] : [])
    if (url.includes('/rest/v1/rpc/')) return rpcReply ?? json(200, [{ appointment_status: 'cancelled', already_in_state: false }])
    return restReply ? restReply(url.split('/rest/v1/')[1]) : json(200, [])
  }))
  return { calls, rpcCalls: () => calls.filter((c) => c.url.includes('/rpc/')) }
}

describe('PATCH /api/admin/appointments/:id (autorización en servidor)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example-ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-public')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sin sesión (anónimo) => 401 y no toca la base de datos', async () => {
    const net = mockSupabase('admin')
    const { res, api } = fakeResponse()
    await byIdHandler(req('PATCH', { body: { action: 'cancel' } }), api)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
    expect(net.calls).toEqual([])
  })

  it('usuario autenticado sin perfil de personal => 403 y sin RPC', async () => {
    const net = mockSupabase(null)
    const { res, api } = fakeResponse()
    await byIdHandler(req('PATCH', { auth: 'Bearer t', body: { action: 'cancel' } }), api)
    expect(res.statusCode).toBe(403)
    expect(net.rpcCalls()).toEqual([])
  })

  it.each(['admin', 'receptionist'])('%s puede cancelar: 200 y la función recibe el autor', async (role) => {
    const net = mockSupabase(role)
    const { res, api } = fakeResponse()
    await byIdHandler(req('PATCH', { auth: 'Bearer t', body: { action: 'cancel' } }), api)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ appointmentId: APPT, status: 'cancelled', alreadyInState: false })
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(net.rpcCalls()[0].url).toContain('/rpc/change_appointment_status')
    expect(net.rpcCalls()[0].body).toEqual({ p_appointment_id: APPT, p_action: 'cancel', p_actor_user_id: ACTOR })
  })

  it('completar: 200; transición inválida => 409 INVALID_TRANSITION', async () => {
    mockSupabase('receptionist', json(200, [{ appointment_status: 'completed', already_in_state: false }]))
    const ok = fakeResponse()
    await byIdHandler(req('PATCH', { auth: 'Bearer t', body: { action: 'complete' } }), ok.api)
    expect(ok.res.body).toMatchObject({ status: 'completed' })

    mockSupabase('receptionist', json(400, { code: 'P0001', message: 'INVALID_TRANSITION', details: 'status=cancelled' }))
    const bad = fakeResponse()
    await byIdHandler(req('PATCH', { auth: 'Bearer t', body: { action: 'complete' } }), bad.api)
    expect(bad.res.statusCode).toBe(409)
    expect(bad.res.body).toMatchObject({ error: { code: 'INVALID_TRANSITION' } })
  })

  it('cita inexistente => 404 y acción inválida => 422 sin RPC', async () => {
    mockSupabase('admin', json(400, { code: 'P0001', message: 'NOT_FOUND', details: 'appointment_not_found' }))
    const nf = fakeResponse()
    await byIdHandler(req('PATCH', { auth: 'Bearer t', body: { action: 'cancel' } }), nf.api)
    expect(nf.res.statusCode).toBe(404)

    const net = mockSupabase('admin')
    const bad = fakeResponse()
    await byIdHandler(req('PATCH', { auth: 'Bearer t', body: { action: 'reabrir' } }), bad.api)
    expect(bad.res.statusCode).toBe(422)
    expect(net.rpcCalls()).toEqual([])
  })

  it('función SQL no instalada (migración sin aplicar) => 503', async () => {
    mockSupabase('admin', json(404, { code: 'PGRST202', message: 'Could not find the function' }))
    const { res, api } = fakeResponse()
    await byIdHandler(req('PATCH', { auth: 'Bearer t', body: { action: 'cancel' } }), api)
    expect(res.statusCode).toBe(503)
    expect(JSON.stringify(res.body)).not.toMatch(/PGRST|function|service-secret/)
  })

  it('solo PATCH (405 para el resto)', async () => {
    mockSupabase('admin')
    for (const method of ['GET', 'POST', 'DELETE', 'PUT']) {
      const { res, api } = fakeResponse()
      await byIdHandler(req(method, { auth: 'Bearer t' }), api)
      expect(res.statusCode).toBe(405)
    }
  })
})

describe('GET /api/admin/appointments?scope=… (listados)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example-ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-public')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sin scope devuelve las próximas (comportamiento original); completable usa fin ya pasado', async () => {
    const paths: string[] = []
    mockSupabase('receptionist', undefined, (path) => { paths.push(path); return json(200, []) })
    const a = fakeResponse()
    await listHandler(req('GET', { auth: 'Bearer t', query: {} }), a.api)
    const b = fakeResponse()
    await listHandler(req('GET', { auth: 'Bearer t', query: { scope: 'completable' } }), b.api)
    expect(a.res.statusCode).toBe(200)
    expect(b.res.statusCode).toBe(200)
    const appointmentQueries = paths.filter((p) => p.startsWith('appointments'))
    expect(appointmentQueries[0]).toContain('starts_at=gte.')
    expect(appointmentQueries[1]).toContain('ends_at=lte.')
    expect(appointmentQueries[1]).toContain('status=eq.confirmed')
  })

  it('scope desconocido => 422', async () => {
    mockSupabase('admin')
    const { res, api } = fakeResponse()
    await listHandler(req('GET', { auth: 'Bearer t', query: { scope: 'todo' } }), api)
    expect(res.statusCode).toBe(422)
  })

  it('listCompletableAppointments solo lee y no expone más que las columnas del listado', async () => {
    const rest = vi.fn<(path: string) => Promise<unknown>>(async () => [])
    await listCompletableAppointments(rest, new Date('2026-11-24T12:00:00Z'))
    expect(rest.mock.calls[0][0]).not.toMatch(/patient_phone|idempotency/)
  })
})
