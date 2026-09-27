import { createHash } from 'node:crypto'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

if (getApps().length === 0) {
  initializeApp()
}

export const db = getFirestore()

/**
 * Pimiento del servidor. En desarrollo/emulador se usa uno sintético;
 * en producción CODE_PEPPER debe ser un secreto del servidor (nunca en el cliente).
 */
export const PEPPER = process.env.CODE_PEPPER || 'dev-synthetic-pepper'

export const CONSTANTS = {
  sessionHours: 12,
  codeDays: 180,
  maxAttempts: 10,
  lockMinutes: 15,
  rateWindowMinutes: 10,
  rateMax: 10,
}

export function hashCode(code: string): string {
  return createHash('sha256').update(`${PEPPER}:${code.trim().toUpperCase()}:${PEPPER}`).digest('hex')
}

/** Código de alta entropía (24 hex ≈ 96 bits). */
export function generateCode(): string {
  const hex = () => createHash('sha256').update(`${Date.now()}:${Math.random()}:${PEPPER}`).digest('hex')
  return (hex() + hex()).slice(0, 24).toUpperCase()
}

export function assertSignedIn(request: CallableRequest): string {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Se requiere sesión.')
  return uid
}

/** Clave de actor derivada del borde confiable (IP del servidor), no del cliente. */
export function actorKeyFrom(request: CallableRequest): string {
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

export async function isTeacherOfCourse(uid: string, courseId: string): Promise<boolean> {
  const snap = await db.doc(`teacherCourses/${uid}_${courseId}`).get()
  return snap.exists
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
