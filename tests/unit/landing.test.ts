import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveGuard } from '../../src/auth/guard'
import { CONTACT, LANDING_LINKS, NAV_ITEMS, SERVICES, STEPS } from '../../src/landing/content'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const page = read('src/pages/LandingPage.tsx')

describe('landing page (RF-11, P-17)', () => {
  it('CA-11a: / es pública y no exige sesión', () => {
    expect(resolveGuard('/', 'signed-out')).toEqual({ kind: 'render' })
    expect(resolveGuard('/', 'unconfigured')).toEqual({ kind: 'render' })
  })

  it('CA-11a: la página contiene servicios, formulario, contacto y acceso del personal', () => {
    expect(page).toContain('SERVICES.map')
    expect(page).toContain('<AvailabilityPage embedded />')
    expect(page).toContain('id="contacto"')
    expect(page).toContain('LANDING_LINKS.staffAccess')
  })

  it('el menú apunta a secciones que existen', () => {
    for (const item of NAV_ITEMS) {
      const id = item.href.slice(1)
      expect(page, `falta la sección #${id}`).toContain(`id="${id}"`)
    }
  })

  it('CA-11c: el acceso del personal lleva a /login y la landing no enlaza rutas internas /admin', () => {
    expect(LANDING_LINKS.staffAccess).toBe('/login')
    expect(page).not.toMatch(/['"`]\/admin/)
  })

  it('CA-11d: contacto ficticio con la ubicación, el teléfono y el correo indicados', () => {
    expect(CONTACT.location).toContain('Oreamuno')
    expect(CONTACT.location).toContain('Cartago')
    expect(CONTACT.phoneDisplay.replace(/\s/g, '')).toBe('25000002')
    expect(CONTACT.phoneHref).toBe('tel:25000002')
    expect(CONTACT.email).toMatch(/@dentalflow\.example$/) // dominio reservado (RFC 2606): no es un correo real
    expect(page).toMatch(/Clínica simulada con datos ficticios/)
    expect(page).toContain('Dirección ficticia')
  })

  it('CA-11d: el horario general coincide con los horarios sembrados (08:00 a 17:00)', () => {
    const seed = read('supabase/seed.sql')
    expect(seed).toContain("time '08:00'")
    expect(seed).toContain("time '17:00'")
    expect(CONTACT.hours).toContain('8:00')
    expect(CONTACT.hours).toContain('17:00')
  })

  it('CA-11e: seis servicios únicos, informativos y sin precios', () => {
    expect(SERVICES).toHaveLength(6)
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(6)
    const text = JSON.stringify(SERVICES) + page
    expect(text).not.toMatch(/₡|\$\s?\d|descuento|promoci[oó]n|oferta/i) // sin montos ni promociones; el aviso 'sin precios' es válido
    expect(page).toContain('Servicios ilustrativos')
  })

  it('"Cómo funciona" describe la secuencia real: horario, solicitud y contacto de la clínica (sin promesas de confirmación automática)', () => {
    expect(STEPS).toHaveLength(3)
    expect(JSON.stringify(STEPS)).toContain('contacta')
    expect(page).toContain('no es una cita confirmada hasta que la clínica la apruebe')
  })

  it('CA-11b: el formulario incrustado usa solo las APIs públicas ya existentes', () => {
    const api = read('src/lib/availabilityApi.ts')
    const urls = [...api.matchAll(/['"`](\/api\/[^'"`?]+)/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).toMatch(/^\/api\/public\//)
    expect(read('src/pages/AvailabilityPage.tsx')).not.toContain('/api/admin')
  })

  it('CA-11g: /disponibilidad se conserva como página independiente', () => {
    const app = read('src/App.tsx')
    expect(app).toContain("pathname === '/disponibilidad'")
    expect(app).toContain('<AvailabilityPage />')
  })

  it('CA-11f: respeta movimiento reducido y tiene enlace para saltar al contenido', () => {
    expect(read('src/styles.css')).toContain('prefers-reduced-motion: reduce')
    expect(page).toContain('Saltar al contenido')
  })
})

describe('landing page renderizada (HTML real del componente)', () => {
  it('produce las secciones, el contacto ficticio, el formulario y los enlaces esperados', async () => {
    const { createElement } = await import('react')
    const { renderToString } = await import('react-dom/server')
    const { LandingPage } = await import('../../src/pages/LandingPage')
    const html = renderToString(createElement(LandingPage))

    for (const service of SERVICES) expect(html).toContain(service.title)
    expect(html).toContain('Oreamuno de Cartago, Costa Rica')
    expect(html).toContain('2500 0002')
    expect(html).toContain('info@dentalflow.example')
    expect(html).toContain('id="solicitar"')
    expect(html).toContain('Cargando odontólogos') // el formulario incrustado arranca cargando los odontólogos públicos
    expect(html).toContain('href="/login"')
    expect(html).not.toContain('href="/admin')
    expect(html).toContain('Acceso del personal')
    expect(html.match(/<h1/g)).toHaveLength(1) // un solo h1 por página
  })
})
