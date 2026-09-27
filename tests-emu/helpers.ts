import { initializeApp as initializeClientApp } from 'firebase/app'
import { connectAuthEmulator, getAuth as getClientAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore as getClientFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { PROJECT, adminAuth, adminDb, adminUpload, hashCode, IDS, seedSynthetic, Timestamp } from './seed'

export { PROJECT, adminAuth, adminDb, adminUpload, hashCode, IDS, seedSynthetic, Timestamp }

function hostPort(envName: string, fallback: string): { host: string; port: number } {
  const raw = process.env[envName] || fallback
  const [host, port] = raw.split(':')
  return { host: host || '127.0.0.1', port: Number(port || fallback.split(':')[1]) }
}

const firestoreEP = hostPort('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080')
const authEP = hostPort('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
const functionsEP = { host: '127.0.0.1', port: 5001 }

function makeClientApp() {
  const app = initializeClientApp({ projectId: PROJECT, apiKey: 'demo-api-key', appId: 'demo-app' }, `c-${Math.random().toString(36).slice(2)}`)
  const auth = getClientAuth(app)
  const db = getClientFirestore(app)
  const functions = getFunctions(app)
  connectAuthEmulator(auth, `http://${authEP.host}:${authEP.port}`, { disableWarnings: true })
  connectFirestoreEmulator(db, firestoreEP.host, firestoreEP.port)
  connectFunctionsEmulator(functions, functionsEP.host, functionsEP.port)
  return { app, auth, db, functions }
}

export async function studentClient() {
  const c = makeClientApp()
  const cred = await signInAnonymously(c.auth)
  return { ...c, uid: cred.user.uid }
}

export async function teacherClient(uid: string) {
  const c = makeClientApp()
  const token = await adminAuth.createCustomToken(uid)
  await signInWithCustomToken(c.auth, token)
  return { ...c, uid }
}
