<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAsync } from '../composables/useAsync'
import { fetchCourseMilestones, fetchTeacherRoster, registerEquivalent } from '../data/firebaseRepository'
import { session } from '../stores/session'
import StatePanel from '../components/StatePanel.vue'

const router = useRouter()

const { data: roster, loading: loadingRoster, error: rosterError } = useAsync(() => fetchTeacherRoster(), () => [session.uid])
const { data: milestones, loading: loadingMilestones } = useAsync(() => fetchCourseMilestones(), () => [session.uid])

const FORMATS = [
  { value: 'paper', label: 'Papel' },
  { value: 'audio_local', label: 'Audio local' },
  { value: 'model', label: 'Maqueta' },
  { value: 'dictation', label: 'Dictado' },
  { value: 'adaptation', label: 'Adaptación autorizada' },
]
const SUPPORTS = [
  { value: 'reading', label: 'Lectura guiada' },
  { value: 'extra_time', label: 'Más tiempo' },
  { value: 'dictation', label: 'Dictado' },
  { value: 'adapted_material', label: 'Material adaptado' },
  { value: 'device_shared', label: 'Dispositivo compartido' },
  { value: 'other', label: 'Otro' },
]

const form = reactive({
  enrollmentId: '',
  milestoneId: '',
  format: 'paper',
  testModality: 'simulation',
  description: '',
  supports: [] as string[],
})
const busy = ref(false)
const message = ref('')
const submitError = ref('')

onMounted(() => {
  // Preselecciona el primer estudiante y hito disponibles.
  if (!form.enrollmentId && roster.value?.length) form.enrollmentId = roster.value[0].enrollmentId
  if (!form.milestoneId && milestones.value?.length) form.milestoneId = milestones.value[0].id
})

const ready = computed(() => Boolean(form.enrollmentId && form.milestoneId))

function toggleSupport(value: string): void {
  form.supports = form.supports.includes(value) ? form.supports.filter((s) => s !== value) : [...form.supports, value]
}

async function registrar(): Promise<void> {
  if (!ready.value) {
    submitError.value = 'Elige estudiante e hito.'
    return
  }
  if (!form.description.trim()) {
    submitError.value = 'Describe la evidencia (texto breve).'
    return
  }
  busy.value = true
  submitError.value = ''
  message.value = ''
  try {
    const { deliveryId } = await registerEquivalent({
      enrollmentId: form.enrollmentId,
      milestoneId: form.milestoneId,
      format: form.format,
      testModality: form.testModality,
      description: form.description.trim(),
      supports: form.supports,
      submitKey: crypto.randomUUID(),
    })
    message.value = 'Entrega equivalente registrada (por revisar).'
    await router.push(`/docente/revision/${deliveryId}`)
  } catch {
    submitError.value = 'No se pudo registrar la entrega equivalente.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="eq-title" data-testid="teacher-equivalent">
    <h1 id="eq-title">Registrar entrega equivalente</h1>
    <p class="lede">
      Para estudiantes sin entrega digital (papel, audio local, maqueta, dictado o adaptación autorizada). Al guardar,
      la entrega queda <strong>por revisar</strong>; después se valora con los mismos indicadores y XP que una entrega
      digital.
    </p>
    <p><RouterLink to="/docente/plantilla">Abrir plantilla imprimible para la ruta en papel</RouterLink></p>

    <p v-if="message" class="ok" role="status">{{ message }}</p>
    <p v-if="submitError" class="error" role="alert">{{ submitError }}</p>

    <StatePanel v-if="loadingRoster || loadingMilestones" state="loading" message="Cargando estudiantes e hitos…" />
    <StatePanel v-else-if="rosterError" state="error" :message="rosterError" />

    <form v-else class="card" @submit.prevent="registrar">
      <label for="eq-student">Estudiante</label>
      <select id="eq-student" v-model="form.enrollmentId" class="input">
        <option value="">Selecciona…</option>
        <option v-for="r in roster ?? []" :key="r.enrollmentId" :value="r.enrollmentId">{{ r.pseudonym }}</option>
      </select>

      <label for="eq-milestone">Hito</label>
      <select id="eq-milestone" v-model="form.milestoneId" class="input">
        <option value="">Selecciona…</option>
        <option v-for="m in milestones ?? []" :key="m.id" :value="m.id">
          {{ m.missionOrder }} · {{ m.missionName }} — {{ m.title }}
        </option>
      </select>

      <label for="eq-format">Soporte</label>
      <select id="eq-format" v-model="form.format" class="input">
        <option v-for="f in FORMATS" :key="f.value" :value="f.value">{{ f.label }}</option>
      </select>

      <label for="eq-modality">Modalidad de prueba</label>
      <select id="eq-modality" v-model="form.testModality" class="input">
        <option value="simulation">Simulación</option>
        <option value="real_authorized">Prueba real autorizada</option>
        <option value="not_applicable">No aplica</option>
      </select>

      <label for="eq-description">Descripción de la evidencia</label>
      <textarea id="eq-description" v-model="form.description" class="input" rows="4" maxlength="2000" />

      <fieldset>
        <legend>Apoyos registrados (por separado de la valoración)</legend>
        <label v-for="s in SUPPORTS" :key="s.value" class="check">
          <input type="checkbox" :checked="form.supports.includes(s.value)" @change="toggleSupport(s.value)" />
          {{ s.label }}
        </label>
      </fieldset>

      <button type="submit" class="btn btn--primary" :disabled="busy || !ready">Registrar entrega equivalente</button>
    </form>
  </section>
</template>

<style scoped>
.lede {
  color: var(--rt-text-muted);
}
label {
  display: block;
  font-weight: 600;
  margin-top: var(--rt-space-2);
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
fieldset {
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  margin: var(--rt-space-3) 0;
  padding: var(--rt-space-2);
}
fieldset label {
  font-weight: 400;
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
</style>
