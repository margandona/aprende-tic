import { afterAll, beforeAll, describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'
import { IDS, adminDb, seedSynthetic, Timestamp } from './helpers'

let env: RulesTestEnvironment

const U = { s1: 'auth-s1', s2: 'auth-s2', s3: 'auth-s3' }

async function seedBindings() {
  const exp = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000)
  await adminDb.doc(`sessionBindings/${U.s1}`).set({ enrollmentId: IDS.s1, courseId: IDS.courseX, state: 'active', issuedAt: Timestamp.now(), expiresAt: exp })
  await adminDb.doc(`sessionBindings/${U.s2}`).set({ enrollmentId: IDS.s2, courseId: IDS.courseX, state: 'active', issuedAt: Timestamp.now(), expiresAt: exp })
  await adminDb.doc(`sessionBindings/${U.s3}`).set({ enrollmentId: IDS.s3, courseId: IDS.courseY, state: 'active', issuedAt: Timestamp.now(), expiresAt: exp })
}

beforeAll(async () => {
  await seedSynthetic()
  await seedBindings()
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

describe('Firestore Rules · aislamiento por curso y rol', () => {
  it('el estudiante lee su matrícula y no la de otro', async () => {
    await assertSucceeds(getDoc(doc(fs(U.s1), 'enrollments', IDS.s1)))
    await assertFails(getDoc(doc(fs(U.s1), 'enrollments', IDS.s3)))
  })

  it('el estudiante lee su entrega y la de su equipo, pero no la individual ajena', async () => {
    await assertSucceeds(getDoc(doc(fs(U.s1), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
    await assertSucceeds(getDoc(doc(fs(U.s2), 'deliveries', `${IDS.s1}_${IDS.milestone2}`)))
    await assertFails(getDoc(doc(fs(U.s2), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
  })

  it('el estudiante no escribe entregas ni valoraciones', async () => {
    await assertFails(setDoc(doc(fs(U.s1), 'deliveries', 'nueva'), { courseId: IDS.courseX }))
    await assertFails(setDoc(doc(fs(U.s1), 'assessments', 'a1'), { enrollmentId: IDS.s1, courseId: IDS.courseX, level: 'achieved' }))
    await assertFails(setDoc(doc(fs(U.s1), 'xpEvents', 'x1'), { enrollmentId: IDS.s1, courseId: IDS.courseX }))
  })

  it('el docente del curso lee; el de otro curso no', async () => {
    await assertSucceeds(getDoc(doc(fs(IDS.t1), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
    await assertFails(getDoc(doc(fs(IDS.t2), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
  })

  it('el catálogo es legible para sesiones autenticadas y no para anónimos', async () => {
    await assertSucceeds(getDoc(doc(fs(U.s1), 'missions', IDS.mission1)))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'missions', IDS.mission1)))
  })

  it('la revocación del vínculo corta el acceso', async () => {
    await adminDb.doc(`sessionBindings/${U.s1}`).update({ state: 'revoked' })
    await assertFails(getDoc(doc(fs(U.s1), 'enrollments', IDS.s1)))
    await assertFails(getDoc(doc(fs(U.s1), 'deliveries', `${IDS.s1}_${IDS.milestone1}`)))
    await adminDb.doc(`sessionBindings/${U.s1}`).update({ state: 'active' })
    await assertSucceeds(getDoc(doc(fs(U.s1), 'enrollments', IDS.s1)))
  })

  it('la encuesta de condiciones la crea el estudiante y solo la lee el docente del curso', async () => {
    await assertSucceeds(setDoc(doc(fs(U.s1), 'conditionsSurveys', IDS.s1), { enrollmentId: IDS.s1, courseId: IDS.courseX, answers: {} }))
    await assertFails(getDoc(doc(fs(U.s1), 'conditionsSurveys', IDS.s1)))
    await assertSucceeds(getDoc(doc(fs(IDS.t1), 'conditionsSurveys', IDS.s1)))
    await assertFails(getDoc(doc(fs(IDS.t2), 'conditionsSurveys', IDS.s1)))
  })
})

describe('Storage Rules · curso, matrícula, estado y tipo', () => {
  const path = (course: string, enrollment: string, delivery: string, file: string) =>
    `courses/${course}/enrollments/${enrollment}/deliveries/${delivery}/uploads/res1/${file}`

  it('permite subir a la entrega propia y abierta', async () => {
    await assertSucceeds(uploadBytes(ref(st(U.s1), path(IDS.courseX, IDS.s1, `${IDS.s1}_${IDS.milestone1}`, 'guia.txt')), new Uint8Array([1, 2, 3]), { contentType: 'text/plain' }))
  })

  it('rechaza curso ajeno, tipo no permitido y tamaño excesivo', async () => {
    await assertFails(uploadBytes(ref(st(U.s1), path(IDS.courseY, IDS.s1, `${IDS.s1}_${IDS.milestone1}`, 'x.txt')), new Uint8Array([1]), { contentType: 'text/plain' }))
    await assertFails(uploadBytes(ref(st(U.s1), path(IDS.courseX, IDS.s1, `${IDS.s1}_${IDS.milestone1}`, 'x.exe')), new Uint8Array([1]), { contentType: 'application/x-msdownload' }))
    await assertFails(uploadBytes(ref(st(U.s1), path(IDS.courseX, IDS.s1, `${IDS.s1}_${IDS.milestone1}`, 'big.pdf')), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'application/pdf' }))
  })

  it('rechaza la carga tras el cierre de la entrega', async () => {
    await adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone1}`).update({ state: 'achieved' })
    await assertFails(uploadBytes(ref(st(U.s1), path(IDS.courseX, IDS.s1, `${IDS.s1}_${IDS.milestone1}`, 'otro.txt')), new Uint8Array([1]), { contentType: 'text/plain' }))
    await adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone1}`).update({ state: 'in_progress' })
  })

  it('el docente del curso lee el archivo; el de otro curso no', async () => {
    const p = path(IDS.courseX, IDS.s1, `${IDS.s1}_${IDS.milestone1}`, 'guia.txt')
    await assertSucceeds(getBytes(ref(st(IDS.t1), p)))
    await assertFails(getBytes(ref(st(IDS.t2), p)))
  })
})
