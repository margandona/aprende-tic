<script setup lang="ts">
defineProps<{ state: 'loading' | 'empty' | 'error'; message?: string }>()
</script>

<template>
  <div
    class="state-panel"
    :class="{ 'state-panel--error': state === 'error', 'state-panel--empty': state === 'empty' }"
    :role="state === 'error' ? 'alert' : 'status'"
    :aria-live="state === 'error' ? 'assertive' : 'polite'"
  >
    <template v-if="state === 'loading'">
      <div class="spinner" aria-hidden="true"></div>
      <p>{{ message ?? 'Cargando…' }}</p>
    </template>
    <template v-else-if="state === 'error'">
      <p><strong>Ocurrió un problema.</strong> {{ message }}</p>
    </template>
    <template v-else>
      <p>{{ message ?? 'Aún no hay información para mostrar.' }}</p>
    </template>
  </div>
</template>
