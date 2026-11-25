import { supabase } from './supabase'

export interface RequestItem {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  doctorName: string
  patientName: string
  patientEmail: string
  patientPhone: string | null
  startsAt: string
  endsAt: string
  appointmentId: string | null
}

export interface AppointmentItem {
  id: string
  doctorName: string
  patientName: string
  patientEmail: string
  startsAt: string
  endsAt: string
  source: string
}

export type AdminResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'error'; status: number; code: string; message?: string }
  | { kind: 'unavailable' }

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<AdminResult<T>> {
  if (!supabase) return { kind: 'unavailable' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { kind: 'error', status: 401, code: 'UNAUTHENTICATED' }
  try {
    const response = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
    })
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    if (response.ok) return { kind: 'ok', data: body as T }
    if (response.status >= 500) return { kind: 'unavailable' }
    return { kind: 'error', status: response.status, code: body?.error?.code ?? 'ERROR', message: body?.error?.message }
  } catch {
    return { kind: 'unavailable' }
  }
}

export const listPendingRequests = () =>
  adminFetch<{ requests: RequestItem[] }>('/api/admin/appointment-requests?status=pending')

export const listUpcomingAppointments = () => adminFetch<{ appointments: AppointmentItem[] }>('/api/admin/appointments')

export const approveRequest = (id: string) =>
  adminFetch<{ appointmentId: string; alreadyApproved: boolean }>(`/api/admin/appointment-requests/${id}/approve`, { method: 'POST' })

export const rejectRequest = (id: string, reason: string) =>
  adminFetch<{ alreadyRejected: boolean }>(`/api/admin/appointment-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(reason.trim() === '' ? {} : { reason: reason.trim() }),
  })

export interface PhoneAppointmentPayload {
  doctorId: string
  patientName: string
  patientEmail: string
  patientPhone: string
  startAt: string
  idempotencyKey: string
}

export interface CreatedAppointment {
  appointmentId: string
  doctorName: string
  startsAt: string
  endsAt: string
}

/** Reserva telefónica directa: la cita queda confirmada de inmediato. El servidor decide origen y autor. */
export const createPhoneAppointment = (payload: PhoneAppointmentPayload) =>
  adminFetch<CreatedAppointment>('/api/admin/appointments', {
    method: 'POST',
    body: JSON.stringify({ ...payload, patientPhone: payload.patientPhone.trim() === '' ? undefined : payload.patientPhone }),
  })

/** Confirmadas cuya hora de fin ya pasó: candidatas a marcarse como completadas. */
export const listCompletableAppointments = () =>
  adminFetch<{ appointments: AppointmentItem[] }>('/api/admin/appointments?scope=completable')

export type StatusAction = 'cancel' | 'complete'

/** Cancela o completa una cita. Las transiciones y la auditoría las decide el servidor (PostgreSQL). */
export const changeAppointmentStatus = (id: string, action: StatusAction) =>
  adminFetch<{ appointmentId: string; status: 'cancelled' | 'completed'; alreadyInState: boolean }>(`/api/admin/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  })
