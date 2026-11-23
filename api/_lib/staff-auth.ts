import type { VercelRequest, VercelResponse } from '@vercel/node'
import { can, isStaffRole, type Permission, type StaffRole } from '../../shared/permissions.js'
import { ensureLocalEnv } from './local-env.js'

// Autenticación y autorización del personal en el SERVIDOR (spec.md §1, CA-01b, CA-01c).
//   1. El token (Authorization: Bearer <access_token>) se valida contra Supabase Auth en cada petición.
//   2. El rol sale de public.staff_profiles, consultado con service_role solo desde aquí.
//   3. La acción solicitada debe estar permitida para ese rol según la matriz compartida.
// Códigos: 401 UNAUTHENTICATED, 403 FORBIDDEN, 503 SERVICE_UNAVAILABLE. Nunca se devuelven detalles internos.

export interface StaffContext {
  userId: string
  role: StaffRole
  displayName: string
}

export type StaffAuthFailure = {
  ok: false
  status: 401 | 403 | 503
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVICE_UNAVAILABLE'
  message: string
}

export type StaffAuthResult = { ok: true; staff: StaffContext } | StaffAuthFailure

const TIMEOUT_MS = 5000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (status: StaffAuthFailure['status'], code: StaffAuthFailure['code'], message: string): StaffAuthFailure => ({
  ok: false,
  status,
  code,
  message,
})

const unauthenticated = () => fail(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.')
const forbidden = () => fail(403, 'FORBIDDEN', 'Tu cuenta no tiene permiso para esta acción.')
const unavailable = () => fail(503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible. Intenta de nuevo en unos minutos.')

function readBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header
  const match = /^Bearer\s+(\S+)$/i.exec(value ?? '')
  return match ? match[1] : null
}

export async function authorizeStaff(
  authorizationHeader: string | string[] | undefined,
  permission: Permission | 'staff',
): Promise<StaffAuthResult> {
  const token = readBearerToken(authorizationHeader)
  if (!token) return unauthenticated()

  ensureLocalEnv()
  const url = process.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !anonKey || !serviceKey) return unavailable()

  try {
    // (1) Token válido y no revocado: lo confirma Supabase Auth.
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (userResponse.status >= 500) return unavailable()
    if (!userResponse.ok) return unauthenticated()
    const user = (await userResponse.json()) as { id?: unknown }
    if (typeof user.id !== 'string' || !UUID.test(user.id)) return unauthenticated()

    // (2) Perfil de personal: sin fila => 403 (autenticado pero no es personal).
    const profileResponse = await fetch(
      `${url}/rest/v1/staff_profiles?select=role,display_name&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )
    if (!profileResponse.ok) return unavailable()
    const rows = (await profileResponse.json()) as Array<{ role?: unknown; display_name?: unknown }>
    const profile = Array.isArray(rows) ? rows[0] : undefined
    if (!profile || !isStaffRole(profile.role)) return forbidden()

    // (3) Matriz de permisos.
    // 'staff' = cualquier personal con perfil válido (p. ej. /api/admin/me); el resto exige la acción concreta.
    if (permission !== 'staff' && !can(profile.role, permission)) return forbidden()

    return {
      ok: true,
      staff: {
        userId: user.id,
        role: profile.role,
        displayName: typeof profile.display_name === 'string' ? profile.display_name : '',
      },
    }
  } catch {
    // Red caída, tiempo agotado o respuesta no JSON: es un fallo del servicio, no una credencial inválida.
    return unavailable()
  }
}

export function sendError(response: VercelResponse, failure: { status: number; code: string; message: string }) {
  response.status(failure.status).json({ error: { code: failure.code, message: failure.message } })
}

/** Envuelve un handler administrativo: el handler solo se ejecuta con personal autorizado para `permission`. */
export function withStaff(
  permission: Permission | 'staff',
  handler: (request: VercelRequest, response: VercelResponse, staff: StaffContext) => void | Promise<void>,
) {
  return async (request: VercelRequest, response: VercelResponse) => {
    const result = await authorizeStaff(request.headers.authorization, permission)
    if (!result.ok) return sendError(response, result)
    response.setHeader('Cache-Control', 'no-store')
    return handler(request, response, result.staff)
  }
}
