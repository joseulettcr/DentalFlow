import { useSyncExternalStore } from 'react'

// Enrutado mínimo basado en History API (evita agregar una dependencia para tres rutas).
const EVENT = 'dentalflow:navigate'

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener(EVENT, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(EVENT, listener)
  }
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (to === window.location.pathname) return
  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new Event(EVENT))
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => '/')
}
