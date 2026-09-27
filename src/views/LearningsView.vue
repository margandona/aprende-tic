<script setup lang="ts">
import { computed } from 'vue'
import { useAsync } from '../composables/useAsync'
import { getEvidence, getStudent } from '../data/repository'
import { indicators } from '../fixtures/synthetic'
import { demo, session } from '../stores/session'
import { indicatorAxisLabels, indicatorLevelLabels } from '../utils/labels'
import StatePanel from '../components/StatePanel.vue'
import type { Assessment } from '../types'

const { data, loading, error } = useAsync(async () => {
  const student = await getStudent(session.studentId ?? '')
  const assessments = student?.assessments ?? []
  const evidenceDescriptions = new Map<string, string>()
  for (const a of assessments) {
    if (a.evidenceId && !evidenceDescriptions.has(a.evidenceId)) {
      const ev = await getEvidence(a.evidenceId)
      if (ev) evidenceDescriptions.set(a.evidenceId, ev.description)
    }
  }
  return { student, assessments, evidenceDescriptions }
}, () => [session.studentId, demo.state])

const student = computed(() => data.value?.student ?? null)
const assessmentByCode = computed(() => {
  const map = new Map<string, Assessment>()
  for (const a of data.value?.assessments ?? []) map.set(a.indicatorCode, a)
  return map
})
const axisD = computed(() => indicators.filter((i) => i.axis === 'D'))
const axisE = computed(() => indicators.filter((i) => i.axis === 'E'))

function evidenceText(code: string): string | null {
  const a = assessmentByCode.value.get(code)
  if (!a?.evidenceId) return null
  return data.value?.evidenceDescriptions.get(a.evidenceId) ?? null
}
</script>

<template>
  <section class="learnings" aria-labelledby="learnings-title" data-testid="learnings-view">
    <h1 id="learnings-title">Mis aprendizajes observados</h1>
    <p class="lede">
      Aquí está tu <strong>perfil de competencia observada</strong>: indicadores, evidencias y
      retroalimentación del docente. Los campos sin evidencia aparecen como «No evaluado».
    </p>

    <StatePanel v-if="loading" state="loading" message="Cargando tus aprendizajes…" />
    <StatePanel v-else-if="error" state="error" :message="error" />
    <StatePanel
      v-else-if="!student"
      state="empty"
      message="Aún no hay aprendizajes observados. Cuando entregues una misión, aparecerán aquí."
    />

    <template v-else>
      <div v-for="group in [{ title: indicatorAxisLabels.D, items: axisD }, { title: indicatorAxisLabels.E, items: axisE }]" :key="group.title">
        <h2>{{ group.title }}</h2>
        <ul class="indicators">
          <li v-for="ind in group.items" :key="ind.code" class="indicator card">
            <div class="indicator__head">
              <span class="indicator__code">{{ ind.code }}</span>
              <span class="indicator__name">{{ ind.name }}</span>
              <span class="chip" :class="`chip--level-${assessmentByCode.get(ind.code)?.level ?? 'not_evaluated'}`">
                {{ indicatorLevelLabels[assessmentByCode.get(ind.code)?.level ?? 'not_evaluated'] }}
              </span>
            </div>
            <p class="indicator__descriptor">{{ ind.descriptor }}</p>
            <p class="indicator__criterion"><strong>Criterio de logro:</strong> {{ ind.criterion }}</p>
            <p v-if="assessmentByCode.get(ind.code)?.comment" class="indicator__comment">
              <strong>Retroalimentación:</strong> {{ assessmentByCode.get(ind.code)?.comment }}
            </p>
            <p v-if="evidenceText(ind.code)" class="indicator__evidence">
              <strong>Evidencia:</strong> {{ evidenceText(ind.code) }}
            </p>
            <p v-else class="indicator__evidence indicator__evidence--none">Evidencia: aún sin evidencia vinculada.</p>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.learnings {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}
.lede {
  color: var(--rt-text-muted);
}
.indicators {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--rt-space-2);
}
.indicator__head {
  display: flex;
  align-items: center;
  gap: var(--rt-space-2);
  flex-wrap: wrap;
}
.indicator__code {
  font-weight: 700;
  color: var(--rt-primary-strong);
}
.indicator__name {
  font-weight: 600;
  flex: 1;
  min-width: 120px;
}
.indicator__descriptor,
.indicator__criterion,
.indicator__comment,
.indicator__evidence {
  margin: var(--rt-space-2) 0 0;
  font-size: var(--rt-font-size-sm);
}
.indicator__evidence--none {
  color: var(--rt-text-muted);
}
.chip--level-not_evaluated {
  background: var(--rt-bg);
  color: var(--rt-text-muted);
}
.chip--level-incipient {
  background: var(--rt-danger-soft);
  border-color: var(--rt-danger);
  color: #7f1d1d;
}
.chip--level-developing {
  background: var(--rt-warning-soft);
  border-color: var(--rt-warning);
  color: #78350f;
}
.chip--level-achieved {
  background: var(--rt-success-soft);
  border-color: var(--rt-success);
  color: #14532d;
}
.chip--level-transferable {
  background: var(--rt-info-soft);
  border-color: var(--rt-info);
  color: #1e3a8a;
}
</style>
