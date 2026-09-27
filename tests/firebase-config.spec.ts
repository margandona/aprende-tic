import { describe, it, expect } from 'vitest'
import { DEMO_PROJECT_ID, resolveFirebaseConfig } from '../src/firebase/config'

describe('resolveFirebaseConfig (fallo cerrado de entorno)', () => {
  it('usa el proyecto demo cuando VITE_USE_EMULATORS=true', () => {
    const r = resolveFirebaseConfig({ VITE_USE_EMULATORS: 'true' })
    expect(r.useEmulators).toBe(true)
    expect(r.config.projectId).toBe(DEMO_PROJECT_ID)
  })

  it('falla si falta configuración explícita sin emuladores', () => {
    expect(() => resolveFirebaseConfig({})).toThrow(/incompleta/i)
  })

  it('falla si apunta al proyecto demo sin emuladores (build no autorizada)', () => {
    expect(() =>
      resolveFirebaseConfig({
        VITE_FIREBASE_PROJECT_ID: DEMO_PROJECT_ID,
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_APP_ID: 'a',
        VITE_FIREBASE_STORAGE_BUCKET: 'b',
      }),
    ).toThrow(/demo/i)
  })

  it('acepta una configuración real', () => {
    const r = resolveFirebaseConfig({
      VITE_FIREBASE_PROJECT_ID: 'proyecto-real',
      VITE_FIREBASE_API_KEY: 'k',
      VITE_FIREBASE_APP_ID: 'a',
      VITE_FIREBASE_STORAGE_BUCKET: 'b',
    })
    expect(r.useEmulators).toBe(false)
    expect(r.config.projectId).toBe('proyecto-real')
  })
})
