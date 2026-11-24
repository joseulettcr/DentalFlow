import { createHmac } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ServiceUnavailableError } from './supabase-rest.js'

export interface Failure {
  ok: false
  status: number
  code: string
  message: string
}
export type Outcome<T> = { ok: true; status: 200 | 201; body: T } | Failure

export const failure = (status: number, code: string, message: string): Failure => ({ ok: false, status, code, message })

/** Códigos de error de dominio de las funciones SQL → HTTP (spec.md §8). */
export function mapDomainError(error: { code: string; message: string }): Failure {
  if (error.code.startsWith('23')) return failure(422, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.') // CHECK/UNIQUE de la tabla
  switch (error.message) {
    case 'SLOT_UNAVAILABLE':
      return failure(409, 'SLOT_UNAVAILABLE', 'Ese horario ya no está disponible.')
    case 'IDEMPOTENCY_KEY_REUSED':
      return failure(409, 'IDEMPOTENCY_KEY_REUSED', 'Esa clave de solicitud ya se usó con datos distintos.')
    case 'REQUEST_ALREADY_DECIDED':
      return failure(409, 'REQUEST_ALREADY_DECIDED', 'La solicitud ya fue decidida.')
    case 'REQUEST_EXPIRED':
      return failure(409, 'REQUEST_EXPIRED', 'El horario solicitado ya pasó.')
    case 'NOT_FOUND':
      return failure(404, 'NOT_FOUND', 'No se encontró la solicitud.')
    case 'VALIDATION_ERROR':
      return failure(422, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.')
    case 'RATE_LIMITED':
      return failure(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intenta de nuevo más tarde.')
    default:
      throw new ServiceUnavailableError('unmapped_domain_error')
  }
}

export function sendJsonError(response: VercelResponse, f: Pick<Failure, 'status' | 'code' | 'message'>) {
  response.status(f.status).json({ error: { code: f.code, message: f.message } })
}

export function sendOutcome<T>(response: VercelResponse, outcome: Outcome<T>) {
  if (!outcome.ok) return sendJsonError(response, outcome)
  response.setHeader('Cache-Control', 'no-store')
  response.status(outcome.status).json(outcome.body)
}

/** Ejecuta un handler y convierte un fallo de Supabase en 503 sin filtrar detalles. */
export async function guarded(response: VercelResponse, run: () => Promise<void>) {
  try {
    await run()
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return sendJsonError(response, failure(503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible. Intenta de nuevo en unos minutos.'))
    }
    return sendJsonError(response, failure(500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado.'))
  }
}

export function requireMethod(request: VercelRequest, response: VercelResponse, method: 'GET' | 'POST'): boolean {
  if (request.method === method) return true
  response.setHeader('Allow', method)
  sendJsonError(response, failure(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.'))
  return false
}

/** Clave anonimizada del cliente para el límite de uso: HMAC de la IP; la IP nunca se guarda en claro (CA-08e). */
export function clientKeyHash(request: VercelRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  const real = request.headers['x-real-ip']
  const ip = raw || (Array.isArray(real) ? real[0] : real) || request.socket?.remoteAddress || 'unknown'
  const secret = process.env.RATE_LIMIT_SALT?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'dentalflow-dev'
  return createHmac('sha256', secret).update(ip).digest('hex')
}
