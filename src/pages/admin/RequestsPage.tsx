import { useCallback, useEffect, useState } from 'react'
import { formatClinicDate, formatClinicTime } from '../../../shared/clinic-time'
import { approveRequest, listPendingRequests, rejectRequest, type AdminResult, type RequestItem } from '../../lib/adminApi'

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

/** Bandeja de solicitudes pendientes (RF-09). La decisión se delega al backend/PostgreSQL; aquí no hay reglas de negocio. */
export function RequestsPage() {
  const [requests, setRequests] = useState<RequestItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])

  const load = useCallback(async () => {
    const result = await listPendingRequests()
    if (result.kind === 'ok') {
      setRequests(result.data.requests)
      setLoadError(false)
    } else {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
    <>
      <h1 className="page-title">Solicitudes de citas</h1>
      <p className="lead">Solicitudes enviadas por pacientes que esperan una decisión.</p>

      {loadError && (
        <p role="alert" className="notice notice-error">
          No pudimos cargar las solicitudes. <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button>
        </p>
      )}

      <div role="status" aria-live="polite">
        {log.map((entry) => (
          <p key={entry.id} className={entry.tone === 'ok' ? 'notice' : 'notice notice-error'}>{entry.text}</p>
        ))}
      </div>

      {requests === null && !loadError && <p role="status">Cargando solicitudes…</p>}
      {requests?.length === 0 && <p className="notice">No hay solicitudes pendientes.</p>}
      <ul className="request-list">
        {requests?.map((item) => (
          <li key={item.id} className="request-item">
            <p><strong>{when(item)}</strong> · {item.doctorName}</p>
            <p>{item.patientName} · {item.patientEmail}{item.patientPhone ? ` · ${item.patientPhone}` : ''}</p>
            {rejectingId === item.id ? (
              <div className="reject-box">
                <label htmlFor={`reason-${item.id}`}>Motivo (opcional, máx. 200 caracteres)</label>
                <input id={`reason-${item.id}`} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
                <div>
                  <button type="button" disabled={busyId === item.id} onClick={() => void handleReject(item)}>Confirmar rechazo</button>
                  <button type="button" className="secondary" onClick={() => { setRejectingId(null); setReason('') }}>Cancelar</button>
                </div>
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
    </>
  )
}
