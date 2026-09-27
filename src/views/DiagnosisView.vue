<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useAsync } from '../composables/useAsync'
import {
  fetchDiagnosis,
  saveDiagnosisResponse,
  saveSurvey,
  startDiagnosis,
  submitDiagnosis,
  type DiagnosisResponse,
} from '../data/firebaseRepository'
import { DIAGNOSIS_TASKS, diagnosisCaseFor } from '../data/diagnosisCase'
import {
  A1_OPTIONS,
  A2_OPTIONS,
  A3_OPTIONS,
  A4_OPTIONS,
  A5_EXPERIENCES,
  A5_OPTIONS,
  emptySurvey,
  type A5Key,
  type SurveyAnswers,
} from '../data/diagnosisSurvey'
import { demo, session } from '../stores/session'
import StatePanel from '../components/StatePanel.vue'

const CASE = diagnosisCaseFor('pre')
const TASKS = DIAGNOSIS_TASKS

const SUPPORTS = [
  { code: 'text_amplified', label: 'Texto ampliado' },
  { code: 'subtitles', label: 'Subtítulos' },
  { code: 'audio_reading', label: 'Audio o lectura guiada' },
  { code: 'keyboard', label: 'Teclado' },
  { code: 'extra_time', label: 'Más tiempo' },
]

const { data, loading, error, reload } = useAsync(() => fetchDiagnosis(), () => [session.binding?.enrollmentId, demo.state])

const survey = reactive<SurveyAnswers>(emptySurvey())
const responses = reactive<Record<string, DiagnosisResponse>>({})
const busy = ref(false)
const message = ref('')

function notify(text: string): void {
  message.value = text
}

watch(
  () => data.value,
  (value) => {
    if (!value) return
    if (value.survey) Object.assign(survey, value.survey)
    for (const t of TASKS) {
      const found = value.responses.find((r) => r.taskCode === t.code)
      responses[t.code] = found ?? {
        taskCode: t.code,
        responseStatus: 'not_answered',
        responseText: '',
        technicalIssue: false,
        supports: [],
        score: null,
        reviewerComment: '',
      }
    }
  },
  { immediate: true },
)

const submitted = computed(() => data.value?.status === 'submitted')
const surveySubmitted = computed(() => Boolean(data.value?.surveySubmitted))
const surveyLocked = computed(() => surveySubmitted.value && submitted.value)

function toggleA1(option: string): void {
  const has = survey.A1.includes(option)
  if (option === 'prefiero no responder') {
    survey.A1 = has ? [] : [option]
    return
  }
  survey.A1 = has ? survey.A1.filter((o) => o !== option) : [...survey.A1.filter((o) => o !== 'prefiero no responder'), option]
}

async function enviarEncuesta(): Promise<void> {
  busy.value = true
  try {
    await saveSurvey({ ...survey, A1: [...survey.A1], A4: { ...survey.A4 }, A5: { ...survey.A5 } })
    notify('Encuesta guardada.')
    await reload()
  } catch {
    notify('No se pudo guardar la encuesta.')
  } finally {
    busy.value = false
  }
}

function toggleSupport(taskCode: string, code: string): void {
  const r = responses[taskCode]
  r.supports = r.supports.includes(code) ? r.supports.filter((s) => s !== code) : [...r.supports, code]
}

async function guardarBorrador(): Promise<boolean> {
  try {
    const attemptId = (await startDiagnosis('pre')) || data.value?.attemptId
    if (!attemptId) throw new Error('sin intento')
    for (const t of TASKS) {
      const r = responses[t.code]
      await saveDiagnosisResponse({
        attemptId,
        taskCode: r.taskCode,
        responseStatus: r.responseStatus,
        responseText: r.responseText,
        technicalIssue: r.technicalIssue,
        supports: r.supports,
      })
    }
    return true
  } catch {
    return false
  }
}

async function guardar(): Promise<void> {
  busy.value = true
  const ok = await guardarBorrador()
  busy.value = false
  if (ok) notify('Borrador guardado.')
  else notify('No se pudo guardar el borrador.')
  await reload()
}

async function enviar(): Promise<void> {
  busy.value = true
  const ok = await guardarBorrador()
  if (ok && data.value?.attemptId) {
    try {
      await submitDiagnosis(data.value.attemptId)
      notify('Diagnóstico enviado. Ya no se puede modificar.')
    } catch {
      notify('No se pudo enviar el diagnóstico.')
    }
  } else {
    notify('No se pudo guardar antes de enviar.')
  }
  busy.value = false
  await reload()
}

function a5(key: A5Key, value: string): void {
  survey.A5[key] = value
}
</script>

