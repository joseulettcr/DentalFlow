import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import indexHandler from '../../api/admin/doctors/index'
import pathHandler from '../../api/admin/doctors/[id]'
import { createDoctor, listAdminDoctors, setDoctorSchedule, updateDoctor } from '../../api/_lib/doctors-admin-service'
import type { RestGet, Rpc, RpcResult } from '../../api/_lib/supabase-rest'
import { DEFAULT_WEEKLY_SCHEDULE, validateDoctorFields, validateWindows } from '../../shared/schedule'

const ACTOR = '11111111-2222-4333-8444-555555555555'
const DOC = 'a1000000-0000-4000-8000-000000000001'
const DOC2 = 'a1000000-0000-4000-8000-000000000002'

describe('horario predeterminado del proyecto', () => {
  it('lunes a viernes 08:00–17:00 y sábado 09:00–13:00; domingo cerrado', () => {
    expect(DEFAULT_WEEKLY_SCHEDULE).toEqual([
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '08:00', endTime: '17:00' })),
      { weekday: 6, startTime: '09:00', endTime: '13:00' },
    ])
    expect(DEFAULT_WEEKLY_SCHEDULE.some((w) => w.weekday === 0)).toBe(false)
  })

  it('el horario predeterminado es válido según las reglas', () => {
    expect(validateWindows(DEFAULT_WEEKLY_SCHEDULE)).toMatchObject({ ok: true })
  })
})

describe('validateWindows (CA-02b)', () => {
  const w = (weekday: number, startTime: string, endTime: string) => ({ weekday, startTime, endTime })

  it('acepta varias franjas por día y las ordena', () => {
    const r = validateWindows([w(1, '13:00', '17:00'), w(1, '08:00', '12:00'), w(0, '09:00', '10:00')])
    expect(r).toEqual({ ok: true, value: [w(0, '09:00', '10:00'), w(1, '08:00', '12:00'), w(1, '13:00', '17:00')] })
  })

  it('permite franjas contiguas y una lista vacía', () => {
    expect(validateWindows([w(1, '08:00', '12:00'), w(1, '12:00', '17:00')])).toMatchObject({ ok: true })
    expect(validateWindows([])).toEqual({ ok: true, value: [] })
  })

  it.each([
    ['fin igual al inicio', [w(1, '09:00', '09:00')], /posterior/],
    ['fin anterior al inicio', [w(1, '10:00', '09:00')], /posterior/],
    ['superposición', [w(2, '08:00', '12:00'), w(2, '11:30', '15:00')], /se superponen/],
    ['hora que no es en punto ni y media', [w(1, '08:15', '09:00')], /en punto o y media/],
    ['formato de hora inválido', [w(1, '8am', '09:00')], /HH:MM/],
    ['día fuera de rango', [w(7, '08:00', '09:00')], /día de la semana/],
    ['día no entero', [w(1.5, '08:00', '09:00')], /día de la semana/],
  ])('rechaza %s con mensaje claro', (_name, input, message) => {
    const r = validateWindows(input)
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.message).toMatch(message)
  })

  it('rechaza lo que no es una lista y más de 6 franjas por día', () => {
    expect(validateWindows('x')).toMatchObject({ ok: false })
    expect(validateWindows([null])).toMatchObject({ ok: false })
    const many = Array.from({ length: 7 }, (_, i) => w(1, `${String(8 + i).padStart(2, '0')}:00`, `${String(8 + i).padStart(2, '0')}:30`))
    expect(validateWindows(many)).toMatchObject({ ok: false })
  })
})

describe('validateDoctorFields', () => {
  it('normaliza espacios y exige 2 a 100 caracteres', () => {
    expect(validateDoctorFields({ fullName: '  Dra.   Laura  Vargas ', specialty: ' Periodoncia ' })).toEqual({ ok: true, value: { fullName: 'Dra. Laura Vargas', specialty: 'Periodoncia' } })
    expect(validateDoctorFields({ fullName: 'A', specialty: 'Periodoncia' })).toMatchObject({ ok: false, field: 'fullName' })
    expect(validateDoctorFields({ fullName: 'Dra. Laura', specialty: '' })).toMatchObject({ ok: false, field: 'specialty' })
    expect(validateDoctorFields({ fullName: 'x'.repeat(101), specialty: 'Periodoncia' })).toMatchObject({ ok: false })
    expect(validateDoctorFields(null)).toMatchObject({ ok: false })
  })
})

// --- Servicio -----------------------------------------------------------------------------------------------------

