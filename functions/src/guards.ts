import { createHash, randomBytes } from 'node:crypto'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

if (getApps().length === 0) {
  initializeApp()
}

export const db = getFirestore()

export const EMULATOR_PEPPER = 'emulator-synthetic-pepper'

export function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST)
}

/**
 * Pimiento del servidor. **Falla cerrado** fuera del emulador: si CODE_PEPPER no está
 * configurado en producción, el hash de códigos lanza error en vez de usar un valor por defecto.
 */
function pepper(): string {
  const value = process.env.CODE_PEPPER
  if (value && value.trim().length > 0) return value
  if (isEmulator()) return EMULATOR_PEPPER
  throw new Error('CODE_PEPPER no configurado: el hash de códigos falla cerrado fuera del emulador.')
}

export const CONSTANTS = {
  sessionHours: 12,
  codeDays: 180,
  maxAttempts: 10,
  lockMinutes: 15,
  rateWindowMinutes: 10,
  rateMax: 10, // por auth.uid (señal confiable)
  rateMaxActor: 60, // por borde (IP); generoso para NAT/aula, no es la defensa principal
  reservationMinutes: 30,
  maxUploadBytes: 5 * 1024 * 1024,
}

export const ALLOWED_MIME = [
  'text/plain',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export function hashCode(code: string): string {
  const p = pepper()
  return createHash('sha256').update(`${p}:${code.trim().toUpperCase()}:${p}`).digest('hex')
}

/** Código de alta entropía con generación criptográficamente segura (128 bits). */
export function generateCode(): string {
  return randomBytes(16).toString('hex').toUpperCase()
}

export function newId(): string {
  return randomBytes(16).toString('hex')
}

export function assertSignedIn(request: CallableRequest): string {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Se requiere sesión.')
  return uid
}

/**
 * Clave de actor derivada del borde confiable. Considera proxy/NAT (x-forwarded-for)
 * y el caso sin IP (bucket compartido 'unknown-edge'). App Check es la protección de borde real.
 */
export function actorKeyFrom(request: CallableRequest): string {
  const headers = request.rawRequest?.headers ?? {}
  const forwarded = headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (typeof first === 'string' && first.trim().length > 0) {
    return first.split(',')[0].trim()
  }
  const ip = request.rawRequest?.ip
  return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown-edge'
}

export interface Binding {
  enrollmentId: string
  courseId: string
  state: string
  expiresAt: Timestamp
}

export async function getActiveBinding(uid: string): Promise<Binding> {
  const snap = await db.doc(`sessionBindings/${uid}`).get()
  const data = snap.data() as Binding | undefined
  if (!data || data.state !== 'active' || data.expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('permission-denied', 'Vínculo inactivo.')
  }
  return data
}

/** Docente autorizado: adscripción al curso **y** docente con estado activo. */
export async function isTeacherOfCourse(uid: string, courseId: string): Promise<boolean> {
  const [adscription, teacher] = await Promise.all([
    db.doc(`teacherCourses/${uid}_${courseId}`).get(),
    db.doc(`teachers/${uid}`).get(),
  ])
  return adscription.exists && teacher.exists && teacher.data()?.status === 'active'
}

export async function assertTeacherOfCourse(uid: string, courseId: string): Promise<void> {
  if (!(await isTeacherOfCourse(uid, courseId))) {
    throw new HttpsError('permission-denied', 'No autorizado para este curso.')
  }
}

export async function courseOfEnrollment(enrollmentId: string): Promise<string> {
  const snap = await db.doc(`enrollments/${enrollmentId}`).get()
  const data = snap.data()
  if (!data) throw new HttpsError('not-found', 'Matrícula inexistente.')
  return data.courseId as string
}

export async function programVersionOfMilestone(milestoneId: string): Promise<string> {
  const ms = await db.doc(`milestones/${milestoneId}`).get()
  const data = ms.data()
  if (!data) throw new HttpsError('not-found', 'Hito inexistente.')
  const mission = await db.doc(`missions/${data.missionId}`).get()
  return mission.data()?.programVersionId as string
}

export async function milestoneInCourse(milestoneId: string, courseId: string): Promise<boolean> {
  const ms = await db.doc(`milestones/${milestoneId}`).get()
  if (!ms.exists) return false
  const mission = await db.doc(`missions/${ms.data()!.missionId}`).get()
  if (!mission.exists) return false
  const course = await db.doc(`courses/${courseId}`).get()
  return course.data()?.programVersionId === mission.data()!.programVersionId
}

export async function audit(actorUid: string, role: string, action: string, entity: string, entityId: string, meta: Record<string, unknown> = {}) {
  await db.collection('auditLogs').add({
    actorUid,
    actorRole: role,
    action,
    entity,
    entityId,
    meta,
    at: Timestamp.now(),
  })
}

export { Timestamp, FieldValue }
export type { Transaction } from 'firebase-admin/firestore'
