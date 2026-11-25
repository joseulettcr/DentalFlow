import { isUuid } from '../../shared/request-validation.js'
import { failure, mapDomainError, type Outcome } from './http.js'
import type { Rpc } from './supabase-rest.js'

// Cancelar o completar una cita (CA-05b, CA-05c, RB-06). Las transiciones y la auditoría viven en la función
// PostgreSQL change_appointment_status (atómica, con la fila bloqueada); aquí solo se valida la entrada y se traducen los códigos.

export const STATUS_ACTIONS = ['cancel', 'complete'] as const
export type StatusAction = (typeof STATUS_ACTIONS)[number]

export interface StatusChangeBody {
  appointmentId: string
  status: 'cancelled' | 'completed'
  /** true si la cita ya estaba en ese estado (operación repetida: no se cambió ni auditó nada). */
  alreadyInState: boolean
}

export async function changeAppointmentStatus(
  rpc: Rpc,
  appointmentId: string,
  actorUserId: string,
  body: unknown,
): Promise<Outcome<StatusChangeBody>> {
  if (!isUuid(appointmentId)) return failure(422, 'VALIDATION_ERROR', 'El identificador de la cita no es válido.')
  const action = typeof body === 'object' && body !== null ? (body as { action?: unknown }).action : undefined
  if (typeof action !== 'string' || !(STATUS_ACTIONS as readonly string[]).includes(action)) {
    return failure(422, 'VALIDATION_ERROR', 'La acción debe ser "cancel" o "complete".')
  }

  const result = await rpc('change_appointment_status', {
    p_appointment_id: appointmentId,
    p_action: action,
    p_actor_user_id: actorUserId,
  })
  if (!result.ok) return mapDomainError(result)
  const row = (result.data as Array<{ appointment_status: 'cancelled' | 'completed'; already_in_state: boolean }>)[0]
  return { ok: true, status: 200, body: { appointmentId, status: row.appointment_status, alreadyInState: row.already_in_state } }
}
