// T-08 (RF-04, RB-05, RB-10; P-04): reserva telefónica directa — función create_phone_appointment contra DentalFlow-Test.
//
// Requiere la migración 20261123020000_phone_appointments.sql ya aplicada en el proyecto de PRUEBAS. ESCRIBE datos
// sintéticos (@example.com, fechas 2031+) y los elimina al terminar. Se niega a correr contra otro proyecto.
// Variables: SUPABASE_DB_URL (secreto, .env.local) y opcional SUPABASE_TEST_PROJECT_REF. Ejecutar: npm run test:t08
import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const dbUrl = process.env.SUPABASE_DB_URL?.trim()
const testRef = (process.env.SUPABASE_TEST_PROJECT_REF ?? 'wzglkfidjcgaukmezyhi').trim()
if (!dbUrl) throw new Error('T-08 no se puede ejecutar: falta SUPABASE_DB_URL (ver supabase/README.md).')
if (!dbUrl.includes(testRef)) throw new Error(`T-08 se niega a correr: SUPABASE_DB_URL no corresponde al proyecto de pruebas (${testRef}).`)

const DOCTOR_1 = 'a1000000-0000-4000-8000-000000000001'
const DOCTOR_2 = 'a1000000-0000-4000-8000-000000000002'

const freeSlot = (): string => new Date(Date.UTC(2031, 0, 6) + randomInt(0, 400) * 7 * 86_400_000 + 16 * 3_600_000).toISOString() // 10:00 CR

const newClient = () => new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
const admin = newClient()
const emails: string[] = []

type Result = { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string; code?: string; detail?: string }

// Cada llamada usa su propia conexión y transacción como service_role, igual que el backend.
async function asService(sql: string, params: unknown[]): Promise<Result> {
  const c = newClient()
  await c.connect()
  try {
    await c.query('begin')
    await c.query('set local role service_role')
    const r = await c.query(sql, params)
    await c.query('commit')
    return { ok: true, rows: r.rows }
  } catch (e) {
    await c.query('rollback').catch(() => undefined)
    const err = e as { message: string; code?: string; detail?: string }
    return { ok: false, message: err.message, code: err.code, detail: err.detail }
  } finally {
    await c.end()
  }
}

function book(over: Partial<{ doctor: string; start: string; key: string; name: string; email: string; actor: string | null }> = {}) {
  const a = { doctor: DOCTOR_1, start: freeSlot(), key: randomUUID(), name: 'Paciente Ficticio', email: `t08-${randomUUID().slice(0, 8)}@example.com`, actor: null as string | null, ...over }
  emails.push(a.email)
  return asService('select * from public.create_phone_appointment($1,$2,$3,$4,$5,$6,$7)', [a.doctor, a.name, a.email, '8888 0000', a.start, a.key, a.actor]).then((r) => ({ r, a }))
}
const count = async (sql: string, params: unknown[]) => Number((await admin.query(sql, params)).rows[0].n)
const idOf = (r: Result) => (r.ok ? (r.rows[0].appointment_id as string) : '')

beforeAll(async () => {
  await admin.connect()
  const fn = await admin.query(`select 1 from pg_proc where proname = 'create_phone_appointment'`)
  if (fn.rowCount === 0) throw new Error('La migración 20261123020000_phone_appointments.sql no está aplicada en el proyecto de pruebas.')
})

afterAll(async () => {
  try {
    const ids = (await admin.query('select id from public.appointments where patient_email = any($1::text[])', [emails])).rows.map((r) => r.id as string)
    await admin.query('delete from public.appointment_audit where appointment_id = any($1::uuid[])', [ids])
    await admin.query('delete from public.appointments where id = any($1::uuid[])', [ids])
  } finally {
    await admin.end()
  }
})

