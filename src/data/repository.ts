/**
 * Repositorio local de demostración (I0a).
 * Lee exclusivamente fixtures sintéticos. No hay red, backend ni credenciales.
 *
 * El estado `demo.state` permite demostrar carga, vacío y error con los mismos datos.
 */
import { demo } from '../stores/session'
import {
  course,
  evidences,
  missions,
  pendingReviews,
  students,
  teachers,
} from '../fixtures/synthetic'
import type { Course, Evidence, Mission, PendingReview, Student, Teacher } from '../types'

const IS_TEST = import.meta.env.MODE === 'test'
const DELAY_OK_MS = IS_TEST ? 0 : 120
const DELAY_LOADING_MS = 6000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function gate(): Promise<void> {
  if (demo.state === 'error') {
    await wait(DELAY_OK_MS)
    throw new Error('No se pudieron cargar los datos (estado de demostración: error).')
  }
  if (demo.state === 'loading') {
    await wait(DELAY_LOADING_MS)
    return
  }
  await wait(DELAY_OK_MS)
}

export async function getCourse(): Promise<Course> {
  await gate()
  return course
}

export async function getMissions(): Promise<Mission[]> {
  await gate()
  if (demo.state === 'empty') return []
  return missions
}

export async function getStudent(id: string): Promise<Student | null> {
  await gate()
  if (demo.state === 'empty') return null
  return students.find((s) => s.id === id) ?? null
}

export async function getTeacher(id: string): Promise<Teacher | null> {
  await gate()
  return teachers.find((t) => t.id === id) ?? null
}

export async function getPendingReviews(): Promise<PendingReview[]> {
  await gate()
  if (demo.state === 'empty') return []
  return pendingReviews
}

export async function getEvidence(id: string): Promise<Evidence | null> {
  await gate()
  return evidences.find((e) => e.id === id) ?? null
}
