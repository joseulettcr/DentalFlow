import type { Permission, StaffRole } from '../../shared/permissions'

export interface StaffProfile {
  role: StaffRole
  displayName: string
  permissions: Permission[]
}

export type StaffProfileResult =
  | { kind: 'ok'; profile: StaffProfile }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'unavailable' }

/** Pregunta al BACKEND quién es el usuario y qué rol tiene (el servidor valida el token y consulta staff_profiles). */
export async function fetchStaffProfile(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<StaffProfileResult> {
  try {
    const response = await fetchImpl('/api/admin/me', { headers: { Authorization: `Bearer ${accessToken}` } })
    if (response.status === 401) return { kind: 'unauthenticated' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = (await response.json()) as StaffProfile
    return { kind: 'ok', profile: body }
  } catch {
    return { kind: 'unavailable' }
  }
}
