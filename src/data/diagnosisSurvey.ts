/**
 * RED-TIC · Encuesta de condiciones A1–A6 (Fase 5) — opciones compartidas por la UI.
 *
 * Reglas del instrumento:
 *  - A1 es de **selección múltiple** (puede marcar varias).
 *  - A2, A3 y A4 admiten «prefiero no responder».
 *  - A4 permite indicar «otra» condición (texto breve).
 *  - A5 registra **tres experiencias por separado**.
 *  - A6 es **opcional** (puede quedar vacío).
 *  - Cualquier ítem puede dejarse en blanco.
 */

export const PREFER_NOT = 'prefiero no responder'

export const A1_OPTIONS = [
  'teléfono propio',
  'teléfono compartido',
  'computador propio',
  'computador compartido',
  'ninguno',
  PREFER_NOT,
] as const

export const A2_OPTIONS = [
  'en el colegio',
  'en casa de forma estable',
  'solo datos móviles o conexión ocasional',
  'ninguna',
  PREFER_NOT,
] as const

export const A3_OPTIONS = [
  'leer pasos',
  'ver demostración',
  'escuchar explicación',
  'probar con ayuda',
  'combinación',
  PREFER_NOT,
] as const

export const A4_OPTIONS = [
  'texto ampliado',
  'subtítulos',
  'audio o lectura',
  'teclado',
  'más tiempo',
  'otra',
  'ninguna',
  'prefiero hablarlo en privado',
] as const

export const A5_OPTIONS = ['sí', 'alguna vez', 'no', 'no recuerdo'] as const

/** Las tres experiencias de A5, registradas por separado. */
export const A5_EXPERIENCES = [
  { key: 'created', label: 'He creado documentos compartidos' },
  { key: 'verified', label: 'He comprobado si una noticia es cierta' },
  { key: 'explained', label: 'He explicado un trámite digital a otra persona' },
] as const

export type A5Key = (typeof A5_EXPERIENCES)[number]['key']

export interface SurveyAnswers {
  A1: string[]
  A2: string
  A3: string
  A4: { option: string; other: string }
  A5: Record<A5Key, string>
  A6: string
}

export function emptySurvey(): SurveyAnswers {
  return {
    A1: [],
    A2: '',
    A3: '',
    A4: { option: '', other: '' },
    A5: { created: '', verified: '', explained: '' },
    A6: '',
  }
}
