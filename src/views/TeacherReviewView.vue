<script setup lang="ts">
import { useAsync } from '../composables/useAsync'
import { getPendingReviews } from '../data/repository'
import { demo } from '../stores/session'
import { missionStateLabels } from '../utils/labels'
import StatePanel from '../components/StatePanel.vue'

const { data, loading, error } = useAsync(() => getPendingReviews(), () => [demo.state])
</script>

<template>
  <section aria-labelledby="review-title">
    <h1 id="review-title">Revisión</h1>
    <p class="lede">Bandeja de demostración (solo lectura en I0a).</p>

    <StatePanel v-if="loading" state="loading" message="Cargando la bandeja…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="(data ?? []).length === 0" state="empty" message="No hay entregas por revisar." />

    <ul v-else class="review-list">
      <li v-for="p in data ?? []" :key="p.id" class="card review-item">
        <div>
          <strong>{{ p.studentPseudonym }}</strong>
          <p class="hint">Misión {{ p.missionId.toUpperCase() }}</p>
        </div>
        <span class="chip" :class="`chip--${p.state}`">{{ missionStateLabels[p.state] }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.lede,
.hint {
  color: var(--rt-text-muted);
}
.review-list {
  list-style: none;
  padding: 0;
  margin: var(--rt-space-4) 0 0;
  display: grid;
  gap: var(--rt-space-2);
}
.review-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--rt-space-2);
}
</style>
