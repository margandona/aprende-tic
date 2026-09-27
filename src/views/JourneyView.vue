<script setup lang="ts">
import { computed } from 'vue'
import { useAsync } from '../composables/useAsync'
import { getCourse, getMissions, getStudent } from '../data/repository'
import { badges } from '../fixtures/synthetic'
import { demo, session } from '../stores/session'
import BadgeGrid from '../components/BadgeGrid.vue'
import MissionCard from '../components/MissionCard.vue'
import ProgressBar from '../components/ProgressBar.vue'
import StatePanel from '../components/StatePanel.vue'

const { data, loading, error } = useAsync(async () => {
  const [student, course, missions] = await Promise.all([
    getStudent(session.studentId ?? ''),
    getCourse(),
    getMissions(),
  ])
  return { student, course, missions }
}, () => [session.studentId, demo.state])

const student = computed(() => data.value?.student ?? null)
const course = computed(() => data.value?.course ?? null)
const missions = computed(() => data.value?.missions ?? [])
const achievedCount = computed(
  () => student.value?.missions.filter((m) => m.state === 'achieved').length ?? 0,
)
</script>

<template>
  <section class="journey" aria-labelledby="journey-title" data-testid="journey-view">
    <h1 id="journey-title">Mi recorrido</h1>
    <p class="lede">
      Aquí ves tu <strong>avance narrativo</strong>: misiones, XP e insignias. No representa tu nivel de
      competencia ni una nota.
    </p>

    <StatePanel v-if="loading" state="loading" message="Cargando tu recorrido…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel
      v-else-if="!student"
      state="empty"
      message="Aún no hay un recorrido para mostrar. Vuelve a entrar con un código de ejemplo."
    />

    <template v-else>
      <div class="card summary">
        <div>
          <p class="summary__name">{{ student.pseudonym }}</p>
          <p class="summary__course">{{ course?.name }} · {{ course?.level }} {{ course?.year }}</p>
        </div>
        <div class="summary__xp" data-testid="journey-xp">
          <span class="summary__xp-value">{{ student.xpTotal }}</span>
          <span class="summary__xp-label">XP</span>
        </div>
      </div>

      <div class="card">
        <h2>Nivel narrativo</h2>
        <p>
          <strong>{{ student.narrativeLevel }}</strong> — describe tu avance en la historia, no una habilidad
          certificada.
        </p>
        <ProgressBar
          :value="achievedCount"
          :max="missions.length"
          label="Misiones logradas"
        />
      </div>

      <div class="card">
        <h2>Insignias</h2>
        <BadgeGrid :badges="badges" :awards="student.badges" />
      </div>

      <div class="card">
        <h2>Misiones</h2>
        <ul class="missions" data-testid="journey-missions">
          <li v-for="m in missions" :key="m.id">
            <MissionCard
              :mission="m"
              :state="student.missions.find((mp) => mp.missionId === m.id)?.state ?? 'not_started'"
            />
          </li>
        </ul>
        <p v-if="missions.length === 0" class="hint">Sin misiones visibles (estado vacío de demostración).</p>
      </div>

      <p class="hint">
        Los indicadores de aprendizaje observados y la retroalimentación están en
        <RouterLink to="/estudiante/aprendizajes">Mis aprendizajes</RouterLink>.
      </p>
    </template>
  </section>
</template>

<style scoped>
.journey {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}
.lede {
  color: var(--rt-text-muted);
}
.summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
}
.summary__name {
  font-size: var(--rt-font-size-lg);
  font-weight: 700;
  margin: 0;
}
.summary__course {
  margin: 0;
  color: var(--rt-text-muted);
}
.summary__xp {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 72px;
}
.summary__xp-value {
  font-size: var(--rt-font-size-2xl);
  font-weight: 700;
  color: var(--rt-primary-strong);
}
.summary__xp-label {
  font-size: var(--rt-font-size-sm);
  color: var(--rt-text-muted);
}
.missions {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--rt-space-2);
}
.hint {
  color: var(--rt-text-muted);
  font-size: var(--rt-font-size-sm);
}
</style>
