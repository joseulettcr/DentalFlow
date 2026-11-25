import { useEffect } from 'react'
import { AppLink } from '../components/AppLink'
import { CONTACT, LANDING_LINKS, NAV_ITEMS, SERVICES, STEPS } from '../landing/content'
import { HeroTooth, ServiceGlyph } from '../landing/icons'
import { AvailabilityPage } from './AvailabilityPage'

/** Landing pública de la Clínica Dental Flow (RF-11): presenta la clínica, recibe solicitudes sin login y enlaza al sitio administrativo. */
export function LandingPage() {
  useEffect(() => {
    document.title = 'Clínica Dental Flow · Oreamuno de Cartago'
  }, [])

  return (
    <div className="landing">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <header className="lp-header">
        <a className="lp-brand" href="#inicio" aria-label="Clínica Dental Flow, inicio">
          <span className="lp-brand-mark" aria-hidden="true">D</span>
          Dental Flow
        </a>
        <nav className="lp-nav" aria-label="Secciones de la página">
          {NAV_ITEMS.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <AppLink to={LANDING_LINKS.staffAccess} className="lp-staff">Acceso del personal</AppLink>
      </header>

      <main id="contenido">
        <section className="lp-hero" id="inicio" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Clínica odontológica · Oreamuno de Cartago</p>
            <h1 id="hero-title">
              Tu <span className="lp-smile-word">sonrisa<svg viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M4 6c30 22 162 22 192 0" /></svg></span>, sin filas ni esperas.
            </h1>
            <p className="lp-lead">Elige tu horario libre y envía tu solicitud en un minuto. Sin crear cuenta ni llamar por teléfono.</p>
            <div className="lp-cta">
              <a className="lp-btn lp-btn-primary" href="#solicitar">Solicitar cita</a>
              <a className="lp-btn lp-btn-ghost" href="#servicios">Ver servicios</a>
            </div>
            <ul className="lp-chips" aria-label="Datos rápidos">
              <li>{CONTACT.hours}</li>
              <li>Solicitud sin cuenta</li>
              <li>Tel. {CONTACT.phoneDisplay}</li>
            </ul>
          </div>
          <div className="lp-hero-art">
            <span className="lp-blob lp-blob-a" aria-hidden="true" />
            <span className="lp-blob lp-blob-b" aria-hidden="true" />
            <HeroTooth />
            <p className="lp-float lp-float-a">Horarios de 30 minutos</p>
            <p className="lp-float lp-float-b">Especialistas a tu servicio</p>
          </div>
        </section>

        <section className="lp-section" id="servicios" aria-labelledby="servicios-title">
          <div className="lp-section-head">
            <p className="lp-eyebrow">Servicios</p>
            <h2 id="servicios-title">Cuidado dental para cada etapa</h2>
            <p className="lp-lead">Atención general y especializada en un solo lugar.</p>
          </div>
          <ul className="lp-cards">
            {SERVICES.map((service) => (
              <li key={service.id} className={`lp-card lp-tone-${service.tone}`}>
                <span className="lp-card-icon"><ServiceGlyph name={service.icon} /></span>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
              </li>
            ))}
          </ul>
          <p className="lp-note">Servicios ilustrativos de una clínica simulada, sin precios. La disponibilidad real depende de los odontólogos y sus horarios.</p>
        </section>

        <section className="lp-section lp-steps-section" id="como-funciona" aria-labelledby="pasos-title">
          <div className="lp-section-head">
            <p className="lp-eyebrow">Cómo funciona</p>
            <h2 id="pasos-title">Pedir tu cita toma tres pasos</h2>
          </div>
          <ol className="lp-steps">
            {STEPS.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-booking" id="solicitar" aria-labelledby="solicitar-title">
          <div className="lp-booking-inner">
            <div className="lp-section-head">
              <p className="lp-eyebrow">Solicitar cita</p>
              <h2 id="solicitar-title">Reserva tu lugar</h2>
              <p className="lp-lead">Tu solicitud no es una cita confirmada hasta que la clínica la apruebe.</p>
            </div>
            <div className="lp-booking-card">
              <AvailabilityPage embedded />
            </div>
          </div>
        </section>

        <section className="lp-section" id="contacto" aria-labelledby="contacto-title">
          <div className="lp-section-head">
            <p className="lp-eyebrow">Contacto</p>
            <h2 id="contacto-title">Visítanos en Oreamuno</h2>
          </div>
          <ul className="lp-contact">
            <li>
              <span className="lp-contact-label">Ubicación</span>
              <strong>{CONTACT.location}</strong>
              <small>Dirección ficticia</small>
            </li>
            <li>
              <span className="lp-contact-label">Teléfono</span>
              <a href={CONTACT.phoneHref}><strong>{CONTACT.phoneDisplay}</strong></a>
              <small>Número ficticio</small>
            </li>
            <li>
              <span className="lp-contact-label">Correo</span>
              <a href={`mailto:${CONTACT.email}`}><strong>{CONTACT.email}</strong></a>
              <small>Correo ficticio</small>
            </li>
            <li>
              <span className="lp-contact-label">Horario</span>
              <strong>{CONTACT.hours}</strong>
              <small>Atención con cita</small>
            </li>
          </ul>
        </section>
      </main>

      <footer className="lp-footer">
        <p><strong>{CONTACT.name}</strong> · Clínica simulada con datos ficticios; no es un servicio médico real.</p>
        <p>
          <AppLink to={LANDING_LINKS.availability} className="lp-footer-link">Consultar disponibilidad</AppLink>
          {' · '}
          <AppLink to={LANDING_LINKS.staffAccess} className="lp-footer-link">Acceso del personal</AppLink>
        </p>
      </footer>
    </div>
  )
}
