import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { session } from '../src/stores/session'

vi.mock('../src/data/firebaseRepository', async () => {
  const fx = await import('../src/fixtures/synthetic')
  const store = await import('../src/stores/session')
  const gate = async () => {
    if (store.demo.state === 'loading') await new Promise((r) => setTimeout(r, 6000))
    if (store.demo.state === 'error') throw new Error('No se pudieron cargar los datos (estado de demostración: error).')
  }
  const emptyJourney = { student: null, course: null, missions: [], badges: [] }
  const emptyLearnings = { pseudonym: null, indicators: [], assessments: [], evidenceDescriptions: new Map() }
  return {
    fetchJourney: vi.fn(async () => {
      await gate()
      if (store.demo.state === 'empty') return emptyJourney
      return { student: fx.students[0], course: fx.course, missions: fx.missions, badges: fx.badges }
    }),
    fetchLearnings: vi.fn(async () => {
      await gate()
      if (store.demo.state === 'empty') return emptyLearnings
      return {
        pseudonym: fx.students[0].pseudonym,
        indicators: fx.indicators,
        assessments: fx.students[0].assessments,
        evidenceDescriptions: new Map(fx.evidences.map((e) => [e.id, e.description])),
      }
    }),
    fetchMissionDetail: vi.fn(async () => ({ mission: fx.missions[0], progress: null, evidence: null })),
  }
})

const binding = { enrollmentId: 'est-01', courseId: 'curso-1m-a', pseudonym: 'Zorro-01' }

const { default: JourneyView } = await import('../src/views/JourneyView.vue')
const { default: LearningsView } = await import('../src/views/LearningsView.vue')

async function mountAndSettle(component: Parameters<typeof mount>[0]) {
  const wrapper = mount(component, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  for (let i = 0; i < 5; i++) await flushPromises()
  await new Promise((r) => setTimeout(r, 20))
  await flushPromises()
  return wrapper
}

describe('Separación de paneles: recorrido (XP) vs aprendizajes (indicadores)', () => {
  beforeEach(() => {
    session.role = 'student'
    session.binding = binding
    session.uid = 'test-uid'
  })

  it('«Mi recorrido» muestra XP e insignias y NO indicadores', async () => {
    const wrapper = await mountAndSettle(JourneyView)
    const text = wrapper.text()
    expect(text).toContain('Mi recorrido')
    expect(text).toContain('XP')
    expect(text).toContain('Insignias')
    expect(text).toContain('Nivel narrativo')
    expect(text).not.toContain('Buscar y valorar información')
    expect(text).not.toContain('Retroalimentación')
  })

  it('«Mis aprendizajes» muestra indicadores y NO XP ni insignias', async () => {
    const wrapper = await mountAndSettle(LearningsView)
    const text = wrapper.text()
    expect(text).toContain('Mis aprendizajes observados')
    expect(text).toContain('D1')
    expect(text).toContain('Buscar y valorar información')
    expect(text).toContain('Retroalimentación')
    expect(text).not.toContain('Nivel narrativo')
  })

  it('el recorrido vuelve al estado de carga al cambiar el estado de demostración', async () => {
    const { demo } = await import('../src/stores/session')
    const wrapper = await mountAndSettle(JourneyView)
    expect(wrapper.find('.spinner').exists()).toBe(false)
    demo.state = 'loading'
    await nextTick()
    expect(wrapper.find('.spinner').exists()).toBe(true)
    demo.state = 'ok'
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()
  })
})
