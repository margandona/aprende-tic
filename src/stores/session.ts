import { reactive } from 'vue'
import { onAuthStateChanged, signInAnonymously, signOut as fbSignOut } from 'firebase/auth'
import { auth } from '../firebase/client'

export interface Binding {
  enrollmentId: string
  courseId: string
  pseudonym: string
}

const BINDING_KEY = 'redtic_binding'

function loadBinding(): Binding | null {
  try {
    const raw = sessionStorage.getItem(BINDING_KEY)
    return raw ? (JSON.parse(raw) as Binding) : null
  } catch {
    return null
  }
}

const storedBinding = loadBinding()

/** Sesión de la app: usuario anónimo de Auth + vínculo (binding) obtenido por canje. */
export const session = reactive<{
  ready: boolean
  uid: string | null
  role: 'student' | 'teacher' | null
  binding: Binding | null
}>({
  ready: false,
  uid: null,
  role: storedBinding ? 'student' : null,
  binding: storedBinding,
})

/** Estado de demostración (carga / vacío / error) sobre datos reales del emulador. */
export const demo = reactive<{ state: 'ok' | 'loading' | 'empty' | 'error' }>({ state: 'ok' })
export function setDemoState(state: 'ok' | 'loading' | 'empty' | 'error'): void {
  demo.state = state
}

onAuthStateChanged(auth, (user) => {
  session.uid = user?.uid ?? null
})

/** Garantiza una sesión anónima de Firebase Auth. */
export async function ensureAuth(): Promise<void> {
  if (auth.currentUser) {
    session.uid = auth.currentUser.uid
    session.ready = true
    return
  }
  try {
    const cred = await signInAnonymously(auth)
    session.uid = cred.user.uid
  } catch {
    // Emuladores no disponibles: la app mostrará estados de error en las lecturas.
  }
  session.ready = true
}

export function setBinding(binding: Binding): void {
  session.binding = binding
  session.role = 'student'
  try {
    sessionStorage.setItem(BINDING_KEY, JSON.stringify(binding))
  } catch {
    /* ignore */
  }
}

export function clearBinding(): void {
  session.binding = null
  session.role = null
  try {
    sessionStorage.removeItem(BINDING_KEY)
  } catch {
    /* ignore */
  }
}

export async function logout(): Promise<void> {
  clearBinding()
  try {
    await fbSignOut(auth)
  } catch {
    /* ignore */
  }
  await ensureAuth()
}
