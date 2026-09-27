<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { ensureAuth, session } from './stores/session'

const route = useRoute()
const router = useRouter()
const showShell = computed(() => Boolean(session.role) && route.name !== 'acceso')

onMounted(() => {
  void ensureAuth()
})

// Si una lectura detecta revocación/expiración, se limpia la sesión y se vuelve al acceso.
watch(
  () => session.invalidated,
  (invalidated) => {
    if (invalidated) {
      session.invalidated = false
      void router.push('/acceso')
    }
  },
)
</script>

<template>
  <AppShell v-if="showShell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
</template>
