import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
  },
  projects: [
    { name: 'movil-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
