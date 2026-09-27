<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { session } from './stores/session'

const route = useRoute()
const showShell = computed(() => Boolean(session.role) && route.name !== 'acceso')
</script>

<template>
  <AppShell v-if="showShell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
</template>
