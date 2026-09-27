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
import { demo, session } from '../stores/session'
import StatePanel from '../components/StatePanel.vue'

const TASKS = [
  { code: 'T1', label: 'T1 · Buscar y contrastar', hint: 'Escribe una búsqueda útil y compara las fuentes A y B; indica qué usarías y por qué.' },
  { code: 'T2', label: 'T2 · Decidir con seguridad', hint: 'Ante el mensaje sospechoso: ¿qué harías antes de abrir el enlace y qué dato no entregarías?' },
  { code: 'T3', label: 'T3 · Explicar para otra persona', hint: 'Redacta tres pasos para reservar usando solo la información confiable.' },
  { code: 'T4', label: 'T4 · Resolver una dificultad', hint: 'La persona no encuentra el botón: propón dos acciones y cómo comprobarías el resultado.' },
  { code: 'T5', label: 'T5 · Formular necesidad', hint: 'Escribe una pregunta que harías al usuario antes de diseñar la guía.' },
]

const SUPPORTS = [
  { code: 'text_amplified', label: 'Texto ampliado' },
  { code: 'subtitles', label: 'Subtítulos' },
  { code: 'audio_reading', label: 'Audio o lectura guiada' },
  { code: 'keyboard', label: 'Teclado' },
  { code: 'extra_time', label: 'Más tiempo' },
]

const { data, loading, error, reload } = useAsync(() => fetchDiagnosis(), () => [session.binding?.enrollmentId, demo.state])

const survey = reactive<Record<string, string>>({ A1: '', A2: '', A3: '', A4: '', A5: '', A6: '' })
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
const surveyComplete = computed(() => Object.values(survey).every((v) => v.trim().length > 0))

async function enviarEncuesta(): Promise<void> {
  if (!surveyComplete.value) {
    notify('Responde A1–A6 antes de continuar.')
    return
  }
  busy.value = true
  try {
    await saveSurvey({ ...survey })
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
      <!-- Encuesta A1–A6 -->
      <section class="card" aria-labelledby="survey-title">
        <h2 id="survey-title">Encuesta de condiciones (A1–A6)</h2>
        <p v-if="surveySubmitted" class="ok">Encuesta ya registrada.</p>
        <template v-else>
          <div class="grid">
            <label>A1 · ¿Con qué puedes trabajar fuera del colegio?
              <select v-model="survey.A1" class="input"><option value="">Selecciona…</option><option>teléfono propio</option><option>teléfono compartido</option><option>computador propio</option><option>computador compartido</option><option>ninguno</option><option>prefiero no responder</option></select>
            </label>
            <label>A2 · ¿Dónde tienes conexión para una tarea?
              <select v-model="survey.A2" class="input"><option value="">Selecciona…</option><option>en el colegio</option><option>en casa de forma estable</option><option>solo datos móviles</option><option>ninguna</option><option>prefiero no responder</option></select>
            </label>
            <label>A3 · ¿Qué te resulta más cómodo para aprender una tarea nueva?
              <select v-model="survey.A3" class="input"><option value="">Selecciona…</option><option>leer pasos</option><option>ver demostración</option><option>escuchar explicación</option><option>probar con ayuda</option><option>combinación</option></select>
            </label>
            <label>A4 · ¿Necesitas alguna condición para participar mejor?
              <select v-model="survey.A4" class="input"><option value="">Selecciona…</option><option>texto ampliado</option><option>subtítulos</option><option>audio o lectura</option><option>teclado</option><option>más tiempo</option><option>ninguna</option><option>prefiero hablarlo en privado</option></select>
            </label>
            <label>A5 · ¿Has creado documentos, comprobado una noticia o explicado un trámite digital?
              <select v-model="survey.A5" class="input"><option value="">Selecciona…</option><option>sí</option><option>alguna vez</option><option>no</option><option>no recuerdo</option></select>
            </label>
            <label>A6 · ¿Qué tarea digital te gustaría poder hacer mejor o ayudar a alguien a realizar?
              <input v-model="survey.A6" class="input" type="text" maxlength="500" />
            </label>
          </div>
          <button type="button" class="btn btn--primary" :disabled="busy || !surveyComplete" @click="enviarEncuesta">
            Guardar encuesta
          </button>
        </template>
      </section>

      <!-- Tareas T1–T5 -->
      <section v-if="surveySubmitted" class="tasks" aria-labelledby="tasks-title">
        <h2 id="tasks-title">Tareas T1–T5</h2>
        <article v-for="t in TASKS" :key="t.code" class="card task" :data-task="t.code">
          <h3>{{ t.label }}</h3>
          <p class="hint">{{ t.hint }}</p>

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
            <strong>Puntaje docente:</strong> {{ responses[t.code].score ?? 'sin puntuar' }}
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
.hint {
  color: var(--rt-text-muted);
}
.grid {
  display: grid;
  gap: var(--rt-space-3);
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
