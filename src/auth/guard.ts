// Decisión pura de navegación según la sesión (CA-01b). Es comodidad de interfaz: la seguridad real
// está en las APIs (api/_lib/staff-auth.ts), que no confían en lo que haga o no haga React.

// 'unconfigured': faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (no hay forma de iniciar sesión).
// 'unavailable': hay sesión pero el servidor no pudo verificar el rol (p. ej. falta SUPABASE_SERVICE_ROLE_KEY o Supabase no responde).
export type AuthStatus = 'loading' | 'signed-out' | 'unconfigured' | 'authorized' | 'forbidden' | 'unavailable'

export type GuardDecision =
  | { kind: 'render' }
  | { kind: 'loading' }
  | { kind: 'redirect'; to: string }

export const LOGIN_PATH = '/login'
export const DASHBOARD_PATH = '/admin'

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export function resolveGuard(pathname: string, status: AuthStatus): GuardDecision {
  if (isAdminPath(pathname)) {
    if (status === 'loading') return { kind: 'loading' }
    if (status === 'signed-out' || status === 'unconfigured') return { kind: 'redirect', to: LOGIN_PATH }
    return { kind: 'render' } // authorized, forbidden y unavailable muestran su propia pantalla
  }
  if (pathname === LOGIN_PATH) {
    if (status === 'loading') return { kind: 'loading' }
    // Con sesión (aunque sea sin permiso o con el servicio caído) el panel muestra el estado real.
    if (status === 'authorized' || status === 'forbidden' || status === 'unavailable') {
      return { kind: 'redirect', to: DASHBOARD_PATH }
    }
    return { kind: 'render' }
  }
  return { kind: 'render' }
}
