import { seedSynthetic } from '../tests-emu/seed'

/** Siembra datos sintéticos en los emuladores antes de las pruebas de navegador. */
export default async function globalSetup(): Promise<void> {
  await seedSynthetic()
}
