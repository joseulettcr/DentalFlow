import { describe, expect, it, vi } from 'vitest'
import { approveRequest, createPublicRequest, listRequests, rejectRequest } from '../../api/_lib/requests-service'
import type { RestGet, Rpc, RpcResult } from '../../api/_lib/supabase-rest'

const NOW = new Date('2026-11-23T12:00:00Z') // lunes 06:00 en Costa Rica
const DOCTOR = 'a1000000-0000-4000-8000-000000000001'
const INACTIVE = 'a1000000-0000-4000-8000-000000000009'
const KEY = '5b6f8f2e-4a63-4c63-9a38-1d2f3a4b5c6d'
const REQUEST_ID = '0f9c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f'
const START = '2026-11-30T14:00:00.000Z' // lunes 08:00 CR
const HASH = 'a'.repeat(64)

const valid = (over: Record<string, unknown> = {}) => ({
  doctorId: DOCTOR,
  patientName: 'Paciente Ficticio',
  patientEmail: 'paciente.ficticio@example.com',
  patientPhone: '8888 0000',
  startAt: START,
  idempotencyKey: KEY,
  ...over,
})

interface World {
  confirmed?: Array<{ starts_at: string; ends_at: string }>
  existing?: Array<Record<string, unknown>>
  schedule?: Array<{ weekday: number; start_time: string; end_time: string }>
}

function setup(world: World = {}, rpcResults: Record<string, RpcResult> = {}) {
  const restCalls: string[] = []
  const rest: RestGet = async (path) => {
    restCalls.push(path)
    const [table, query = ''] = path.split('?')
    const q = new URLSearchParams(query)
    if (table === 'doctors') {
      return `eq.${DOCTOR}` === q.get('id') ? [{ id: DOCTOR, full_name: 'Dra. Ana Morales' }] : []
    }
    if (table === 'weekly_schedules') return world.schedule ?? [{ weekday: 1, start_time: '08:00:00', end_time: '09:00:00' }]
    if (table === 'appointments') return world.confirmed ?? []
    if (table === 'appointment_requests') return world.existing ?? []
    throw new Error(`Consulta inesperada: ${path}`)
  }
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpc: Rpc = vi.fn(async (name, args) => {
    rpcCalls.push({ name, args })
    return (
      rpcResults[name] ??
      (name === 'register_booking_attempt'
        ? { ok: true, data: true }
        : { ok: true, data: [{ request_id: REQUEST_ID, request_status: 'pending', replayed: false }] })
    )
  })
  const create = (body: unknown) => createPublicRequest({ rest, rpc, now: NOW, clientHash: HASH }, body)
  const createdCalls = () => rpcCalls.filter((c) => c.name === 'create_appointment_request')
  return { create, rest, rpc, restCalls, rpcCalls, createdCalls }
}

