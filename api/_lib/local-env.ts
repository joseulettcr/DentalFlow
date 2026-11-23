import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

let attempted = false

/**
 * Desarrollo local: `vercel dev` (con el proyecto enlazado) no pasa `.env.local` a las Vercel Functions,
 * aunque Vite sí lo lee para el navegador. Se completan SOLO las variables que falten; nunca se sobrescribe
 * una variable ya definida. En Vercel (preview/producción) las variables vienen de la configuración del
 * proyecto y no se lee ningún archivo. No se registra ningún valor.
 */
export function ensureLocalEnv(): void {
  if (attempted) return
  attempted = true
  if (process.env.VITEST) return // las pruebas controlan su propio entorno
  if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') return
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  try {
    process.loadEnvFile(file)
  } catch {
    /* archivo ilegible: se sigue con el entorno actual */
  }
}