describe('create_phone_appointment (RF-04)', () => {
  it('crea una cita confirmada de origen telefónico, persistida y auditada (CA-04a, CA-05b)', async () => {
    const { r, a } = await book()
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.rows[0]).toMatchObject({ appointment_status: 'confirmed', replayed: false })
    const row = (await admin.query('select * from public.appointments where id = $1', [idOf(r)])).rows[0]
    expect(row).toMatchObject({ doctor_id: DOCTOR_1, status: 'confirmed', source: 'admin_phone', patient_email: a.email })
    expect(new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()).toBe(30 * 60_000)
    expect(await count(`select count(*) n from public.appointment_audit where appointment_id = $1 and action = 'created' and to_status = 'confirmed'`, [idOf(r)])).toBe(1)
  })

  it('mismo bloque y odontólogo => SLOT_UNAVAILABLE; otro odontólogo o bloque contiguo => permitido', async () => {
    const start = freeSlot()
    expect((await book({ start })).r.ok).toBe(true)
    expect((await book({ start })).r).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE' })
    expect((await book({ start, doctor: DOCTOR_2 })).r.ok).toBe(true)
    expect((await book({ start: new Date(Date.parse(start) + 30 * 60_000).toISOString() })).r.ok).toBe(true)
  })

  it('concurrencia: 6 reservas simultáneas del mismo bloque producen exactamente una cita (CA-04b, P-04)', async () => {
    const start = freeSlot()
    const results = await Promise.all(Array.from({ length: 6 }, () => book({ start })))
    const ok = results.filter((x) => x.r.ok)
    const failed = results.filter((x) => !x.r.ok)
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(5)
    for (const f of failed) expect(f.r).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE', code: 'P0001' })
    expect(await count(`select count(*) n from public.appointments where doctor_id = $1 and starts_at = $2 and status = 'confirmed'`, [DOCTOR_1, start])).toBe(1)
    // El perdedor no deja auditoría huérfana: solo la cita ganadora tiene registro 'created'.
    const winner = ok[0].r.ok ? idOf(ok[0].r) : ''
    expect(await count(`select count(*) n from public.appointment_audit where appointment_id = $1`, [winner])).toBe(1)
  })

  it('idempotencia: misma clave y datos => misma cita; datos distintos => IDEMPOTENCY_KEY_REUSED (CA-04d)', async () => {
    const first = await book()
    const again = await book({ key: first.a.key, start: first.a.start, name: first.a.name, email: first.a.email })
    expect(again.r.ok && again.r.rows[0].replayed === true && idOf(again.r) === idOf(first.r)).toBe(true)
    expect((await book({ key: first.a.key, start: first.a.start, name: 'Otra Persona', email: first.a.email })).r).toMatchObject({ ok: false, message: 'IDEMPOTENCY_KEY_REUSED' })
    expect(await count('select count(*) n from public.appointments where idempotency_key = $1', [first.a.key])).toBe(1)
    expect(await count(`select count(*) n from public.appointment_audit where appointment_id = $1`, [idOf(first.r)])).toBe(1)
  })

  it('3 envíos simultáneos con la misma clave => una sola cita', async () => {
    const a = { key: randomUUID(), start: freeSlot(), email: `t08-${randomUUID().slice(0, 8)}@example.com` }
    const results = await Promise.all([book(a), book(a), book(a)])
    expect(results.every((x) => x.r.ok)).toBe(true)
    expect(await count('select count(*) n from public.appointments where idempotency_key = $1', [a.key])).toBe(1)
  })

  it('una solicitud pendiente no bloquea; al aprobarla sobre un bloque ya reservado falla sin duplicar (RB-11, RB-12)', async () => {
    const start = freeSlot()
    const reqId = randomUUID()
    const email = `t08-${randomUUID().slice(0, 8)}@example.com`
    emails.push(email)
    await admin.query(
      `insert into public.appointment_requests (id, doctor_id, patient_name, patient_email, requested_starts_at, requested_ends_at, idempotency_key)
       values ($1, $2, 'Paciente Ficticio', $3, $4, $5, $6)`,
      [reqId, DOCTOR_1, email, start, new Date(Date.parse(start) + 30 * 60_000).toISOString(), randomUUID()],
    )
    try {
      expect((await book({ start })).r.ok).toBe(true)
      expect(await asService('select * from public.approve_appointment_request($1, null)', [reqId])).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE' })
      expect((await admin.query('select status from public.appointment_requests where id = $1', [reqId])).rows[0].status).toBe('pending')
    } finally {
      await admin.query('delete from public.appointment_requests where id = $1', [reqId])
    }
  })

  it('inicio en el pasado => VALIDATION_ERROR sin crear nada', async () => {
    const { r, a } = await book({ start: '2024-01-08T16:00:00.000Z' })
    expect(r).toMatchObject({ ok: false, message: 'VALIDATION_ERROR', detail: 'starts_in_past' })
    expect(await count('select count(*) n from public.appointments where patient_email = $1', [a.email])).toBe(0)
  })

  it.each(['anon', 'authenticated'])('%s no puede ejecutar la función', async (role) => {
    const c = newClient()
    await c.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${role}`)
      await expect(c.query('select * from public.create_phone_appointment(null,null,null,null,null,null)')).rejects.toMatchObject({ code: '42501' })
    } finally {
      await c.query('rollback').catch(() => undefined)
      await c.end()
    }
  })
})