describe('POST solicitud pública (RF-08)', () => {
  it('solicitud válida => 201 pending con número de solicitud, sin datos del paciente (CA-08a)', async () => {
    const t = setup()
    const result = await t.create(valid())
    expect(result).toEqual({
      ok: true,
      status: 201,
      body: { requestId: REQUEST_ID, status: 'pending', doctorName: 'Dra. Ana Morales', startsAt: START, endsAt: '2026-11-30T14:30:00.000Z' },
    })
    expect(JSON.stringify(result)).not.toMatch(/paciente|example\.com|8888/i)
    expect(t.createdCalls()).toHaveLength(1)
    expect(t.createdCalls()[0].args).toMatchObject({
      p_doctor_id: DOCTOR,
      p_patient_name: 'Paciente Ficticio',
      p_patient_email: 'paciente.ficticio@example.com',
      p_starts_at: START,
      p_idempotency_key: KEY,
    })
  })

  it('normaliza datos (correo en minúsculas, espacios del nombre, hora con offset)', async () => {
    const t = setup()
    await t.create(valid({ patientName: '  Ana   Pérez ', patientEmail: ' ANA@Example.COM ', startAt: '2026-11-30T08:00:00-06:00' }))
    expect(t.createdCalls()[0].args).toMatchObject({ p_patient_name: 'Ana Pérez', p_patient_email: 'ana@example.com', p_starts_at: START })
  })

  it.each([
    ['correo inválido', { patientEmail: 'no-es-correo' }],
    ['nombre vacío', { patientName: '   ' }],
    ['nombre de 1 letra', { patientName: 'A' }],
    ['teléfono con letras', { patientPhone: 'abc12345' }],
    ['teléfono demasiado corto', { patientPhone: '123' }],
    ['horario sin zona horaria', { startAt: '2026-11-30T08:00:00' }],
    ['horario no alineado a :00/:30', { startAt: '2026-11-30T14:15:00Z' }],
    ['odontólogo no UUID', { doctorId: 'nope' }],
    ['clave de idempotencia ausente', { idempotencyKey: undefined }],
  ])('datos inválidos (%s) => 422 sin crear nada (CA-08b)', async (_name, over) => {
    const t = setup()
    const result = await t.create(valid(over))
    expect(result).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
    expect(t.createdCalls()).toHaveLength(0)
  })

  it('cuerpo no objeto => 422', async () => {
    expect(await setup().create(null)).toMatchObject({ ok: false, status: 422 })
    expect(await setup().create('texto')).toMatchObject({ ok: false, status: 422 })
  })

  it('odontólogo inactivo, fuera de franja y fuera de ventana => 422', async () => {
    expect(await setup().create(valid({ doctorId: INACTIVE }))).toMatchObject({ ok: false, status: 422 })
    expect(await setup().create(valid({ startAt: '2026-11-30T16:00:00.000Z' }))).toMatchObject({ ok: false, status: 422 }) // 10:00 CR, franja 08–09
    expect(await setup().create(valid({ startAt: '2026-11-29T14:00:00.000Z' }))).toMatchObject({ ok: false, status: 422 }) // domingo
    expect(await setup().create(valid({ startAt: '2026-11-22T14:00:00.000Z' }))).toMatchObject({ ok: false, status: 422 }) // pasada
    expect(await setup().create(valid({ startAt: '2026-12-28T14:00:00.000Z' }))).toMatchObject({ ok: false, status: 422 }) // > 30 días
  })

  it('bloque ya ocupado por una cita confirmada => 409 SLOT_UNAVAILABLE y no se crea (CA-08c)', async () => {
    const t = setup({ confirmed: [{ starts_at: START, ends_at: '2026-11-30T14:30:00Z' }] })
    expect(await t.create(valid())).toMatchObject({ ok: false, status: 409, code: 'SLOT_UNAVAILABLE' })
    expect(t.createdCalls()).toHaveLength(0)
  })

  it('las solicitudes pendientes no bloquean el horario: ni se consultan al comprobar disponibilidad (RB-11)', async () => {
    const t = setup()
    expect(await t.create(valid())).toMatchObject({ ok: true, status: 201 })
    // La única lectura de appointment_requests es la búsqueda por clave de idempotencia.
    const reads = t.restCalls.filter((c) => c.startsWith('appointment_requests'))
    expect(reads).toHaveLength(1)
    expect(reads[0]).toContain(`idempotency_key=eq.${KEY}`)
  })

  it('repetir la solicitud con la misma clave y datos devuelve la misma, sin crear otra (CA-08d)', async () => {
    const existing = [{
      id: REQUEST_ID, status: 'pending', doctor_id: DOCTOR, patient_name: 'Paciente Ficticio',
      patient_email: 'paciente.ficticio@example.com', patient_phone: '8888 0000',
      requested_starts_at: '2026-11-30T14:00:00+00:00', requested_ends_at: '2026-11-30T14:30:00+00:00',
      doctors: { full_name: 'Dra. Ana Morales' },
    }]
    const t = setup({ existing })
    const result = await t.create(valid())
    expect(result).toMatchObject({ ok: true, status: 200, body: { requestId: REQUEST_ID, status: 'pending', startsAt: START } })
    expect(t.createdCalls()).toHaveLength(0)
  })

  it('el reintento no falla aunque el bloque se ocupe después (idempotencia primero)', async () => {
    const existing = [{
      id: REQUEST_ID, status: 'pending', doctor_id: DOCTOR, patient_name: 'Paciente Ficticio',
      patient_email: 'paciente.ficticio@example.com', patient_phone: '8888 0000',
      requested_starts_at: START, requested_ends_at: '2026-11-30T14:30:00.000Z', doctors: { full_name: 'Dra. Ana Morales' },
    }]
    const t = setup({ existing, confirmed: [{ starts_at: START, ends_at: '2026-11-30T14:30:00Z' }] })
    expect(await t.create(valid())).toMatchObject({ ok: true, status: 200 })
  })

  it('misma clave con datos distintos => 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const existing = [{
      id: REQUEST_ID, status: 'pending', doctor_id: DOCTOR, patient_name: 'Otra Persona',
      patient_email: 'otra@example.com', patient_phone: null,
      requested_starts_at: START, requested_ends_at: '2026-11-30T14:30:00.000Z', doctors: null,
    }]
    const t = setup({ existing })
    expect(await t.create(valid())).toMatchObject({ ok: false, status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(t.createdCalls()).toHaveLength(0)
  })

  it('límite de 10 intentos por IP => 429 antes de validar o leer nada (CA-08e)', async () => {
    const t = setup({}, { register_booking_attempt: { ok: true, data: false } })
    expect(await t.create(valid())).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED' })
    expect(t.restCalls).toEqual([])
    expect(t.createdCalls()).toHaveLength(0)
  })

  it('cada intento se registra con la clave anonimizada, aunque sea inválido', async () => {
    const t = setup()
    await t.create(valid({ patientEmail: 'x' }))
    expect(t.rpcCalls[0]).toEqual({ name: 'register_booking_attempt', args: { p_key_hash: HASH } })
  })

  it.each([
    ['tope de pendientes por correo', 'RATE_LIMITED', 'P0001', 429],
    ['carrera por el mismo bloque', 'SLOT_UNAVAILABLE', 'P0001', 409],
    ['clave reutilizada en carrera', 'IDEMPOTENCY_KEY_REUSED', 'P0001', 409],
  ])('error de la función SQL (%s) se traduce a HTTP %i', async (_name, message, code, status) => {
    const t = setup({}, { create_appointment_request: { ok: false, code, message, details: null } })
    expect(await t.create(valid())).toMatchObject({ ok: false, status })
  })

  it('restricción CHECK de la tabla (23514) => 422', async () => {
    const t = setup({}, { create_appointment_request: { ok: false, code: '23514', message: 'new row violates check constraint', details: null } })
    expect(await t.create(valid())).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_ERROR' })
  })

  it('un reintento resuelto por la función (replayed) responde 200', async () => {
    const t = setup({}, { create_appointment_request: { ok: true, data: [{ request_id: REQUEST_ID, request_status: 'pending', replayed: true }] } })
    expect(await t.create(valid())).toMatchObject({ ok: true, status: 200 })
  })
})

