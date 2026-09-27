import { vi } from 'vitest'

// Las pruebas unitarias de UI no hablan con Firebase: se sustituye el cliente y Auth.
vi.mock('../src/firebase/client', () => ({
  firebaseApp: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'test-uid' } })),
  signOut: vi.fn(async () => {}),
}))
