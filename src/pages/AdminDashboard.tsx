import { useAuth } from '../auth/useAuth'
import { ALL_PERMISSIONS, PERMISSIONS } from '../../shared/permissions'

const ROLE_LABEL = { admin: 'Administrador', receptionist: 'Recepción' } as const

/** Panel base (T-04). Las secciones reales llegan en tareas posteriores; aquí solo se muestran las opciones por rol. */
export function AdminDashboard() {
  const { profile, status, signOut } = useAuth()

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

  const allowed = new Set(profile.permissions)

  return (
    <main className="app-shell">
      <section aria-labelledby="dashboard-title" className="welcome-card">
        <p className="eyebrow">Panel administrativo</p>
        <h1 id="dashboard-title" className="page-title">Hola, {profile.displayName || 'equipo'}</h1>
        <p className="lead">Rol: <strong>{ROLE_LABEL[profile.role]}</strong></p>
        <ul className="permission-list" aria-label="Opciones según tu rol">
          {ALL_PERMISSIONS.map((permission) => (
            <li key={permission} className={allowed.has(permission) ? 'allowed' : 'denied'}>
              <span aria-hidden="true">{allowed.has(permission) ? '✔' : '—'}</span>{' '}
              {PERMISSIONS[permission].label}
              {!allowed.has(permission) && <em> (solo administrador)</em>}
            </li>
          ))}
        </ul>
        <p className="lead small">Las secciones funcionales se habilitan en las siguientes tareas.</p>
        <button type="button" onClick={() => void signOut()}>Cerrar sesión</button>
      </section>
    </main>
  )
}
