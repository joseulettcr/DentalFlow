import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createDoctor, listAdminDoctors } from '../../_lib/doctors-admin-service.js'
import { failure, guarded, sendJsonError, sendOutcome } from '../../_lib/http.js'
import { withStaff } from '../../_lib/staff-auth.js'
import { createRestGet, createRpc } from '../../_lib/supabase-rest.js'

/**
 * GET  /api/admin/doctors — todos los odontólogos con su horario (módulo exclusivo de `admin`).
 * POST /api/admin/doctors — alta: activo y con el horario predeterminado (CA-02a).
 * Permiso `doctors.write`: un `receptionist` recibe 403 (CA-02e).
 */
export default withStaff('doctors.write', async (request: VercelRequest, response: VercelResponse) => {
  if (request.method === 'GET') {
    return guarded(response, async () => sendOutcome(response, await listAdminDoctors(createRestGet())))
  }
  if (request.method === 'POST') {
    return guarded(response, async () => sendOutcome(response, await createDoctor(createRestGet(), createRpc(), request.body)))
  }
  response.setHeader('Allow', 'GET, POST')
  return sendJsonError(response, failure(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.'))
})
