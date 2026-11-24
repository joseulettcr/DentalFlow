import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import doctors from '../../api/public/doctors'
import slots from '../../api/public/slots'
import { fetchDoctors, fetchSlots } from '../../src/lib/availabilityApi'
import { addDays, todayInClinic } from '../../shared/clinic-time'

function fakeResponse() {
  const res = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> }
  const api = {
    status(code: number) { res.statusCode = code; return api },
    json(payload: unknown) { res.body = payload; return api },
    setHeader(name: string, value: string) { res.headers[name] = value; return api },
  }
  return { res, api: api as unknown as VercelResponse }
}
const req = (method: string, query: Record<string, string> = {}) => ({ method, query, headers: {} }) as unknown as VercelRequest
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example-ref.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('endpoints públicos', () => {
  it('solo aceptan GET (405)', async () => {
    for (const handler of [doctors, slots]) {
      const { res, api } = fakeResponse()
      await handler(req('POST'), api)
      expect(res.statusCode).toBe(405)
    }
  })

  it('sin configuración del servidor => 503 sin filtrar detalles', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { res, api } = fakeResponse()
    await doctors(req('GET'), api)
    expect(res.statusCode).toBe(503)
    expect(JSON.stringify(res.body)).not.toMatch(/service-secret|supabase\.co/)
  })

  it('Supabase caído => 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, {})))
    const { res, api } = fakeResponse()
    const tomorrow = addDays(todayInClinic(new Date()), 1)
    await slots(req('GET', { doctorId: 'a1000000-0000-4000-8000-000000000001', date: tomorrow }), api)
    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } })
  })

  it('fecha inválida => 422 con el formato de error estándar', async () => {
    const { res, api } = fakeResponse()
    await slots(req('GET', { doctorId: 'a1000000-0000-4000-8000-000000000001', date: 'mañana' }), api)
    expect(res.statusCode).toBe(422)
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: expect.any(String) } })
  })

  it('doctores: 200 y solo peticiones GET con la clave de servicio en el servidor', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('/doctors?') ? json(200, [{ id: 'a1000000-0000-4000-8000-000000000001', full_name: 'Dra. Ana Morales', specialty: null }]) : json(200, []),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { res, api } = fakeResponse()
    await doctors(req('GET'), api)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(JSON.stringify(res.body)).not.toContain('service-secret')
    for (const call of fetchMock.mock.calls) expect(call[1]?.method).toBe('GET')
  })
})

describe('cliente de la interfaz', () => {
  it('mapea 200, 422 y fallos', async () => {
    expect(await fetchDoctors(vi.fn(async () => json(200, { doctors: [] })) as unknown as typeof fetch)).toEqual({ kind: 'ok', data: [] })
    expect(await fetchSlots('d', '2026-11-30', vi.fn(async () => json(422, { error: { message: 'Fecha pasada' } })) as unknown as typeof fetch)).toEqual({ kind: 'validation', message: 'Fecha pasada' })
    expect(await fetchSlots('d', '2026-11-30', vi.fn(async () => json(503, {})) as unknown as typeof fetch)).toEqual({ kind: 'unavailable' })
    expect(await fetchDoctors(vi.fn(async () => { throw new Error('red') }) as unknown as typeof fetch)).toEqual({ kind: 'unavailable' })
  })
})
