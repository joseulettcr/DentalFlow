import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorizeStaff } from '../../api/_lib/staff-auth'
import me from '../../api/admin/me'

const URL_BASE = 'https://example-ref.supabase.co'
const ANON = 'anon-public-key'
const SERVICE = 'service-role-secret-key'
const USER_ID = '11111111-2222-4333-8444-555555555555'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Simula Supabase Auth (/auth/v1/user) y PostgREST (/rest/v1/staff_profiles). */
function mockSupabase(options: { user?: Response | Error; profile?: Response | Error }) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: init?.headers as Record<string, string> })
    const next = url.includes('/auth/v1/user') ? options.user : options.profile
    if (next instanceof Error) throw next
    return next ?? jsonResponse(500, {})
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

const goodUser = () => jsonResponse(200, { id: USER_ID, email: 'ignorado@example.com' })
const profile = (role: unknown, display_name = 'Persona Demo') => jsonResponse(200, [{ role, display_name }])

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_BASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('authorizeStaff — autenticación (401)', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b'])('sin token válido en cabecera (%s) => 401 sin consultar Supabase', async (header) => {
    const { fetchMock } = mockSupabase({})
    const result = await authorizeStaff(header, 'staff')
    expect(result).toMatchObject({ ok: false, status: 401, code: 'UNAUTHENTICATED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('token rechazado por Supabase Auth => 401', async () => {
    mockSupabase({ user: jsonResponse(401, { msg: 'invalid JWT' }) })
    expect(await authorizeStaff('Bearer token-malo', 'staff')).toMatchObject({ ok: false, status: 401, code: 'UNAUTHENTICATED' })
  })
})

describe('authorizeStaff — autorización (403)', () => {
  it('usuario autenticado sin fila en staff_profiles => 403', async () => {
    mockSupabase({ user: goodUser(), profile: jsonResponse(200, []) })
    expect(await authorizeStaff('Bearer t', 'staff')).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' })
  })

  it('rol desconocido en la base de datos => 403', async () => {
    mockSupabase({ user: goodUser(), profile: profile('patient') })
    expect(await authorizeStaff('Bearer t', 'staff')).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' })
  })

  it.each(['doctors.write', 'google.manage'] as const)('receptionist => 403 en %s', async (permission) => {
    mockSupabase({ user: goodUser(), profile: profile('receptionist') })
    expect(await authorizeStaff('Bearer t', permission)).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' })
  })

  it.each(['appointments.create_phone', 'requests.decide', 'system.status'] as const)('receptionist => permitido en %s', async (permission) => {
    mockSupabase({ user: goodUser(), profile: profile('receptionist') })
    expect(await authorizeStaff('Bearer t', permission)).toMatchObject({ ok: true, staff: { role: 'receptionist' } })
  })

  it.each(['doctors.write', 'google.manage', 'requests.decide'] as const)('admin => permitido en %s', async (permission) => {
    mockSupabase({ user: goodUser(), profile: profile('admin') })
    expect(await authorizeStaff('Bearer t', permission)).toMatchObject({ ok: true, staff: { role: 'admin', userId: USER_ID } })
  })
})

describe('authorizeStaff — disponibilidad (503) y manejo de secretos', () => {
  it('faltan variables de entorno => 503 sin consultar Supabase', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { fetchMock } = mockSupabase({})
    expect(await authorizeStaff('Bearer t', 'staff')).toMatchObject({ ok: false, status: 503, code: 'SERVICE_UNAVAILABLE' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['Auth responde 500', { user: jsonResponse(500, {}) }],
    ['Auth no responde', { user: new Error('ECONNRESET') }],
    ['PostgREST responde 500', { user: goodUser(), profile: jsonResponse(500, {}) }],
    ['PostgREST no responde', { user: goodUser(), profile: new Error('timeout') }],
  ])('%s => 503, nunca 401/403 ni éxito', async (_name, options) => {
    mockSupabase(options)
    expect(await authorizeStaff('Bearer t', 'staff')).toMatchObject({ ok: false, status: 503, code: 'SERVICE_UNAVAILABLE' })
  })

  it('la clave service_role solo se usa para leer el perfil; el token de usuario nunca va al perfil', async () => {
    const { calls } = mockSupabase({ user: goodUser(), profile: profile('admin') })
    await authorizeStaff('Bearer token-usuario', 'staff')
    const [authCall, profileCall] = calls
    expect(authCall.url).toBe(`${URL_BASE}/auth/v1/user`)
    expect(authCall.headers).toEqual({ apikey: ANON, Authorization: 'Bearer token-usuario' })
    expect(JSON.stringify(authCall.headers)).not.toContain(SERVICE)
    expect(profileCall.url).toContain(`user_id=eq.${USER_ID}`)
    expect(profileCall.headers.Authorization).toBe(`Bearer ${SERVICE}`)
  })
})

function fakeResponse() {
  const res = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> }
  const api = {
    status(code: number) { res.statusCode = code; return api },
    json(payload: unknown) { res.body = payload; return api },
    setHeader(name: string, value: string) { res.headers[name] = value; return api },
  }
  return { res, api: api as unknown as VercelResponse }
}

const request = (headers: Record<string, string>, method = 'GET') => ({ headers, method }) as unknown as VercelRequest

describe('GET /api/admin/me', () => {
  it('sin token => 401 con el formato de error estándar', async () => {
    mockSupabase({})
    const { res, api } = fakeResponse()
    await me(request({}), api)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: expect.any(String) } })
  })

  it('autenticado sin perfil de personal => 403', async () => {
    mockSupabase({ user: goodUser(), profile: jsonResponse(200, []) })
    const { res, api } = fakeResponse()
    await me(request({ authorization: 'Bearer t' }), api)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } })
  })

  it('personal => 200 con rol y permisos, sin id, correo ni secretos; no cacheable', async () => {
    mockSupabase({ user: goodUser(), profile: profile('receptionist', 'Recepción Demo') })
    const { res, api } = fakeResponse()
    await me(request({ authorization: 'Bearer t' }), api)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Cache-Control']).toBe('no-store')
    const body = res.body as { role: string; displayName: string; permissions: string[] }
    expect(body.role).toBe('receptionist')
    expect(body.displayName).toBe('Recepción Demo')
    expect(body.permissions).not.toContain('doctors.write')
    expect(JSON.stringify(body)).not.toMatch(new RegExp(`${SERVICE}|${USER_ID}|ignorado@example.com`))
  })

  it('método distinto de GET => 405', async () => {
    mockSupabase({ user: goodUser(), profile: profile('admin') })
    const { res, api } = fakeResponse()
    await me(request({ authorization: 'Bearer t' }, 'POST'), api)
    expect(res.statusCode).toBe(405)
  })
})
