import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { SIGN_IN_MESSAGES, type SignInFailure } from '../auth/messages'

export function LoginPage() {
  const { signIn, notice, status } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<SignInFailure | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFailure(null)
    const result = await signIn(email, password)
    if (!result.ok) {
      setFailure(result.reason)
      setPassword('')
      setSubmitting(false)
    }
    // Si fue correcto, AuthProvider resuelve el rol y la ruta se redirige sola.
  }

  const configMissing = status === 'unconfigured'

  return (
    <main className="app-shell">
      <section aria-labelledby="login-title" className="welcome-card">
        <p className="eyebrow">Acceso del personal</p>
        <h1 id="login-title" className="page-title">Iniciar sesión</h1>

        {notice === 'session-expired' && (
          <p className="notice" role="status">Tu sesión venció. Inicia sesión de nuevo.</p>
        )}
        {configMissing && (
          <p className="notice notice-error" role="alert">
            El inicio de sesión no está configurado en este entorno.
          </p>
        )}
        {failure && (
          <p className="notice notice-error" role="alert">{SIGN_IN_MESSAGES[failure]}</p>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-email">Correo</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting || configMissing}
          />
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting || configMissing}
          />
          <button type="submit" disabled={submitting || configMissing || !email || !password}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  )
}
