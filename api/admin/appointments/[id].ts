import type { VercelRequest, VercelResponse } from '@vercel/node'
import { changeAppointmentStatus } from '../../_lib/appointment-status-service.js'
import { failure, guarded, sendJsonError, sendOutcome } from '../../_lib/http.js'
import { withStaff } from '../../_lib/staff-auth.js'
import { createRpc } from '../../_lib/supabase-rest.js'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/** PATCH /api/admin/appointments/:id — body { action: "cancel" | "complete" }; permiso `appointments.cancel_complete`. */
const patch = withStaff('appointments.cancel_complete', async (request: VercelRequest, response: VercelResponse, staff) => {
  await guarded(response, async () =>
    sendOutcome(response, await changeAppointmentStatus(createRpc(), first(request.query.id), staff.userId, request.body)),
  )
})

export default function appointmentById(request: VercelRequest, response: VercelResponse) {
  if (request.method === 'PATCH') return patch(request, response)
  response.setHeader('Allow', 'PATCH')
  return sendJsonError(response, failure(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.'))
}
