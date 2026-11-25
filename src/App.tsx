import { useEffect } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { resolveGuard } from './auth/guard'
import { useAuth } from './auth/useAuth'
import { AdminDashboard } from './pages/AdminDashboard'
import { AvailabilityPage } from './pages/AvailabilityPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { navigate, usePathname } from './router'

function Loading() {
  return (
    <main className="app-shell">
      <p role="status" aria-live="polite">Cargando…</p>
    </main>
  )
}

function Routes() {
  const pathname = usePathname()
  const { status } = useAuth()
  const decision = resolveGuard(pathname, status)

  useEffect(() => {
    if (decision.kind === 'redirect') navigate(decision.to, { replace: true })
  }, [decision])

  if (decision.kind !== 'render') return <Loading />
  if (pathname === '/login') return <LoginPage />
  if (pathname === '/disponibilidad') return <AvailabilityPage />
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <AdminDashboard />
  return <LandingPage />
}

function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  )
}

export default App
