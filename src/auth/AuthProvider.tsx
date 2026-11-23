import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchStaffProfile } from '../lib/staffApi'
import { AuthContext, type AuthContextValue, type AuthState } from './context'
import { classifySignInError } from './messages'

const initialState: AuthState = supabase
  ? { status: 'loading', profile: null, notice: null }
  : { status: 'unconfigured', profile: null, notice: null } // faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    // El rol se obtiene SIEMPRE del backend, que valida el token y lee staff_profiles.
    async function resolve(session: Session | null) {
      if (!session) {
        if (active) setState((prev) => ({ status: 'signed-out', profile: null, notice: prev.notice }))
        return
      }
      setState((prev) => (prev.status === 'authorized' ? prev : { status: 'loading', profile: null, notice: null }))
      const result = await fetchStaffProfile(session.access_token)
      if (!active) return
      if (result.kind === 'ok') setState({ status: 'authorized', profile: result.profile, notice: null })
      else if (result.kind === 'forbidden') setState({ status: 'forbidden', profile: null, notice: null })
      else if (result.kind === 'unavailable') setState({ status: 'unavailable', profile: null, notice: null })
      else {
        setState({ status: 'signed-out', profile: null, notice: 'session-expired' })
        void client.auth.signOut()
      }
    }

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return
      // Se difiere para no llamar a Supabase dentro del propio callback de autenticación.
      setTimeout(() => void resolve(session), 0)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    if (!supabase) return { ok: false, reason: 'unavailable' }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) return { ok: false, reason: classifySignInError(error) }
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut().catch(() => undefined)
    setState({ status: 'signed-out', profile: null, notice: null })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ ...state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
