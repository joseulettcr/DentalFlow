import { createContext } from 'react'
import type { StaffProfile } from '../lib/staffApi'
import type { AuthStatus } from './guard'
import type { SignInFailure } from './messages'

export interface AuthState {
  status: AuthStatus
  profile: StaffProfile | null
  /** Aviso de una sola vez en /login (por ejemplo, sesión vencida). */
  notice: 'session-expired' | null
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; reason: SignInFailure }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
