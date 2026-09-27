import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'
import { IDS, adminDb, seedSynthetic, Timestamp } from './helpers'

let env: RulesTestEnvironment
const U = { s1: 'auth-s1', s2: 'auth-s2', s3: 'auth-s3', nobody: 'auth-nobody' }

async function seedBindings() {
  const exp = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000)
  await adminDb.doc(`sessionBindings/${U.s1}`).set({ enrollmentId: IDS.s1, courseId: IDS.courseX, state: 'active', issuedAt: Timestamp.now(), expiresAt: exp })
  await adminDb.doc(`sessionBindings/${U.s2}`).set({ enrollmentId: IDS.s2, courseId: IDS.courseX, state: 'active', issuedAt: Timestamp.now(), expiresAt: exp })
  await adminDb.doc(`sessionBindings/${U.s3}`).set({ enrollmentId: IDS.s3, courseId: IDS.courseY, state: 'active', issuedAt: Timestamp.now(), expiresAt: exp })
  await adminDb.doc(`sessionBindings/${U.nobody}`).set({ enrollmentId: IDS.s1, courseId: IDS.courseX, state: 'revoked', issuedAt: Timestamp.now(), expiresAt: exp })
}

const RES = {
  valid: 'res-valid',
  expired: 'res-expired',
  consumed: 'res-consumed',
  wrongFile: 'res-wrong-file',
  wrongSize: 'res-wrong-size',
}

async function seedReservations() {
  const base = {
    courseId: IDS.courseX,
    enrollmentId: IDS.s1,
    deliveryId: `${IDS.s1}_${IDS.milestone1}`,
    ownerEnrollmentId: IDS.s1,
    fileName: 'guia.txt',
    contentType: 'text/plain',
    sizeBytes: 3,
    storagePath: '',
    createdBy: U.s1,
    createdAt: Timestamp.now(),
  }
  const future = Timestamp.fromMillis(Date.now() + 30 * 60 * 1000)
  const past = Timestamp.fromMillis(Date.now() - 60 * 1000)
  await adminDb.doc(`uploadReservations/${RES.valid}`).set({ ...base, state: 'reserved', expiresAt: future })
  await adminDb.doc(`uploadReservations/${RES.expired}`).set({ ...base, state: 'reserved', expiresAt: past })
  await adminDb.doc(`uploadReservations/${RES.consumed}`).set({ ...base, state: 'consumed', expiresAt: future })
  await adminDb.doc(`uploadReservations/${RES.wrongFile}`).set({ ...base, state: 'reserved', expiresAt: future })
  await adminDb.doc(`uploadReservations/${RES.wrongSize}`).set({ ...base, state: 'reserved', expiresAt: future, sizeBytes: 999 })
}