function setup(rpcResult?: RpcResult) {
  const rest: RestGet = async (path) => {
    if (path.startsWith('doctors?')) {
      return [
        { id: DOC2, full_name: 'Dr. Carlos Rojas', specialty: 'Ortodoncia', is_active: true },
        { id: DOC, full_name: 'Dra. Ana Morales', specialty: 'Odontología general', is_active: false },
      ]
    }
    return [{ doctor_id: DOC, weekday: 1, start_time: '08:00:00', end_time: '17:00:00' }]
  }
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpc: Rpc = async (name, args) => {
    calls.push({ name, args })
    return rpcResult ?? { ok: true, data: [{ doctor_id: 'new-id', window_count: 6 }] }
  }
  return { rest, rpc, calls }
}

describe('servicio de administración de odontólogos', () => {
  it('lista activos e inactivos con su horario (HH:MM)', async () => {
    const t = setup()
    const r = await listAdminDoctors(t.rest)
    expect(r).toMatchObject({ ok: true, status: 200 })
    if (r.ok) {
      expect(r.body.doctors.map((d) => [d.fullName, d.isActive])).toEqual([['Dr. Carlos Rojas', true], ['Dra. Ana Morales', false]])
      expect(r.body.doctors[1].windows).toEqual([{ weekday: 1, startTime: '08:00', endTime: '17:00' }])
    }
  })

  it('alta: activo y con el horario predeterminado (CA-02a)', async () => {
    const t = setup()
    const r = await createDoctor(t.rest, t.rpc, { fullName: 'Dra. Laura Vargas', specialty: 'Periodoncia' })
    expect(r).toMatchObject({ ok: true, status: 201, body: { doctor: { id: 'new-id', fullName: 'Dra. Laura Vargas', isActive: true } } })
    expect(t.calls[0].name).toBe('create_doctor')
    expect(t.calls[0].args).toEqual({ p_full_name: 'Dra. Laura Vargas', p_specialty: 'Periodoncia', p_windows: [...DEFAULT_WEEKLY_SCHEDULE] })
  })

  it('alta con franjas propias válidas; inválidas => 422 sin llamar a la base de datos', async () => {
    const ok = setup()
    await createDoctor(ok.rest, ok.rpc, { fullName: 'Dr. Nuevo', specialty: 'Endodoncia', windows: [{ weekday: 1, startTime: '10:00', endTime: '12:00' }] })
    expect(ok.calls[0].args.p_windows).toEqual([{ weekday: 1, startTime: '10:00', endTime: '12:00' }])
    const bad = setup()
    expect(await createDoctor(bad.rest, bad.rpc, { fullName: 'Dr. Nuevo', specialty: 'Endodoncia', windows: [{ weekday: 1, startTime: '12:00', endTime: '10:00' }] })).toMatchObject({ ok: false, status: 422 })
    expect(bad.calls).toEqual([])
  })

  it.each([
    ['nombre vacío', { fullName: ' ', specialty: 'Periodoncia' }],
    ['especialidad vacía', { fullName: 'Dr. Nuevo', specialty: '' }],
    ['nombre duplicado (sin distinguir mayúsculas)', { fullName: 'DR. carlos rojas', specialty: 'Ortodoncia' }],
  ])('alta inválida (%s) => 422 y no escribe', async (_name, body) => {
    const t = setup()
    expect(await createDoctor(t.rest, t.rpc, body)).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
    expect(t.calls).toEqual([])
  })

  it('edición y activación: datos normalizados y estado a la función SQL (CA-02c)', async () => {
    const t = setup({ ok: true, data: [{ is_active: false }] })
    const r = await updateDoctor(t.rest, t.rpc, DOC, { fullName: ' Dra. Ana Morales ', specialty: 'Odontología general', isActive: false })
    expect(r).toMatchObject({ ok: true, status: 200, body: { doctor: { id: DOC, isActive: false } } })
    expect(t.calls[0]).toEqual({ name: 'update_doctor', args: { p_doctor_id: DOC, p_full_name: 'Dra. Ana Morales', p_specialty: 'Odontología general', p_is_active: false } })
  })

  it('edición: nombre de otro odontólogo => 422; propio nombre permitido; isActive obligatorio; id inválido', async () => {
    const t = setup({ ok: true, data: [{ is_active: true }] })
    expect(await updateDoctor(t.rest, t.rpc, DOC, { fullName: 'Dr. Carlos Rojas', specialty: 'X1', isActive: true })).toMatchObject({ ok: false, status: 422 })
    expect(await updateDoctor(t.rest, t.rpc, DOC, { fullName: 'Dra. Ana Morales', specialty: 'Odontología', isActive: true })).toMatchObject({ ok: true })
    expect(await updateDoctor(t.rest, t.rpc, DOC, { fullName: 'Dra. Ana Morales', specialty: 'Odontología' })).toMatchObject({ ok: false, status: 422 })
    expect(await updateDoctor(t.rest, t.rpc, 'no-uuid', { fullName: 'Dra. Ana', specialty: 'Odontología', isActive: true })).toMatchObject({ ok: false, status: 422 })
  })

  it('odontólogo inexistente al editar o cambiar horario => 404', async () => {
    const nf: RpcResult = { ok: false, code: 'P0001', message: 'NOT_FOUND', details: 'doctor_not_found' }
    const t = setup(nf)
    expect(await updateDoctor(t.rest, t.rpc, DOC, { fullName: 'Dra. Ana Morales', specialty: 'Odontología', isActive: true })).toMatchObject({ ok: false, status: 404 })
    expect(await setDoctorSchedule(t.rpc, DOC, { windows: [] })).toMatchObject({ ok: false, status: 404 })
  })

  it('horario: reemplazo exitoso con franjas normalizadas', async () => {
    const t = setup({ ok: true, data: [{ window_count: 2 }] })
    const r = await setDoctorSchedule(t.rpc, DOC, { windows: [{ weekday: 1, startTime: '13:00', endTime: '17:00' }, { weekday: 1, startTime: '08:00', endTime: '12:00' }] })
    expect(r).toMatchObject({ ok: true, status: 200 })
    expect(t.calls[0].args.p_windows).toEqual([{ weekday: 1, startTime: '08:00', endTime: '12:00' }, { weekday: 1, startTime: '13:00', endTime: '17:00' }])
  })

  it('horario inválido o superpuesto => 422 con mensaje claro y sin tocar la base de datos (CA-02b)', async () => {
    const t = setup()
    const overlap = await setDoctorSchedule(t.rpc, DOC, { windows: [{ weekday: 2, startTime: '08:00', endTime: '12:00' }, { weekday: 2, startTime: '11:00', endTime: '14:00' }] })
    expect(overlap).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
    if (!overlap.ok) expect(overlap.message).toContain('martes')
    expect(await setDoctorSchedule(t.rpc, DOC, { windows: 'x' })).toMatchObject({ ok: false, status: 422 })
    expect(await setDoctorSchedule(t.rpc, DOC, undefined)).toMatchObject({ ok: false, status: 422 })
    expect(t.calls).toEqual([])
  })

  it('citas futuras fuera del nuevo horario => 409 SCHEDULE_CONFLICT que explica cuáles (CA-02d)', async () => {
    const details = JSON.stringify([
      { startsAt: '2031-03-03T16:00:00+00:00', patientName: 'Paciente Uno' },
      { startsAt: '2031-03-04T16:00:00+00:00', patientName: 'Paciente Dos' },
    ])
    const t = setup({ ok: false, code: 'P0001', message: 'SCHEDULE_CONFLICT', details })
    const r = await setDoctorSchedule(t.rpc, DOC, { windows: [{ weekday: 6, startTime: '09:00', endTime: '13:00' }] })
    expect(r).toMatchObject({ ok: false, status: 409, code: 'SCHEDULE_CONFLICT' })
    if (!r.ok) {
      expect(r.message).toContain('2 cita(s)')
      expect(r.message).toContain('10:00') // 16:00Z = 10:00 en Costa Rica
      expect(r.message).toContain('Paciente Uno')
    }
  })

  it('el conflicto con muchas citas resume las primeras y cuenta el resto', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ startsAt: `2031-03-0${i + 1}T16:00:00+00:00`, patientName: `P${i}` }))
    const t = setup({ ok: false, code: 'P0001', message: 'SCHEDULE_CONFLICT', details: JSON.stringify(many) })
    const r = await setDoctorSchedule(t.rpc, DOC, { windows: [] })
    if (!r.ok) expect(r.message).toContain('y 3 más')
  })
})

