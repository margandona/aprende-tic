import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import JourneyView from '../src/views/JourneyView.vue'
import LearningsView from '../src/views/LearningsView.vue'
import { demo, signInStudent } from '../src/stores/session'

async function mountAndSettle(component: Parameters<typeof mount>[0]) {
  const wrapper = mount(component, {
    global: {
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
  // El cargador encadena varios awaits (estudiante + evidencias): esperamos a que settle.
  await new Promise((resolve) => setTimeout(resolve, 80))
  await flushPromises()
  return wrapper
}

describe('Separación de paneles: recorrido (XP) vs aprendizajes (indicadores)', () => {
  beforeEach(() => {
    signInStudent('est-01')
    demo.state = 'ok'
  })

  it('«Mi recorrido» muestra XP e insignias y NO muestra indicadores D/E', async () => {
    const wrapper = await mountAndSettle(JourneyView)
    const text = wrapper.text()

    // Debe mostrar el panel narrativo
    expect(text).toContain('Mi recorrido')
    expect(text).toContain('XP')
    expect(text).toContain('Insignias')
    expect(text).toContain('Nivel narrativo')
    expect(wrapper.find('[data-testid="journey-xp"]').exists()).toBe(true)

    // NO debe mostrar indicadores ni retroalimentación
    expect(text).not.toContain('D1')
    expect(text).not.toContain('E1')
    expect(text).not.toContain('Buscar y valorar información')
    expect(text).not.toContain('No evaluado')
    expect(text).not.toContain('Retroalimentación')
  })

  it('«Mis aprendizajes» muestra indicadores y retroalimentación y NO muestra XP ni insignias', async () => {
    const wrapper = await mountAndSettle(LearningsView)
    const text = wrapper.text()

    // Debe mostrar el panel de competencia observada
    expect(text).toContain('Mis aprendizajes observados')
    expect(text).toContain('D1')
    expect(text).toContain('Buscar y valorar información')
    expect(text).toContain('E1')
    expect(text).toContain('Retroalimentación')
    expect(text).toContain('No evaluado')

    // NO debe mostrar gamificación narrativa
    expect(text).not.toContain('XP')
    expect(text).not.toContain('Insignia')
    expect(text).not.toContain('Nivel narrativo')
  })

  it('los campos sin evidencia aparecen como «No evaluado»', async () => {
    const wrapper = await mountAndSettle(LearningsView)
    // E4 está sin evaluar en los fixtures de Zorro-01
    const e4 = wrapper.findAll('.indicator').find((n) => n.text().includes('E4'))
    expect(e4).toBeTruthy()
    expect(e4?.text()).toContain('No evaluado')
  })

  it('el recorrido vuelve al estado de carga al cambiar el estado de demostración', async () => {
    const wrapper = await mountAndSettle(JourneyView)
    expect(wrapper.find('.spinner').exists()).toBe(false)

    demo.state = 'loading'
    await nextTick()
    expect(wrapper.find('.spinner').exists()).toBe(true)

    demo.state = 'ok'
    await new Promise((resolve) => setTimeout(resolve, 80))
    await flushPromises()
  })
})
