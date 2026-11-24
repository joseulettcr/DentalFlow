import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_DAYS_AHEAD } from '../../shared/availability'
import { addDays, formatClinicDate, formatClinicTime, todayInClinic } from '../../shared/clinic-time'
import { validateRequestInput } from '../../shared/request-validation'
import {
  fetchDoctors,
  fetchSlots,
  submitRequest,
  type CreatedRequest,
  type DoctorOption,
  type SlotItem,
} from '../lib/availabilityApi'
import { navigate } from '../router'

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

type DoctorsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; doctors: DoctorOption[] }
type SlotsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; slots: SlotItem[] }

function scheduleSummary(doctor: DoctorOption): string[] {
  const byDay = new Map<number, string[]>()
  for (const range of doctor.weeklySchedule) {
    byDay.set(range.weekday, [...(byDay.get(range.weekday) ?? []), `${range.startTime}–${range.endTime}`])
  }
  return [...byDay.entries()].sort(([a], [b]) => a - b).map(([day, ranges]) => `${WEEKDAYS[day]}: ${ranges.join(' y ')}`)
}

/** Consulta de disponibilidad (T-05/T-06). Solo lectura: no crea solicitudes ni citas. */
export function AvailabilityPage() {
  const [doctorsState, setDoctorsState] = useState<DoctorsState>({ status: 'loading' })
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState('')
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: 'idle' })
  const [reloadKey, setReloadKey] = useState(0)

  // Solicitud (RF-08): horario elegido, datos del paciente y resultado.
  const [selectedStart, setSelectedStart] = useState('')
  const [patientName, setPatientName] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ request: CreatedRequest; replayed: boolean } | null>(null)
  // La clave de idempotencia se conserva mientras los datos no cambien (un reintento no duplica) y se renueva si cambian.
  const keyRef = useRef<{ signature: string; key: string } | null>(null)

  const today = todayInClinic(new Date())
  const maxDate = addDays(today, MAX_DAYS_AHEAD)

  useEffect(() => {
    let active = true
    setDoctorsState({ status: 'loading' })
    void fetchDoctors().then((result) => {
      if (!active) return
      setDoctorsState(result.kind === 'ok' ? { status: 'ready', doctors: result.data } : { status: 'error' })
    })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    setSelectedStart('')
    setFormError(null)
  }, [doctorId, date])

  useEffect(() => {
    if (!doctorId || !date) {
      setSlotsState({ status: 'idle' })
      return
    }
    let active = true
    setSlotsState({ status: 'loading' })
    void fetchSlots(doctorId, date).then((result) => {
      if (!active) return // se ignora una respuesta vieja si el usuario ya cambió la selección
      if (result.kind === 'ok') setSlotsState({ status: 'ready', slots: result.data })
      else if (result.kind === 'validation') setSlotsState({ status: 'invalid', message: result.message })
      else setSlotsState({ status: 'error' })
    })
    return () => {
      active = false
    }
  }, [doctorId, date, reloadKey])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const signature = JSON.stringify([doctorId, selectedStart, patientName, patientEmail, patientPhone])
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() }
    const payload = { doctorId, patientName, patientEmail, patientPhone, startAt: selectedStart, idempotencyKey: keyRef.current.key }

    // Aviso inmediato con las mismas reglas del servidor (el servidor las vuelve a validar).
    const local = validateRequestInput({ ...payload, patientPhone: patientPhone.trim() === '' ? undefined : patientPhone })
    if (!local.ok) {
      setFormError(local.message)
      return
    }

    setSubmitting(true)
    setFormError(null)
    const result = await submitRequest(payload)
    setSubmitting(false)
    if (result.kind === 'ok') {
      setCreated({ request: result.request, replayed: result.replayed })
      setPatientName('')
      setPatientEmail('')
      setPatientPhone('')
      keyRef.current = null
    } else if (result.kind === 'validation') {
      setFormError(result.message)
    } else if (result.kind === 'conflict') {
      setFormError(result.message)
      if (result.code === 'SLOT_UNAVAILABLE') {
        setSelectedStart('')
        setReloadKey((k) => k + 1) // actualiza los horarios libres
      }
    } else if (result.kind === 'rate_limited') {
      setFormError('Has enviado demasiados intentos. Espera unos minutos e inténtalo de nuevo.')
    } else {
      setFormError('No pudimos enviar tu solicitud. No se registró nada; intenta de nuevo en unos minutos.')
    }
  }

  function startOver() {
    setCreated(null)
    setSelectedStart('')
    setFormError(null)
    setReloadKey((k) => k + 1)
  }

  const selected = doctorsState.status === 'ready' ? doctorsState.doctors.find((d) => d.id === doctorId) : undefined

  return (
    <main className="app-shell">
      <section aria-labelledby="availability-title" className="welcome-card">
        <p className="eyebrow">Consulta de horarios</p>
        <h1 id="availability-title" className="page-title">Disponibilidad</h1>
        <p className="lead">Elige un odontólogo y una fecha para ver los horarios libres (bloques de 30 minutos, hora de Costa Rica) y envía tu solicitud de cita.</p>

        {doctorsState.status === 'loading' && <p role="status" className="notice">Cargando odontólogos…</p>}
        {doctorsState.status === 'error' && (
          <div role="alert" className="notice notice-error">
            No pudimos cargar los odontólogos.
            <button type="button" className="secondary" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</button>
          </div>
        )}
        {doctorsState.status === 'ready' && doctorsState.doctors.length === 0 && (
          <p role="status" className="notice">Por ahora no hay odontólogos disponibles.</p>
        )}

        {doctorsState.status === 'ready' && doctorsState.doctors.length > 0 && (
          <form className="form" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="doctor-select">Odontólogo</label>
            <select id="doctor-select" value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
              <option value="">Selecciona un odontólogo</option>
              {doctorsState.doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.fullName}{doctor.specialty ? ` — ${doctor.specialty}` : ''}
                </option>
              ))}
            </select>

            {selected && (
              <ul className="schedule-list" aria-label={`Horario semanal de ${selected.fullName}`}>
                {scheduleSummary(selected).map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}

            <label htmlFor="date-input">Fecha</label>
            <input id="date-input" type="date" min={today} max={maxDate} value={date} onChange={(event) => setDate(event.target.value)} />
          </form>
        )}

        {slotsState.status === 'loading' && <p role="status" className="notice">Buscando horarios…</p>}
        {slotsState.status === 'invalid' && <p role="alert" className="notice notice-error">{slotsState.message}</p>}
        {slotsState.status === 'error' && (
          <div role="alert" className="notice notice-error">
            No pudimos consultar los horarios. No se modificó ningún dato.
            <button type="button" className="secondary" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</button>
          </div>
        )}
        {slotsState.status === 'ready' && slotsState.slots.length === 0 && (
          <p role="status" className="notice">No hay horarios disponibles para esta fecha. Prueba con otro día.</p>
        )}
        {slotsState.status === 'ready' && slotsState.slots.length > 0 && !created && (
          <>
            <p className="lead" id="slots-title">Horarios disponibles — elige uno para solicitarlo</p>
            <ul className="slot-list selectable" aria-labelledby="slots-title">
              {slotsState.slots.map((slot) => (
                <li key={slot.startAt}>
                  <button
                    type="button"
                    className="slot-button"
                    aria-pressed={selectedStart === slot.startAt}
                    onClick={() => { setSelectedStart(slot.startAt); setFormError(null) }}
                  >
                    <time dateTime={slot.startAt}>{formatClinicTime(slot.startAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {selectedStart && !created && (
          <form className="form request-form" onSubmit={handleSubmit} noValidate aria-labelledby="request-title">
            <h2 id="request-title">Solicitar {formatClinicDate(selectedStart)}, {formatClinicTime(selectedStart)}</h2>
            <p className="lead small">Enviar el formulario crea una solicitud. No es una cita confirmada hasta que el personal la apruebe.</p>
            <label htmlFor="patient-name">Nombre completo</label>
            <input id="patient-name" autoComplete="name" required maxLength={100} value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={submitting} />
            <label htmlFor="patient-email">Correo electrónico</label>
            <input id="patient-email" type="email" autoComplete="email" required maxLength={254} value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} disabled={submitting} />
            <label htmlFor="patient-phone">Teléfono (opcional)</label>
            <input id="patient-phone" type="tel" autoComplete="tel" maxLength={25} value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} disabled={submitting} />
            {formError && <p role="alert" className="notice notice-error">{formError}</p>}
            <button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar solicitud'}</button>
          </form>
        )}

        {created && (
          <div className="confirmation" role="status">
            <h2>Solicitud recibida</h2>
            <p className="notice">
              Esta solicitud <strong>todavía no es una cita confirmada</strong>. El personal de la clínica la revisará y se comunicará contigo.
            </p>
            <p>Número de solicitud:</p>
            <code>{created.request.requestId}</code>
            <p>
              {created.request.doctorName} · {formatClinicDate(created.request.startsAt)}, {formatClinicTime(created.request.startsAt)}
              {created.replayed ? ' (esta solicitud ya había sido registrada)' : ''}
            </p>
            <button type="button" onClick={startOver}>Hacer otra consulta</button>
          </div>
        )}

        <button type="button" className="secondary" onClick={() => navigate('/')}>Volver al inicio</button>
      </section>
    </main>
  )
}
