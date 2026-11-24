import { useCallback, useEffect, useState } from 'react'
import { formatClinicDate, formatClinicTime } from '../../shared/clinic-time'
import {
  approveRequest,
  listPendingRequests,
  listUpcomingAppointments,
  rejectRequest,
  type AdminResult,
  type AppointmentItem,
  type RequestItem,
} from '../lib/adminApi'

interface LogEntry {
  id: number
  tone: 'ok' | 'error'
  text: string
}

const APPROVE_ERRORS: Record<string, string> = {
  SLOT_UNAVAILABLE: 'No se pudo aprobar: el horario ya está ocupado por otra cita confirmada. La solicitud sigue pendiente; puedes rechazarla.',
  REQUEST_EXPIRED: 'No se pudo aprobar: el horario solicitado ya pasó.',
  REQUEST_ALREADY_DECIDED: 'Esta solicitud ya había sido decidida.',
  NOT_FOUND: 'La solicitud ya no existe.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para esta acción.',
  UNAUTHENTICATED: 'Tu sesión venció. Vuelve a iniciar sesión.',
}

function failureText(result: AdminResult<unknown>, fallback: string): string {
  if (result.kind === 'unavailable') return 'El servicio no está disponible. No se hizo ningún cambio.'
  if (result.kind === 'error') return APPROVE_ERRORS[result.code] ?? fallback
  return fallback
}

const when = (item: { startsAt: string }) => `${formatClinicDate(item.startsAt)}, ${formatClinicTime(item.startsAt)}`

/** Solicitudes pendientes y citas confirmadas (RF-09). La decisión se delega al backend/PostgreSQL; aquí no hay reglas. */
export function RequestsPanel({ canDecide, canReadAppointments, refreshKey = 0 }: { canDecide: boolean; canReadAppointments: boolean; refreshKey?: number }) {
  const [requests, setRequests] = useState<RequestItem[] | null>(null)
  const [appointments, setAppointments] = useState<AppointmentItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])

  const load = useCallback(async () => {
    const [pending, upcoming] = await Promise.all([
      canDecide ? listPendingRequests() : Promise.resolve(null),
      canReadAppointments ? listUpcomingAppointments() : Promise.resolve(null),
    ])
    const failed = (pending && pending.kind !== 'ok') || (upcoming && upcoming.kind !== 'ok')
    setLoadError(Boolean(failed))
    if (pending?.kind === 'ok') setRequests(pending.data.requests)
    if (upcoming?.kind === 'ok') setAppointments(upcoming.data.appointments)
  }, [canDecide, canReadAppointments])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const push = (tone: LogEntry['tone'], text: string) =>
    setLog((entries) => [{ id: Date.now() + Math.random(), tone, text }, ...entries].slice(0, 5))

  async function handleApprove(item: RequestItem) {
    setBusyId(item.id)
    const result = await approveRequest(item.id)
    if (result.kind === 'ok') {
      push('ok', result.data.alreadyApproved
        ? `La solicitud de ${item.patientName} ya estaba aprobada; no se creó otra cita.`
        : `Aprobada: cita confirmada para ${item.patientName} (${item.doctorName}, ${when(item)}).`)
    } else {
      push('error', `${item.patientName}: ${failureText(result, 'No se pudo aprobar la solicitud.')}`)
    }
    setBusyId(null)
    await load()
  }

  async function handleReject(item: RequestItem) {
    setBusyId(item.id)
    const result = await rejectRequest(item.id, reason)
    if (result.kind === 'ok') push('ok', `Rechazada la solicitud de ${item.patientName}.`)
    else push('error', `${item.patientName}: ${failureText(result, 'No se pudo rechazar la solicitud.')}`)
    setBusyId(null)
    setRejectingId(null)
    setReason('')
    await load()
  }

  return (
    <div className="requests-panel">
      {loadError && (
        <p role="alert" className="notice notice-error">
          No pudimos cargar los datos. <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button>
        </p>
      )}

      <div role="status" aria-live="polite">
        {log.map((entry) => (
          <p key={entry.id} className={entry.tone === 'ok' ? 'notice' : 'notice notice-error'}>{entry.text}</p>
        ))}
      </div>

      {canDecide && (
        <section aria-labelledby="pending-title">
          <h2 id="pending-title">Solicitudes pendientes</h2>
          {requests === null && !loadError && <p role="status">Cargando solicitudes…</p>}
          {requests?.length === 0 && <p className="lead">No hay solicitudes pendientes.</p>}
          <ul className="request-list">
            {requests?.map((item) => (
              <li key={item.id} className="request-item">
                <p><strong>{when(item)}</strong> · {item.doctorName}</p>
                <p>{item.patientName} · {item.patientEmail}{item.patientPhone ? ` · ${item.patientPhone}` : ''}</p>
                {rejectingId === item.id ? (
                  <div className="reject-box">
                    <label htmlFor={`reason-${item.id}`}>Motivo (opcional, máx. 200 caracteres)</label>
                    <input id={`reason-${item.id}`} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
                    <button type="button" disabled={busyId === item.id} onClick={() => void handleReject(item)}>Confirmar rechazo</button>
                    <button type="button" className="secondary" onClick={() => { setRejectingId(null); setReason('') }}>Cancelar</button>
                  </div>
                ) : (
                  <div>
                    <button type="button" disabled={busyId !== null} onClick={() => void handleApprove(item)}>
                      {busyId === item.id ? 'Procesando…' : 'Aprobar'}
                    </button>
                    <button type="button" className="secondary" disabled={busyId !== null} onClick={() => setRejectingId(item.id)}>Rechazar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canReadAppointments && (
        <section aria-labelledby="confirmed-title">
          <h2 id="confirmed-title">Citas confirmadas próximas</h2>
          {appointments === null && !loadError && <p role="status">Cargando citas…</p>}
          {appointments?.length === 0 && <p className="lead">Todavía no hay citas confirmadas.</p>}
          <ul className="request-list">
            {appointments?.map((item) => (
              <li key={item.id} className="request-item confirmed">
                <p><strong>{when(item)}</strong> · {item.doctorName}</p>
                <p>{item.patientName} · {item.patientEmail} · {item.source === 'public_request' ? 'desde solicitud pública' : 'reserva telefónica'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
