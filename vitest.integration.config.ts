import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Carga VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY desde .env.local (o del entorno del shell).
// Solo se leen variables públicas: estas pruebas nunca usan la clave service_role.
export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), 'VITE_'),
    testTimeout: 20_000,
  },
}))
