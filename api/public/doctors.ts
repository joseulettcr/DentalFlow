import type { VercelRequest, VercelResponse } from '@vercel/node'
import { listActiveDoctors } from '../_lib/availability-service.js'
import { sendError } from '../_lib/staff-auth.js'
import { ServiceUnavailableError, createRestGet } from '../_lib/supabase-rest.js'

/** GET /api/public/doctors — odontólogos activos y su horario semanal; sin contactos ni datos de pacientes. */
export default async function doctors(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendError(response, { status: 405, code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' })
  }
  try {
    const list = await listActiveDoctors(createRestGet())
    response.setHeader('Cache-Control', 'no-store')
    response.status(200).json({ doctors: list })
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return sendError(response, { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible. Intenta de nuevo en unos minutos.' })
    }
    throw error
  }
}
