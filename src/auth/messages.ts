export type SignInFailure = 'invalid_credentials' | 'unavailable'

/** Traduce el error de Supabase Auth a un motivo de interfaz sin revelar si el correo existe. */
export function classifySignInError(error: { status?: number; code?: string; message?: string } | null | undefined): SignInFailure {
  if (!error) return 'unavailable'
  if (error.code === 'invalid_credentials' || error.status === 400 || error.status === 401) return 'invalid_credentials'
  return 'unavailable'
}

export const SIGN_IN_MESSAGES: Record<SignInFailure, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  unavailable: 'No pudimos iniciar sesión por un problema del servicio. Intenta de nuevo en unos minutos.',
}
