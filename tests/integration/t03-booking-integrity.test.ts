// T-03 (RB-05, RB-12; P-04, P-12, P-13): no superposición de citas y aprobación atómica e idempotente.
//
// Prueba de integración contra un proyecto Supabase Cloud DE PRUEBAS donde ya se aplicó la migración
// 20261123000000_booking_integrity.sql. ESCRIBE datos sintéticos (correos @example.com, fechas en 2031+)
// y los elimina al terminar. Se niega a correr contra un proyecto distinto del de pruebas.
//
// Variables (en .env.local o en el shell; nunca en Git):
//   SUPABASE_DB_URL            cadena de conexión Postgres (modo sesión o directa, NO el pooler en modo transacción)
//   SUPABASE_TEST_PROJECT_REF  opcional; por defecto wzglkfidjcgaukmezyhi (DentalFlow-Test)
//
// Ejecutar: npm run test:t03
import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const dbUrl = process.env.SUPABASE_DB_URL?.trim()
const testRef = (process.env.SUPABASE_TEST_PROJECT_REF ?? 'wzglkfidjcgaukmezyhi').trim()

if (!dbUrl) {
  throw new Error(
    'T-03 no se puede ejecutar: falta SUPABASE_DB_URL. Defínela en .env.local (ver supabase/README.md, "T-03 — Integridad de reservas").',
  )
}
if (!dbUrl.includes(testRef)) {
  throw new Error(`T-03 se niega a correr: SUPABASE_DB_URL no corresponde al proyecto de pruebas (${testRef}).`)
}

const DOCTOR_1 = 'a1000000-0000-4000-8000-000000000001' // Dra. Morales: L–V 08–12 y 13–17 (hora de Costa Rica)
const DOCTOR_2 = 'a1000000-0000-4000-8000-000000000002' // Dr. Rojas: L–V 09–12 y 14–17

// Lunes 2031-01-06 + semanas aleatorias; 10:00 o 10:30 en Costa Rica (UTC-6, sin horario de verano) = 16:00/16:30Z.
function freeSlot(half = false): { start: string; end: string } {
  const monday = Date.UTC(2031, 0, 6) + randomInt(0, 400) * 7 * 86_400_000
  const start = new Date(monday + (16 * 60 + (half ? 30 : 0)) * 60_000)
  return { start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() }
}

const newClient = () =>
  // Proyecto de pruebas: Supabase usa una CA que Node no trae por defecto.
  new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

const admin = newClient()
const requestIds: string[] = []
const directAppointmentIds: string[] = []

async function makeRequest(doctorId: string, slot: { start: string; end: string }, status: 'pending' | 'rejected' = 'pending') {
  const id = randomUUID()
  await admin.query(
    `insert into public.appointment_requests
       (id, doctor_id, patient_name, patient_email, requested_starts_at, requested_ends_at, status, idempotency_key, decided_at)
     values ($1, $2, 'Paciente Ficticio', $3, $4, $5, $6, $7, case when $6 = 'pending' then null else now() end)`,
    [id, doctorId, `t03-${id.slice(0, 8)}@example.com`, slot.start, slot.end, status, randomUUID()],
  )
  requestIds.push(id)
  return id
}

async function insertConfirmed(doctorId: string, slot: { start: string; end: string }, status = 'confirmed') {
  const id = randomUUID()
  await admin.query(
    `insert into public.appointments
       (id, doctor_id, patient_name, patient_email, starts_at, ends_at, status, source, idempotency_key, cancelled_at)
     values ($1, $2, 'Paciente Ficticio', $3, $4, $5, $6, 'admin_phone', $7, case when $6 = 'cancelled' then now() end)`,
    [id, doctorId, `t03-${id.slice(0, 8)}@example.com`, slot.start, slot.end, status, randomUUID()],
  )
  directAppointmentIds.push(id)
  return id
}

type Outcome =
  | { ok: true; appointmentId: string; status: string; already: boolean }
  | { ok: false; message: string; code?: string; detail?: string }

// Llama a la función como lo hará el backend: rol service_role, en su propia sesión y transacción.
async function approve(requestId: string, actor: string | null = null): Promise<Outcome> {
  const c = newClient()
  await c.connect()
  try {
    await c.query('begin')
    await c.query('set local role service_role')
    const r = await c.query(
      'select appointment_id, request_status, already_approved from public.approve_appointment_request($1, $2)',
      [requestId, actor],
    )
    await c.query('commit')
    const row = r.rows[0]
    return { ok: true, appointmentId: row.appointment_id, status: row.request_status, already: row.already_approved }
  } catch (e) {
    await c.query('rollback').catch(() => undefined)
    const err = e as { message: string; code?: string; detail?: string }
    return { ok: false, message: err.message, code: err.code, detail: err.detail }
  } finally {
    await c.end()
  }
}

