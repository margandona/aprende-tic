<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useAsync } from '../composables/useAsync'
import {
  fetchTeacherDiagnoses,
  fetchTeacherDiagnosis,
  reviewDiagnosisResponse,
  saveDiagnosisFeedback,
  type TeacherDiagnosisDetail,
} from '../data/firebaseRepository'
import { DIAGNOSIS_TASKS } from '../data/diagnosisCase'
import { A5_EXPERIENCES } from '../data/diagnosisSurvey'
import { demo } from '../stores/session'
import StatePanel from '../components/StatePanel.vue'

const SUPPORT_LABELS: Record<string, string> = {
  text_amplified: 'Texto ampliado',
  subtitles: 'Subtítulos',
  audio_reading: 'Audio o lectura guiada',
  keyboard: 'Teclado',
  extra_time: 'Más tiempo',
  other: 'Otro',
}

const { data: list, loading, error, reload } = useAsync(() => fetchTeacherDiagnoses(), () => [demo.state])

const selectedId = ref<string | null>(null)
const detail = ref<TeacherDiagnosisDetail | null>(null)
const detailError = ref<string | null>(null)
const busy = ref(false)
const message = ref('')

const draft = reactive<Record<string, { score: string; comment: string }>>({})
const feedback = reactive<{ strength: string; nextStep: string }>({ strength: '', nextStep: '' })

async function abrir(attemptId: string): Promise<void> {
  selectedId.value = attemptId
  detailError.value = null
  message.value = ''
  try {
    const d = await fetchTeacherDiagnosis(attemptId)
    detail.value = d
    feedback.strength = d.strength
    feedback.nextStep = d.nextStep
    for (const t of DIAGNOSIS_TASKS) {
      const r = d.responses.find((x) => x.taskCode === t.code)
      draft[t.code] = {
        score: r?.score === null || r?.score === undefined ? '' : String(r.score),
        comment: r?.reviewerComment ?? '',
      }
    }
  } catch {
    detail.value = null
    detailError.value = 'No se pudo cargar el diagnóstico (revisa tu autorización de curso).'
  }
}

function answerable(taskCode: string): boolean {
  const r = detail.value?.responses.find((x) => x.taskCode === taskCode)
  return Boolean(r && r.responseStatus === 'answered' && !r.technicalIssue)
}

async function guardarTarea(taskCode: string): Promise<void> {
  if (!detail.value) return
  busy.value = true
  message.value = ''
  const attemptId = detail.value.attemptId
  try {
    const raw = draft[taskCode].score
    await reviewDiagnosisResponse({
      attemptId,
      taskCode,
      score: raw === '' ? null : Number(raw),
      reviewerComment: draft[taskCode].comment,
    })
    await abrir(attemptId)
    await reload()
    message.value = `Valoración de ${taskCode} guardada.`
  } catch {
    message.value = `No se pudo guardar ${taskCode} (¿tarea no respondida o barrera técnica?).`
  } finally {
    busy.value = false
  }
}

async function guardarDevolucion(): Promise<void> {
  if (!detail.value) return
  busy.value = true
  message.value = ''
  const attemptId = detail.value.attemptId
  try {
    await saveDiagnosisFeedback({ attemptId, strength: feedback.strength, nextStep: feedback.nextStep })
    await abrir(attemptId)
    message.value = 'Devolución guardada.'
  } catch {
    message.value = 'No se pudo guardar la devolución.'
  } finally {
    busy.value = false
  }
}

function surveyText(d: TeacherDiagnosisDetail): string[] {
  const s = d.survey
  if (!s) return ['Sin encuesta registrada.']
  const a5 = A5_EXPERIENCES.map((e) => `${e.label}: ${s.A5?.[e.key] || 'sin responder'}`)
  return [
    `A1 (dispositivos): ${s.A1?.length ? s.A1.join(', ') : 'sin responder'}`,
    `A2 (conexión): ${s.A2 || 'sin responder'}`,
    `A3 (preferencia): ${s.A3 || 'sin responder'}`,
    `A4 (condición): ${s.A4?.option || 'sin responder'}${s.A4?.other ? ` — ${s.A4.other}` : ''}`,
    ...a5,
    `A6 (interés): ${s.A6 || 'sin responder'}`,
  ]
}

const items = computed(() => list.value ?? [])
</script>

