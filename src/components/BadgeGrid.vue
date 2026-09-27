<script setup lang="ts">
import { computed } from 'vue'
import type { Badge, BadgeAward } from '../types'

const props = defineProps<{ badges: Badge[]; awards: BadgeAward[] }>()

const awardedIds = computed(() => new Set(props.awards.map((a) => a.badgeId)))
</script>

<template>
  <ul class="badges">
    <li
      v-for="badge in badges"
      :key="badge.id"
      class="badge"
      :class="{ 'badge--on': awardedIds.has(badge.id) }"
    >
      <span class="badge__icon" aria-hidden="true">{{ awardedIds.has(badge.id) ? '🏅' : '•' }}</span>
      <span class="badge__text">
        <strong>{{ badge.name }}</strong>
        <span class="badge__state">{{ awardedIds.has(badge.id) ? 'Obtenida' : 'No obtenida' }}</span>
        <span class="badge__criterion">{{ badge.criterion }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.badges {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--rt-space-2);
}
.badge {
  display: flex;
  gap: var(--rt-space-3);
  align-items: flex-start;
  padding: var(--rt-space-3);
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-md);
  background: var(--rt-bg);
  color: var(--rt-text-muted);
}
.badge--on {
  background: var(--rt-success-soft);
  border-color: var(--rt-success);
  color: var(--rt-text);
}
.badge__icon {
  font-size: 1.4rem;
}
.badge__text {
  display: flex;
  flex-direction: column;
}
.badge__state {
  font-size: var(--rt-font-size-sm);
  font-weight: 600;
}
.badge__criterion {
  font-size: var(--rt-font-size-sm);
}
</style>