describe('aprobación y rechazo (RF-09): delegan en funciones SQL', () => {
  const rpcOk = (data: unknown): Rpc => vi.fn(async () => ({ ok: true as const, data }))
  const rpcError = (message: string, code = 'P0001'): Rpc => vi.fn(async () => ({ ok: false as const, code, message, details: null }))
  const ACTOR = 'c0000000-0000-4000-8000-0000000000aa'

  it('aprobación exitosa llama a approve_appointment_request con el actor', async () => {
    const rpc = rpcOk([{ appointment_id: 'ap-1', request_status: 'approved', already_approved: false }])
    const result = await approveRequest(rpc, REQUEST_ID, ACTOR)
    expect(result).toEqual({ ok: true, status: 200, body: { appointmentId: 'ap-1', requestStatus: 'approved', alreadyApproved: false } })
    expect(rpc).toHaveBeenCalledWith('approve_appointment_request', { p_request_id: REQUEST_ID, p_actor_user_id: ACTOR })
  })

  it('aprobación repetida devuelve la misma cita, marcada como ya aprobada', async () => {
    const rpc = rpcOk([{ appointment_id: 'ap-1', request_status: 'approved', already_approved: true }])
    expect(await approveRequest(rpc, REQUEST_ID, ACTOR)).toMatchObject({ ok: true, body: { appointmentId: 'ap-1', alreadyApproved: true } })
  })

  it.each([
    ['SLOT_UNAVAILABLE', 409],
    ['REQUEST_EXPIRED', 409],
    ['REQUEST_ALREADY_DECIDED', 409],
    ['NOT_FOUND', 404],
  ])('conflicto %s al aprobar => HTTP %i con código estable', async (message, status) => {
    expect(await approveRequest(rpcError(message), REQUEST_ID, ACTOR)).toMatchObject({ ok: false, status, code: message })
  })

  it('identificador inválido => 422 sin llamar a la base de datos', async () => {
    const rpc = rpcOk([])
    expect(await approveRequest(rpc, 'no-uuid', ACTOR)).toMatchObject({ ok: false, status: 422 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechazo con motivo opcional llama a reject_appointment_request', async () => {
    const rpc = rpcOk([{ request_status: 'rejected', already_rejected: false }])
    expect(await rejectRequest(rpc, REQUEST_ID, ACTOR, { reason: '  Sin cupo  ' })).toEqual({ ok: true, status: 200, body: { requestStatus: 'rejected', alreadyRejected: false } })
    expect(rpc).toHaveBeenCalledWith('reject_appointment_request', { p_request_id: REQUEST_ID, p_actor_user_id: ACTOR, p_reason: 'Sin cupo' })
  })

  it('rechazo sin cuerpo y motivo de más de 200 caracteres', async () => {
    const rpc = rpcOk([{ request_status: 'rejected', already_rejected: false }])
    expect(await rejectRequest(rpc, REQUEST_ID, ACTOR, undefined)).toMatchObject({ ok: true })
    expect(await rejectRequest(rpc, REQUEST_ID, ACTOR, { reason: 'x'.repeat(201) })).toMatchObject({ ok: false, status: 422 })
  })

  it('rechazar una solicitud ya aprobada => 409 REQUEST_ALREADY_DECIDED', async () => {
    expect(await rejectRequest(rpcError('REQUEST_ALREADY_DECIDED'), REQUEST_ID, ACTOR, {})).toMatchObject({ ok: false, status: 409, code: 'REQUEST_ALREADY_DECIDED' })
  })

  it('listado: por defecto pendientes, estado inválido => 422, sin tocar otra cosa', async () => {
    const rest = vi.fn(async () => []) as unknown as RestGet
    expect(await listRequests(rest, '')).toMatchObject({ ok: true, body: { requests: [] } })
    expect((rest as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('status=eq.pending')
    expect(await listRequests(rest, 'borrar')).toMatchObject({ ok: false, status: 422 })
  })
})
