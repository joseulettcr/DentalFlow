import { AppLink } from '../../components/AppLink'
import { PhoneBookingPanel } from '../PhoneBookingPanel'

export function NewAppointmentPage() {
  return (
    <>
      <h1 className="page-title">Nueva cita telefónica</h1>
      <PhoneBookingPanel onCreated={() => undefined} />
      <p className="lead small"><AppLink to="/admin/citas" className="text-link">Ver citas confirmadas</AppLink></p>
    </>
  )
}
