import { describe, expect, it, vi } from 'vitest'
import { resolveGuard } from '../../src/auth/guard'
import { classifySignInError } from '../../src/auth/messages'
import { fetchStaffProfile } from '../../src/lib/staffApi'

describe('resolveGuard (CA-01b)', () => {
  it('sin sesión, cualquier ruta /admin/* (también escrita a mano) redirige a /login', () => {
    for (const path of ['/admin', '/admin/citas', '/admin/solicitudes', '/admin/nueva-cita', '/admin/odontologos', '/admin/configuracion', '/admin/inventada']) {
      expect(resolveGuard(path, 'signed-out')).toEqual({ kind: 'redirect', to: '/login' })
    }
  })
  it('mientras se verifica la sesión muestra carga, no contenido protegido', () => {
    expect(resolveGuard('/admin/citas', 'loading')).toEqual({ kind: 'loading' })
    expect(resolveGuard('/login', 'loading')).toEqual({ kind: 'loading' })
  })
  it('personal autorizado entra al panel y /login lo envía al panel', () => {
    expect(resolveGuard('/admin/citas', 'authorized')).toEqual({ kind: 'render' })
    expect(resolveGuard('/login', 'authorized')).toEqual({ kind: 'redirect', to: '/admin' })
  })
  it('cuenta sin perfil (forbidden) o servicio caído se muestran en su propia pantalla del panel', () => {
    expect(resolveGuard('/admin/citas', 'forbidden')).toEqual({ kind: 'render' })
    expect(resolveGuard('/admin/citas', 'unavailable')).toEqual({ kind: 'render' })
  })
  it('con sesión pero sin poder verificar el rol, /login no se queda mostrando "no configurado": va al panel', () => {
    expect(resolveGuard('/login', 'unavailable')).toEqual({ kind: 'redirect', to: '/admin' })
    expect(resolveGuard('/login', 'forbidden')).toEqual({ kind: 'redirect', to: '/admin' })
  })
  it('sin configuración de Supabase, el panel redirige a /login y /login se muestra', () => {
    expect(resolveGuard('/admin/citas', 'unconfigured')).toEqual({ kind: 'redirect', to: '/login' })
    expect(resolveGuard('/login', 'unconfigured')).toEqual({ kind: 'render' })
  })
  it('/admin es el inicio del panel y las páginas públicas no se protegen', () => {
    expect(resolveGuard('/admin', 'authorized')).toEqual({ kind: 'render' })
    expect(resolveGuard('/', 'signed-out')).toEqual({ kind: 'render' })
    expect(resolveGuard('/disponibilidad', 'signed-out')).toEqual({ kind: 'render' })
  })
})

describe('classifySignInError', () => {
  it('credenciales inválidas', () => {
    expect(classifySignInError({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('invalid_credentials')
  })
  it('fallos de servicio o de red no se presentan como credenciales inválidas', () => {
    expect(classifySignInError({ status: 500 })).toBe('unavailable')
    expect(classifySignInError({ message: 'Failed to fetch' })).toBe('unavailable')
    expect(classifySignInError(null)).toBe('unavailable')
  })
})

describe('fetchStaffProfile', () => {
  const respond = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it('200 => perfil', async () => {
    const body = { role: 'admin', displayName: 'A', permissions: [] }
    expect(await fetchStaffProfile('t', respond(200, body))).toEqual({ kind: 'ok', profile: body })
  })
  it('401, 403 y fallos se distinguen', async () => {
    expect(await fetchStaffProfile('t', respond(401))).toEqual({ kind: 'unauthenticated' })
    expect(await fetchStaffProfile('t', respond(403))).toEqual({ kind: 'forbidden' })
    expect(await fetchStaffProfile('t', respond(503))).toEqual({ kind: 'unavailable' })
    expect(await fetchStaffProfile('t', vi.fn(async () => { throw new Error('red') }) as unknown as typeof fetch)).toEqual({ kind: 'unavailable' })
  })
  it('envía el token como Bearer', async () => {
    const spy = respond(200, { role: 'admin', displayName: '', permissions: [] })
    await fetchStaffProfile('abc', spy)
    expect(spy).toHaveBeenCalledWith('/api/admin/me', { headers: { Authorization: 'Bearer abc' } })
  })
})
