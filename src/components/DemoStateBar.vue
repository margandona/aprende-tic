<script setup lang="ts">
import { demo, setDemoState } from '../stores/session'
import type { DemoLoadState } from '../types'

const states: { value: DemoLoadState; label: string }[] = [
  { value: 'ok', label: 'Datos' },
  { value: 'loading', label: 'Carga' },
  { value: 'empty', label: 'Vacío' },
  { value: 'error', label: 'Error' },
]
</script>

<template>
  <div class="demo-bar" role="region" aria-label="Demostración de estados">
    <span class="demo-bar__title">Demo (fixtures):</span>
    <button
      v-for="s in states"
      :key="s.value"
      type="button"
      class="demo-bar__btn"
      :aria-pressed="demo.state === s.value"
      @click="setDemoState(s.value)"
    >
      {{ s.label }}
    </button>
  </div>
</template>

<style scoped>
.demo-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rt-space-2);
  align-items: center;
  padding: var(--rt-space-2) var(--rt-space-3);
  background: var(--rt-accent-soft);
  border-bottom: 1px solid var(--rt-border);
  font-size: var(--rt-font-size-sm);
}
.demo-bar__title {
  font-weight: 700;
}
.demo-bar__btn {
  min-height: 36px;
  padding: var(--rt-space-1) var(--rt-space-3);
  border-radius: 999px;
  border: 1px solid var(--rt-border);
  background: var(--rt-surface);
  cursor: pointer;
}
.demo-bar__btn[aria-pressed='true'] {
  background: var(--rt-primary);
  color: #fff;
  border-color: var(--rt-primary-strong);
}
</style>
