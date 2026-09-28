<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '../composables/useAsync'
import { fetchMissionDetail, startMission, submitTextEvidence } from '../data/firebaseRepository'
import { clearDraft, loadDraft, saveDraft } from '../data/drafts'
import { demo, refreshSession, session } from '../stores/session'
import { missionStateLabels } from '../utils/labels'
import StatePanel from '../components/StatePanel.vue'

const route = useRoute()
const missionId = computed(() => String(route.params.id))

const { data, loading, error, reload } = useAsync(
  () => fetchMissionDetail(missionId.value),
  () => [missionId.value, session.binding?.enrollmentId, demo.state],
)

const mission = computed(() => data.value?.mission ?? null)
const milestone = computed(() => data.value?.milestone ?? null)
const progress = computed(() => data.value?.progress ?? null)
const versions = computed(() => data.value?.versions ?? [])
const state = computed(() => progress.value?.state ?? 'not_started')
const editable = computed(() => state.value === 'not_started' || state.value === 'in_progress')

const draftText = ref('')
const busy = ref(false)
const message = ref('')
const submitError = ref('')
const confirmation = ref<{ version: number; reused: boolean; date: string } | null>(null)
// Clave de idempotencia: se genera una vez y se reutiliza al reintentar el mismo envío.
const submitKey = ref<string | null>(null)

watch(
  () => data.value,
  (value) => {
    if (!value || !session.binding || !value.milestone) return
    if (editable.value && !draftText.value) {
      draftText.value = loadDraft(session.binding.enrollmentId, value.milestone.id)
    }
  },
  { immediate: true },
)

function guardarBorrador(): void {
  if (!session.binding || !milestone.value) return
  saveDraft(session.binding.enrollmentId, milestone.value.id, draftText.value)
  message.value = 'Borrador guardado solo en este dispositivo.'
}

async function iniciar(): Promise<void> {
  if (!milestone.value) return
  busy.value = true
  message.value = ''
  try {
    await startMission(milestone.value.id)
    message.value = 'Misión iniciada.'
    await reload()
  } catch {
    message.value = 'No se pudo iniciar la misión. Intenta de nuevo.'
  } finally {
    busy.value = false
  }
}

