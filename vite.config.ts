import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 4173,
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.spec.ts'],
    css: true,
  },
})
