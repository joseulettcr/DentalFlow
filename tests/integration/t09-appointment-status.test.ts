// T-09 (CA-05b, CA-05c, RB-06): cancelar y completar citas — función change_appointment_status contra DentalFlow-Test.
//
// Requiere las migraciones 20261123020000 (cita telefónica) y 20261124000000 (cambio de estado) ya aplicadas en el
// proyecto de PRUEBAS. ESCRIBE datos sintéticos (@example.com, fechas 2020 y 2031+) y los elimina al terminar.
// Se niega a correr contra otro proyecto. Variables: SUPABASE_DB_URL (secreto, .env.local) y opcional
// SUPABASE_TEST_PROJECT_REF. Ejecutar: npm run test:t09
import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const dbUrl = process.env.SUPABASE_DB_URL?.trim()
const testRef = (process.env.SUPABASE_TEST_PROJECT_REF ?? 'wzglkfidjcgaukmezyhi').trim()
if (!dbUrl) throw new Error('T-09 no se puede ejecutar: falta SUPABASE_DB_URL (ver supabase/README.md).')
if (!dbUrl.includes(testRef)) throw new Error(`T-09 se niega a correr: SUPABASE_DB_URL no corresponde al proyecto de pruebas (${testRef}).`)

const DOCTOR_1 = 'a1000000-0000-4000-8000-000000000001'
const futureSlot = (): string => new Date(Date.UTC(2031, 0, 6) + randomInt(0, 400) * 7 * 86_400_000 + 16 * 3_600_000).toISOString()
const pastSlot = (): string => new Date(Date.UTC(2020, 0, 6) + randomInt(0, 300) * 7 * 86_400_000 + 16 * 3_600_000).toISOString()

const newClient = () => new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
const admin = newClient()
const ids: string[] = []

type Result = { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string; code?: string; detail?: string }

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

/** Inserta una cita confirmada directamente (permite fechas pasadas, que la reserva normal no admite). */
async function seed(start: string): Promise<string> {
  const id = randomUUID()
  await admin.query(
    `insert into public.appointments (id, doctor_id, patient_name, patient_email, starts_at, ends_at, status, source, idempotency_key)
     values ($1, $2, 'Paciente Ficticio', $3, $4, $5, 'confirmed', 'admin_phone', $6)`,
    [id, DOCTOR_1, `t09-${id.slice(0, 8)}@example.com`, start, new Date(Date.parse(start) + 30 * 60_000).toISOString(), randomUUID()],
  )
  ids.push(id)
  return id
}
const change = (id: string, action: string) => asService('select * from public.change_appointment_status($1, $2, null)', [id, action])
const count = async (sql: string, params: unknown[]) => Number((await admin.query(sql, params)).rows[0].n)
const audit = (id: string, action: string) => count('select count(*) n from public.appointment_audit where appointment_id = $1 and action = $2', [id, action])

beforeAll(async () => {
  await admin.connect()
  const fn = await admin.query(`select 1 from pg_proc where proname = 'change_appointment_status'`)
  if (fn.rowCount === 0) throw new Error('La migración 20261124000000_appointment_status.sql no está aplicada en el proyecto de pruebas.')
})

afterAll(async () => {
  try {
    await admin.query('delete from public.appointment_audit where appointment_id = any($1::uuid[])', [ids])
    await admin.query('delete from public.appointments where id = any($1::uuid[])', [ids])
  } finally {
    await admin.end()
  }
})

