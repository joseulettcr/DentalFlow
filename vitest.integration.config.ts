import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Carga VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY desde .env.local (o del entorno del shell).
// P-10 solo usa variables públicas (VITE_*). T-03 usa además SUPABASE_DB_URL (secreto, solo en .env.local).
// Ninguna prueba usa la clave service_role.
export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ['VITE_', 'SUPABASE_DB_', 'SUPABASE_TEST_']),
    testTimeout: 20_000,
  },
}))
