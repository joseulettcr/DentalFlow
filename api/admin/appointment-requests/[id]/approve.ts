import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guarded, requireMethod, sendOutcome } from '../../../_lib/http.js'
import { approveRequest } from '../../../_lib/requests-service.js'
import { withStaff } from '../../../_lib/staff-auth.js'
import { createRpc } from '../../../_lib/supabase-rest.js'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/** POST /api/admin/appointment-requests/:id/approve — delega en la función PostgreSQL approve_appointment_request (RB-12). */
export default withStaff('requests.decide', async (request: VercelRequest, response: VercelResponse, staff) => {
  if (!requireMethod(request, response, 'POST')) return
  await guarded(response, async () => sendOutcome(response, await approveRequest(createRpc(), first(request.query.id), staff.userId)))
})
