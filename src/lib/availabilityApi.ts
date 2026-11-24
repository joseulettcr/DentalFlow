export interface DoctorOption {
  id: string
  fullName: string
  specialty: string | null
  weeklySchedule: Array<{ weekday: number; startTime: string; endTime: string }>
}

export interface SlotItem {
  startAt: string
  endAt: string
}

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'validation'; message: string }
  | { kind: 'unavailable' }

async function getJson<T>(url: string, pick: (body: unknown) => T, fetchImpl: typeof fetch): Promise<ApiResult<T>> {
  try {
    const response = await fetchImpl(url)
    if (response.status === 422) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
      return { kind: 'validation', message: body?.error?.message ?? 'La consulta no es válida.' }
    }
    if (!response.ok) return { kind: 'unavailable' }
    return { kind: 'ok', data: pick(await response.json()) }
  } catch {
    return { kind: 'unavailable' }
  }
}

export function fetchDoctors(fetchImpl: typeof fetch = fetch): Promise<ApiResult<DoctorOption[]>> {
  return getJson('/api/public/doctors', (body) => (body as { doctors: DoctorOption[] }).doctors, fetchImpl)
}

export function fetchSlots(doctorId: string, date: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<SlotItem[]>> {
  const query = new URLSearchParams({ doctorId, date })
  return getJson(`/api/public/slots?${query}`, (body) => (body as { slots: SlotItem[] }).slots, fetchImpl)
}

export interface RequestPayload {
  doctorId: string
  patientName: string
  patientEmail: string
  patientPhone: string
  startAt: string
  idempotencyKey: string
}

export interface CreatedRequest {
  requestId: string
  doctorName: string
  startsAt: string
  endsAt: string
}

export type SubmitResult =
  | { kind: 'ok'; replayed: boolean; request: CreatedRequest }
  | { kind: 'validation'; message: string }
  | { kind: 'conflict'; code: string; message: string }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }

/** POST público: crea una SOLICITUD pendiente (no una cita). */
export async function submitRequest(payload: RequestPayload, fetchImpl: typeof fetch = fetch): Promise<SubmitResult> {
  try {
    const response = await fetchImpl('/api/public/appointment-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, patientPhone: payload.patientPhone.trim() === '' ? undefined : payload.patientPhone }),
    })
    const body = (await response.json().catch(() => null)) as
      | (CreatedRequest & { status?: string })
      | { error?: { code?: string; message?: string } }
      | null
    if (response.status === 201 || response.status === 200) {
      return { kind: 'ok', replayed: response.status === 200, request: body as CreatedRequest }
    }
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error
    if (response.status === 422) return { kind: 'validation', message: error?.message ?? 'Revisa los datos ingresados.' }
    if (response.status === 409) return { kind: 'conflict', code: error?.code ?? 'CONFLICT', message: error?.message ?? 'No se pudo registrar la solicitud.' }
    if (response.status === 429) return { kind: 'rate_limited' }
    return { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}
