import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Solo la clave pública (anon/publishable). La service_role nunca llega al navegador.
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null
