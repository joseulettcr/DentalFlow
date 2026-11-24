import { ensureLocalEnv } from './local-env.js'

export class ServiceUnavailableError extends Error {}

/** Función de solo lectura: recibe la ruta de PostgREST y devuelve el JSON. Solo existe GET. */
export type RestGet = (path: string) => Promise<unknown>

/** Lector PostgREST con service_role. Se usa solo en el servidor; nunca se expone al navegador. */
export function createRestGet(): RestGet {
  ensureLocalEnv()
  const url = process.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return async (path) => {
    if (!url || !serviceKey) throw new ServiceUnavailableError('missing_env')
    try {
      const response = await fetch(`${url}/rest/v1/${path}`, {
        method: 'GET',
        headers: { apikey: serviceKey },
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new ServiceUnavailableError(`status_${response.status}`)
      return await response.json()
    } catch (error) {
      throw error instanceof ServiceUnavailableError ? error : new ServiceUnavailableError('network')
    }
  }
}

export type RpcResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string; details: string | null }

/** Llama a una función de PostgreSQL por RPC (solo service_role). Errores de dominio (P0001, restricciones) vuelven como ok:false. */
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>

// Errores que significan "regla de negocio incumplida" y no "servicio roto".
const DOMAIN_ERROR = /^(P0001|23\d{3})$/

export function createRpc(): Rpc {
  ensureLocalEnv()
  const url = process.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return async (name, args) => {
    if (!url || !serviceKey) throw new ServiceUnavailableError('missing_env')
    let response: Response
    try {
      response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      throw new ServiceUnavailableError('network')
    }
    if (response.ok) {
      try {
        return { ok: true, data: await response.json() }
      } catch {
        throw new ServiceUnavailableError('bad_json')
      }
    }
    const body = (await response.json().catch(() => null)) as { code?: string; message?: string; details?: string | null } | null
    if (response.status < 500 && body?.code && DOMAIN_ERROR.test(body.code)) {
      return { ok: false, code: body.code, message: body.message ?? '', details: body.details ?? null }
    }
    // Función inexistente (migración sin aplicar), permisos o fallo del servicio: no es un error del usuario.
    throw new ServiceUnavailableError(`rpc_${response.status}`)
  }
}
