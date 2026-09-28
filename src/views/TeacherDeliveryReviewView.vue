<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '../composables/useAsync'
import {
  confirmChecklistItem,
  correctAssessment,
  fetchDeliveryReview,
  fetchEvidenceBlob,
  reopenMilestone,
  requestAdjustment,
  restoreXp,
  revokeXp,
  validateDelivery,
} from '../data/firebaseRepository'
import { indicatorLevelLabels } from '../utils/labels'
import StatePanel from '../components/StatePanel.vue'

const route = useRoute()
const deliveryId = computed(() => String(route.params.deliveryId))

const { data, loading, error, reload } = useAsync(() => fetchDeliveryReview(deliveryId.value), () => [deliveryId.value])

const LEVELS = ['not_evaluated', 'incipient', 'developing', 'achieved', 'transferable'] as const

interface Draft {
  level: string
  comment: string
  strength: string
  nextStep: string
}
const draft = reactive<Record<string, Draft>>({})
const adjustmentAction = ref('')
const message = ref('')
const submitError = ref('')
const busy = ref(false)

function keyOf(enrollmentId: string, indicatorCode: string): string {
  return `${enrollmentId}:${indicatorCode}`
}

watch(
  () => data.value,
  (value) => {
    if (!value) return
    for (const m of value.members) {
      for (const code of value.indicatorCodes) {
        const k = keyOf(m.enrollmentId, code)
        // No sobrescribir lo que el docente ya editó (p. ej., al recargar tras confirmar un ítem).
        if (draft[k]) continue
        const a = value.assessments.find((x) => x.enrollmentId === m.enrollmentId && x.indicatorCode === code)
        draft[k] = {
          level: a?.level ?? 'not_evaluated',
          comment: a?.comment ?? '',
          strength: a?.strength ?? '',
          nextStep: a?.nextStep ?? '',
        }
      }
    }
  },
  { immediate: true },
)

const state = computed(() => data.value?.state ?? 'not_started')
// Regla «no evaluado»: si ningún indicador se observó, el XP acredita el hito (avance
// narrativo) pero la competencia queda «No evaluado», nunca como 0.
const allNotEvaluated = computed(
  () =>
    Boolean(data.value?.indicatorCodes.length) &&
    (data.value?.members ?? []).every((m) =>
      (data.value?.indicatorCodes ?? []).every((code) => draft[keyOf(m.enrollmentId, code)]?.level === 'not_evaluated'),
    ),
)
const supportsLabel: Record<string, string> = {
  reading: 'Lectura guiada',
  extra_time: 'Más tiempo',
  dictation: 'Dictado',
  adapted_material: 'Material adaptado',
  device_shared: 'Dispositivo compartido',
  other: 'Otro',
}

function notify(text: string): void {
  message.value = text
  submitError.value = ''
}

async function validar(): Promise<void> {
  if (!data.value) return
  busy.value = true
  submitError.value = ''
  try {
    const assessments = data.value.members.flatMap((m) =>
      data.value!.indicatorCodes.map((code) => {
        const d = draft[keyOf(m.enrollmentId, code)]
        return {
          enrollmentId: m.enrollmentId,
          indicatorCode: code,
          level: d.level,
          comment: d.comment,
          strength: d.strength,
          nextStep: d.nextStep,
        }
      }),
    )
    await validateDelivery({ deliveryId: deliveryId.value, comment: '', assessments })
    notify('Hito validado. El XP se otorgó una sola vez por estudiante.')
    await reload()
  } catch {
    submitError.value = 'No se pudo validar (revisa que todos los indicadores estén valorados).'
  } finally {
    busy.value = false
  }
}

async function pedirAjuste(): Promise<void> {
  if (!adjustmentAction.value.trim()) {
    submitError.value = 'Escribe una acción concreta para el ajuste.'
    return
  }
  busy.value = true
  submitError.value = ''
  try {
    await requestAdjustment({ deliveryId: deliveryId.value, action: adjustmentAction.value.trim() })
    notify('Ajuste solicitado. El estudiante puede enviar una nueva versión.')
    await reload()
  } catch {
    submitError.value = 'No se pudo pedir el ajuste.'
  } finally {
    busy.value = false
  }
}

async function reabrir(): Promise<void> {
  if (!adjustmentAction.value.trim()) {
    submitError.value = 'Escribe una acción concreta para la corrección.'
    return
  }
  busy.value = true
  submitError.value = ''
  try {
    await reopenMilestone({ deliveryId: deliveryId.value, action: adjustmentAction.value.trim() })
    notify('Entrega reabierta para corrección (se conserva el historial y el XP).')
    await reload()
  } catch {
    submitError.value = 'No se pudo reabrir la entrega.'
  } finally {
    busy.value = false
  }
}

function confirmedItem(i: number): boolean {
  return (data.value?.checklistConfirmations ?? []).some((c) => c.itemIndex === i)
}

