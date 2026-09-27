<script setup lang="ts">
import { computed } from 'vue'
import { useAsync } from '../composables/useAsync'
import { fetchJourney } from '../data/firebaseRepository'
import { demo, session } from '../stores/session'
import MissionCard from '../components/MissionCard.vue'
import StatePanel from '../components/StatePanel.vue'

const { data, loading, error } = useAsync(() => fetchJourney(), () => [session.binding?.enrollmentId, demo.state])

const missions = computed(() => data.value?.missions ?? [])
const student = computed(() => data.value?.student ?? null)

function stateOf(missionId: string) {
  return student.value?.missions.find((m) => m.missionId === missionId)?.state ?? 'not_started'
}
</script>

<template>
  <section aria-labelledby="missions-title">
    <h1 id="missions-title">Misiones</h1>
    <p class="lede">Seis misiones. El estado se calcula por hitos validados, no por minutos de uso.</p>

    <StatePanel v-if="loading" state="loading" message="Cargando misiones…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel v-else-if="missions.length === 0" state="empty" message="No hay misiones para mostrar." />

    <ul v-else class="missions">
      <li v-for="m in missions" :key="m.id">
        <MissionCard :mission="m" :state="stateOf(m.id)" />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.lede {
  color: var(--rt-text-muted);
}
.missions {
  list-style: none;
  padding: 0;
  margin: var(--rt-space-4) 0 0;
  display: grid;
  gap: var(--rt-space-2);
}
</style>
