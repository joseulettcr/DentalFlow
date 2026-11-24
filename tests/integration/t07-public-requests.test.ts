// T-07/T-09A (RF-08, RF-09, RB-10, RB-11, D-08): funciones SQL de solicitudes públicas contra DentalFlow-Test.
//
// Requiere la migración 20261123010000_public_requests.sql ya aplicada en el proyecto de PRUEBAS. ESCRIBE datos
// sintéticos (@example.com, fechas 2031+) y los elimina al terminar. Se niega a correr contra otro proyecto.
// Variables: SUPABASE_DB_URL (secreto, .env.local) y opcional SUPABASE_TEST_PROJECT_REF. Ejecutar: npm run test:t07
import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const dbUrl = process.env.SUPABASE_DB_URL?.trim()
const testRef = (process.env.SUPABASE_TEST_PROJECT_REF ?? 'wzglkfidjcgaukmezyhi').trim()
if (!dbUrl) throw new Error('T-07 no se puede ejecutar: falta SUPABASE_DB_URL (ver supabase/README.md).')
if (!dbUrl.includes(testRef)) throw new Error(`T-07 se niega a correr: SUPABASE_DB_URL no corresponde al proyecto de pruebas (${testRef}).`)

const DOCTOR_1 = 'a1000000-0000-4000-8000-000000000001'

function freeSlot(): string {
  const monday = Date.UTC(2031, 0, 6) + randomInt(0, 400) * 7 * 86_400_000
  return new Date(monday + 16 * 3_600_000).toISOString() // 10:00 hora de Costa Rica
}

const newClient = () => new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
const admin = newClient()
const emails: string[] = []
const hashes: string[] = []
const directAppointments: string[] = []

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

const newEmail = () => {
  const e = `t07-${randomUUID().slice(0, 8)}@example.com`
  emails.push(e)
  return e
}

function createRequest(over: Partial<{ email: string; start: string; key: string; name: string; doctor: string }> = {}) {
  const a = { email: over.email ?? newEmail(), start: over.start ?? freeSlot(), key: over.key ?? randomUUID(), name: over.name ?? 'Paciente Ficticio', doctor: over.doctor ?? DOCTOR_1 }
  return asService('select * from public.create_appointment_request($1,$2,$3,$4,$5,$6)', [a.doctor, a.name, a.email, null, a.start, a.key]).then((r) => ({ r, a }))
}
const approve = (id: string) => asService('select * from public.approve_appointment_request($1, null)', [id])
const reject = (id: string, reason: string | null = null) => asService('select * from public.reject_appointment_request($1, null, $2)', [id, reason])
const count = async (sql: string, params: unknown[]) => Number((await admin.query(sql, params)).rows[0].n)

beforeAll(async () => {
  await admin.connect()
  const fn = await admin.query(`select 1 from pg_proc where proname = 'create_appointment_request'`)
  if (fn.rowCount === 0) throw new Error('La migración 20261123010000_public_requests.sql no está aplicada en el proyecto de pruebas.')
})

afterAll(async () => {
  try {
    const reqs = (await admin.query('select id from public.appointment_requests where patient_email = any($1::text[])', [emails])).rows.map((r) => r.id as string)
    const appts = [...directAppointments, ...(await admin.query('select id from public.appointments where request_id = any($1::uuid[])', [reqs])).rows.map((r) => r.id as string)]
    await admin.query('delete from public.appointment_audit where request_id = any($1::uuid[]) or appointment_id = any($2::uuid[])', [reqs, appts])
    await admin.query(`update public.appointment_requests set status = 'pending', appointment_id = null, decided_at = null, decided_by = null, rejection_reason = null
                       where id = any($1::uuid[]) and status in ('approved','rejected')`, [reqs])
    await admin.query('delete from public.appointments where id = any($1::uuid[])', [appts])
    await admin.query('delete from public.appointment_requests where id = any($1::uuid[])', [reqs])
    await admin.query('delete from private.booking_rate_limits where key_hash = any($1::text[])', [hashes])
  } finally {
    await admin.end()
  }
})

