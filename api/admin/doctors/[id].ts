import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setDoctorSchedule, updateDoctor } from '../../_lib/doctors-admin-service.js'
import { failure, guarded, sendJsonError, sendOutcome } from '../../_lib/http.js'
import { withStaff } from '../../_lib/staff-auth.js'
import { createRestGet, createRpc } from '../../_lib/supabase-rest.js'

// Una sola función atiende dos rutas (el plan de Vercel limita la cantidad de funciones). vercel.json reescribe
//   /api/admin/doctors/:id/schedules  ->  /api/admin/doctors/:id?part=schedules
//   PATCH /api/admin/doctors/:id            datos y activación (CA-02c)
//   PUT   /api/admin/doctors/:id/schedules  horario semanal completo (CA-02b, CA-02d)
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

export default withStaff('doctors.write', async (request: VercelRequest, response: VercelResponse) => {
  const id = first(request.query.id)
  const part = first(request.query.part)

  if (part === '') {
    if (request.method !== 'PATCH') {
      response.setHeader('Allow', 'PATCH')
      return sendJsonError(response, failure(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.'))
    }
    return guarded(response, async () => sendOutcome(response, await updateDoctor(createRestGet(), createRpc(), id, request.body)))
  }

  if (part === 'schedules') {
    if (request.method !== 'PUT') {
      response.setHeader('Allow', 'PUT')
      return sendJsonError(response, failure(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.'))
    }
    return guarded(response, async () => sendOutcome(response, await setDoctorSchedule(createRpc(), id, request.body)))
  }

  return sendJsonError(response, failure(404, 'NOT_FOUND', 'Ruta no encontrada.'))
})
