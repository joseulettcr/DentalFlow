import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guarded, sendJsonError, sendOutcome, failure } from '../_lib/http.js'
import { createPhoneAppointment } from '../_lib/phone-booking-service.js'
import { listCompletableAppointments, listUpcomingAppointments } from '../_lib/requests-service.js'
import { withStaff } from '../_lib/staff-auth.js'
import { createRestGet, createRpc } from '../_lib/supabase-rest.js'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/**
 * GET: citas confirmadas (permiso `appointments.read`). Sin parámetros: las próximas (comportamiento original).
 * `?scope=completable`: confirmadas cuya hora de fin ya pasó (candidatas a completar).
 */
const list = withStaff('appointments.read', async (request: VercelRequest, response: VercelResponse) => {
  const scope = first(request.query.scope)
  if (scope !== '' && scope !== 'upcoming' && scope !== 'completable') {
    return sendJsonError(response, failure(422, 'VALIDATION_ERROR', 'El parámetro scope debe ser upcoming o completable.'))
  }
  await guarded(response, async () =>
    sendOutcome(response, scope === 'completable'
      ? await listCompletableAppointments(createRestGet(), new Date())
      : await listUpcomingAppointments(createRestGet(), new Date())),
  )
})

/** POST: reserva telefónica directa, confirmada de inmediato (permiso `appointments.create_phone`). El permiso se exige por método. */
const create = withStaff('appointments.create_phone', async (request: VercelRequest, response: VercelResponse, staff) => {
  await guarded(response, async () =>
    sendOutcome(response, await createPhoneAppointment({ rest: createRestGet(), rpc: createRpc(), now: new Date() }, staff.userId, request.body)),
  )
})

export default function appointments(request: VercelRequest, response: VercelResponse) {
  if (request.method === 'GET') return list(request, response)
  if (request.method === 'POST') return create(request, response)
  response.setHeader('Allow', 'GET, POST')
  return sendJsonError(response, failure(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.'))
}
