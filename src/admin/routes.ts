import type { Permission } from '../../shared/permissions'

// Mapa de pantallas administrativas. Solo decide qué se MUESTRA; la autorización real de cada acción está en
// las APIs (api/_lib/staff-auth.ts), que no confían en lo que haga o no haga React.

export interface AdminRoute {
  path: string
  label: string
  title: string
  /** Permiso de la matriz (spec.md §1) necesario para ver la pantalla; null = cualquier personal. */
  permission: Permission | null
  /** 'pending' = la funcionalidad aún no existe: se muestra marcada como pendiente, nunca como operativa. */
  status: 'ready' | 'pending'
}

export const ADMIN_ROUTES: readonly AdminRoute[] = [
  { path: '/admin', label: 'Inicio', title: 'Inicio', permission: null, status: 'ready' },
  { path: '/admin/nueva-cita', label: 'Nueva cita', title: 'Nueva cita telefónica', permission: 'appointments.create_phone', status: 'ready' },
  { path: '/admin/solicitudes', label: 'Solicitudes', title: 'Solicitudes de citas', permission: 'requests.decide', status: 'ready' },
  { path: '/admin/citas', label: 'Citas', title: 'Citas confirmadas', permission: 'appointments.read', status: 'ready' },
  // Opciones administrativas (solo admin): la escritura de odontólogos y la gestión de Google son de `admin` (spec.md §1).
  { path: '/admin/odontologos', label: 'Odontólogos', title: 'Odontólogos', permission: 'doctors.write', status: 'pending' },
  { path: '/admin/configuracion', label: 'Configuración', title: 'Configuración e integraciones', permission: 'google.manage', status: 'pending' },
]

export const ADMIN_HOME = '/admin'

export type AdminResolution =
  | { kind: 'screen'; route: AdminRoute }
  | { kind: 'forbidden'; route: AdminRoute }
  | { kind: 'not-found' }

const normalize = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)

export function canAccess(route: AdminRoute, permissions: readonly Permission[]): boolean {
  return route.permission === null || permissions.includes(route.permission)
}

/** Opciones del menú para un perfil: las no permitidas no se muestran. */
export function visibleRoutes(permissions: readonly Permission[]): AdminRoute[] {
  return ADMIN_ROUTES.filter((route) => canAccess(route, permissions))
}

/** Qué pantalla corresponde a una URL: también cubre URLs escritas a mano (acceso restringido => 'forbidden'). */
export function resolveAdminRoute(pathname: string, permissions: readonly Permission[]): AdminResolution {
  const route = ADMIN_ROUTES.find((candidate) => candidate.path === normalize(pathname))
  if (!route) return { kind: 'not-found' }
  return canAccess(route, permissions) ? { kind: 'screen', route } : { kind: 'forbidden', route }
}