async function enviar(): Promise<void> {
  if (!milestone.value || !session.binding) return
  if (!draftText.value.trim()) {
    submitError.value = 'Escribe tu entrega antes de enviarla.'
    return
  }
  busy.value = true
  submitError.value = ''
  message.value = ''
  try {
    // Revalida el vínculo antes de una acción sensible (por si fue revocado).
    await refreshSession()
    if (!session.binding) {
      submitError.value = 'Tu sesión ya no está activa. Vuelve a entrar con tu código.'
      return
    }
    let deliveryId = data.value?.deliveryId ?? null
    if (!deliveryId) deliveryId = await startMission(milestone.value.id)
    if (!submitKey.value) submitKey.value = crypto.randomUUID()

    const result = await submitTextEvidence({
      deliveryId,
      submitKey: submitKey.value,
      description: draftText.value.trim(),
    })
    clearDraft(session.binding.enrollmentId, milestone.value.id)
    submitKey.value = null
    confirmation.value = { version: result.version, reused: result.reused, date: new Date().toLocaleString('es-CL') }
    message.value = 'Entrega registrada. Tu docente la revisará y te dejará un comentario.'
    draftText.value = ''
    await reload()
  } catch {
    submitError.value = 'No se pudo enviar la entrega.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="mission-title" data-testid="mission-detail">
    <p><RouterLink to="/estudiante/misiones">← Volver a misiones</RouterLink></p>

    <StatePanel v-if="loading" state="loading" message="Cargando la misión…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="!mission" state="empty" message="No encontramos esta misión." />

    <template v-else>
      <h1 id="mission-title">Misión {{ mission.order }} · {{ mission.name }}</h1>
      <p class="lede">{{ mission.prompt }}</p>

      <p v-if="message" class="ok" role="status">{{ message }}</p>

      <div class="card">
        <h2>Entregable</h2>
        <p>{{ mission.deliverable }}</p>
        <p v-if="milestone">
          Hito: <strong>{{ milestone.title }}</strong> · {{ milestone.xpValue }} XP al validar ·
          indicadores {{ milestone.indicatorCodes.join(', ') || '—' }}
        </p>
        <p>
          Estado:
          <span class="chip" :class="`chip--${state}`" data-testid="mission-state">
            {{ missionStateLabels[state] }}
          </span>
        </p>
        <p class="hint">El XP se otorga solo al validar el hito (I2b). Aquí se registra tu entrega.</p>
      </div>

      <!-- Confirmación de envío -->
      <div v-if="confirmation" class="card receipt" role="status" data-testid="mission-receipt">
        <h2>Entrega confirmada</h2>
        <p>
          Versión <strong>{{ confirmation.version }}</strong> · {{ confirmation.date }}
          <span v-if="confirmation.reused"> · (envío ya registrado, sin duplicar)</span>
        </p>
      </div>

      <!-- Editor (solo mientras está en borrador) -->
      <div v-if="editable" class="card">
        <h2>Tu entrega (texto)</h2>
        <p class="hint">
          Escribe tu ficha de necesidad con evidencias y fuentes revisadas. No incluyas contraseñas ni datos
          personales.
        </p>

        <div v-if="!data?.deliveryId" class="actions">
          <button type="button" class="btn btn--primary" :disabled="busy" @click="iniciar">Iniciar misión</button>
        </div>

        <template v-else>
          <label for="entrega-texto">Texto de la entrega</label>
          <textarea id="entrega-texto" v-model="draftText" class="input" rows="6" :disabled="busy" />

          <p v-if="submitError" class="error" role="alert">{{ submitError }}</p>

          <div class="actions">
            <button type="button" class="btn btn--secondary" :disabled="busy" @click="guardarBorrador">
              Guardar borrador
            </button>
            <button type="button" class="btn btn--primary" :disabled="busy" @click="enviar">
              {{ submitError ? 'Reintentar envío' : 'Enviar entrega' }}
            </button>
          </div>
          <p class="hint">El borrador se guarda solo en este dispositivo hasta que envíes.</p>
        </template>
      </div>

      <!-- Resumen de solo lectura tras enviar -->
      <div v-else class="card">
        <h2>Entrega enviada</h2>
        <p class="hint">La valoración y el XP llegan en I2b; aquí solo se registra y versiona la evidencia.</p>
      </div>

      <div class="card">
        <h2>Evidencia registrada</h2>
        <StatePanel v-if="versions.length === 0" state="empty" message="Aún no hay evidencia registrada." />
        <ol v-else class="versions">
          <li v-for="v in versions" :key="v.evidenceId" :data-version="v.version">
            <p class="version-head">
              <strong>Versión {{ v.version }}</strong>
              · {{ v.origin === 'teacher_equivalent' ? 'Registro docente (equivalencia)' : 'Entrega del estudiante' }}
              · {{ v.format }}
            </p>
            <p class="version-body">{{ v.description }}</p>
          </li>
        </ol>
      </div>
    </template>
  </section>
</template>

<style scoped>
.lede,
.hint {
  color: var(--rt-text-muted);
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
label {
  display: block;
  font-weight: 600;
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
.error {
  color: #7f1d1d;
  background: var(--rt-danger-soft);
  border: 1px solid var(--rt-danger);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-2);
  font-weight: 600;
}
.receipt {
  border-left: 4px solid var(--rt-success);
}
.versions {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--rt-space-2);
}
.version-head {
  font-size: var(--rt-font-size-sm);
  color: var(--rt-text-muted);
  margin: 0;
}
.version-body {
  margin: 0;
  white-space: pre-wrap;
}
</style>
