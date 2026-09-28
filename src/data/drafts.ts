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

/** Borra todos los borradores locales (al cerrar sesión, por privacidad en equipos compartidos). */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`${PREFIX}:`)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

/** Conserva solo los borradores de la matrícula indicada (al cambiar de estudiante). */
export function clearDraftsExcept(enrollmentId: string): void {
  try {
    const prefix = `${PREFIX}:${enrollmentId}:`
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`${PREFIX}:`) && !k.startsWith(prefix)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}
