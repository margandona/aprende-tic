<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { ensureAuth, session } from './stores/session'

const route = useRoute()
const showShell = computed(() => Boolean(session.role) && route.name !== 'acceso')

onMounted(() => {
  void ensureAuth()
})
</script>

<template>
  <AppShell v-if="showShell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
</template>
