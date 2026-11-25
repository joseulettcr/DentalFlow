import type { ServiceIcon } from './content'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Íconos simples de trazo para las tarjetas de servicios (decorativos: el texto de la tarjeta ya describe el servicio). */
export function ServiceGlyph({ name }: { name: ServiceIcon }) {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false" {...STROKE}>
      {name === 'tooth' && <path d="M16 6c-3-2-9-1-9 5 0 4 2 6 2 11 0 3 2 4 3 1l1-5c.3-1 .8-1.500 3-1.500s2.700.5 3 1.500l1 5c1 3 3 2 3-1 0-5 2-7 2-11 0-6-6-7-9-5Z" />}
      {name === 'sparkle' && <path d="M16 4v6M16 22v6M4 16h6M22 16h6M9 9l3 3M20 20l3 3M23 9l-3 3M12 20l-3 3" />}
      {name === 'braces' && <><rect x="4" y="10" width="24" height="12" rx="6" /><path d="M10 16h12M12 10v12M20 10v12" /></>}
      {name === 'sun' && <><circle cx="16" cy="16" r="5" /><path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.500 7.500l2 2M22.500 22.500l2 2M24.500 7.500l-2 2M9.500 22.500l-2 2" /></>}
      {name === 'pulse' && <path d="M3 17h6l3-8 5 15 3-7h9" />}
      {name === 'smile' && <><circle cx="16" cy="16" r="11" /><path d="M11 18c1.500 3 8.500 3 10 0M12 12v1M20 12v1" /></>}
    </svg>
  )
}

/** Ilustración principal del hero: un diente amable sobre formas fluidas. */
export function HeroTooth() {
  return (
    <svg className="lp-tooth" viewBox="0 0 320 340" role="img" aria-label="Ilustración de un diente sonriente">
      <defs>
        <linearGradient id="toothFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d7f4ee" />
        </linearGradient>
      </defs>
      <path d="M160 30c-38-26-112-12-112 62 0 50 26 78 26 134 0 36 24 50 36 16l16-62c4-12 10-18 34-18s30 6 34 18l16 62c12 34 36 20 36-16 0-56 26-84 26-134 0-74-74-88-112-62Z" fill="url(#toothFill)" stroke="#0a2b3d" strokeWidth="6" strokeLinejoin="round" />
      <path d="M112 116c10 22 26 32 48 32s38-10 48-32" fill="none" stroke="#0a2b3d" strokeWidth="6" strokeLinecap="round" />
      <circle cx="122" cy="92" r="7" fill="#0a2b3d" />
      <circle cx="198" cy="92" r="7" fill="#0a2b3d" />
      <path d="M96 70c10-14 26-20 40-18" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" opacity=".9" />
    </svg>
  )
}
