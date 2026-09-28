/**
 * Borrador local de una entrega (I2a).
 *
 * Se guarda **solo en este dispositivo** (localStorage) y la interfaz lo indica de forma
 * explícita. No viaja al servidor: la entrega se registra al enviarla (Function idempotente).
 */

const PREFIX = 'redtic_draft'

function key(enrollmentId: string, milestoneId: string): string {
  return `${PREFIX}:${enrollmentId}:${milestoneId}`
}

export function loadDraft(enrollmentId: string, milestoneId: string): string {
  try {
    return localStorage.getItem(key(enrollmentId, milestoneId)) ?? ''
  } catch {
    return ''
  }
}

export function saveDraft(enrollmentId: string, milestoneId: string, text: string): void {
  try {
    localStorage.setItem(key(enrollmentId, milestoneId), text)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function clearDraft(enrollmentId: string, milestoneId: string): void {
  try {
    localStorage.removeItem(key(enrollmentId, milestoneId))
  } catch {
    /* ignore */
  }
}
