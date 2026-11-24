import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientKeyHash, guarded, requireMethod, sendOutcome } from '../_lib/http.js'
import { createPublicRequest } from '../_lib/requests-service.js'
import { createRestGet, createRpc } from '../_lib/supabase-rest.js'

/**
 * POST /api/public/appointment-requests — solicitud pública de cita (RF-08). Crea una solicitud `pending`;
 * NO crea cita ni bloquea el horario. La respuesta nunca incluye datos del paciente.
 */
export default async function appointmentRequests(request: VercelRequest, response: VercelResponse) {
  if (!requireMethod(request, response, 'POST')) return
  await guarded(response, async () => {
    const outcome = await createPublicRequest(
      { rest: createRestGet(), rpc: createRpc(), now: new Date(), clientHash: clientKeyHash(request) },
      request.body,
    )
    sendOutcome(response, outcome)
  })
}