const count = async (sql: string, params: unknown[]) => Number((await admin.query(sql, params)).rows[0].n)
const appointmentsForRequest = (id: string) =>
  count('select count(*) n from public.appointments where request_id = $1', [id])

beforeAll(async () => {
  await admin.connect()
  const fn = await admin.query(`select 1 from pg_proc where proname = 'approve_appointment_request'`)
  if (fn.rowCount === 0) throw new Error('La migración 20261123000000_booking_integrity.sql no está aplicada en el proyecto de pruebas.')
})

afterAll(async () => {
  try {
    const rows = await admin.query('select id from public.appointments where request_id = any($1::uuid[])', [requestIds])
    const apptIds = [...directAppointmentIds, ...rows.rows.map((r) => r.id as string)]
    await admin.query('delete from public.appointment_audit where request_id = any($1::uuid[]) or appointment_id = any($2::uuid[])', [requestIds, apptIds])
    // Las FK circulares son RESTRICT: se desenlazan las solicitudes aprobadas antes de borrar.
    await admin.query(
      `update public.appointment_requests
         set status = 'pending', appointment_id = null, decided_at = null, decided_by = null
       where id = any($1::uuid[]) and status = 'approved'`,
      [requestIds],
    )
    await admin.query('delete from public.appointments where id = any($1::uuid[])', [apptIds])
    await admin.query('delete from public.appointment_requests where id = any($1::uuid[])', [requestIds])
  } finally {
    await admin.end()
  }
})

describe('RB-05 · restricción de no superposición', () => {
  it('rechaza dos citas confirmadas en el mismo horario y odontólogo (23P01)', async () => {
    const s = freeSlot()
    await insertConfirmed(DOCTOR_1, s)
    await expect(insertConfirmed(DOCTOR_1, s)).rejects.toMatchObject({ code: '23P01' })
  })

  it('permite a dos odontólogos distintos citas simultáneas', async () => {
    const s = freeSlot()
    await insertConfirmed(DOCTOR_1, s)
    await expect(insertConfirmed(DOCTOR_2, s)).resolves.toBeTruthy()
  })

  it('permite bloques contiguos (rango semiabierto)', async () => {
    const a = freeSlot()
    const b = { start: a.end, end: new Date(Date.parse(a.end) + 30 * 60_000).toISOString() }
    await insertConfirmed(DOCTOR_1, a)
    await expect(insertConfirmed(DOCTOR_1, b)).resolves.toBeTruthy()
  })

  it('una cita cancelada libera el bloque', async () => {
    const s = freeSlot()
    await insertConfirmed(DOCTOR_1, s, 'cancelled')
    await expect(insertConfirmed(DOCTOR_1, s)).resolves.toBeTruthy()
  })

  it('las solicitudes pendientes no bloquean el horario (RB-11)', async () => {
    const s = freeSlot()
    await makeRequest(DOCTOR_1, s)
    await makeRequest(DOCTOR_1, s)
    await expect(insertConfirmed(DOCTOR_1, s)).resolves.toBeTruthy()
  })
})

