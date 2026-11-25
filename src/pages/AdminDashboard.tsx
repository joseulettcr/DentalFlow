import { resolveAdminRoute } from '../admin/routes'
import { useAuth } from '../auth/useAuth'
import { AdminLayout } from '../components/AdminLayout'
import { usePathname } from '../router'
import { AppointmentsPage } from './admin/AppointmentsPage'
import { HomePage } from './admin/HomePage'
import { NewAppointmentPage } from './admin/NewAppointmentPage'
import { RequestsPage } from './admin/RequestsPage'
import { NotFoundPage, PendingFeaturePage, RestrictedPage } from './admin/StatusPages'

/** Entrada del panel administrativo: estados de sesión, layout compartido y la pantalla de la ruta actual. */
export function AdminDashboard() {
  const { profile, status, signOut } = useAuth()
  const pathname = usePathname()

  if (status === 'forbidden') {
    return (
      <main className="app-shell">
        <section aria-labelledby="forbidden-title" className="welcome-card">
          <p className="eyebrow">Acceso no autorizado</p>
          <h1 id="forbidden-title" className="page-title">Sin permiso</h1>
          <p className="lead">
            Tu cuenta no está registrada como personal de la clínica. Pide al administrador que la habilite.
          </p>
          <button type="button" onClick={() => void signOut()}>Cerrar sesión</button>
        </section>
      </main>
    )
  }

  if (status === 'unavailable' || !profile) {
    return (
      <main className="app-shell">
        <section aria-labelledby="unavailable-title" className="welcome-card">
          <p className="eyebrow">Servicio no disponible</p>
          <h1 id="unavailable-title" className="page-title">No pudimos verificar tu sesión</h1>
          <p className="lead">Intenta de nuevo en unos minutos. No se guardó ni confirmó ningún dato.</p>
          <button type="button" onClick={() => window.location.reload()}>Reintentar</button>
          <button type="button" className="secondary" onClick={() => void signOut()}>Cerrar sesión</button>
        </section>
      </main>
    )
  }

  const resolution = resolveAdminRoute(pathname, profile.permissions)
  const currentRoute = resolution.kind === 'not-found' ? null : resolution.route

  let screen
  if (resolution.kind === 'not-found') screen = <NotFoundPage />
  else if (resolution.kind === 'forbidden') screen = <RestrictedPage />
  else {
    switch (resolution.route.path) {
      case '/admin':
        screen = <HomePage permissions={profile.permissions} displayName={profile.displayName} />
        break
      case '/admin/nueva-cita':
        screen = <NewAppointmentPage />
        break
      case '/admin/solicitudes':
        screen = <RequestsPage />
        break
      case '/admin/citas':
        screen = <AppointmentsPage />
        break
      case '/admin/odontologos':
        screen = <PendingFeaturePage title="Odontólogos" description="La administración de odontólogos y horarios todavía no está habilitada (tarea T-05 en curso)." />
        break
      default:
        screen = <PendingFeaturePage title="Configuración e integraciones" description="La conexión con Google Calendar y otras integraciones todavía no están habilitadas." />
    }
  }

  return (
    <AdminLayout profile={profile} pathname={pathname} currentRoute={currentRoute} onSignOut={() => void signOut()}>
      {screen}
    </AdminLayout>
  )
}