async function confirmarItem(i: number): Promise<void> {
  if (!data.value) return
  busy.value = true
  submitError.value = ''
  try {
    await confirmChecklistItem({ deliveryId: deliveryId.value, itemIndex: i })
    notify('Evidencia mínima confirmada (juicio docente).')
    await reload()
  } catch {
    submitError.value = 'No se pudo confirmar el ítem.'
  } finally {
    busy.value = false
  }
}

async function verArchivo(path: string): Promise<void> {
  try {
    const url = URL.createObjectURL(await fetchEvidenceBlob(path))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    submitError.value = 'No se pudo abrir el archivo (¿sin autorización?).'
  }
}

async function corregir(assessmentId: string, k: string): Promise<void> {
  busy.value = true
  submitError.value = ''
  try {
    const d = draft[k]
    await correctAssessment({ assessmentId, newLevel: d.level, comment: d.comment })
    notify('Valoración corregida (se conserva el historial).')
    await reload()
  } catch {
    submitError.value = 'No se pudo corregir la valoración.'
  } finally {
    busy.value = false
  }
}

async function cambiarXp(xpEventId: string, revoked: boolean): Promise<void> {
  busy.value = true
  submitError.value = ''
  try {
    if (revoked) await restoreXp({ xpEventId })
    else await revokeXp({ xpEventId, reason: 'corrección docente' })
    notify(revoked ? 'XP reinstaurado.' : 'XP retirado.')
    await reload()
  } catch {
    submitError.value = 'No se pudo cambiar el XP.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="dr-title" data-testid="delivery-review">
    <p><RouterLink to="/docente/revision">← Volver a la bandeja</RouterLink></p>

    <StatePanel v-if="loading" state="loading" message="Cargando la entrega…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="!data" state="empty" message="No encontramos esta entrega." />

    <template v-else>
      <h1 id="dr-title">{{ data.missionName }} · {{ data.milestoneTitle }}</h1>
      <p class="lede">
        Estado: <span class="chip" :class="`chip--${state}`">{{ state }}</span> · {{ data.xpValue }} XP al validar ·
        indicadores {{ data.indicatorCodes.join(', ') || '—' }}
      </p>

      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="submitError" class="error" role="alert">{{ submitError }}</p>

      <section class="card" aria-labelledby="ev-h">
        <h2 id="ev-h">Evidencia ({{ data.evidences.length }} versión/es)</h2>
        <ol class="versions">
          <li v-for="ev in data.evidences" :key="ev.evidenceId">
            <p class="meta">
              <strong>Versión {{ ev.version }}</strong> ·
              {{ ev.origin === 'teacher_equivalent' ? 'registro docente (equivalencia)' : 'estudiante' }} ·
              {{ ev.format }}<span v-if="ev.supports.length"> · Apoyos: {{ ev.supports.map((s) => supportsLabel[s] ?? s).join(', ') }}</span>
            </p>
            <p class="body">{{ ev.description }}</p>
            <button
              v-if="ev.format === 'file' && ev.storagePath"
              type="button"
              class="btn btn--secondary"
              @click="verArchivo(ev.storagePath)"
            >
              Ver archivo
            </button>
          </li>
        </ol>
      </section>

      <section v-if="data.adjustment" class="card" aria-labelledby="adj-h">
        <h2 id="adj-h">Ajuste solicitado</h2>
        <p>{{ data.adjustment.action }}</p>
      </section>

      <section class="card" aria-labelledby="val-h">
        <h2 id="val-h">Valoración por indicador</h2>
        <p class="hint">«No evaluado» es un estado distinto de una valoración baja.</p>
        <template v-if="data.evidenceChecklist.length">
          <p class="hint">
            <strong>Verifica y confirma la evidencia mínima del bloque antes de acreditar el XP.</strong>
            La confirmación es tu juicio docente; el servidor no interpreta el contenido.
          </p>
          <ul class="checklist">
            <li v-for="(c, i) in data.evidenceChecklist" :key="i" :data-item="i">
              <span>{{ c }}</span>
              <span v-if="confirmedItem(i)" class="ok" role="status">✔ Confirmado</span>
              <button v-else type="button" class="btn btn--secondary" :disabled="busy" @click="confirmarItem(i)">
                Confirmar ítem {{ i + 1 }}
              </button>
            </li>
          </ul>
        </template>
        <fieldset v-for="m in data.members" :key="m.enrollmentId" class="member">
          <legend>{{ m.pseudonym }}</legend>
          <div v-for="code in data.indicatorCodes" :key="code" class="indicator-block">
            <h3>{{ code }}</h3>
            <label :for="`lvl-${m.enrollmentId}-${code}`">Nivel</label>
            <select :id="`lvl-${m.enrollmentId}-${code}`" v-model="draft[keyOf(m.enrollmentId, code)].level" class="input">
              <option v-for="lvl in LEVELS" :key="lvl" :value="lvl">{{ indicatorLevelLabels[lvl] }}</option>
            </select>
            <label :for="`cmt-${m.enrollmentId}-${code}`">Comentario</label>
            <input :id="`cmt-${m.enrollmentId}-${code}`" v-model="draft[keyOf(m.enrollmentId, code)].comment" class="input" type="text" />
            <label :for="`str-${m.enrollmentId}-${code}`">Fortaleza observada</label>
            <input :id="`str-${m.enrollmentId}-${code}`" v-model="draft[keyOf(m.enrollmentId, code)].strength" class="input" type="text" />
            <label :for="`nxt-${m.enrollmentId}-${code}`">Siguiente paso</label>
            <input :id="`nxt-${m.enrollmentId}-${code}`" v-model="draft[keyOf(m.enrollmentId, code)].nextStep" class="input" type="text" />
          </div>
        </fieldset>

        <p v-if="allNotEvaluated" class="notice" role="note">
          Todos los indicadores están «No evaluado». Al validar, el hito se acredita como <strong>avance narrativo</strong>
          (XP); la competencia observada queda «No evaluado», no como una valoración baja.
        </p>

        <div class="actions">
          <button v-if="state === 'pending_review'" type="button" class="btn btn--primary" :disabled="busy" @click="validar">
            Validar hito
          </button>
        </div>
      </section>

      <section v-if="state === 'pending_review'" class="card" aria-labelledby="adjreq-h">
        <h2 id="adjreq-h">Pedir ajuste</h2>
        <label for="adjustment-action">Acción concreta para el estudiante</label>
        <input id="adjustment-action" v-model="adjustmentAction" class="input" type="text" maxlength="500" />
        <button type="button" class="btn btn--secondary" :disabled="busy" @click="pedirAjuste">Pedir ajuste</button>
      </section>

      <section v-if="state === 'achieved'" class="card" aria-labelledby="reopen-h">
        <h2 id="reopen-h">Reabrir para corrección</h2>
        <p class="hint">
          Vuelve la entrega a «en proceso» para una nueva versión. Conserva el historial y no reinicia el XP.
        </p>
        <label for="reopen-action">Acción concreta para el estudiante</label>
        <input id="reopen-action" v-model="adjustmentAction" class="input" type="text" maxlength="500" />
        <button type="button" class="btn btn--secondary" :disabled="busy" @click="reabrir">Reabrir para corrección</button>
      </section>

      <section v-if="state === 'achieved'" class="card" aria-labelledby="corr-h">
        <h2 id="corr-h">Corrección y XP</h2>
        <ul class="assessments">
          <li v-for="a in data.assessments" :key="a.assessmentId">
            <p class="meta">{{ a.enrollmentId }} · {{ a.indicatorCode }} · {{ indicatorLevelLabels[a.level as keyof typeof indicatorLevelLabels] ?? a.level }}</p>
            <button type="button" class="btn btn--secondary" :disabled="busy" @click="corregir(a.assessmentId, keyOf(a.enrollmentId, a.indicatorCode))">
              Guardar corrección
            </button>
          </li>
        </ul>
        <ul class="xp">
          <li v-for="x in data.xp" :key="x.xpEventId">
            <span>{{ x.enrollmentId }} · {{ x.xpValue }} XP · {{ x.revoked ? 'retirado' : 'vigente' }}</span>
            <button type="button" class="btn btn--secondary" :disabled="busy" @click="cambiarXp(x.xpEventId, x.revoked)">
              {{ x.revoked ? 'Reinstaurar XP' : 'Retirar XP' }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.lede,
.hint,
.meta {
  color: var(--rt-text-muted);
}
.versions,
.assessments,
.xp {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--rt-space-2);
}
.body {
  white-space: pre-wrap;
  margin: 0;
}
.member {
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-2);
  margin: var(--rt-space-2) 0;
}
.indicator-block {
  display: grid;
  gap: var(--rt-space-1);
  margin-bottom: var(--rt-space-2);
}
label {
  font-weight: 600;
  font-size: var(--rt-font-size-sm);
}
.input {
  width: 100%;
  min-height: var(--rt-touch);
  padding: var(--rt-space-2);
  font: inherit;
  border: 2px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-surface);
  color: var(--rt-text);
}
.actions {
  display: flex;
  gap: var(--rt-space-2);
  flex-wrap: wrap;
  margin-top: var(--rt-space-2);
}
.ok {
  color: #14532d;
  font-weight: 600;
}
.notice {
  background: var(--rt-warning-soft);
  color: #7c2d12;
  padding: var(--rt-space-2);
  border-radius: var(--rt-radius-sm);
  font-weight: 600;
}
.checklist {
  margin: var(--rt-space-1) 0 var(--rt-space-2);
  padding-left: var(--rt-space-4);
  color: var(--rt-text-muted);
  font-size: var(--rt-font-size-sm);
}
.checklist li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-2);
  flex-wrap: wrap;
  margin-bottom: var(--rt-space-1);
}
.error {
  color: #7f1d1d;
  background: var(--rt-danger-soft);
  border: 1px solid var(--rt-danger);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-2);
  font-weight: 600;
}
</style>