// --- Nivel HTTP: autenticación y rol admin -------------------------------------------------------------------------

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
const req = (method: string, opts: { auth?: string; body?: unknown; id?: string; part?: string } = {}) =>
  ({ method, query: { id: opts.id, part: opts.part }, body: opts.body, headers: opts.auth ? { authorization: opts.auth } : {} }) as unknown as VercelRequest

function mockSupabase(role: string | null, rpcReply?: Response) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/auth/v1/user')) return json(200, { id: ACTOR })
    if (url.includes('/rest/v1/staff_profiles')) return json(200, role ? [{ role, display_name: 'Persona Demo' }] : [])
    if (url.includes('/rest/v1/rpc/')) return rpcReply ?? json(200, [{ doctor_id: 'new-id', window_count: 6, is_active: true }])
    return json(200, [])
  }))
  return { calls, rpcCalls: () => calls.filter((c) => c.url.includes('/rpc/')) }
}

describe('endpoints /api/admin/doctors (exclusivos de admin)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example-ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-public')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  const calls = [
    ['listar', () => indexHandler, 'GET', {}],
    ['crear', () => indexHandler, 'POST', { body: { fullName: 'Dra. Laura Vargas', specialty: 'Periodoncia' } }],
    ['editar', () => pathHandler, 'PATCH', { id: DOC, body: { fullName: 'Dra. Ana Morales', specialty: 'Odontología', isActive: true } }],
    ['horario', () => pathHandler, 'PUT', { id: DOC, part: 'schedules', body: { windows: [] } }],
  ] as const

  it.each(calls)('%s sin sesión => 401 y sin tocar la base de datos', async (_n, handler, method, extra) => {
    const net = mockSupabase('admin')
    const { res, api } = fakeResponse()
    await handler()(req(method, extra), api)
    expect(res.statusCode).toBe(401)
    expect(net.calls).toEqual([])
  })

  it.each(calls)('%s como receptionist => 403 (CA-02e) y sin RPC', async (_n, handler, method, extra) => {
    const net = mockSupabase('receptionist')
    const { res, api } = fakeResponse()
    await handler()(req(method, { auth: 'Bearer t', ...extra }), api)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } })
    expect(net.rpcCalls()).toEqual([])
  })

  it.each(calls)('%s con usuario sin perfil de personal => 403', async (_n, handler, method, extra) => {
    mockSupabase(null)
    const { res, api } = fakeResponse()
    await handler()(req(method, { auth: 'Bearer t', ...extra }), api)
    expect(res.statusCode).toBe(403)
  })

  it('admin lista: 200 sin caché', async () => {
    mockSupabase('admin')
    const { res, api } = fakeResponse()
    await indexHandler(req('GET', { auth: 'Bearer t' }), api)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ doctors: [] })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('admin crea: 201 y la función recibe el horario predeterminado', async () => {
    const net = mockSupabase('admin')
    const { res, api } = fakeResponse()
    await indexHandler(req('POST', { auth: 'Bearer t', body: { fullName: 'Dra. Laura Vargas', specialty: 'Periodoncia' } }), api)
    expect(res.statusCode).toBe(201)
    expect(net.rpcCalls()[0].url).toContain('/rpc/create_doctor')
    expect((net.rpcCalls()[0].body as { p_windows: unknown[] }).p_windows).toHaveLength(6)
  })

  it('admin edita y cambia horario (ruta con y sin /schedules)', async () => {
    const net = mockSupabase('admin')
    const a = fakeResponse()
    await pathHandler(req('PATCH', { auth: 'Bearer t', id: DOC, body: { fullName: 'Dra. Ana Morales', specialty: 'Odontología', isActive: false } }), a.api)
    expect(a.res.statusCode).toBe(200)
    const b = fakeResponse()
    await pathHandler(req('PUT', { auth: 'Bearer t', id: DOC, part: 'schedules', body: { windows: [{ weekday: 1, startTime: '08:00', endTime: '17:00' }] } }), b.api)
    expect(b.res.statusCode).toBe(200)
    expect(net.rpcCalls().map((c) => c.url.split('/rpc/')[1])).toEqual(['update_doctor', 'set_doctor_schedule'])
  })

  it('conflicto de horario => 409 SCHEDULE_CONFLICT', async () => {
    mockSupabase('admin', json(400, { code: 'P0001', message: 'SCHEDULE_CONFLICT', details: JSON.stringify([{ startsAt: '2031-03-03T16:00:00+00:00', patientName: 'Paciente Uno' }]) }))
    const { res, api } = fakeResponse()
    await pathHandler(req('PUT', { auth: 'Bearer t', id: DOC, part: 'schedules', body: { windows: [] } }), api)
    expect(res.statusCode).toBe(409)
    expect(res.body).toMatchObject({ error: { code: 'SCHEDULE_CONFLICT' } })
  })

  it('métodos o rutas incorrectas => 405 / 404; función SQL no instalada => 503', async () => {
    mockSupabase('admin')
    const m = fakeResponse()
    await pathHandler(req('PUT', { auth: 'Bearer t', id: DOC }), m.api)
    expect(m.res.statusCode).toBe(405)
    const n = fakeResponse()
    await pathHandler(req('PATCH', { auth: 'Bearer t', id: DOC, part: 'otra' }), n.api)
    expect(n.res.statusCode).toBe(404)
    const d = fakeResponse()
    await indexHandler(req('DELETE', { auth: 'Bearer t' }), d.api)
    expect(d.res.statusCode).toBe(405)

    mockSupabase('admin', json(404, { code: 'PGRST202', message: 'Could not find the function' }))
    const u = fakeResponse()
    await indexHandler(req('POST', { auth: 'Bearer t', body: { fullName: 'Dra. Laura Vargas', specialty: 'Periodoncia' } }), u.api)
    expect(u.res.statusCode).toBe(503)
    expect(JSON.stringify(u.res.body)).not.toMatch(/PGRST|service-secret/)
  })
})
