<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/AppShell.vue'
import { ensureAuth, refreshSession, session } from './stores/session'

const route = useRoute()
const router = useRouter()
const showShell = computed(() => Boolean(session.role) && route.name !== 'acceso')

function onWake(): void {
  if (session.role) void refreshSession()
}

onMounted(() => {
  void ensureAuth()
  // Revalida el vínculo al volver a la pestaña/ventana: detecta revocación o expiración sin navegar.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onWake()
  })
  window.addEventListener('focus', onWake)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', onWake)
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
