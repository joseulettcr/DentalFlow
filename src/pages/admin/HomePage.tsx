import { useCallback, useEffect, useState } from 'react'
import type { Permission } from '../../../shared/permissions'
import { AppLink } from '../../components/AppLink'
import { listPendingRequests, listUpcomingAppointments } from '../../lib/adminApi'

type Count = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: number }

// Los listados administrativos tienen tope (100 solicitudes, 50 citas): si se alcanza, se muestra "o más".
const PENDING_LIMIT = 100
const APPOINTMENTS_LIMIT = 50

function StatCard({ label, count, limit, to, linkLabel }: { label: string; count: Count; limit: number; to: string; linkLabel: string }) {
  return (
    <article className="stat-card">
      <p className="stat-label">{label}</p>
      {count.status === 'loading' && <p className="stat-value" role="status">…</p>}
      {count.status === 'error' && <p className="stat-error" role="alert">No disponible</p>}
      {count.status === 'ready' && <p className="stat-value">{count.value}{count.value >= limit ? '+' : ''}</p>}
      <AppLink to={to} className="text-link">{linkLabel}</AppLink>
    </article>
  )
}

/** Inicio: indicadores sencillos con los endpoints existentes y accesos rápidos según permisos. */
export function HomePage({ permissions, displayName }: { permissions: readonly Permission[]; displayName: string }) {
  const canRequests = permissions.includes('requests.decide')
  const canAppointments = permissions.includes('appointments.read')
  const canCreate = permissions.includes('appointments.create_phone')
  const [pending, setPending] = useState<Count>({ status: 'loading' })
  const [upcoming, setUpcoming] = useState<Count>({ status: 'loading' })

  const load = useCallback(async () => {
    setPending({ status: 'loading' })
    setUpcoming({ status: 'loading' })
    const [p, u] = await Promise.all([
      canRequests ? listPendingRequests() : Promise.resolve(null),
      canAppointments ? listUpcomingAppointments() : Promise.resolve(null),
    ])
    if (p) setPending(p.kind === 'ok' ? { status: 'ready', value: p.data.requests.length } : { status: 'error' })
    if (u) setUpcoming(u.kind === 'ok' ? { status: 'ready', value: u.data.appointments.length } : { status: 'error' })
  }, [canRequests, canAppointments])

  useEffect(() => {
    void load()
  }, [load])

  const failed = pending.status === 'error' || upcoming.status === 'error'

  return (
    <>
      <h1 className="page-title">Hola, {displayName || 'equipo'}</h1>
      <p className="lead">Resumen de la clínica.</p>

      {failed && (
        <p role="alert" className="notice notice-error">
          No pudimos cargar todos los indicadores. <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button>
        </p>
      )}

      <div className="stat-grid">
        {canRequests && <StatCard label="Solicitudes pendientes" count={pending} limit={PENDING_LIMIT} to="/admin/solicitudes" linkLabel="Revisar solicitudes" />}
        {canAppointments && <StatCard label="Citas confirmadas próximas" count={upcoming} limit={APPOINTMENTS_LIMIT} to="/admin/citas" linkLabel="Ver citas" />}
      </div>

      <h2 className="section-title">Accesos rápidos</h2>
      <div className="quick-links">
        {canCreate && <AppLink to="/admin/nueva-cita" className="quick-link">Nueva cita</AppLink>}
        {canRequests && <AppLink to="/admin/solicitudes" className="quick-link">Solicitudes</AppLink>}
        {canAppointments && <AppLink to="/admin/citas" className="quick-link">Citas</AppLink>}
      </div>
    </>
  )
}
