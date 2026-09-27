/** Etiquetas en español para estados e indicadores (accesibilidad: texto, no solo color). */

import type { IndicatorLevel, MilestoneState } from '../types'

export const missionStateLabels: Record<MilestoneState, string> = {
  not_started: 'Sin iniciar',
  in_progress: 'En proceso',
  pending_review: 'Por revisar',
  achieved: 'Logrado',
}

export const indicatorLevelLabels: Record<IndicatorLevel, string> = {
  not_evaluated: 'No evaluado',
  incipient: 'Incipiente',
  developing: 'En desarrollo',
  achieved: 'Logrado',
  transferable: 'Transferible',
}

export const indicatorAxisLabels: Record<'D' | 'E', string> = {
  D: 'Desempeño digital',
  E: 'Proceso emprendedor',
}