describe('RB-12 · aprobación de solicitudes', () => {
  it('crea exactamente una cita enlazada, cambia la solicitud y audita (CA-09a)', async () => {
    const s = freeSlot()
    const req = await makeRequest(DOCTOR_1, s)
    const r = await approve(req)
    expect(r).toMatchObject({ ok: true, status: 'approved', already: false })

    const appt = (await admin.query('select * from public.appointments where request_id = $1', [req])).rows
    expect(appt).toHaveLength(1)
    expect(appt[0]).toMatchObject({ doctor_id: DOCTOR_1, status: 'confirmed', source: 'public_request' })
    expect(new Date(appt[0].starts_at).toISOString()).toBe(s.start)

    const reqRow = (await admin.query('select status, appointment_id, decided_at from public.appointment_requests where id = $1', [req])).rows[0]
    expect(reqRow.status).toBe('approved')
    expect(reqRow.appointment_id).toBe(appt[0].id)
    expect(reqRow.decided_at).not.toBeNull()

    const audit = await count('select count(*) n from public.appointment_audit where request_id = $1', [req])
    expect(audit).toBe(2)
  })

  it('aprobar de nuevo devuelve la misma cita sin duplicar (CA-09c)', async () => {
    const req = await makeRequest(DOCTOR_1, freeSlot())
    const first = await approve(req)
    const second = await approve(req)
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(second.appointmentId).toBe(first.appointmentId)
      expect(second.already).toBe(true)
    }
    expect(await appointmentsForRequest(req)).toBe(1)
    expect(await count('select count(*) n from public.appointment_audit where request_id = $1', [req])).toBe(2)
  })

  it('cinco aprobaciones concurrentes de la misma solicitud producen una sola cita (P-12)', async () => {
    const req = await makeRequest(DOCTOR_1, freeSlot())
    const results = await Promise.all(Array.from({ length: 5 }, () => approve(req)))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(new Set(results.map((r) => (r.ok ? r.appointmentId : ''))).size).toBe(1)
    expect(results.filter((r) => r.ok && !r.already)).toHaveLength(1)
    expect(await appointmentsForRequest(req)).toBe(1)
  })

  it('dos solicitudes distintas del mismo bloque: una gana y la otra recibe SLOT_UNAVAILABLE (CA-04b)', async () => {
    const s = freeSlot()
    const a = await makeRequest(DOCTOR_1, s)
    const b = await makeRequest(DOCTOR_1, s)
    const [ra, rb] = await Promise.all([approve(a), approve(b)])
    const oks = [ra, rb].filter((r) => r.ok)
    const fails = [ra, rb].filter((r) => !r.ok)
    expect(oks).toHaveLength(1)
    expect(fails).toHaveLength(1)
    expect(fails[0]).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE', code: 'P0001' })

    const loser = ra.ok ? b : a
    expect(await appointmentsForRequest(a) + await appointmentsForRequest(b)).toBe(1)
    const row = (await admin.query('select status, appointment_id from public.appointment_requests where id = $1', [loser])).rows[0]
    expect(row).toMatchObject({ status: 'pending', appointment_id: null }) // D-10: sigue pendiente
  })

  it('horario ya ocupado: falla sin crear cita y la solicitud sigue pendiente (P-13)', async () => {
    const s = freeSlot()
    await insertConfirmed(DOCTOR_1, s)
    const req = await makeRequest(DOCTOR_1, s)
    expect(await approve(req)).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE', detail: 'overlapping_confirmed_appointment' })
    expect(await appointmentsForRequest(req)).toBe(0)
    const row = (await admin.query('select status from public.appointment_requests where id = $1', [req])).rows[0]
    expect(row.status).toBe('pending')
    expect(await count('select count(*) n from public.appointment_audit where request_id = $1', [req])).toBe(0)
  })

  it('odontólogos distintos pueden aprobar el mismo bloque', async () => {
    const s = freeSlot()
    const a = await makeRequest(DOCTOR_1, s)
    const b = await makeRequest(DOCTOR_2, s)
    const [ra, rb] = await Promise.all([approve(a), approve(b)])
    expect(ra.ok && rb.ok).toBe(true)
  })

  it('una solicitud rechazada devuelve REQUEST_ALREADY_DECIDED', async () => {
    const req = await makeRequest(DOCTOR_1, freeSlot(), 'rejected')
    expect(await approve(req)).toMatchObject({ ok: false, message: 'REQUEST_ALREADY_DECIDED' })
    expect(await appointmentsForRequest(req)).toBe(0)
  })

  it('un horario pasado devuelve REQUEST_EXPIRED (D-06)', async () => {
    const past = { start: '2024-01-08T16:00:00.000Z', end: '2024-01-08T16:30:00.000Z' } // lunes
    const req = await makeRequest(DOCTOR_1, past)
    expect(await approve(req)).toMatchObject({ ok: false, message: 'REQUEST_EXPIRED' })
    expect(await appointmentsForRequest(req)).toBe(0)
  })

  it('fuera de la franja semanal devuelve SLOT_UNAVAILABLE (CA-09e)', async () => {
    const sunday = { start: '2031-01-05T16:00:00.000Z', end: '2031-01-05T16:30:00.000Z' }
    const req = await makeRequest(DOCTOR_1, sunday)
    expect(await approve(req)).toMatchObject({ ok: false, message: 'SLOT_UNAVAILABLE', detail: 'outside_weekly_schedule' })
    expect(await appointmentsForRequest(req)).toBe(0)
  })

  it('una solicitud inexistente devuelve NOT_FOUND', async () => {
    expect(await approve(randomUUID())).toMatchObject({ ok: false, message: 'NOT_FOUND' })
  })
})

describe('privilegios de la función', () => {
  it.each(['anon', 'authenticated'])('%s no puede ejecutar approve_appointment_request', async (role) => {
    const c = newClient()
    await c.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${role}`)
      await expect(c.query('select * from public.approve_appointment_request($1, null)', [randomUUID()])).rejects.toMatchObject({ code: '42501' })
    } finally {
      await c.query('rollback').catch(() => undefined)
      await c.end()
    }
  })
})
