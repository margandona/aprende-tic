<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '../composables/useAsync'
import {
  evidenceDownloadUrl,
  fetchMissionDetail,
  reserveUpload,
  startMission,
  submitFileEvidence,
  submitTextEvidence,
  uploadEvidenceFile,
} from '../data/firebaseRepository'
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
// Modalidades admitidas por el hito (texto/archivo). La equivalencia en papel la registra el docente.
const modalities = computed(() => milestone.value?.modalities ?? ['text'])
const allowText = computed(() => modalities.value.includes('text'))
const allowFile = computed(() => modalities.value.includes('file'))

// Formatos de archivo admitidos (deben coincidir con Storage Rules y Functions).
const ALLOWED_TYPES = [
  'text/plain',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_BYTES = 5 * 1024 * 1024

const draftText = ref('')
const mode = ref<'text' | 'file'>('text')
const file = ref<File | null>(null)
const fileError = ref('')
const uploadPercent = ref(0)
const busy = ref(false)
const message = ref('')
const submitError = ref('')
const confirmation = ref<{ version: number; reused: boolean; evidenceId: string } | null>(null)
// Clave de idempotencia: se genera una vez y se reutiliza al reintentar el mismo envío.
const submitKey = ref<string | null>(null)
// Reserva en curso: se reutiliza en reintentos para no subir el archivo dos veces.
const pendingReservation = ref<{ reservationId: string; path: string; expiresAt: number; uploaded: boolean } | null>(null)

const adjustment = computed(() => data.value?.adjustment ?? null)
// Fecha de recepción confirmada por el servidor (no el reloj del dispositivo).
const confirmationDate = computed(() => {
  const id = confirmation.value?.evidenceId
  if (!id) return null
  const v = versions.value.find((x) => x.evidenceId === id)
  return v?.createdAt ? new Date(v.createdAt).toLocaleString('es-CL') : null
})

watch(
  () => data.value,
  (value) => {
    if (!value || !session.binding || !value.milestone) return
    if (!allowText.value && allowFile.value) mode.value = 'file'
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

function borrarBorrador(): void {
  if (!session.binding || !milestone.value) return
  clearDraft(session.binding.enrollmentId, milestone.value.id)
  draftText.value = ''
  message.value = 'Borrador local borrado.'
}

function onFile(event: Event): void {
  fileError.value = ''
  submitError.value = ''
  const f = (event.target as HTMLInputElement).files?.[0] ?? null
  if (!f) {
    file.value = null
    return
  }
  if (!ALLOWED_TYPES.includes(f.type)) {
    file.value = null
    fileError.value = 'Tipo de archivo no permitido (texto, PDF, PNG, JPG o DOCX).'
    return
  }
  if (f.size > MAX_BYTES) {
    file.value = null
    fileError.value = 'El archivo supera el máximo de 5 MB.'
    return
  }
  file.value = f
}

async function enviarArchivo(): Promise<void> {
  if (!milestone.value || !session.binding || !file.value) {
    if (!file.value) submitError.value = 'Selecciona un archivo antes de enviar.'
    return
  }
  busy.value = true
  submitError.value = ''
  message.value = ''
  uploadPercent.value = 0
  try {
    await refreshSession()
    if (!session.binding) {
      submitError.value = 'Tu sesión ya no está activa. Vuelve a entrar con tu código.'
      return
    }
    let deliveryId = data.value?.deliveryId ?? null
    if (!deliveryId) deliveryId = await startMission(milestone.value.id)
    if (!submitKey.value) submitKey.value = crypto.randomUUID()

    // 1) Reserva con caducidad (se reutiliza en reintentos si sigue vigente).
    let reservation = pendingReservation.value
    if (!reservation || reservation.expiresAt <= Date.now()) {
      const created = await reserveUpload({
        deliveryId,
        fileName: file.value.name,
        contentType: file.value.type,
        sizeBytes: file.value.size,
      })
      reservation = { reservationId: created.reservationId, path: created.path, expiresAt: created.expiresAt, uploaded: false }
      pendingReservation.value = reservation
    }
    // 2) Subida a Storage con progreso (solo si no se subió antes).
    if (!reservation.uploaded) {
      await uploadEvidenceFile(reservation.path, file.value, (p) => {
        uploadPercent.value = p
      })
      reservation.uploaded = true
    }
    // 3) Confirmación solo tras verificar el objeto real en el servidor.
    const result = await submitFileEvidence({
      deliveryId,
      submitKey: submitKey.value,
      description: file.value.name,
      reservationId: reservation.reservationId,
    })
    submitKey.value = null
    pendingReservation.value = null
    confirmation.value = { version: result.version, reused: result.reused, evidenceId: result.evidenceId }
    message.value = 'Archivo registrado y verificado por el servidor.'
    file.value = null
    uploadPercent.value = 0
    await reload()
  } catch {
    submitError.value = 'No se pudo subir o registrar el archivo. Puedes reintentar.'
  } finally {
    busy.value = false
  }
}

async function verArchivo(path: string): Promise<void> {
  try {
    window.open(await evidenceDownloadUrl(path), '_blank', 'noopener')
  } catch {
    /* sin acceso al archivo */
  }
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
    confirmation.value = { version: result.version, reused: result.reused, evidenceId: result.evidenceId }
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
          Versión <strong>{{ confirmation.version }}</strong> ·
          <span v-if="confirmationDate">{{ confirmationDate }} (fecha del servidor)</span>
          <span v-else>fecha confirmada por el servidor</span>
          <span v-if="confirmation.reused"> · (envío ya registrado, sin duplicar)</span>
        </p>
      </div>

      <!-- Devolución de «pedir ajuste» -->
      <div v-if="editable && adjustment" class="card adjustment" role="note" data-testid="mission-adjustment">
        <h2>Tu docente pidió un ajuste</h2>
        <p>{{ adjustment.action }}</p>
      </div>

      <!-- Editor (solo mientras está en borrador) -->
      <div v-if="editable" class="card">
        <h2>Tu entrega</h2>
        <p v-if="milestone?.guidance" class="hint">{{ milestone.guidance }}</p>
        <p class="hint">
          No incluyas contraseñas ni datos personales. Si no tienes dispositivo, tu docente puede registrar una
          <strong>entrega equivalente</strong> (papel/audio/maqueta) con el mismo criterio de acreditación.
        </p>

        <div v-if="!data?.deliveryId" class="actions">
          <button type="button" class="btn btn--primary" :disabled="busy" @click="iniciar">Iniciar misión</button>
        </div>

        <template v-else>
          <fieldset v-if="allowText && allowFile" class="mode" :disabled="busy">
            <legend>Formato de entrega</legend>
            <label><input v-model="mode" type="radio" value="text" /> Texto</label>
            <label><input v-model="mode" type="radio" value="file" /> Archivo</label>
          </fieldset>
          <p v-else class="hint">
            Modalidad admitida: <strong>{{ allowFile ? 'archivo' : 'texto' }}</strong>.
          </p>

          <p v-if="submitError" class="error" role="alert">{{ submitError }}</p>

          <!-- Texto -->
          <template v-if="mode === 'text' && allowText">
            <label for="entrega-texto">Texto de la entrega</label>
            <textarea id="entrega-texto" v-model="draftText" class="input" rows="6" :disabled="busy" />
            <div class="actions">
              <button type="button" class="btn btn--secondary" :disabled="busy" @click="guardarBorrador">
                Guardar borrador
              </button>
              <button type="button" class="btn btn--secondary" :disabled="busy" @click="borrarBorrador">
                Borrar borrador local
              </button>
              <button type="button" class="btn btn--primary" :disabled="busy" @click="enviar">
                {{ submitError ? 'Reintentar envío' : 'Enviar entrega' }}
              </button>
            </div>
            <p class="hint">El borrador se guarda solo en este dispositivo hasta que envíes.</p>
          </template>

          <!-- Archivo -->
          <template v-else-if="allowFile">
            <label for="entrega-archivo">Archivo (texto, PDF, PNG, JPG o DOCX · máx. 5 MB)</label>
            <input
              id="entrega-archivo"
              class="input"
              type="file"
              accept=".txt,.pdf,.png,.jpg,.jpeg,.docx"
              :disabled="busy"
              @change="onFile"
            />
            <p v-if="fileError" class="error" role="alert">{{ fileError }}</p>
            <p v-if="file" class="hint">Seleccionado: {{ file.name }} ({{ Math.ceil(file.size / 1024) }} KB)</p>
            <div v-if="busy && uploadPercent > 0" class="progress" role="status" aria-live="polite">
              <progress :value="uploadPercent" max="100" /> {{ uploadPercent }}%
            </div>
            <div class="actions">
              <button type="button" class="btn btn--primary" :disabled="busy || !file" @click="enviarArchivo">
                {{ submitError ? 'Reintentar envío' : 'Subir y enviar' }}
              </button>
            </div>
            <p class="hint">El envío se confirma solo cuando el servidor verifica el archivo real.</p>
          </template>
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
            <button
              v-if="v.format === 'file' && v.storagePath"
              type="button"
              class="btn btn--secondary"
              @click="verArchivo(v.storagePath)"
            >
              Ver archivo
            </button>
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
.adjustment {
  border-left: 4px solid var(--rt-warning);
  background: var(--rt-warning-soft);
}
.mode {
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-2);
  margin: var(--rt-space-2) 0;
}
.mode label {
  display: inline-flex;
  gap: var(--rt-space-1);
  margin-right: var(--rt-space-3);
  font-weight: 400;
}
.progress {
  display: flex;
  align-items: center;
  gap: var(--rt-space-2);
  margin-top: var(--rt-space-2);
}
.progress progress {
  flex: 1;
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
