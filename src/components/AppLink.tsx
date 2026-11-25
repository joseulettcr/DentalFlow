import type { MouseEvent, ReactNode } from 'react'
import { navigate } from '../router'

/** Enlace de la SPA: navega sin recargar, pero conserva el comportamiento normal (nueva pestaña, Ctrl/Cmd+clic). */
export function AppLink({
  to,
  className,
  current,
  onNavigate,
  children,
}: {
  to: string
  className?: string
  current?: boolean
  onNavigate?: () => void
  children: ReactNode
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
    onNavigate?.()
  }
  return (
    <a href={to} className={className} aria-current={current ? 'page' : undefined} onClick={handleClick}>
      {children}
    </a>
  )
}
