import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guarded, requireMethod, sendOutcome } from '../_lib/http.js'
import { listUpcomingAppointments } from '../_lib/requests-service.js'
import { withStaff } from '../_lib/staff-auth.js'
import { createRestGet } from '../_lib/supabase-rest.js'

/** GET /api/admin/appointments — citas confirmadas próximas (personal con permiso `appointments.read`). */
export default withStaff('appointments.read', async (request: VercelRequest, response: VercelResponse) => {
  if (!requireMethod(request, response, 'GET')) return
  await guarded(response, async () => sendOutcome(response, await listUpcomingAppointments(createRestGet(), new Date())))
})
