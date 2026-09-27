<script setup lang="ts">
import { computed } from 'vue'
import type { Mission, MilestoneState } from '../types'
import { missionStateLabels } from '../utils/labels'

const props = defineProps<{
  mission: Mission
  state: MilestoneState
}>()

const label = computed(() => missionStateLabels[props.state])
</script>

<template>
  <RouterLink class="mission-card" :to="`/estudiante/misiones/${mission.id}`">
    <span class="mission-card__order" aria-hidden="true">{{ mission.order }}</span>
    <span class="mission-card__body">
      <span class="mission-card__name">{{ mission.name }}</span>
      <span class="mission-card__prompt">{{ mission.prompt }}</span>
    </span>
    <span class="chip" :class="`chip--${state}`">{{ label }}</span>
  </RouterLink>
</template>

<style scoped>
.mission-card {
  display: flex;
  align-items: center;
  gap: var(--rt-space-3);
  min-height: var(--rt-touch);
  padding: var(--rt-space-3);
  background: var(--rt-surface);
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-md);
  text-decoration: none;
  color: var(--rt-text);
}
.mission-card:hover {
  border-color: var(--rt-primary);
}
.mission-card__order {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 50%;
  background: var(--rt-primary-soft);
  color: var(--rt-primary-strong);
  font-weight: 700;
}
.mission-card__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.mission-card__name {
  font-weight: 600;
}
.mission-card__prompt {
  font-size: var(--rt-font-size-sm);
  color: var(--rt-text-muted);
}
</style>
