<script setup lang="ts">
import { computed } from 'vue'
import { useAsync } from '../composables/useAsync'
import { getCourse, getPendingReviews, getTeacher } from '../data/repository'
import { demo } from '../stores/session'
import { missionStateLabels } from '../utils/labels'
import StatePanel from '../components/StatePanel.vue'

const { data, loading, error } = useAsync(async () => {
  const [teacher, course, pending] = await Promise.all([
    getTeacher('doc-01'),
    getCourse(),
    getPendingReviews(),
  ])
  return { teacher, course, pending }
}, () => [demo.state])

const teacher = computed(() => data.value?.teacher ?? null)
const course = computed(() => data.value?.course ?? null)
const pending = computed(() => data.value?.pending ?? [])
</script>

<template>
  <section aria-labelledby="panel-title" data-testid="teacher-panel">
    <h1 id="panel-title">Panel del curso</h1>
    <p class="lede">Vista agregada de demostración. Sin datos reales.</p>

    <StatePanel v-if="loading" state="loading" message="Cargando el panel…" />
    <StatePanel v-else-if="error" state="error" :message="error" />

    <template v-else>
      <div class="card">
        <h2>{{ course?.name }}</h2>
        <p class="hint">{{ teacher?.displayName }} · {{ course?.level }} {{ course?.year }}</p>
        <p><strong>{{ pending.length }}</strong> entregas por revisar.</p>
      </div>

      <div class="card">
        <h2>Por revisar</h2>
        <StatePanel v-if="pending.length === 0" state="empty" message="No hay entregas por revisar." />
        <ul v-else class="pending">
          <li v-for="p in pending" :key="p.id" class="pending__item">
            <span>{{ p.studentPseudonym }}</span>
            <span class="chip" :class="`chip--${p.state}`">{{ missionStateLabels[p.state] }}</span>
          </li>
        </ul>
        <p class="hint">La revisión y el registro de evidencia equivalente se implementan en I0b/I4.</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.lede,
.hint {
  color: var(--rt-text-muted);
}
.pending {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--rt-space-2);
}
.pending__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--rt-space-2);
  padding: var(--rt-space-2) 0;
  border-bottom: 1px solid var(--rt-border);
}
</style>