<template>
  <section class="diag" aria-labelledby="diag-title" data-testid="diagnosis-view">
    <h1 id="diag-title">Diagnóstico inicial</h1>
    <p class="lede">
      Línea base formativa (sin nota). Distingue <strong>condiciones</strong>, <strong>respuestas</strong> y
      <strong>apoyos</strong>; el puntaje lo asigna tu docente después.
    </p>

    <p v-if="message" class="ok" role="status">{{ message }}</p>

    <StatePanel v-if="loading" state="loading" message="Cargando el diagnóstico…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="!session.binding" state="empty" message="Entra con tu código para ver el diagnóstico." />

    <template v-else>
      <!-- Caso y materiales (Fase 5) -->
      <section class="card case" aria-labelledby="case-title" data-testid="diagnosis-case">
        <h2 id="case-title">Caso: {{ CASE.title }}</h2>
        <p>{{ CASE.summary }}</p>
        <p class="sim" role="note">🔎 {{ CASE.disclaimer }}</p>

        <div class="sources">
          <article v-for="s in CASE.sources" :key="s.label" class="source" :data-source="s.label">
            <h3>{{ s.label }} · {{ s.heading }}</h3>
            <p class="provenance">{{ s.provenance }}</p>
            <ul>
              <li v-for="(line, i) in s.lines" :key="i">{{ line }}</li>
            </ul>
            <p v-if="s.simulatedLink" class="sim-link">
              Enlace simulado (no activo): <span class="code">{{ s.simulatedLink }}</span>
            </p>
          </article>
        </div>

        <article class="message" data-testid="suspicious-message">
          <h3>Mensaje recibido (simulado)</h3>
          <p class="provenance">De: {{ CASE.message.from }}</p>
          <p class="provenance">Asunto: {{ CASE.message.subject }}</p>
          <p>{{ CASE.message.body }}</p>
          <p class="sim-link">
            Enlace simulado (no activo): <span class="code">{{ CASE.message.simulatedLink }}</span>
          </p>
        </article>

        <div class="materials">
          <div>
            <h3>Plantilla de carpeta de fuentes</h3>
            <ul>
              <li v-for="(f, i) in CASE.folderTemplate" :key="i">{{ f }}</li>
            </ul>
          </div>
          <div>
            <h3>Instrucciones</h3>
            <ul>
              <li v-for="(f, i) in CASE.instructions" :key="i">{{ f }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Encuesta A1–A6 -->
      <section class="card" aria-labelledby="survey-title">
        <h2 id="survey-title">Encuesta de condiciones (A1–A6)</h2>
        <p class="hint">Tus respuestas no son una nota. Puedes dejar en blanco lo que no desees responder.</p>
        <p v-if="surveyLocked" class="ok">Encuesta registrada (cerrada tras el envío).</p>

        <fieldset :disabled="surveyLocked">
          <legend>A1 · ¿Con qué puedes trabajar fuera del colegio? (puedes marcar varias)</legend>
          <label v-for="opt in A1_OPTIONS" :key="opt" class="check">
            <input type="checkbox" :checked="survey.A1.includes(opt)" @change="toggleA1(opt)" />
            {{ opt }}
          </label>
        </fieldset>

        <div class="grid">
          <label>A2 · ¿Dónde tienes conexión para una tarea?
            <select v-model="survey.A2" class="input">
              <option value="">Sin responder</option>
              <option v-for="opt in A2_OPTIONS" :key="opt">{{ opt }}</option>
            </select>
          </label>
          <label>A3 · ¿Qué te resulta más cómodo para aprender una tarea nueva?
            <select v-model="survey.A3" class="input">
              <option value="">Sin responder</option>
              <option v-for="opt in A3_OPTIONS" :key="opt">{{ opt }}</option>
            </select>
          </label>
          <label>A4 · ¿Necesitas alguna condición para participar mejor?
            <select v-model="survey.A4.option" class="input">
              <option value="">Sin responder</option>
              <option v-for="opt in A4_OPTIONS" :key="opt">{{ opt }}</option>
            </select>
          </label>
          <label v-if="survey.A4.option === 'otra'">A4 · Describe la condición «otra»
            <input v-model="survey.A4.other" class="input" type="text" maxlength="200" />
          </label>
        </div>

        <fieldset :disabled="surveyLocked">
          <legend>A5 · ¿Has hecho alguna de estas acciones? (registra cada una por separado)</legend>
          <div v-for="exp in A5_EXPERIENCES" :key="exp.key" class="a5-row">
            <label :for="`A5-${exp.key}`">{{ exp.label }}</label>
            <select
              :id="`A5-${exp.key}`"
              class="input"
              :value="survey.A5[exp.key]"
              @change="a5(exp.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Sin responder</option>
              <option v-for="opt in A5_OPTIONS" :key="opt">{{ opt }}</option>
            </select>
          </div>
        </fieldset>

        <label>A6 · ¿Qué tarea digital te gustaría poder hacer mejor o ayudar a alguien a realizar? (opcional)
          <input v-model="survey.A6" class="input" type="text" maxlength="500" :disabled="surveyLocked" />
        </label>

        <button v-if="!surveyLocked" type="button" class="btn btn--primary" :disabled="busy" @click="enviarEncuesta">
          {{ surveySubmitted ? 'Actualizar encuesta' : 'Guardar encuesta' }}
        </button>
      </section>

      <!-- Tareas T1–T5 -->
      <section v-if="surveySubmitted" class="tasks" aria-labelledby="tasks-title">
        <h2 id="tasks-title">Tareas T1–T5</h2>
        <article v-for="t in TASKS" :key="t.code" class="card task" :data-task="t.code">
          <h3>{{ t.code }} · {{ t.title }} <span class="chip">{{ t.indicator }}</span></h3>
          <p class="consigna">{{ t.prompt }}</p>

          <label :for="`resp-${t.code}`">Respuesta</label>
          <textarea :id="`resp-${t.code}`" v-model="responses[t.code].responseText" class="input" rows="3" :disabled="submitted" />

          <fieldset :disabled="submitted">
            <legend>Estado de la respuesta</legend>
            <label><input v-model="responses[t.code].responseStatus" type="radio" value="answered" /> Respondida</label>
            <label><input v-model="responses[t.code].responseStatus" type="radio" value="not_answered" /> No respondido</label>
            <label><input v-model="responses[t.code].responseStatus" type="radio" value="skipped" /> Omitida</label>
          </fieldset>

          <label class="check">
            <input v-model="responses[t.code].technicalIssue" type="checkbox" :disabled="submitted" />
            Barrera técnica (no pude responder por el dispositivo o la conexión)
          </label>

          <fieldset :disabled="submitted">
            <legend>Apoyos utilizados (independientes del puntaje)</legend>
            <label v-for="s in SUPPORTS" :key="s.code" class="check">
              <input
                type="checkbox"
                :checked="responses[t.code].supports.includes(s.code)"
                @change="toggleSupport(t.code, s.code)"
              />
              {{ s.label }}
            </label>
          </fieldset>

          <p v-if="submitted" class="feedback">
            <strong>Puntaje docente:</strong>
            {{ responses[t.code].score ?? (responses[t.code].responseStatus !== 'answered' || responses[t.code].technicalIssue ? 'nulo (no respondida o barrera técnica)' : 'sin puntuar') }}
            <span v-if="responses[t.code].reviewerComment"> · {{ responses[t.code].reviewerComment }}</span>
          </p>
        </article>

        <div class="actions">
          <button v-if="!submitted" type="button" class="btn btn--secondary" :disabled="busy" @click="guardar">
            Guardar borrador
          </button>
          <button v-if="!submitted" type="button" class="btn btn--primary" :disabled="busy" @click="enviar">
            Enviar diagnóstico
          </button>
          <p v-if="submitted" class="ok">Diagnóstico enviado (inmutable).</p>
        </div>

        <section v-if="submitted && (data?.strength || data?.nextStep)" class="card" aria-labelledby="feedback-title">
          <h2 id="feedback-title">Devolución docente</h2>
          <p v-if="data?.strength"><strong>Fortaleza observada:</strong> {{ data?.strength }}</p>
          <p v-if="data?.nextStep"><strong>Siguiente paso:</strong> {{ data?.nextStep }}</p>
        </section>
      </section>

      <StatePanel v-else state="empty" message="Responde la encuesta para habilitar las tareas." />
    </template>
  </section>
</template>

<style scoped>
.diag {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}
.lede,
.hint,
.provenance,
.consigna {
  color: var(--rt-text-muted);
}
.grid {
  display: grid;
  gap: var(--rt-space-3);
  margin-top: var(--rt-space-3);
}
label {
  display: block;
  font-weight: 600;
}
.input {
  width: 100%;
  min-height: var(--rt-touch);
  padding: var(--rt-space-2);
  margin-top: var(--rt-space-1);
  font: inherit;
  border: 2px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-surface);
  color: var(--rt-text);
}
fieldset {
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  margin: var(--rt-space-3) 0;
  padding: var(--rt-space-2);
}
fieldset label,
.check {
  font-weight: 400;
}
.sources {
  display: grid;
  gap: var(--rt-space-3);
  margin-top: var(--rt-space-3);
}
.source,
.message {
  border: 1px solid var(--rt-border);
  border-left: 4px solid var(--rt-primary);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-3);
  background: var(--rt-surface);
}
.message {
  border-left-color: var(--rt-danger);
  margin-top: var(--rt-space-3);
}
.source ul,
.materials ul {
  margin: var(--rt-space-2) 0 0;
  padding-left: var(--rt-space-4);
}
.sim {
  background: var(--rt-warning-soft);
  color: #7c2d12;
  padding: var(--rt-space-2);
  border-radius: var(--rt-radius-sm);
  font-weight: 600;
}
.sim-link {
  font-weight: 600;
}
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--rt-bg);
  padding: 0 4px;
  border-radius: 4px;
}
.materials {
  display: grid;
  gap: var(--rt-space-3);
  margin-top: var(--rt-space-3);
}
.a5-row {
  display: grid;
  gap: var(--rt-space-1);
  margin-bottom: var(--rt-space-2);
}
.task {
  margin-bottom: var(--rt-space-3);
}
.feedback {
  background: var(--rt-info-soft);
  padding: var(--rt-space-2);
  border-radius: var(--rt-radius-sm);
}
.ok {
  color: #14532d;
  font-weight: 600;
}
.actions {
  display: flex;
  gap: var(--rt-space-2);
  flex-wrap: wrap;
}
</style>