describe('create_appointment_request (RF-08)', () => {
  it('crea una solicitud pending sin crear cita ni bloquear el horario (CA-08a, RB-11)', async () => {
    const start = freeSlot()
    const { r } = await createRequest({ start })
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.rows[0]).toMatchObject({ request_status: 'pending', replayed: false })
    expect(await count('select count(*) n from public.appointments where doctor_id = $1 and starts_at = $2', [DOCTOR_1, start])).toBe(0)
    // Otra solicitud del mismo bloque coexiste.
    expect((await createRequest({ start })).r.ok).toBe(true)
  })

  it('misma clave y mismos datos => misma solicitud; datos distintos => IDEMPOTENCY_KEY_REUSED (CA-08d)', async () => {
    const first = await createRequest()
    const again = await createRequest({ key: first.a.key, email: first.a.email, start: first.a.start })
    expect(again.r.ok && first.r.ok && again.r.rows[0].request_id === first.r.rows[0].request_id && again.r.rows[0].replayed === true).toBe(true)
    const other = await createRequest({ key: first.a.key, email: first.a.email, start: first.a.start, name: 'Otra Persona' })
    expect(other.r).toMatchObject({ ok: false, message: 'IDEMPOTENCY_KEY_REUSED' })
    expect(await count('select count(*) n from public.appointment_requests where idempotency_key = $1', [first.a.key])).toBe(1)
  })

  it('dos envíos simultáneos con la misma clave producen una sola solicitud', async () => {
    const a = { email: newEmail(), start: freeSlot(), key: randomUUID() }
    const results = await Promise.all([createRequest(a), createRequest(a), createRequest(a)])
    expect(results.every((x) => x.r.ok)).toBe(true)
    expect(await count('select count(*) n from public.appointment_requests where idempotency_key = $1', [a.key])).toBe(1)
  })

  it('tope de 3 pendientes por correo => RATE_LIMITED (D-08)', async () => {
    const email = newEmail()
    for (let i = 0; i < 3; i++) expect((await createRequest({ email })).r.ok).toBe(true)
    expect((await createRequest({ email })).r).toMatchObject({ ok: false, message: 'RATE_LIMITED', detail: 'pending_cap' })
  })

  it('bloque ocupado por una cita confirmada => SLOT_UNAVAILABLE y no se crea fila (CA-08c)', async () => {
    const start = freeSlot()
    const apptId = randomUUID()
    await admin.query(
      `insert into public.appointments (id, doctor_id, patient_name, patient_email, starts_at, ends_at, status, source, idempotency_key)
       values ($1, $2, 'Paciente Ficticio', $3, $4, $5, 'confirmed', 'admin_phone', $6)`,
      [apptId, DOCTOR_1, newEmail(), start, new Date(Date.parse(start) + 30 * 60_000).toISOString(), randomUUID()],
    )
    directAppointments.push(apptId)
    const { r, a } = await createRequest({ start })
    expect(r).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE' })
    expect(await count('select count(*) n from public.appointment_requests where patient_email = $1', [a.email])).toBe(0)
  })
})

describe('register_booking_attempt (CA-08e)', () => {
  it('permite 10 intentos por clave y bloquea el 11, guardando solo el hash', async () => {
    const hash = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
    hashes.push(hash)
    const allowed: boolean[] = []
    for (let i = 0; i < 11; i++) {
      const r = await asService('select public.register_booking_attempt($1) as ok', [hash])
      allowed.push(r.ok ? (r.rows[0].ok as boolean) : false)
    }
    expect(allowed.slice(0, 10).every(Boolean)).toBe(true)
    expect(allowed[10]).toBe(false)
  })
})

describe('flujo completo: solicitud → decisión (RF-09)', () => {
  it('solicitud → aprobación => exactamente una cita confirmada; repetir no duplica', async () => {
    const { r, a } = await createRequest()
    const id = r.ok ? (r.rows[0].request_id as string) : ''
    const first = await approve(id)
    const second = await approve(id)
    expect(first.ok && second.ok && first.rows[0].appointment_id === second.rows[0].appointment_id).toBe(true)
    expect(await count('select count(*) n from public.appointments where request_id = $1', [id])).toBe(1)
    expect((await admin.query('select status from public.appointment_requests where id = $1', [id])).rows[0].status).toBe('approved')
    expect(await count(`select count(*) n from public.appointments where doctor_id = $1 and starts_at = $2 and status = 'confirmed'`, [DOCTOR_1, a.start])).toBe(1)
  })

  it('dos solicitudes del mismo bloque: aprobar la segunda da SLOT_UNAVAILABLE y queda pendiente (CA-09b)', async () => {
    const start = freeSlot()
    const a = await createRequest({ start })
    const b = await createRequest({ start })
    const idA = a.r.ok ? (a.r.rows[0].request_id as string) : ''
    const idB = b.r.ok ? (b.r.rows[0].request_id as string) : ''
    expect((await approve(idA)).ok).toBe(true)
    expect(await approve(idB)).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE' })
    expect((await admin.query('select status from public.appointment_requests where id = $1', [idB])).rows[0].status).toBe('pending')
  })

  it('rechazo con motivo; repetir es idempotente; aprobar una rechazada falla (CA-09d)', async () => {
    const { r } = await createRequest()
    const id = r.ok ? (r.rows[0].request_id as string) : ''
    expect(await reject(id, '  Sin cupo  ')).toMatchObject({ ok: true })
    expect((await admin.query('select status, rejection_reason from public.appointment_requests where id = $1', [id])).rows[0]).toMatchObject({ status: 'rejected', rejection_reason: 'Sin cupo' })
    const again = await reject(id)
    expect(again.ok && again.rows[0].already_rejected).toBe(true)
    expect(await approve(id)).toMatchObject({ ok: false, message: 'REQUEST_ALREADY_DECIDED' })
    expect(await count(`select count(*) n from public.appointment_audit where request_id = $1 and action = 'rejected'`, [id])).toBe(1)
  })

  it('rechazar una solicitud ya aprobada => REQUEST_ALREADY_DECIDED', async () => {
    const { r } = await createRequest()
    const id = r.ok ? (r.rows[0].request_id as string) : ''
    await approve(id)
    expect(await reject(id)).toMatchObject({ ok: false, message: 'REQUEST_ALREADY_DECIDED' })
  })
})

describe('privilegios', () => {
  it.each(['anon', 'authenticated'])('%s no puede ejecutar las funciones de solicitudes', async (role) => {
    const c = newClient()
    await c.connect()
    try {
      for (const sql of ["select public.register_booking_attempt('x')", 'select * from public.reject_appointment_request($1)']) {
        await c.query('begin')
        await c.query(`set local role ${role}`)
        await expect(c.query(sql, sql.includes('$1') ? [randomUUID()] : [])).rejects.toMatchObject({ code: '42501' })
        await c.query('rollback')
      }
    } finally {
      await c.end()
    }
  })
})
