import { describe, expect, it, vi } from 'vitest'
import { submitRequest, type RequestPayload } from '../../src/lib/availabilityApi'
import { validateReason, validateRequestInput } from '../../shared/request-validation'

const payload: RequestPayload = {
  doctorId: 'a1000000-0000-4000-8000-000000000001',
  patientName: 'Paciente Ficticio',
  patientEmail: 'paciente@example.com',
  patientPhone: '',
  startAt: '2026-11-30T14:00:00.000Z',
  idempotencyKey: '5b6f8f2e-4a63-4c63-9a38-1d2f3a4b5c6d',
}
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
const created = { requestId: 'r-1', status: 'pending', doctorName: 'Dra. Ana Morales', startsAt: payload.startAt, endsAt: '2026-11-30T14:30:00.000Z' }

describe('submitRequest (cliente)', () => {
  it('201 => solicitud creada; 200 => reintento ya registrado', async () => {
    expect(await submitRequest(payload, reply(201, created))).toMatchObject({ kind: 'ok', replayed: false, request: { requestId: 'r-1' } })
    expect(await submitRequest(payload, reply(200, created))).toMatchObject({ kind: 'ok', replayed: true })
  })

  it('no envía el teléfono vacío y usa POST con JSON', async () => {
    const spy = reply(201, created)
    await submitRequest(payload, spy)
    const [url, init] = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/public/appointment-requests')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).not.toHaveProperty('patientPhone')
  })

  it('traduce 422, 409, 429 y fallos', async () => {
    expect(await submitRequest(payload, reply(422, { error: { message: 'Correo inválido' } }))).toEqual({ kind: 'validation', message: 'Correo inválido' })
    expect(await submitRequest(payload, reply(409, { error: { code: 'SLOT_UNAVAILABLE', message: 'Ocupado' } }))).toEqual({ kind: 'conflict', code: 'SLOT_UNAVAILABLE', message: 'Ocupado' })
    expect(await submitRequest(payload, reply(429, {}))).toEqual({ kind: 'rate_limited' })
    expect(await submitRequest(payload, reply(503, {}))).toEqual({ kind: 'unavailable' })
    expect(await submitRequest(payload, vi.fn(async () => { throw new Error('red') }) as unknown as typeof fetch)).toEqual({ kind: 'unavailable' })
  })
})

describe('validateRequestInput / validateReason', () => {
  const base = { ...payload, patientPhone: undefined }
  it('acepta una solicitud correcta y normaliza', () => {
    expect(validateRequestInput({ ...base, patientEmail: ' P@Example.com ' })).toMatchObject({ ok: true, value: { patientEmail: 'p@example.com', patientPhone: null } })
    expect(validateRequestInput({ ...base, patientPhone: '+506 8888-0000' })).toMatchObject({ ok: true, value: { patientPhone: '+506 8888-0000' } })
  })
  it('rechaza cada campo inválido indicando cuál', () => {
    expect(validateRequestInput({ ...base, patientEmail: 'x' })).toMatchObject({ ok: false, field: 'patientEmail' })
    expect(validateRequestInput({ ...base, patientName: ' ' })).toMatchObject({ ok: false, field: 'patientName' })
    expect(validateRequestInput({ ...base, startAt: '2026-11-30T14:07:00Z' })).toMatchObject({ ok: false, field: 'startAt' })
    expect(validateRequestInput({ ...base, idempotencyKey: '1' })).toMatchObject({ ok: false, field: 'idempotencyKey' })
  })
  it('motivo de rechazo: opcional, recortado y máximo 200', () => {
    expect(validateReason(undefined)).toEqual({ ok: true, value: null })
    expect(validateReason('  ')).toEqual({ ok: true, value: null })
    expect(validateReason(' Sin cupo ')).toEqual({ ok: true, value: 'Sin cupo' })
    expect(validateReason('x'.repeat(201))).toMatchObject({ ok: false })
    expect(validateReason(5)).toMatchObject({ ok: false })
  })
})
