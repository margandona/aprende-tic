import { defineConfig } from 'vitest/config'

// Pruebas contra Firebase Emulator Suite (Auth, Firestore, Storage, Functions).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests-emu/**/*.spec.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    pool: 'forks',
    fileParallelism: false,
  },
})
