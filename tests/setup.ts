import { vi } from 'vitest'

// Las pruebas unitarias de UI no hablan con Firebase: se sustituye el cliente y Auth.
vi.mock('../src/firebase/client', () => ({
  firebaseApp: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
  usingEmulators: true,
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'test-uid' } })),
  signOut: vi.fn(async () => {}),
}))

// La guarda de navegación no debe revalidar contra Firestore en pruebas unitarias.
vi.mock('../src/stores/session', async (importActual) => {
  const actual = await importActual<typeof import('../src/stores/session')>()
  return {
    ...actual,
    ensureSession: vi.fn(async () => {}),
    revalidateBinding: vi.fn(async () => {}),
  }
})
