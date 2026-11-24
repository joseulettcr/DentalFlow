import type { VercelRequest, VercelResponse } from '@vercel/node'
import { listSlots } from '../_lib/availability-service.js'
import { sendError } from '../_lib/staff-auth.js'
import { ServiceUnavailableError, createRestGet } from '../_lib/supabase-rest.js'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/** GET /api/public/slots?doctorId=UUID&date=YYYY-MM-DD — horas libres (solo lectura). */
export default async function slots(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendError(response, { status: 405, code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' })
  }
  try {
    const result = await listSlots(createRestGet(), {
      doctorId: first(request.query.doctorId),
      date: first(request.query.date),
      now: new Date(),
    })
    if (!result.ok) return sendError(response, result)
    response.setHeader('Cache-Control', 'no-store')
    response.status(200).json({ doctorId: result.doctorId, date: result.date, slots: result.slots })
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return sendError(response, { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible. Intenta de nuevo en unos minutos.' })
    }
    throw error
  }
}
