<script setup lang="ts">
import { computed } from 'vue'
import { useAsync } from '../composables/useAsync'
import { fetchPendingDeliveries } from '../data/firebaseRepository'
import { session } from '../stores/session'
import StatePanel from '../components/StatePanel.vue'

const { data, loading, error } = useAsync(() => fetchPendingDeliveries(), () => [session.uid])

const items = computed(() => data.value ?? [])
</script>

<template>
  <section aria-labelledby="review-title" data-testid="teacher-review">
    <h1 id="review-title">Entregas por revisar</h1>
    <p class="lede">
      Lectura de las entregas pendientes de tus cursos. <strong>Sin valoración ni XP todavía</strong> (llegan en I2b).
    </p>

    <StatePanel v-if="loading" state="loading" message="Cargando entregas…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="items.length === 0" state="empty" message="No hay entregas por revisar." />

    <ul v-else class="review-list">
      <li v-for="d in items" :key="d.deliveryId" class="card review-item" :data-delivery="d.deliveryId">
        <p class="review-item__head">
          <strong>{{ d.pseudonym }}</strong>
          <span class="chip">{{ d.missionName }} · {{ d.milestoneTitle }}</span>
        </p>
        <p class="review-item__meta">
          Estado: por revisar · Origen: {{ d.origin === 'teacher_equivalent' ? 'registro docente' : 'estudiante' }} ·
          Formato: {{ d.format }}<span v-if="d.evidenceVersion"> · Versión {{ d.evidenceVersion }}</span>
        </p>
        <p class="review-item__body">{{ d.evidenceDescription || 'Sin descripción.' }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.lede,
.review-item__meta {
  color: var(--rt-text-muted);
}
.review-list {
  list-style: none;
  padding: 0;
  margin: var(--rt-space-4) 0 0;
  display: grid;
  gap: var(--rt-space-2);
}
.review-item__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--rt-space-2);
  margin: 0 0 var(--rt-space-1);
  flex-wrap: wrap;
}
.review-item__meta {
  font-size: var(--rt-font-size-sm);
  margin: 0 0 var(--rt-space-1);
}
.review-item__body {
  margin: 0;
  white-space: pre-wrap;
}
</style>