beforeAll(async () => {
  await seedSynthetic()
  await seedBindings()
  await seedReservations()
  env = await initializeTestEnvironment({
    projectId: 'demo-red-tic',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})

afterAll(async () => {
  if (env) await env.cleanup()
})

const fs = (uid: string) => env.authenticatedContext(uid).firestore()
const st = (uid: string) => env.authenticatedContext(uid).storage()

async function deniedOrEmpty(p: Promise<{ empty: boolean }>): Promise<boolean> {
  try {
    const snap = await p
    return snap.empty
  } catch {
    return true
  }
}

describe('Firestore Rules · aislamiento por curso y rol', () => {
  it('el estudiante lee su matrícula y no la de otro', async () => {
    await assertSucceeds(getDoc(doc(fs(U.s1), 'enrollments', IDS.s1)))
    await assertFails(getDoc(doc(fs(U.s1), 'enrollments', IDS.s3)))
  })

  it('lee su entrega y la de su equipo, pero no la individual ajena', async () => {
    await assertSucceeds(getDoc(doc(fs(U.s1), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
    await assertSucceeds(getDoc(doc(fs(U.s2), 'deliveries', `${IDS.s1}_${IDS.milestone2}`)))
    await assertFails(getDoc(doc(fs(U.s2), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
  })

  it('un miembro de un equipo de OTRO curso no accede a la entrega (curso distinto)', async () => {
    // 'xc-course' está en curso X pero apunta al equipo del curso Y (S3 es miembro).
    await assertSucceeds(getDoc(doc(fs(U.s1), 'deliveries', 'xc-course')))
    await assertFails(getDoc(doc(fs(U.s3), 'deliveries', 'xc-course')))
  })

  it('no escribe entregas, valoraciones ni XP', async () => {
    await assertFails(setDoc(doc(fs(U.s1), 'deliveries', 'nueva'), { courseId: IDS.courseX }))
    await assertFails(setDoc(doc(fs(U.s1), 'assessments', 'a1'), { enrollmentId: IDS.s1, courseId: IDS.courseX, level: 'achieved' }))
    await assertFails(setDoc(doc(fs(U.s1), 'xpEvents', 'x1'), { enrollmentId: IDS.s1, courseId: IDS.courseX }))
  })

  it('los documentos de identidad y rol no son escribibles desde el cliente', async () => {
    await assertFails(setDoc(doc(fs(U.s1), 'sessionBindings', U.s1), { state: 'active' }))
    await assertFails(setDoc(doc(fs(U.s1), 'codeCredentials', 'h'), { enrollmentId: IDS.s1 }))
    await assertFails(setDoc(doc(fs(U.s1), 'enrollments', IDS.s1), { courseId: IDS.courseX }))
    await assertFails(setDoc(doc(fs(IDS.t1), 'teachers', IDS.t1), { status: 'active' }))
    await assertFails(setDoc(doc(fs(IDS.t1), 'teacherCourses', `${IDS.t1}_${IDS.courseX}`), { teacherUid: IDS.t1 }))
    await assertFails(setDoc(doc(fs(U.s1), 'uploadReservations', 'r'), { state: 'reserved' }))
  })

  it('el docente del curso lee; el de otro curso no', async () => {
    await assertSucceeds(getDoc(doc(fs(IDS.t1), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
    await assertFails(getDoc(doc(fs(IDS.t2), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
  })

  it('un docente desactivado no lee ni opera', async () => {
    // t3 tiene adscripción al curso X pero status 'inactive'.
    await assertFails(getDoc(doc(fs(IDS.t3), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
    await assertFails(getDoc(doc(fs(IDS.t3), 'courses', IDS.courseX)))
  })

  it('la revocación del vínculo corta el acceso', async () => {
    await assertFails(getDoc(doc(fs(U.nobody), 'enrollments', IDS.s1)))
    await assertFails(getDoc(doc(fs(U.nobody), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
  })

  it('una sesión autenticada SIN vínculo no lee catálogo, cursos ni equipos', async () => {
    await assertFails(getDoc(doc(fs(U.nobody), 'missions', IDS.mission1)))
    await assertFails(getDoc(doc(fs(U.nobody), 'courses', IDS.courseX)))
    await assertFails(getDoc(doc(fs(U.nobody), 'teams', IDS.teamX)))
  })

  it('el catálogo lo lee una sesión vinculada, no una anónima', async () => {
    await assertSucceeds(getDoc(doc(fs(U.s1), 'missions', IDS.mission1)))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'missions', IDS.mission1)))
  })

  it('los cursos y equipos se leen solo por vínculo o docente', async () => {
    await assertSucceeds(getDoc(doc(fs(U.s1), 'courses', IDS.courseX)))
    await assertFails(getDoc(doc(fs(U.s1), 'courses', IDS.courseY)))
    await assertSucceeds(getDoc(doc(fs(IDS.t1), 'courses', IDS.courseX)))
    await assertSucceeds(getDoc(doc(fs(U.s2), 'teams', IDS.teamX)))
    await assertFails(getDoc(doc(fs(U.s3), 'teams', IDS.teamX)))
    await assertSucceeds(getDoc(doc(fs(IDS.t1), 'teams', IDS.teamX)))
  })

  it('consulta real: el estudiante lista solo lo suyo y el docente su curso', async () => {
    const s1 = await assertSucceeds(getDocs(query(collection(fs(U.s1), 'deliveries'), where('ownerEnrollmentId', '==', IDS.s1))))
    expect(s1.size).toBeGreaterThan(0)
    const t1 = await assertSucceeds(getDocs(query(collection(fs(IDS.t1), 'deliveries'), where('courseId', '==', IDS.courseX))))
    expect(t1.size).toBeGreaterThan(0)
    const t2 = await deniedOrEmpty(getDocs(query(collection(fs(IDS.t2), 'deliveries'), where('courseId', '==', IDS.courseX))))
    expect(t2).toBe(true)
  })

  it('encuesta de condiciones: esquema validado', async () => {
    const good = { enrollmentId: IDS.s1, courseId: IDS.courseX, schemaVersion: 1, answers: { A1: 'teléfono propio', A2: 'colegio', A3: 'leer pasos', A4: 'ninguna', A5: 'sí', A6: 'trámite' } }
    await assertSucceeds(setDoc(doc(fs(U.s1), 'conditionsSurveys', IDS.s1), good))
    await assertFails(setDoc(doc(fs(U.s1), 'conditionsSurveys', 'otra'), { ...good, extra: 'x' }))
    await assertFails(setDoc(doc(fs(U.s1), 'conditionsSurveys', 'sin-a6'), { ...good, answers: { A1: 'a' } }))
    await assertFails(setDoc(doc(fs(U.s1), 'conditionsSurveys', 'largo'), { ...good, answers: { ...good.answers, A1: 'x'.repeat(600) } }))
    await assertFails(setDoc(doc(fs(U.s1), 'conditionsSurveys', 'ajena'), { ...good, enrollmentId: IDS.s3 }))
    await assertFails(getDoc(doc(fs(U.s1), 'conditionsSurveys', IDS.s1)))
    await assertSucceeds(getDoc(doc(fs(IDS.t1), 'conditionsSurveys', IDS.s1)))
    await assertFails(getDoc(doc(fs(IDS.t2), 'conditionsSurveys', IDS.s1)))
  })
})

describe('Storage Rules · reserva real de archivos', () => {
  const path = (course: string, enrollment: string, delivery: string, res: string, file: string) =>
    `courses/${course}/enrollments/${enrollment}/deliveries/${delivery}/uploads/${res}/${file}`
  const D = `${IDS.s1}_${IDS.milestone1}`
  const up = (uid: string, p: string, bytes: number, type: string) =>
    uploadBytes(ref(st(uid), p), new Uint8Array(bytes), { contentType: type })

  it('permite subir solo con una reserva válida que coincide', async () => {
    await assertSucceeds(up(U.s1, path(IDS.courseX, IDS.s1, D, RES.valid, 'guia.txt'), 3, 'text/plain'))
  })

  it('deniega sin reserva, reserva caducada o ya consumida', async () => {
    await assertFails(up(U.s1, path(IDS.courseX, IDS.s1, D, 'res-inexistente', 'guia.txt'), 3, 'text/plain'))
    await assertFails(up(U.s1, path(IDS.courseX, IDS.s1, D, RES.expired, 'guia.txt'), 3, 'text/plain'))
    await assertFails(up(U.s1, path(IDS.courseX, IDS.s1, D, RES.consumed, 'guia.txt'), 3, 'text/plain'))
  })

  it('deniega si el nombre o el tamaño no coinciden con la reserva', async () => {
    await assertFails(up(U.s1, path(IDS.courseX, IDS.s1, D, RES.wrongFile, 'otro.txt'), 3, 'text/plain'))
    await assertFails(up(U.s1, path(IDS.courseX, IDS.s1, D, RES.wrongSize, 'guia.txt'), 3, 'text/plain'))
  })

  it('deniega curso ajeno o matrícula ajena', async () => {
    await assertFails(up(U.s1, path(IDS.courseY, IDS.s1, D, RES.valid, 'guia.txt'), 3, 'text/plain'))
    await assertFails(up(U.s3, path(IDS.courseX, IDS.s1, D, RES.valid, 'guia.txt'), 3, 'text/plain'))
  })

  it('el docente del curso lee el archivo; el de otro curso no', async () => {
    const p = path(IDS.courseX, IDS.s1, D, RES.valid, 'guia.txt')
    await assertSucceeds(getBytes(ref(st(IDS.t1), p)))
    await assertFails(getBytes(ref(st(IDS.t2), p)))
  })
})
