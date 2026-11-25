import { AppLink } from '../../components/AppLink'

/** Opción de administración todavía sin funcionalidad: se explica y no ofrece acciones. */
export function PendingFeaturePage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="notice" role="status"><span className="badge">Pendiente</span> {description}</p>
    </>
  )
}

/** URL escrita a mano hacia una pantalla restringida (el backend además rechaza cualquier API con 403). */
export function RestrictedPage() {
  return (
    <>
      <h1 className="page-title">Sin acceso</h1>
      <p className="notice notice-error" role="alert">Tu rol no tiene acceso a esta sección.</p>
      <p className="lead"><AppLink to="/admin" className="text-link">Volver al inicio</AppLink></p>
    </>
  )
}

export function NotFoundPage() {
  return (
    <>
      <h1 className="page-title">Página no encontrada</h1>
      <p className="lead">La sección que buscas no existe.</p>
      <p className="lead"><AppLink to="/admin" className="text-link">Volver al inicio</AppLink></p>
    </>
  )
}
