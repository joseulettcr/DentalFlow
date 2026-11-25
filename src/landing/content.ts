// Contenido de la landing page (RF-11). Todo es FICTICIO: clínica simulada, contacto inventado, servicios ilustrativos
// (sin precios ni promesas de disponibilidad por servicio, CA-11e).

export type ServiceTone = 'aqua' | 'sky' | 'violet' | 'sun' | 'coral' | 'mint'
export type ServiceIcon = 'tooth' | 'sparkle' | 'braces' | 'sun' | 'pulse' | 'smile'

export interface ServiceCard {
  id: string
  title: string
  text: string
  tone: ServiceTone
  icon: ServiceIcon
}

export const SERVICES: readonly ServiceCard[] = [
  { id: 'general', title: 'Odontología general', text: 'Revisión, diagnóstico y tratamiento de caries para toda la familia.', tone: 'aqua', icon: 'tooth' },
  { id: 'limpieza', title: 'Limpieza y prevención', text: 'Profilaxis y controles periódicos para cuidar tus encías y el esmalte.', tone: 'sky', icon: 'sparkle' },
  { id: 'ortodoncia', title: 'Ortodoncia', text: 'Alineación de dientes y mordida con seguimiento personalizado.', tone: 'violet', icon: 'braces' },
  { id: 'blanqueamiento', title: 'Blanqueamiento dental', text: 'Aclara el tono de tus dientes de forma gradual y segura.', tone: 'sun', icon: 'sun' },
  { id: 'endodoncia', title: 'Endodoncia', text: 'Tratamiento de conductos para conservar piezas con dolor o infección.', tone: 'coral', icon: 'pulse' },
  { id: 'infantil', title: 'Odontología infantil', text: 'Atención amable para que los más pequeños pierdan el miedo al dentista.', tone: 'mint', icon: 'smile' },
]

export const STEPS: readonly { title: string; text: string }[] = [
  { title: 'Elige tu horario', text: 'Selecciona odontólogo, fecha y una hora libre. Solo ves horarios disponibles.' },
  { title: 'Envía tu solicitud', text: 'Escribe tus datos. No necesitas crear una cuenta.' },
  { title: 'La clínica te contacta', text: 'El personal revisa tu solicitud y se comunica contigo para confirmar la cita.' },
]

export const CONTACT = {
  name: 'Clínica Dental Flow',
  location: 'Oreamuno de Cartago, Costa Rica',
  phoneDisplay: '2500 0002',
  phoneHref: 'tel:25000002',
  email: 'info@dentalflow.example',
  hours: 'Lunes a viernes, de 8:00 a 17:00 · Sábados, de 9:00 a 13:00',
} as const

/** Rutas a las que enlaza la landing: solo páginas públicas y el acceso al login del personal (CA-11c). */
export const LANDING_LINKS = { staffAccess: '/login', availability: '/disponibilidad' } as const

export const NAV_ITEMS: readonly { href: string; label: string }[] = [
  { href: '#servicios', label: 'Servicios' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#solicitar', label: 'Solicitar cita' },
  { href: '#contacto', label: 'Contacto' },
]