<template>
  <section aria-labelledby="td-title" data-testid="teacher-diagnosis">
    <h1 id="td-title">Diagnósticos del curso</h1>
    <p class="lede">
      Diagnósticos <strong>enviados</strong> de tus cursos. Registra puntuación (0–2), una fortaleza observada y un
      siguiente paso. Datos sintéticos de emuladores.
    </p>

    <p v-if="message" class="ok" role="status">{{ message }}</p>

    <StatePanel v-if="loading" state="loading" message="Cargando diagnósticos…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="items.length === 0" state="empty" message="Aún no hay diagnósticos enviados en tu curso." />

    <ul v-else class="list">
      <li v-for="d in items" :key="d.attemptId">
        <button type="button" class="row" :aria-pressed="selectedId === d.attemptId" @click="abrir(d.attemptId)">
          <span>{{ d.pseudonym }}</span>
          <span class="chip">{{ d.scoredCount }}/{{ d.responseCount }} valoradas</span>
        </button>
      </li>
    </ul>

    <StatePanel v-if="detailError" state="error" :message="detailError" />

    <article v-if="detail" class="detail card" aria-labelledby="detail-title">
      <h2 id="detail-title">{{ detail.pseudonym }}</h2>

      <section aria-labelledby="survey-h">
        <h3 id="survey-h">Encuesta de condiciones</h3>
        <ul>
          <li v-for="(line, i) in surveyText(detail)" :key="i">{{ line }}</li>
        </ul>
      </section>

      <section aria-labelledby="resp-h">
        <h3 id="resp-h">Respuestas T1–T5</h3>
        <article v-for="t in DIAGNOSIS_TASKS" :key="t.code" class="task" :data-task="t.code">
          <h4>{{ t.code }} · {{ t.title }} <span class="chip">{{ t.indicator }}</span></h4>
          <p class="resp">{{ detail.responses.find((r) => r.taskCode === t.code)?.responseText || 'Sin texto.' }}</p>
          <p class="meta">
            Estado:
            {{ detail.responses.find((r) => r.taskCode === t.code)?.responseStatus ?? 'no respondido' }}
            · Barrera técnica: {{ detail.responses.find((r) => r.taskCode === t.code)?.technicalIssue ? 'sí' : 'no' }}
          </p>
          <p class="meta">
            Apoyos:
            {{
              (detail.responses.find((r) => r.taskCode === t.code)?.supports ?? [])
                .map((s) => SUPPORT_LABELS[s] ?? s)
                .join(', ') || 'ninguno'
            }}
          </p>

          <p v-if="!answerable(t.code)" class="barrier" role="note">
            Tarea no respondida o con barrera técnica: el puntaje queda <strong>nulo</strong>.
          </p>

          <div class="review">
            <label :for="`score-${t.code}`">Puntaje (0–2)</label>
            <select :id="`score-${t.code}`" v-model="draft[t.code].score" class="input" :disabled="!answerable(t.code)">
              <option value="">Nulo / sin puntuar</option>
              <option value="0">0 · sin evidencia suficiente</option>
              <option value="1">1 · evidencia parcial</option>
              <option value="2">2 · evidencia clara</option>
            </select>
            <label :for="`comment-${t.code}`">Comentario</label>
            <input :id="`comment-${t.code}`" v-model="draft[t.code].comment" class="input" type="text" maxlength="1000" />
            <button type="button" class="btn btn--secondary" :disabled="busy" @click="guardarTarea(t.code)">
              Guardar {{ t.code }}
            </button>
          </div>
        </article>
      </section>

      <section aria-labelledby="fb-h">
        <h3 id="fb-h">Devolución</h3>
        <label for="strength">Fortaleza observada</label>
        <input id="strength" v-model="feedback.strength" class="input" type="text" maxlength="1000" />
        <label for="next-step">Siguiente paso</label>
        <input id="next-step" v-model="feedback.nextStep" class="input" type="text" maxlength="1000" />
        <button type="button" class="btn btn--primary" :disabled="busy" @click="guardarDevolucion">
          Guardar devolución
        </button>
      </section>

      <section v-if="detail.history.length" aria-labelledby="hist-h">
        <h3 id="hist-h">Historial de cambios</h3>
        <ul class="history">
          <li v-for="h in detail.history" :key="h.id">
            <template v-if="h.kind === 'score'">
              {{ h.taskCode }}: {{ h.previousScore ?? 'nulo' }} → {{ h.newScore ?? 'nulo' }}
            </template>
            <template v-else>
              Devolución: «{{ h.newStrength || '—' }}» / «{{ h.newNextStep || '—' }}»
            </template>
          </li>
        </ul>
      </section>
    </article>
  </section>
</template>

<style scoped>
.lede,
.meta,
.provenance {
  color: var(--rt-text-muted);
}
.list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--rt-space-2);
}
.row {
  width: 100%;
  min-height: var(--rt-touch);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--rt-space-2);
  padding: var(--rt-space-2) var(--rt-space-3);
  font: inherit;
  text-align: left;
  background: var(--rt-surface);
  border: 2px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  cursor: pointer;
}
.row[aria-pressed='true'] {
  border-color: var(--rt-primary);
}
.detail {
  margin-top: var(--rt-space-4);
}
.task {
  border-top: 1px solid var(--rt-border);
  padding-top: var(--rt-space-3);
  margin-top: var(--rt-space-3);
}
.resp {
  background: var(--rt-bg);
  padding: var(--rt-space-2);
  border-radius: var(--rt-radius-sm);
  white-space: pre-wrap;
}
.barrier {
  background: var(--rt-warning-soft);
  color: #7c2d12;
  padding: var(--rt-space-2);
  border-radius: var(--rt-radius-sm);
  font-weight: 600;
}
.review {
  display: grid;
  gap: var(--rt-space-1);
  margin-top: var(--rt-space-2);
}
label {
  font-weight: 600;
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
.history {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--rt-space-1);
}
.ok {
  color: #14532d;
  font-weight: 600;
}
</style>
