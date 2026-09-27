import { createHash } from 'node:crypto'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { initializeApp as initializeClientApp } from 'firebase/app'
import { connectAuthEmulator, getAuth as getClientAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore as getClientFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

export const PROJECT = 'demo-red-tic'
const PEPPER = process.env.CODE_PEPPER || 'emulator-synthetic-pepper'

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT })
}
export const adminDb = getFirestore()
export const adminAuth = getAuth()

export function hashCode(code: string): string {
  return createHash('sha256').update(`${PEPPER}:${code.trim().toUpperCase()}:${PEPPER}`).digest('hex')
}

function hostPort(envName: string, fallback: string): { host: string; port: number } {
  const raw = process.env[envName] || fallback
  const [host, port] = raw.split(':')
  return { host: host || '127.0.0.1', port: Number(port || fallback.split(':')[1]) }
}

// ── Fixtures sintéticos (UUID-like, sin datos reales) ─────────────────────
export const IDS = {
  institution: 'inst-1',
  programVersion: 'pv-2026',
  courseX: 'course-x',
  courseY: 'course-y',
  mission1: 'mission-1',
  milestone1: 'milestone-1',
  milestone2: 'milestone-2',
  indicatorD1: 'D1',
  indicatorE1: 'E1',
  teamX: 'team-x',
  teamY: 'team-y',
  s1: 'enr-s1',
  s2: 'enr-s2',
  s3: 'enr-s3',
  t1: 'teacher-1',
  t2: 'teacher-2',
  t3: 'teacher-3',
  codeS1: 'ZORRO-01',
  codeS2: 'PUMA-02',
  codeS3: 'CONDOR-03',
}

const future = () => Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000)

