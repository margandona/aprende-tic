<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number; max: number; label: string }>()
const pct = computed(() => (props.max > 0 ? Math.round((props.value / props.max) * 100) : 0))
</script>

<template>
  <div>
    <div class="progress-label">
      <span>{{ label }}</span>
      <span>{{ value }} / {{ max }} ({{ pct }}%)</span>
    </div>
    <div
      class="progress"
      role="progressbar"
      :aria-valuenow="value"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-label="label"
    >
      <div class="progress__bar" :style="{ width: pct + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: var(--rt-font-size-sm);
  color: var(--rt-text-muted);
  margin-bottom: var(--rt-space-1);
}
</style>
