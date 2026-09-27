import { reactive } from 'vue'
import type { DemoLoadState, Role } from '../types'

/** Sesión local de demostración (sin credenciales reales). */
export const session = reactive<{
  role: Role | null
  studentId: string | null
  teacherId: string | null
}>({
  role: null,
  studentId: null,
  teacherId: null,
})

export function signInStudent(studentId: string): void {
  session.role = 'student'
  session.studentId = studentId
  session.teacherId = null
}

export function signInTeacher(teacherId: string): void {
  session.role = 'teacher'
  session.teacherId = teacherId
  session.studentId = null
}

export function signOut(): void {
  session.role = null
  session.studentId = null
  session.teacherId = null
}

/** Estado de demostración para poder ver carga, vacío y error con fixtures. */
export const demo = reactive<{ state: DemoLoadState }>({ state: 'ok' })

export function setDemoState(state: DemoLoadState): void {
  demo.state = state
}
