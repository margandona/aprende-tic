import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { routes } from '../src/router'
import BottomNav from '../src/components/BottomNav.vue'
import { session, signInStudent, signInTeacher, signOut } from '../src/stores/session'

describe('Configuración de rutas', () => {
  it('incluye las pantallas base de estudiante y docente', () => {
    const paths = routes.map((r) => r.path)
    expect(paths).toContain('/acceso')
    expect(paths).toContain('/estudiante/recorrido')
    expect(paths).toContain('/estudiante/misiones')
    expect(paths).toContain('/estudiante/aprendizajes')
    expect(paths).toContain('/docente/panel')
    expect(paths).toContain('/docente/revision')
  })

  it('declara el rol requerido en las rutas por rol', () => {
    const recorrido = routes.find((r) => r.path === '/estudiante/recorrido')
    const panel = routes.find((r) => r.path === '/docente/panel')
    expect(recorrido?.meta?.role).toBe('student')
    expect(panel?.meta?.role).toBe('teacher')
  })
})

describe('Guarda de navegación por rol', () => {
  beforeEach(() => signOut())

  it('redirige a /acceso si no hay sesión', async () => {
    const { router } = await import('../src/router')
    await router.push('/estudiante/recorrido')
    expect(router.currentRoute.value.path).toBe('/acceso')
  })

  it('permite el recorrido del estudiante cuando hay sesión de estudiante', async () => {
    signInStudent('est-01')
    const { router } = await import('../src/router')
    await router.push('/estudiante/recorrido')
    expect(router.currentRoute.value.path).toBe('/estudiante/recorrido')
  })

  it('impide que un estudiante abra el panel docente', async () => {
    signInStudent('est-01')
    const { router } = await import('../src/router')
    await router.push('/docente/panel')
    expect(router.currentRoute.value.path).toBe('/acceso')
  })
})

describe('Navegación inferior por rol', () => {
  const stubs = { RouterLink: { template: '<a><slot /></a>' } }

  beforeEach(() => signOut())

  it('muestra los destinos del estudiante', () => {
    signInStudent('est-01')
    const wrapper = mount(BottomNav, { props: { role: 'student' }, global: { stubs } })
    const text = wrapper.text()
    expect(text).toContain('Mi recorrido')
    expect(text).toContain('Misiones')
    expect(text).toContain('Mis aprendizajes')
    expect(text).not.toContain('Panel')
  })

  it('muestra los destinos del docente', () => {
    signInTeacher('doc-01')
    const wrapper = mount(BottomNav, { props: { role: 'teacher' }, global: { stubs } })
    const text = wrapper.text()
    expect(text).toContain('Panel')
    expect(text).toContain('Revisión')
    expect(text).not.toContain('Mi recorrido')
  })

  it('expone una navegación con nombre accesible', () => {
    const wrapper = mount(BottomNav, { props: { role: 'student' }, global: { stubs } })
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Navegación principal')
    expect(session.role).toBeNull()
  })
})