async function clearAll(): Promise<void> {
  // Borra colecciones con subcolecciones de forma recursiva.
  await adminDb.recursiveDelete(adminDb.collection('deliveries'))
  await adminDb.recursiveDelete(adminDb.collection('teams'))
  await adminDb.recursiveDelete(adminDb.collection('diagnosisAttempts'))

  const collections = [
    'institutions', 'programVersions', 'courses', 'missions', 'milestones', 'indicators', 'badges',
    'teachers', 'teacherCourses', 'enrollments', 'codeCredentials', 'sessionBindings',
    'assessments', 'assessmentHistory', 'xpEvents', 'badgeAwards',
    'conditionsSurveys', 'uploadReservations', 'redeemRate', 'redeemAttempts', 'auditLogs',
  ]
  for (const c of collections) {
    const snap = await adminDb.collection(c).get()
    if (snap.empty) continue
    const batch = adminDb.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/** Semilla 100 % sintética: 2 estudiantes del mismo curso, 1 de otro y 2 docentes. */
export async function seedSynthetic(): Promise<void> {
  await clearAll()
  const b = adminDb.batch()

  b.set(adminDb.doc(`institutions/${IDS.institution}`), { name: 'Colegio Innovador del Futuro (ficticio)', status: 'active' })
  b.set(adminDb.doc(`programVersions/${IDS.programVersion}`), { label: 'red-tic-2026.1' })
  b.set(adminDb.doc(`courses/${IDS.courseX}`), { institutionId: IDS.institution, name: '1º Medio A', level: '1º medio', year: 2026, programVersionId: IDS.programVersion, status: 'active' })
  b.set(adminDb.doc(`courses/${IDS.courseY}`), { institutionId: IDS.institution, name: '1º Medio B', level: '1º medio', year: 2026, programVersionId: IDS.programVersion, status: 'active' })

  b.set(adminDb.doc(`missions/${IDS.mission1}`), { programVersionId: IDS.programVersion, order: 1, name: 'Abrir el mapa', prompt: '¿Qué sabemos?', status: 'active' })
  b.set(adminDb.doc(`milestones/${IDS.milestone1}`), { missionId: IDS.mission1, order: 1, title: 'Diagnóstico', xpValue: 20, indicatorCodes: [IDS.indicatorD1, IDS.indicatorE1] })
  b.set(adminDb.doc(`milestones/${IDS.milestone2}`), { missionId: IDS.mission1, order: 2, title: 'Necesidad', xpValue: 20, indicatorCodes: [IDS.indicatorD1] })
  b.set(adminDb.doc(`indicators/${IDS.indicatorD1}`), { code: 'D1', axis: 'D', name: 'Buscar y valorar información' })
  b.set(adminDb.doc(`indicators/${IDS.indicatorE1}`), { code: 'E1', axis: 'E', name: 'Detectar una oportunidad' })
  b.set(adminDb.doc(`badges/badge-1`), { code: 'escucha', name: 'Escucha activa', criterion: 'Diferencia necesidad de suposición.' })

  b.set(adminDb.doc(`teachers/${IDS.t1}`), { displayName: 'Docente Uno (ficticio)', status: 'active' })
  b.set(adminDb.doc(`teachers/${IDS.t2}`), { displayName: 'Docente Dos (ficticio)', status: 'active' })
  b.set(adminDb.doc(`teachers/${IDS.t3}`), { displayName: 'Docente Tres (inactivo, ficticio)', status: 'inactive' })
  b.set(adminDb.doc(`teacherCourses/${IDS.t1}_${IDS.courseX}`), { teacherUid: IDS.t1, courseId: IDS.courseX, role: 'facilitator' })
  b.set(adminDb.doc(`teacherCourses/${IDS.t2}_${IDS.courseY}`), { teacherUid: IDS.t2, courseId: IDS.courseY, role: 'facilitator' })
  b.set(adminDb.doc(`teacherCourses/${IDS.t3}_${IDS.courseX}`), { teacherUid: IDS.t3, courseId: IDS.courseX, role: 'facilitator' })

  b.set(adminDb.doc(`enrollments/${IDS.s1}`), { courseId: IDS.courseX, pseudonym: 'Zorro-01', state: 'active', activeCodeHash: hashCode(IDS.codeS1) })
  b.set(adminDb.doc(`enrollments/${IDS.s2}`), { courseId: IDS.courseX, pseudonym: 'Puma-02', state: 'active', activeCodeHash: hashCode(IDS.codeS2) })
  b.set(adminDb.doc(`enrollments/${IDS.s3}`), { courseId: IDS.courseY, pseudonym: 'Condor-03', state: 'active', activeCodeHash: hashCode(IDS.codeS3) })

  for (const [code, enrollmentId, courseId] of [
    [IDS.codeS1, IDS.s1, IDS.courseX],
    [IDS.codeS2, IDS.s2, IDS.courseX],
    [IDS.codeS3, IDS.s3, IDS.courseY],
  ] as const) {
    b.set(adminDb.doc(`codeCredentials/${hashCode(code)}`), { enrollmentId, courseId, state: 'active', issuedAt: Timestamp.now(), expiresAt: future(), failedAttempts: 0, lockedUntil: null })
  }

  b.set(adminDb.doc(`teams/${IDS.teamX}`), { courseId: IDS.courseX, name: 'Equipo Zorro-Puma' })
  b.set(adminDb.doc(`teams/${IDS.teamX}/members/${IDS.s1}`), { role: 'facilitación' })
  b.set(adminDb.doc(`teams/${IDS.teamX}/members/${IDS.s2}`), { role: 'diseño' })
  b.set(adminDb.doc(`teams/${IDS.teamY}`), { courseId: IDS.courseY, name: 'Equipo de otro curso' })
  b.set(adminDb.doc(`teams/${IDS.teamY}/members/${IDS.s3}`), { role: 'miembro' })

  // Entrega individual de S1 (para reglas de lectura y Storage) en curso X.
  b.set(adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone1}`), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s1, milestoneId: IDS.milestone1, scope: 'individual',
    teamId: null, state: 'in_progress', currentEvidenceId: null, evidenceCount: 0,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  // Entrega del equipo (S1+S2) pendiente de revisar.
  b.set(adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone2}`), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s1, milestoneId: IDS.milestone2, scope: 'team',
    teamId: IDS.teamX, state: 'pending_review', currentEvidenceId: 'ev-team', evidenceCount: 1,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone2}/evidence/ev-team`), {
    version: 1, origin: 'student_digital', format: 'file', testModality: 'peer_simulation',
    description: 'Ficha del equipo', submitKey: 'ev-team', createdBy: IDS.s1, createdAt: Timestamp.now(), deletedAt: null,
  })
  // Caso adversarial: entrega del curso X vinculada a un equipo de OTRO curso.
  b.set(adminDb.doc('deliveries/xc-course'), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s1, milestoneId: IDS.milestone1, scope: 'team',
    teamId: IDS.teamY, state: 'in_progress', currentEvidenceId: null, evidenceCount: 0,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })

  await b.commit()
}

// ── Clientes ───────────────────────────────────────────────────────────────
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

export { Timestamp }
