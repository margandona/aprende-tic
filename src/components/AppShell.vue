<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { logout, session } from '../stores/session'
import BottomNav from './BottomNav.vue'
import SkipLink from './SkipLink.vue'
import DemoStateBar from './DemoStateBar.vue'

const router = useRouter()
const role = computed(() => session.role ?? 'student')
const roleLabel = computed(() => (role.value === 'student' ? 'Estudiante' : 'Docente'))

async function salir(): Promise<void> {
  await logout()
  router.push('/acceso')
}
</script>

<template>
  <div class="shell">
    <SkipLink />
    <DemoStateBar />
    <header class="shell__header">
      <div class="shell__brand">
        <span class="shell__logo" aria-hidden="true">🌐</span>
        <span>
          <strong>RED-TIC</strong>
          <span class="shell__subtitle">Aprende, crea y aporta a tu comunidad</span>
        </span>
      </div>
      <div class="shell__actions">
        <span class="chip">{{ roleLabel }}</span>
        <button type="button" class="btn btn--secondary" @click="salir">Salir</button>
      </div>
    </header>

    <main id="contenido" class="shell__main" tabindex="-1">
      <slot />
    </main>

    <BottomNav :role="role" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  max-width: 720px;
  margin: 0 auto;
  background: var(--rt-bg);
}
.shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
  padding: var(--rt-space-3) var(--rt-space-4);
  background: var(--rt-surface);
  border-bottom: 1px solid var(--rt-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.shell__brand {
  display: flex;
  align-items: center;
  gap: var(--rt-space-2);
}
.shell__logo {
  font-size: 1.6rem;
}
.shell__subtitle {
  display: block;
  font-size: var(--rt-font-size-sm);
  color: var(--rt-text-muted);
}
.shell__actions {
  display: flex;
  align-items: center;
  gap: var(--rt-space-2);
}
.shell__main {
  flex: 1;
  padding: var(--rt-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}
@media (max-width: 359px) {
  .shell__header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
