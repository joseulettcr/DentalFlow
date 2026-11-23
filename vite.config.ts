import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Las pruebas de integración requieren un proyecto Supabase Cloud de pruebas y se
    // ejecutan aparte (npm run test:p10); ver supabase/README.md.
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
  },
})
