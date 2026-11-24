import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_DAYS_AHEAD } from '../../shared/availability'
import { addDays, formatClinicDate, formatClinicTime, todayInClinic } from '../../shared/clinic-time'
import { validateRequestInput } from '../../shared/request-validation'
import { createPhoneAppointment } from '../lib/adminApi'
import { fetchDoctors, fetchSlots, type DoctorOption, type SlotItem } from '../lib/availabilityApi'

type SlotsState = { status: 'idle' | 'loading' | 'error' } | { status: 'invalid'; message: string } | { status: 'ready'; slots: SlotItem[] }

const ERROR_TEXT: Record<string, string> = {
  SLOT_UNAVAILABLE: 'Ese horario ya no está disponible. Elige otro.',
  IDEMPOTENCY_KEY_REUSED: 'Este envío ya se usó con otros datos. Vuelve a intentarlo.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para crear citas.',
  UNAUTHENTICATED: 'Tu sesión venció. Vuelve a iniciar sesión.',
}

/** Nueva cita telefónica (RF-04): queda CONFIRMADA al enviar, sin pasar por una solicitud pendiente. */
export function PhoneBookingPanel({ onCreated }: { onCreated: () => void }) {
  const [doctors, setDoctors] = useState<DoctorOption[] | null>(null)
  const [doctorsError, setDoctorsError] = useState(false)
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<SlotsState>({ status: 'idle' })
  const [selectedStart, setSelectedStart] = useState('')
  const [patientName, setPatientName] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const keyRef = useRef<{ signature: string; key: string } | null>(null)

  const today = todayInClinic(new Date())
  const maxDate = addDays(today, MAX_DAYS_AHEAD)

  useEffect(() => {
    let active = true
    void fetchDoctors().then((result) => {
      if (!active) return
      if (result.kind === 'ok') setDoctors(result.data)
      else setDoctorsError(true)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setSelectedStart('')
    setFormError(null)
  }, [doctorId, date])

  useEffect(() => {
    if (!doctorId || !date) {
      setSlots({ status: 'idle' })
      return
    }
    let active = true
    setSlots({ status: 'loading' })
    void fetchSlots(doctorId, date).then((result) => {
      if (!active) return
      if (result.kind === 'ok') setSlots({ status: 'ready', slots: result.data })
      else if (result.kind === 'validation') setSlots({ status: 'invalid', message: result.message })
      else setSlots({ status: 'error' })
    })
    return () => {
      active = false
    }
  }, [doctorId, date, reloadKey])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSuccess(null)
    // La clave de idempotencia se conserva mientras los datos no cambien: reenviar no duplica la cita.
    const signature = JSON.stringify([doctorId, selectedStart, patientName, patientEmail, patientPhone])
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() }
    const payload = { doctorId, patientName, patientEmail, patientPhone, startAt: selectedStart, idempotencyKey: keyRef.current.key }

    const local = validateRequestInput({ ...payload, patientPhone: patientPhone.trim() === '' ? undefined : patientPhone })
    if (!local.ok) {
      setFormError(local.message)
      return
    }

    setSubmitting(true)
    setFormError(null)
    const result = await createPhoneAppointment(payload)
    setSubmitting(false)

    if (result.kind === 'ok') {
      const when = `${formatClinicDate(result.data.startsAt)}, ${formatClinicTime(result.data.startsAt)}`
      setSuccess(`Cita confirmada para ${patientName.trim()} con ${result.data.doctorName} (${when}).`)
      setPatientName('')
      setPatientEmail('')
      setPatientPhone('')
      setSelectedStart('')
      keyRef.current = null
      setReloadKey((k) => k + 1) // el horario ocupado desaparece de la lista
      onCreated() // actualiza "Citas confirmadas próximas"
    } else if (result.kind === 'error') {
      setFormError(result.status === 422 && result.message ? result.message : (ERROR_TEXT[result.code] ?? 'No se pudo registrar la cita.'))
      if (result.code === 'SLOT_UNAVAILABLE') {
        setSelectedStart('')
        setReloadKey((k) => k + 1)
      }
    } else {
      setFormError('El servicio no está disponible. No se registró la cita; intenta de nuevo en unos minutos.')
    }
  }

  return (
    <section aria-labelledby="phone-title" className="phone-booking">
      <h2 id="phone-title">Nueva cita telefónica</h2>
      <p className="lead small">La cita queda confirmada al instante. Los horarios mostrados ya excluyen las citas confirmadas.</p>
      {success && <p role="status" className="notice">{success}</p>}
      {doctorsError && <p role="alert" className="notice notice-error">No pudimos cargar los odontólogos.</p>}
      {doctors === null && !doctorsError && <p role="status">Cargando odontólogos…</p>}
      {doctors?.length === 0 && <p className="lead">No hay odontólogos activos.</p>}

      {doctors && doctors.length > 0 && (
        <form className="form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="phone-doctor">Odontólogo</label>
          <select id="phone-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={submitting}>
            <option value="">Selecciona un odontólogo</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.fullName}{d.specialty ? ` — ${d.specialty}` : ''}</option>
            ))}
          </select>
          <label htmlFor="phone-date">Fecha</label>
          <input id="phone-date" type="date" min={today} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />

          {slots.status === 'loading' && <p role="status">Buscando horarios…</p>}
          {slots.status === 'invalid' && <p role="alert" className="notice notice-error">{slots.message}</p>}
          {slots.status === 'error' && <p role="alert" className="notice notice-error">No pudimos consultar los horarios.</p>}
          {slots.status === 'ready' && slots.slots.length === 0 && <p role="status" className="notice">No hay horarios disponibles para esa fecha.</p>}
          {slots.status === 'ready' && slots.slots.length > 0 && (
            <>
              <p className="lead small" id="phone-slots-title">Horarios disponibles</p>
              <ul className="slot-list selectable" aria-labelledby="phone-slots-title">
                {slots.slots.map((slot) => (
                  <li key={slot.startAt}>
                    <button type="button" className="slot-button" aria-pressed={selectedStart === slot.startAt} onClick={() => { setSelectedStart(slot.startAt); setFormError(null) }}>
                      <time dateTime={slot.startAt}>{formatClinicTime(slot.startAt)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {selectedStart && (
            <>
              <label htmlFor="phone-name">Nombre del paciente</label>
              <input id="phone-name" required maxLength={100} value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={submitting} />
              <label htmlFor="phone-email">Correo</label>
              <input id="phone-email" type="email" required maxLength={254} value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} disabled={submitting} />
              <label htmlFor="phone-phone">Teléfono (opcional)</label>
              <input id="phone-phone" type="tel" maxLength={25} value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} disabled={submitting} />
              {formError && <p role="alert" className="notice notice-error">{formError}</p>}
              <button type="submit" disabled={submitting}>{submitting ? 'Confirmando…' : 'Confirmar cita'}</button>
            </>
          )}
          {!selectedStart && formError && <p role="alert" className="notice notice-error">{formError}</p>}
        </form>
      )}
    </section>
  )
}