describe('change_appointment_status (CA-05b, CA-05c)', () => {
  it('cancelar: persiste cancelled_at/cancelled_by y audita (confirmed → cancelled)', async () => {
    const id = await seed(futureSlot())
    expect(await change(id, 'cancel')).toMatchObject({ ok: true })
    const row = (await admin.query('select status, cancelled_at, completed_at from public.appointments where id = $1', [id])).rows[0]
    expect(row.status).toBe('cancelled')
    expect(row.cancelled_at).not.toBeNull()
    expect(row.completed_at).toBeNull()
    expect(await count(`select count(*) n from public.appointment_audit where appointment_id = $1 and action = 'cancelled' and from_status = 'confirmed' and to_status = 'cancelled'`, [id])).toBe(1)
  })

  it('cancelar libera el bloque: se puede reservar de nuevo el mismo horario (RB-06)', async () => {
    const start = futureSlot()
    const id = await seed(start)
    const blocked = await asService('select * from public.create_phone_appointment($1,$2,$3,$4,$5,$6,null)', [DOCTOR_1, 'Otra Persona', `t09-${randomUUID().slice(0, 8)}@example.com`, null, start, randomUUID()])
    expect(blocked).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE' })
    await change(id, 'cancel')
    const again = await asService('select * from public.create_phone_appointment($1,$2,$3,$4,$5,$6,null)', [DOCTOR_1, 'Otra Persona', `t09-${randomUUID().slice(0, 8)}@example.com`, null, start, randomUUID()])
    expect(again).toMatchObject({ ok: true })
    if (again.ok) ids.push(again.rows[0].appointment_id as string)
  })

  it('completar una cita terminada: persiste completed_at y audita', async () => {
    const id = await seed(pastSlot())
    expect(await change(id, 'complete')).toMatchObject({ ok: true })
    const row = (await admin.query('select status, completed_at, cancelled_at from public.appointments where id = $1', [id])).rows[0]
    expect(row.status).toBe('completed')
    expect(row.completed_at).not.toBeNull()
    expect(row.cancelled_at).toBeNull()
    expect(await audit(id, 'completed')).toBe(1)
  })

  it('transiciones inválidas => INVALID_TRANSITION y no cambian nada', async () => {
    const future = await seed(futureSlot())
    expect(await change(future, 'complete')).toMatchObject({ ok: false, message: 'INVALID_TRANSITION', detail: 'not_finished_yet' })
    const cancelled = await seed(futureSlot())
    await change(cancelled, 'cancel')
    expect(await change(cancelled, 'complete')).toMatchObject({ ok: false, message: 'INVALID_TRANSITION' })
    const completed = await seed(pastSlot())
    await change(completed, 'complete')
    expect(await change(completed, 'cancel')).toMatchObject({ ok: false, message: 'INVALID_TRANSITION' })
    expect((await admin.query('select status from public.appointments where id = $1', [future])).rows[0].status).toBe('confirmed')
    expect(await audit(future, 'completed')).toBe(0)
  })

  it('operación repetida: idempotente y sin auditoría duplicada', async () => {
    const id = await seed(futureSlot())
    await change(id, 'cancel')
    const again = await change(id, 'cancel')
    expect(again.ok && again.rows[0].already_in_state).toBe(true)
    expect(await audit(id, 'cancelled')).toBe(1)
  })

  it('5 cancelaciones simultáneas de la misma cita: una sola transición y una sola auditoría', async () => {
    const id = await seed(futureSlot())
    const results = await Promise.all(Array.from({ length: 5 }, () => change(id, 'cancel')))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(results.filter((r) => r.ok && r.rows[0].already_in_state === false)).toHaveLength(1)
    expect(await audit(id, 'cancelled')).toBe(1)
  })

  it('cancelar y completar a la vez: gana una y el estado final coincide con su auditoría', async () => {
    const id = await seed(pastSlot())
    const [a, b] = await Promise.all([change(id, 'cancel'), change(id, 'complete')])
    expect([a, b].filter((r) => r.ok)).toHaveLength(1)
    expect([a, b].filter((r) => !r.ok)[0]).toMatchObject({ ok: false, message: 'INVALID_TRANSITION' })
    const status = (await admin.query('select status from public.appointments where id = $1', [id])).rows[0].status as string
    expect(['cancelled', 'completed']).toContain(status)
    expect(await audit(id, status)).toBe(1)
    expect((await audit(id, 'cancelled')) + (await audit(id, 'completed'))).toBe(1)
  })

  it('cita inexistente => NOT_FOUND y acción inválida => VALIDATION_ERROR', async () => {
    expect(await change(randomUUID(), 'cancel')).toMatchObject({ ok: false, message: 'NOT_FOUND' })
    const id = await seed(futureSlot())
    expect(await change(id, 'borrar')).toMatchObject({ ok: false, message: 'VALIDATION_ERROR' })
  })

  it.each(['anon', 'authenticated'])('%s no puede ejecutar la función', async (role) => {
    const c = newClient()
    await c.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${role}`)
      await expect(c.query('select * from public.change_appointment_status(null, null, null)')).rejects.toMatchObject({ code: '42501' })
    } finally {
      await c.query('rollback').catch(() => undefined)
      await c.end()
    }
  })
})
