import { useCallback, useEffect, useState } from 'react'
import { formatClinicDate, formatClinicTime } from '../../../shared/clinic-time'
import { listUpcomingAppointments, type AppointmentItem } from '../../lib/adminApi'

/** Citas confirmadas próximas (solo lectura). */
export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<AppointmentItem[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const result = await listUpcomingAppointments()
    if (result.kind === 'ok') {
      setAppointments(result.data.appointments)
      setError(false)
    } else {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <h1 className="page-title">Citas confirmadas</h1>
      <p className="lead">Próximas citas de todos los odontólogos.</p>
      {error && (
        <p role="alert" className="notice notice-error">
          No pudimos cargar las citas. <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button>
        </p>
      )}
      {appointments === null && !error && <p role="status">Cargando citas…</p>}
      {appointments?.length === 0 && <p className="notice">Todavía no hay citas confirmadas.</p>}
      <ul className="request-list">
        {appointments?.map((item) => (
          <li key={item.id} className="request-item confirmed">
            <p><strong>{formatClinicDate(item.startsAt)}, {formatClinicTime(item.startsAt)}</strong> · {item.doctorName}</p>
            <p>{item.patientName} · {item.patientEmail} · {item.source === 'public_request' ? 'desde solicitud pública' : 'reserva telefónica'}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
