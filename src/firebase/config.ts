/** Resolución de configuración de Firebase con fallo cerrado (I1b). */
export interface FirebaseEnv {
  VITE_USE_EMULATORS?: string
  VITE_FIREBASE_PROJECT_ID?: string
  VITE_FIREBASE_API_KEY?: string
  VITE_FIREBASE_APP_ID?: string
  VITE_FIREBASE_STORAGE_BUCKET?: string
  VITE_FIREBASE_AUTH_DOMAIN?: string
}

export interface ResolvedFirebaseConfig {
  useEmulators: boolean
  config: {
    projectId: string
    apiKey: string
    appId: string
    storageBucket: string
    authDomain?: string
  }
}

export const DEMO_PROJECT_ID = 'demo-red-tic'

/**
 * - Con `VITE_USE_EMULATORS=true`: usa el proyecto demo y emuladores.
 * - Sin la bandera: exige configuración real explícita y **falla** si falta o si apunta al proyecto demo.
 */
export function resolveFirebaseConfig(env: FirebaseEnv): ResolvedFirebaseConfig {
  const useEmulators = env.VITE_USE_EMULATORS === 'true'

  if (useEmulators) {
    return {
      useEmulators: true,
      config: {
        projectId: env.VITE_FIREBASE_PROJECT_ID || DEMO_PROJECT_ID,
        apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
        appId: env.VITE_FIREBASE_APP_ID || 'demo-app',
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${DEMO_PROJECT_ID}.appspot.com`,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${DEMO_PROJECT_ID}.firebaseapp.com`,
      },
    }
  }

  const required = ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_STORAGE_BUCKET'] as const
  const missing = required.filter((k) => !env[k])
  if (missing.length > 0) {
    throw new Error(
      `Configuración Firebase incompleta: faltan ${missing.join(', ')}. Define las variables VITE_FIREBASE_* o activa VITE_USE_EMULATORS=true.`,
    )
  }
  if (env.VITE_FIREBASE_PROJECT_ID === DEMO_PROJECT_ID) {
    throw new Error(
      'Configuración demo detectada sin emuladores: build no autorizada. Define un proyecto real o activa VITE_USE_EMULATORS=true.',
    )
  }

  return {
    useEmulators: false,
    config: {
      projectId: env.VITE_FIREBASE_PROJECT_ID!,
      apiKey: env.VITE_FIREBASE_API_KEY!,
      appId: env.VITE_FIREBASE_APP_ID!,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET!,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    },
  }
}
