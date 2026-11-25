import { describe, expect, it } from 'vitest'
import { ADMIN_ROUTES, canAccess, resolveAdminRoute, visibleRoutes } from '../../src/admin/routes'
import { PERMISSIONS, permissionsFor, type Permission } from '../../shared/permissions'

const admin = permissionsFor('admin')
const reception = permissionsFor('receptionist')
const paths = (permissions: readonly Permission[]) => visibleRoutes(permissions).map((r) => r.path)

describe('navegación por roles', () => {
  it('admin ve las seis opciones', () => {
    expect(paths(admin)).toEqual(['/admin', '/admin/nueva-cita', '/admin/solicitudes', '/admin/citas', '/admin/odontologos', '/admin/configuracion'])
  })

  it('recepción ve Inicio, Nueva cita, Solicitudes y Citas; no ve las opciones administrativas', () => {
    expect(paths(reception)).toEqual(['/admin', '/admin/nueva-cita', '/admin/solicitudes', '/admin/citas'])
  })

  it('las opciones sin funcionalidad están marcadas como pendientes y las operativas no', () => {
    const pending = ADMIN_ROUTES.filter((r) => r.status === 'pending').map((r) => r.path)
    expect(pending).toEqual(['/admin/odontologos', '/admin/configuracion'])
    expect(ADMIN_ROUTES.filter((r) => r.status === 'ready').map((r) => r.path)).toEqual(['/admin', '/admin/nueva-cita', '/admin/solicitudes', '/admin/citas'])
  })

  it('cada pantalla usa un permiso real de la matriz de spec.md §1', () => {
    for (const route of ADMIN_ROUTES) {
      if (route.permission) expect(Object.keys(PERMISSIONS)).toContain(route.permission)
    }
  })
})

describe('resolveAdminRoute: acceso por URL escrita a mano', () => {
  it('personal con permiso ve la pantalla', () => {
    expect(resolveAdminRoute('/admin/solicitudes', reception)).toMatchObject({ kind: 'screen', route: { path: '/admin/solicitudes' } })
    expect(resolveAdminRoute('/admin', reception)).toMatchObject({ kind: 'screen' })
    expect(resolveAdminRoute('/admin/odontologos', admin)).toMatchObject({ kind: 'screen' })
  })

  it('recepción en pantallas administrativas => forbidden (no se muestra el contenido)', () => {
    expect(resolveAdminRoute('/admin/odontologos', reception)).toMatchObject({ kind: 'forbidden' })
    expect(resolveAdminRoute('/admin/configuracion', reception)).toMatchObject({ kind: 'forbidden' })
  })

  it('un perfil sin permisos solo accede al inicio', () => {
    expect(resolveAdminRoute('/admin', [])).toMatchObject({ kind: 'screen' })
    for (const path of ['/admin/nueva-cita', '/admin/solicitudes', '/admin/citas']) {
      expect(resolveAdminRoute(path, [])).toMatchObject({ kind: 'forbidden' })
    }
  })

  it('tolera la barra final y rechaza rutas inexistentes', () => {
    expect(resolveAdminRoute('/admin/citas/', admin)).toMatchObject({ kind: 'screen', route: { path: '/admin/citas' } })
    expect(resolveAdminRoute('/admin/inventada', admin)).toEqual({ kind: 'not-found' })
    expect(resolveAdminRoute('/admin/citas/123', admin)).toEqual({ kind: 'not-found' })
  })

  it('canAccess coincide con la matriz del backend', () => {
    const odontologos = ADMIN_ROUTES.find((r) => r.path === '/admin/odontologos')!
    expect(canAccess(odontologos, admin)).toBe(true)
    expect(canAccess(odontologos, reception)).toBe(false)
  })
})
