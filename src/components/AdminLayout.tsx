import { useEffect, useState, type ReactNode } from 'react'
import { visibleRoutes, type AdminRoute } from '../admin/routes'
import type { StaffProfile } from '../lib/staffApi'
import { AppLink } from './AppLink'

const ROLE_LABEL = { admin: 'Administrador', receptionist: 'Recepción' } as const

/** Estructura compartida del panel: barra lateral (menú en móvil), encabezado con usuario y rol, y área principal. */
export function AdminLayout({
  profile,
  pathname,
  currentRoute,
  onSignOut,
  children,
}: {
  profile: StaffProfile
  pathname: string
  currentRoute: AdminRoute | null
  onSignOut: () => void
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const routes = visibleRoutes(profile.permissions)

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    document.title = currentRoute ? `${currentRoute.title} · DentalFlow` : 'DentalFlow'
  }, [currentRoute])

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">Saltar al contenido</a>

      <aside className={menuOpen ? 'admin-sidebar open' : 'admin-sidebar'} id="admin-nav">
        <p className="admin-brand">DentalFlow</p>
        <nav aria-label="Navegación administrativa">
          <ul className="admin-nav-list">
            {routes.map((route) => (
              <li key={route.path}>
                <AppLink to={route.path} className="admin-nav-link" current={currentRoute?.path === route.path} onNavigate={() => setMenuOpen(false)}>
                  <span>{route.label}</span>
                  {route.status === 'pending' && <span className="badge">Pendiente</span>}
                </AppLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="admin-body">
        <header className="admin-header">
          <button type="button" className="menu-toggle secondary" aria-expanded={menuOpen} aria-controls="admin-nav" onClick={() => setMenuOpen((open) => !open)}>
            Menú
          </button>
          <div className="user-box">
            <span className="user-name">{profile.displayName || 'Equipo'}</span>
            <span className="role-chip">{ROLE_LABEL[profile.role]}</span>
            <button type="button" className="secondary" onClick={onSignOut}>Cerrar sesión</button>
          </div>
        </header>
        <main id="admin-main" className="admin-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  )
}
