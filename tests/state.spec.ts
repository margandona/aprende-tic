import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LearningsView from '../src/views/LearningsView.vue'
import { demo, signInStudent } from '../src/stores/session'

async function mountAndSettle(component: Parameters<typeof mount>[0]) {
  const wrapper = mount(component, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('Estados de carga, vacío y error con fixtures', () => {
  beforeEach(() => signInStudent('est-01'))
  afterEach(() => {
    demo.state = 'ok'
  })

  it('muestra el estado de carga', async () => {
    demo.state = 'loading'
    const wrapper = mount(LearningsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    // El estado de carga se renderiza de inmediato
    expect(wrapper.text()).toContain('Cargando')
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('muestra el estado vacío cuando no hay datos', async () => {
    demo.state = 'empty'
    const wrapper = await mountAndSettle(LearningsView)
    expect(wrapper.text()).toContain('Aún no hay aprendizajes observados')
    expect(wrapper.find('.state-panel--empty').exists()).toBe(true)
  })

  it('muestra el estado de error con rol de alerta', async () => {
    demo.state = 'error'
    const wrapper = await mountAndSettle(LearningsView)
    expect(wrapper.text()).toContain('Ocurrió un problema')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('aria-live')).toBe('assertive')
  })
})
