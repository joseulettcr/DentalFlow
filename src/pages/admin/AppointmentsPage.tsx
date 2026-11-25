import { useCallback, useEffect, useState } from 'react'
import { formatClinicDate, formatClinicTime } from '../../../shared/clinic-time'
import {
  changeAppointmentStatus,
  listCompletableAppointments,
  listUpcomingAppointments,
  type AdminResult,
  type AppointmentItem,
  type StatusAction,
} from '../../lib/adminApi'

interface LogEntry {
  id: number
  tone: 'ok' | 'error'
  text: string
}

const ERRORS: Record<string, string> = {
  INVALID_TRANSITION: 'La cita ya no está en un estado que permita esta acción (por ejemplo, ya fue cancelada o completada). Se actualizó el listado.',
  NOT_FOUND: 'La cita ya no existe.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para esta acción.',
  UNAUTHENTICATED: 'Tu sesión venció. Vuelve a iniciar sesión.',
}

function failureText(result: AdminResult<unknown>): string {
  if (result.kind === 'unavailable') return 'El servicio no está disponible. No se hizo ningún cambio.'
  if (result.kind === 'error') return ERRORS[result.code] ?? 'No se pudo completar la operación.'
  return 'No se pudo completar la operación.'
}

const when = (item: AppointmentItem) => `${formatClinicDate(item.startsAt)}, ${formatClinicTime(item.startsAt)}`
const origin = (item: AppointmentItem) => (item.source === 'public_request' ? 'desde solicitud pública' : 'reserva telefónica')

/** Citas confirmadas: próximas (se pueden cancelar) y ya terminadas por cerrar (se pueden completar o cancelar). */
export function AppointmentsPage({ canManage }: { canManage: boolean }) {
  const [upcoming, setUpcoming] = useState<AppointmentItem[] | null>(null)
  const [finished, setFinished] = useState<AppointmentItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])

  const load = useCallback(async () => {
    const [next, done] = await Promise.all([listUpcomingAppointments(), listCompletableAppointments()])
    if (next.kind === 'ok') setUpcoming(next.data.appointments)
    if (done.kind === 'ok') setFinished(done.data.appointments)
    setLoadError(next.kind !== 'ok' || done.kind !== 'ok')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const push = (tone: LogEntry['tone'], text: string) =>
    setLog((entries) => [{ id: Date.now() + Math.random(), tone, text }, ...entries].slice(0, 5))

  async function run(item: AppointmentItem, action: StatusAction) {
    setBusyId(item.id)
    setConfirmingId(null)
    const result = await changeAppointmentStatus(item.id, action)
    if (result.kind === 'ok') {
      const verb = action === 'cancel' ? 'cancelada' : 'completada'
      push('ok', result.data.alreadyInState
        ? `La cita de ${item.patientName} ya estaba ${verb}; no se cambió nada.`
        : action === 'cancel'
          ? `Cita cancelada: ${item.patientName} (${when(item)}). El horario quedó libre.`
          : `Cita completada: ${item.patientName} (${when(item)}).`)
    } else {
      push('error', `${item.patientName}: ${failureText(result)}`)
    }
    setBusyId(null)
    await load() // también tras un error: el estado real pudo cambiar
  }

  function renderActions(item: AppointmentItem, canComplete: boolean) {
    if (!canManage) return null
    if (confirmingId === item.id) {
      return (
        <div className="reject-box" role="group" aria-label={`Confirmar cancelación de la cita de ${item.patientName}`}>
          <p><strong>¿Cancelar la cita de {item.patientName}?</strong> El horario quedará libre para nuevas reservas.</p>
          <div>
            <button type="button" disabled={busyId === item.id} onClick={() => void run(item, 'cancel')}>Sí, cancelar cita</button>
            <button type="button" className="secondary" onClick={() => setConfirmingId(null)}>No, volver</button>
          </div>
        </div>
      )
    }
    return (
      <div>
        {canComplete && (
          <button type="button" disabled={busyId !== null} onClick={() => void run(item, 'complete')}>
            {busyId === item.id ? 'Procesando…' : 'Completar'}
          </button>
        )}
        <button type="button" className="secondary" disabled={busyId !== null} onClick={() => setConfirmingId(item.id)}>Cancelar</button>
      </div>
    )
  }

  const loading = upcoming === null && finished === null && !loadError

  return (
    <>
      <h1 className="page-title">Citas confirmadas</h1>
      <p className="lead">Consulta las citas y gestiona su estado.</p>

      {loadError && (
        <p role="alert" className="notice notice-error">
          No pudimos cargar las citas. <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button>
        </p>
      )}

      <div role="status" aria-live="polite">
        {log.map((entry) => (
          <p key={entry.id} className={entry.tone === 'ok' ? 'notice' : 'notice notice-error'}>{entry.text}</p>
        ))}
      </div>

      {loading && <p role="status">Cargando citas…</p>}

      {finished && finished.length > 0 && (
        <section aria-labelledby="finished-title">
          <h2 id="finished-title" className="section-title">Por cerrar (ya terminaron)</h2>
          <p className="lead small">Marca como completadas las citas que se realizaron; cancela las que no se llevaron a cabo.</p>
          <ul className="request-list">
            {finished.map((item) => (
              <li key={item.id} className="request-item">
                <p><strong>{when(item)}</strong> · {item.doctorName}</p>
                <p>{item.patientName} · {item.patientEmail} · {origin(item)}</p>
                {renderActions(item, true)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming && (
        <section aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="section-title">Próximas citas</h2>
          {upcoming.length === 0 && <p className="notice">Todavía no hay citas confirmadas próximas.</p>}
          <ul className="request-list">
            {upcoming.map((item) => (
              <li key={item.id} className="request-item confirmed">
                <p><strong>{when(item)}</strong> · {item.doctorName}</p>
                <p>{item.patientName} · {item.patientEmail} · {origin(item)}</p>
                {renderActions(item, false)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
