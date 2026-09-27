<script setup lang="ts">
import { computed } from 'vue'
import type { Role } from '../types'

const props = defineProps<{ role: Role }>()

interface NavItem {
  to: string
  label: string
  icon: string
}

const studentItems: NavItem[] = [
  { to: '/estudiante/recorrido', label: 'Mi recorrido', icon: '🧭' },
  { to: '/estudiante/diagnostico', label: 'Diagnóstico', icon: '🩺' },
  { to: '/estudiante/misiones', label: 'Misiones', icon: '🗺️' },
  { to: '/estudiante/aprendizajes', label: 'Mis aprendizajes', icon: '📋' },
  { to: '/estudiante/ajustes', label: 'Ajustes', icon: '⚙️' },
]

const teacherItems: NavItem[] = [
  { to: '/docente/panel', label: 'Panel', icon: '📊' },
  { to: '/docente/diagnosticos', label: 'Diagnósticos', icon: '🩺' },
  { to: '/docente/revision', label: 'Revisión', icon: '✅' },
  { to: '/docente/ajustes', label: 'Ajustes', icon: '⚙️' },
]

const items = computed<NavItem[]>(() => (props.role === 'student' ? studentItems : teacherItems))
</script>

<template>
  <nav class="bottom-nav" aria-label="Navegación principal">
    <ul class="bottom-nav__list">
      <li v-for="item in items" :key="item.to">
        <RouterLink class="bottom-nav__link" :to="item.to">
          <span class="bottom-nav__icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="bottom-nav__label">{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: sticky;
  bottom: 0;
  background: var(--rt-surface);
  border-top: 1px solid var(--rt-border);
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.bottom-nav__list {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
}
.bottom-nav__list li {
  flex: 1 1 0;
  min-width: 0;
}
.bottom-nav__link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: var(--rt-touch);
  min-width: 0;
  padding: var(--rt-space-2) var(--rt-space-1);
  text-decoration: none;
  color: var(--rt-text-muted);
  font-size: var(--rt-font-size-sm);
  text-align: center;
}
.bottom-nav__link.router-link-active {
  color: var(--rt-primary-strong);
  font-weight: 700;
  box-shadow: inset 0 3px 0 var(--rt-primary);
}
.bottom-nav__icon {
  font-size: 1.25rem;
}
.bottom-nav__label {
  line-height: 1.1;
  font-size: 0.7rem;
  overflow-wrap: anywhere;
}
</style>
