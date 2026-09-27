<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '../composables/useAsync'
import { getEvidence, getMissions, getStudent } from '../data/repository'
import { demo, session } from '../stores/session'
import { missionStateLabels } from '../utils/labels'
import StatePanel from '../components/StatePanel.vue'

const route = useRoute()
const missionId = computed(() => String(route.params.id))

const { data, loading, error } = useAsync(async () => {
  const missions = await getMissions()
  const mission = missions.find((m) => m.id === missionId.value) ?? null
  const student = await getStudent(session.studentId ?? '')
  const progress = student?.missions.find((m) => m.missionId === missionId.value) ?? null
  const evidence = progress?.evidenceId ? await getEvidence(progress.evidenceId) : null
  return { mission, progress, evidence }
}, () => [missionId.value, session.studentId, demo.state])

const mission = computed(() => data.value?.mission ?? null)
const progress = computed(() => data.value?.progress ?? null)
const evidence = computed(() => data.value?.evidence ?? null)
</script>

<template>
  <section aria-labelledby="mission-title">
    <p><RouterLink to="/estudiante/misiones">← Volver a misiones</RouterLink></p>

    <StatePanel v-if="loading" state="loading" message="Cargando la misión…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="!mission" state="empty" message="No encontramos esta misión." />

    <template v-else>
      <h1 id="mission-title">Misión {{ mission.order }} · {{ mission.name }}</h1>
      <p class="lede">{{ mission.prompt }}</p>

      <div class="card">
        <h2>Entregable</h2>
        <p>{{ mission.deliverable }}</p>
        <p>
          Estado:
          <span class="chip" :class="`chip--${progress?.state ?? 'not_started'}`">
            {{ missionStateLabels[progress?.state ?? 'not_started'] }}
          </span>
        </p>
      </div>

      <div class="card">
        <h2>Evidencia</h2>
        <template v-if="evidence">
          <p>{{ evidence.description }}</p>
          <ul class="meta">
            <li><strong>Origen:</strong> {{ evidence.origin === 'teacher_equivalent' ? 'Registro docente (equivalencia)' : 'Entrega del estudiante' }}</li>
            <li><strong>Formato:</strong> {{ evidence.format }}</li>
            <li><strong>Modalidad de prueba:</strong> {{ evidence.testModality }}</li>
          </ul>
        </template>
        <p v-else class="hint">Aún no hay evidencia registrada para esta misión.</p>
      </div>

      <div class="card">
        <h2>Acciones</h2>
        <p class="hint">
          En esta demostración las acciones de entrega, reintento y registro equivalente no están habilitadas;
          se implementan en incrementos posteriores (I0b/I4).
        </p>
        <button type="button" class="btn btn--primary" disabled>Entregar evidencia (próximamente)</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.lede {
  color: var(--rt-text-muted);
}
.meta {
  list-style: none;
  padding: 0;
  font-size: var(--rt-font-size-sm);
  color: var(--rt-text-muted);
}
.hint {
  color: var(--rt-text-muted);
}
</style>
