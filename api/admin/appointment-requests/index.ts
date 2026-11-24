import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guarded, requireMethod, sendOutcome } from '../../_lib/http.js'
import { listRequests } from '../../_lib/requests-service.js'
import { withStaff } from '../../_lib/staff-auth.js'
import { createRestGet } from '../../_lib/supabase-rest.js'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/** GET /api/admin/appointment-requests?status=pending|approved|rejected|all — personal con permiso `requests.decide`. */
export default withStaff('requests.decide', async (request: VercelRequest, response: VercelResponse) => {
  if (!requireMethod(request, response, 'GET')) return
  await guarded(response, async () => sendOutcome(response, await listRequests(createRestGet(), first(request.query.status))))
})
