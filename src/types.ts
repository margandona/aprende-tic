/**
 * Tipos del dominio RED-TIC (I0a).
 * Datos 100 % sintéticos: no representan personas ni establecimientos reales.
 */

export type Role = 'student' | 'teacher'

export type MilestoneState = 'not_started' | 'in_progress' | 'pending_review' | 'achieved'

/** Ejes separados de la evidencia (corrección de Fase 9). */
export type EvidenceOrigin = 'student_digital' | 'teacher_equivalent'
export type EvidenceFormat =
  | 'text'
  | 'image'
  | 'file'
  | 'audio_local'
  | 'paper'
  | 'model'
  | 'dictation'
  | 'adaptation'
export type EvidenceTestModality = 'not_applicable' | 'peer_simulation' | 'simulation' | 'real_authorized'

/** Escala cualitativa de indicadores; incluye «no evaluado». */
export type IndicatorLevel =
  | 'not_evaluated'
  | 'incipient'
  | 'developing'
  | 'achieved'
  | 'transferable'

export type IndicatorAxis = 'D' | 'E'

export interface Indicator {
  code: string // D1..D5, E1..E5
  axis: IndicatorAxis
  name: string
  descriptor: string
  criterion: string
}

export interface Mission {
  id: string
  order: number
  name: string
  prompt: string
  deliverable: string
}

export interface MissionProgress {
  missionId: string
  state: MilestoneState
  evidenceId: string | null
}

export interface Evidence {
  id: string
  missionId: string
  origin: EvidenceOrigin
  format: EvidenceFormat
  testModality: EvidenceTestModality
  description: string
  createdAt: string
}

export interface Assessment {
  indicatorCode: string
  level: IndicatorLevel
  comment: string
  strength?: string
  nextStep?: string
  evidenceId: string | null
}

export interface XpEvent {
  missionId: string
  value: number
  validated: boolean
}

export interface BadgeAward {
  badgeId: string
  awardedAt: string
}

export interface Badge {
  id: string
  name: string
  criterion: string
}

export interface Student {
  id: string
  pseudonym: string
  courseId: string
  xpTotal: number
  narrativeLevel: string
  xpEvents: XpEvent[]
  badges: BadgeAward[]
  missions: MissionProgress[]
  assessments: Assessment[]
  reflections: { missionId: string; text: string }[]
}

export interface Teacher {
  id: string
  displayName: string
  courseId: string
}

export interface Course {
  id: string
  name: string
  level: string
  year: number
  programVersion: string
}

export interface PendingReview {
  id: string
  studentPseudonym: string
  missionId: string
  state: MilestoneState
}

/** Estado de demostración para probar carga, vacío y error con fixtures. */
export type DemoLoadState = 'ok' | 'loading' | 'empty' | 'error'
