import type { VercelRequest, VercelResponse } from '@vercel/node'
import { permissionsFor } from '../../shared/permissions.js'
import { sendError, withStaff } from '../_lib/staff-auth.js'

/**
 * GET /api/admin/me — identifica al personal autenticado (cualquier rol de staff).
 * Devuelve rol, nombre y permisos para que la interfaz muestre solo las opciones permitidas.
 * La interfaz NO decide la autorización: cada API administrativa vuelve a comprobarla aquí en el servidor.
 */
export default withStaff('staff', (request: VercelRequest, response: VercelResponse, staff) => {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendError(response, { status: 405, code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' })
  }
  response.status(200).json({
    role: staff.role,
    displayName: staff.displayName,
    permissions: permissionsFor(staff.role),
  })
})
