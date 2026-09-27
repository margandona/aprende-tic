import { reactive } from 'vue'
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken, signOut as fbSignOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/client'

export interface Binding {
  enrollmentId: string
  courseId: string
  pseudonym: string
}

export type SessionRole = 'student' | 'teacher'

/** Solo se persiste lo mínimo; nunca códigos ni credenciales. */
interface PersistedSession {
  uid: string
  role: SessionRole
  binding?: Binding
  displayName?: string
}

const STORAGE_KEY = 'redtic_session'

function readPersisted(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedSession) : null
  } catch {
    return null
  }
}
function writePersisted(value: PersistedSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
function clearPersisted(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export const session = reactive<{
  ready: boolean
  uid: string | null
  role: SessionRole | null
  binding: Binding | null
  displayName: string | null
  invalidated: boolean
}>({
  ready: false,
  uid: null,
  role: null,
  binding: null,
  displayName: null,
  invalidated: false,
})

export const demo = reactive<{ state: 'ok' | 'loading' | 'empty' | 'error' }>({ state: 'ok' })
export function setDemoState(state: 'ok' | 'loading' | 'empty' | 'error'): void {
  demo.state = state
}

let revalidatedForUid: string | null = null
let firstAuthInit: Promise<void> | null = null

/** Espera la primera emisión de Auth (restauración de la sesión persistida). */
function waitForAuthInit(): Promise<void> {
  if (firstAuthInit) return firstAuthInit
  firstAuthInit = new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub()
      resolve()
    })
  })
  return firstAuthInit
}

function clearSessionLocal(): void {
  session.binding = null
  session.role = null
  session.displayName = null
  clearPersisted()
}

onAuthStateChanged(auth, (user) => {
  const uid = user?.uid ?? null
  // Solo se limpia ante una rotación real (había un UID y cambió), no en la restauración inicial.
  if (session.uid && uid !== session.uid) {
    clearSessionLocal()
    revalidatedForUid = null
  }
  session.uid = uid
  session.ready = true
})

export async function ensureAuth(): Promise<void> {
  // `authStateReady` espera a que Auth restaure la sesión persistida (evita crear un
  // usuario anónimo nuevo antes de recuperar el UID guardado).
  const maybeReady = (auth as unknown as { authStateReady?: () => Promise<void> }).authStateReady
  if (typeof maybeReady === 'function') {
    await maybeReady.call(auth)
  } else {
    await waitForAuthInit()
  }
  if (auth.currentUser) {
    session.uid = auth.currentUser.uid
    session.ready = true
    return
  }
  try {
    const cred = await signInAnonymously(auth)
    session.uid = cred.user.uid
  } catch {
    /* emuladores no disponibles */
  }
  session.ready = true
}

/**
 * Revalida la sesión guardada:
 *  - docente: restaura el rol si el UID coincide.
 *  - estudiante: comprueba el vínculo contra `sessionBindings/{uid}` en el servidor.
 */
export async function revalidateBinding(): Promise<void> {
  const uid = session.uid
  if (!uid) {
    clearSessionLocal()
    return
  }
  if (revalidatedForUid === uid) return

  const persisted = readPersisted()
  if (!persisted || persisted.uid !== uid) {
    clearSessionLocal()
    revalidatedForUid = uid
    return
  }

  if (persisted.role === 'teacher') {
    session.binding = null
    session.role = 'teacher'
    session.displayName = persisted.displayName ?? 'Docente'
    revalidatedForUid = uid
    return
  }

  if (!persisted.binding) {
    clearSessionLocal()
    revalidatedForUid = uid
    return
  }

  try {
    const snap = await getDoc(doc(db, 'sessionBindings', uid))
    const data = snap.data()
    const expiresAt = data?.expiresAt as { toMillis?: () => number } | undefined
    const valid =
      snap.exists() &&
      data?.state === 'active' &&
      typeof expiresAt?.toMillis === 'function' &&
      expiresAt.toMillis() > Date.now() &&
      data.enrollmentId === persisted.binding.enrollmentId &&
      data.courseId === persisted.binding.courseId
    if (valid) {
      session.binding = persisted.binding
      session.role = 'student'
    } else {
      clearSessionLocal()
    }
  } catch {
    clearSessionLocal()
  }
  revalidatedForUid = uid
}

/** Asegura Auth y revalida la sesión una vez por UID. */
export async function ensureSession(): Promise<void> {
  await ensureAuth()
  await revalidateBinding()
}

export function setBinding(binding: Binding): void {
  session.binding = binding
  session.role = 'student'
  session.displayName = binding.pseudonym
  session.invalidated = false
  if (session.uid) writePersisted({ uid: session.uid, role: 'student', binding })
}

/** Inicia sesión docente de demostración (solo emuladores) con un token personalizado. */
export async function signInAsTeacher(token: string, teacherUid: string, displayName: string): Promise<void> {
  await signInWithCustomToken(auth, token)
  session.uid = teacherUid
  session.binding = null
  session.role = 'teacher'
  session.displayName = displayName
  session.invalidated = false
  revalidatedForUid = teacherUid
  writePersisted({ uid: teacherUid, role: 'teacher', displayName })
}

export function clearBinding(): void {
  clearSessionLocal()
}

/** Marca la sesión como inválida (revocación/expiración detectada en una lectura). */
export function invalidateSession(): void {
  clearSessionLocal()
  session.invalidated = true
  revalidatedForUid = null
}

export async function logout(): Promise<void> {
  clearSessionLocal()
  session.invalidated = false
  revalidatedForUid = null
  try {
    await fbSignOut(auth)
  } catch {
    /* ignore */
  }
  await ensureAuth()
}
