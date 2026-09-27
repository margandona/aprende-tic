import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

// Configuración pública de SDK para el proyecto de EMULADORES (sin claves privadas).
const firebaseConfig = {
  projectId: 'demo-red-tic',
  apiKey: 'demo-api-key',
  appId: 'demo-app',
  authDomain: 'demo-red-tic.firebaseapp.com',
  storageBucket: 'demo-red-tic.appspot.com',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
export const functions = getFunctions(firebaseApp)
export const storage = getStorage(firebaseApp)

// En desarrollo (o con VITE_USE_EMULATORS=true) la app apunta a Emulator Suite.
const useEmulators = import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true'

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
}
