import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  DEFAULT_WEEKLY_SCHEDULE,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_NAMES,
  validateDoctorFields,
  validateWindows,
  type ScheduleWindow,
} from '../../../shared/schedule'
import {
  createAdminDoctor,
  listAdminDoctors,
  saveDoctorSchedule,
  updateAdminDoctor,
  type AdminDoctor,
  type AdminResult,
} from '../../lib/adminApi'

const NEW = 'new'

interface Notice {
  id: number
  tone: 'ok' | 'error'
  text: string
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const defaults = (): ScheduleWindow[] => DEFAULT_WEEKLY_SCHEDULE.map((w) => ({ ...w }))

function failureText(result: AdminResult<unknown>, fallback: string): string {
  if (result.kind === 'unavailable') return 'El servicio no está disponible. No se hizo ningún cambio.'
  if (result.kind === 'error') {
    if (result.status === 403) return 'Solo el administrador puede gestionar odontólogos y horarios.'
    if (result.status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.'
    if (result.message) return result.message // 422 y 409 traen un mensaje claro del servidor
  }
  return fallback
}

/** Administración de odontólogos y horarios (RF-02). Exclusivo de `admin`; el servidor vuelve a validar cada operación. */
export function DoctorsPage() {
  const [doctors, setDoctors] = useState<AdminDoctor[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState('')
  const [fullName, setFullName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [windows, setWindows] = useState<ScheduleWindow[]>(defaults())
  const [busy, setBusy] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])

  const notify = (tone: Notice['tone'], text: string) =>
    setNotices((list) => [{ id: Date.now() + Math.random(), tone, text }, ...list].slice(0, 4))

  const load = useCallback(async () => {
    const result = await listAdminDoctors()
    if (result.kind === 'ok') {
      setDoctors(result.data.doctors)
      setLoadError(false)
    } else {
      setLoadError(true)
    }
    return result.kind === 'ok' ? result.data.doctors : null
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function choose(id: string, list: AdminDoctor[] | null = doctors) {
    setSelected(id)
    if (id === NEW || id === '') {
      setFullName('')
      setSpecialty('')
      setIsActive(true)
      setWindows(defaults())
      return
    }
    const doctor = list?.find((d) => d.id === id)
    if (doctor) {
      setFullName(doctor.fullName)
      setSpecialty(doctor.specialty)
      setIsActive(doctor.isActive)
      setWindows(doctor.windows.map((w) => ({ ...w })))
    }
  }

  const isNew = selected === NEW
  const hasSelection = selected !== ''

  function updateWindow(index: number, field: 'startTime' | 'endTime', value: string) {
    setWindows((list) => list.map((w, i) => (i === index ? { ...w, [field]: value } : w)))
  }
  const removeWindow = (index: number) => setWindows((list) => list.filter((_, i) => i !== index))
  const addWindow = (weekday: number) => setWindows((list) => [...list, { weekday, startTime: '08:00', endTime: '12:00' }])

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !hasSelection) return
    const fields = validateDoctorFields({ fullName, specialty })
    if (!fields.ok) return notify('error', fields.message)

    if (isNew) {
      const check = validateWindows(windows)
      if (!check.ok) return notify('error', check.message)
      setBusy(true)
      const result = await createAdminDoctor({ ...fields.value, windows: check.value })
      setBusy(false)
      if (result.kind !== 'ok') return notify('error', failureText(result, 'No se pudo crear el odontólogo.'))
      notify('ok', `Odontólogo creado: ${fields.value.fullName}. Ya aparece en los selectores de citas.`)
      const list = await load()
      choose(result.data.doctor.id, list)
      return
    }

    setBusy(true)
    const result = await updateAdminDoctor(selected, { ...fields.value, isActive })
    setBusy(false)
    if (result.kind !== 'ok') return notify('error', failureText(result, 'No se pudieron guardar los datos.'))
    notify('ok', isActive
      ? `Datos guardados: ${fields.value.fullName}.`
      : `Datos guardados. ${fields.value.fullName} quedó inactivo: ya no aparece para nuevas solicitudes ni citas (su historial se conserva).`)
    const list = await load()
    choose(selected, list)
  }

  async function saveSchedule() {
    if (busy || !hasSelection || isNew) return
    const check = validateWindows(windows)
    if (!check.ok) return notify('error', check.message)
    setBusy(true)
    const result = await saveDoctorSchedule(selected, check.value)
    setBusy(false)
    if (result.kind !== 'ok') return notify('error', failureText(result, 'No se pudo guardar el horario.'))
    notify('ok', 'Horario guardado.')
    const list = await load()
    choose(selected, list)
  }

  return (
    <>
      <h1 className="page-title">Odontólogos y horarios</h1>
      <p className="lead">
        Crea odontólogos, edítalos, actívalos o desactívalos y define sus franjas semanales. Los selectores de Nueva cita y de la página pública
        muestran los odontólogos <strong>activos</strong> de esta misma lista.
      </p>

      {loadError && (
        <p role="alert" className="notice notice-error">
          No pudimos cargar los odontólogos. <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button>
        </p>
      )}
      {doctors === null && !loadError && <p role="status">Cargando odontólogos…</p>}

      <div role="status" aria-live="polite">
        {notices.map((n) => (
          <p key={n.id} className={n.tone === 'ok' ? 'notice' : 'notice notice-error'}>{n.text}</p>
        ))}
      </div>

      {doctors && (
        <div className="form">
          <label htmlFor="doctor-picker">Odontólogo</label>
          <select id="doctor-picker" value={selected} onChange={(event) => choose(event.target.value)} disabled={busy}>
            <option value="">Selecciona un odontólogo</option>
            <option value={NEW}>+ Nuevo odontólogo</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.fullName}{d.isActive ? '' : ' (inactivo)'}</option>
            ))}
          </select>
        </div>
      )}

      {doctors && !hasSelection && doctors.length === 0 && (
        <p className="notice">Todavía no hay odontólogos. Elige "Nuevo odontólogo" para crear el primero.</p>
      )}

      {hasSelection && (
        <>
          <form className="form doctor-card" onSubmit={saveDetails} noValidate aria-label="Datos del odontólogo">
            <h2 className="section-title">{isNew ? 'Nuevo odontólogo' : 'Datos'}</h2>
            <label htmlFor="doctor-name">Nombre completo</label>
            <input id="doctor-name" maxLength={100} required value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={busy} />
            <label htmlFor="doctor-specialty">Especialidad</label>
            <input id="doctor-specialty" maxLength={100} required value={specialty} onChange={(e) => setSpecialty(e.target.value)} disabled={busy} />
            {!isNew && (
              <label className="check-row" htmlFor="doctor-active">
                <input id="doctor-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={busy} />
                Activo (disponible para nuevas solicitudes y citas)
              </label>
            )}
            {isNew && <p className="lead small">Se crea activo. Ajusta el horario aquí abajo si no usará el predeterminado.</p>}
            <div>
              <button type="submit" disabled={busy}>{busy ? 'Guardando…' : isNew ? 'Crear odontólogo' : 'Guardar datos'}</button>
            </div>
          </form>

          <section className="doctor-card" aria-labelledby="schedule-title">
            <h2 id="schedule-title" className="section-title">Horario semanal</h2>
            <p className="lead small">
              Predeterminado del proyecto: lunes a viernes de 8:00 a 17:00 y sábados de 9:00 a 13:00. Las horas son en punto o y media (hora de Costa Rica).
            </p>
            <ul className="schedule-days">
              {WEEKDAY_DISPLAY_ORDER.map((day) => {
                const rows = windows.map((w, index) => ({ w, index })).filter((x) => x.w.weekday === day)
                return (
                  <li key={day} className="schedule-day">
                    <span className="schedule-day-name">{cap(WEEKDAY_NAMES[day])}</span>
                    <div className="schedule-day-rows">
                      {rows.length === 0 && <span className="schedule-closed">Cerrado</span>}
                      {rows.map(({ w, index }) => (
                        <span key={index} className="schedule-range">
                          <label className="sr-only" htmlFor={`start-${index}`}>Inicio {WEEKDAY_NAMES[day]}</label>
                          <input id={`start-${index}`} type="time" step={1800} value={w.startTime} onChange={(e) => updateWindow(index, 'startTime', e.target.value)} disabled={busy} />
                          <span aria-hidden="true">a</span>
                          <label className="sr-only" htmlFor={`end-${index}`}>Fin {WEEKDAY_NAMES[day]}</label>
                          <input id={`end-${index}`} type="time" step={1800} value={w.endTime} onChange={(e) => updateWindow(index, 'endTime', e.target.value)} disabled={busy} />
                          <button type="button" className="secondary compact" onClick={() => removeWindow(index)} disabled={busy} aria-label={`Quitar franja de ${WEEKDAY_NAMES[day]}`}>Quitar</button>
                        </span>
                      ))}
                      <button type="button" className="secondary compact" onClick={() => addWindow(day)} disabled={busy}>Agregar franja</button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div>
              {!isNew && <button type="button" disabled={busy} onClick={() => void saveSchedule()}>{busy ? 'Guardando…' : 'Guardar horario'}</button>}
              <button type="button" className="secondary" disabled={busy} onClick={() => setWindows(defaults())}>Restablecer horario predeterminado</button>
            </div>
            {!isNew && <p className="lead small">"Restablecer" solo rellena el formulario; el horario cambia cuando pulsas "Guardar horario".</p>}
          </section>
        </>
      )}
    </>
  )
}
