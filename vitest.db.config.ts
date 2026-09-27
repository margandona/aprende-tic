import { defineConfig } from 'vitest/config'

// Pruebas de integración SQL sobre PostgreSQL aislado (PGlite/WASM).
// No usa Docker ni credenciales reales.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests-db/**/*.spec.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    fileParallelism: false,
  },
})
