// P-10 (spec.md §9): el rol anónimo no accede a pacientes ni solicitudes por la Data API.
//
// Prueba de integración de SOLO LECTURA contra un proyecto Supabase Cloud de pruebas.
// Solo envía peticiones GET con la clave pública (anon / publishable). No escribe datos
// y no usa ni acepta la clave service_role.
//
// Variables (en .env.local o en el shell):
//   VITE_SUPABASE_URL       https://<ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY  clave anon (JWT) o publishable (sb_publishable_...)
//
// Ejecutar: npm run test:p10
import { beforeAll, describe, expect, it } from 'vitest'

const rawUrl = process.env.VITE_SUPABASE_URL?.trim()
const apiKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()

const missing = [
  !rawUrl && 'VITE_SUPABASE_URL',
  !apiKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean)

if (missing.length > 0) {
  // Falla de forma visible: un P-10 omitido en silencio parecería una prueba superada.
  throw new Error(
    `P-10 no se puede ejecutar: faltan ${missing.join(' y ')}. ` +
      'Defínelas en .env.local (ver supabase/README.md, "Prueba P-10"). ' +
      'Solo se necesita la clave pública anon; nunca la service_role.',
  )
}

const baseUrl = rawUrl!.replace(/\/+$/, '')
const key = apiKey!

function jwtRole(token: string): string | undefined {
  const part = token.split('.')[1]
  if (!part) return undefined
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { role?: string }
    return payload.role
  } catch {
    return undefined
  }
}

async function dataApiGet(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers },
  })
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* cuerpo no JSON */
  }
  return { status: res.status, body }
}

// Una respuesta con filas (aunque sea [] vacío con 200) significa que el rol anon pudo consultar.
function expectDenied(r: { status: number; body: unknown }) {
  expect([401, 403], `HTTP ${r.status}: ${JSON.stringify(r.body)}`).toContain(r.status)
  expect(Array.isArray(r.body)).toBe(false)
}

describe('P-10 · rol anónimo vía Supabase Data API', () => {
  beforeAll(() => {
    // Salvaguardas: esta prueba debe correr siempre como anon, nunca con privilegios elevados.
    expect(key.startsWith('sb_secret_'), 'Se recibió una clave secreta; usa la clave pública').toBe(false)
    const role = jwtRole(key)
    if (role !== undefined) expect(role, 'La clave no es del rol anon').toBe('anon')
  })

  it('control: la URL y la clave son válidas (Auth responde 200)', async () => {
    const r = await dataApiGet('/auth/v1/health')
    expect(r.status, `Si no es 200, la URL o la clave están mal; no se puede concluir nada: ${JSON.stringify(r.body)}`).toBe(200)
  })

  it.each(['appointments', 'appointment_requests'])('anon NO puede consultar %s', async (table) => {
    expectDenied(await dataApiGet(`/rest/v1/${table}?select=*&limit=1`))
  })

  it.each([
    ['appointments', 'patient_email'],
    ['appointment_requests', 'patient_email'],
  ])('anon NO puede leer la columna %s.%s', async (table, column) => {
    expectDenied(await dataApiGet(`/rest/v1/${table}?select=${column}&limit=1`))
  })

  it.each(['appointments', 'appointment_requests'])('anon NO puede contar filas de %s', async (table) => {
    expectDenied(await dataApiGet(`/rest/v1/${table}?select=id`, { Prefer: 'count=exact', Range: '0-0' }))
  })

  it('anon NO accede al esquema private por la Data API', async () => {
    const r = await dataApiGet('/rest/v1/google_connections?select=*&limit=1', { 'Accept-Profile': 'private' })
    expect(r.status, `HTTP ${r.status}: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400)
    expect(Array.isArray(r.body)).toBe(false)
  })
})
