import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { demo, session } from '../src/stores/session'

vi.mock('../src/data/firebaseRepository', async () => {
  const fx = await import('../src/fixtures/synthetic')
  const store = await import('../src/stores/session')
  const gate = async () => {
    if (store.demo.state === 'loading') await new Promise((r) => setTimeout(r, 6000))
    if (store.demo.state === 'error') throw new Error('No se pudieron cargar los datos (estado de demostración: error).')
  }
  const emptyLearnings = { pseudonym: null, indicators: [], assessments: [], evidenceDescriptions: new Map() }
  return {
    fetchJourney: vi.fn(async () => ({ student: fx.students[0], course: fx.course, missions: fx.missions, badges: fx.badges })),
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

const { default: LearningsView } = await import('../src/views/LearningsView.vue')

async function mountAndSettle(component: Parameters<typeof mount>[0]) {
  const wrapper = mount(component, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  await new Promise((resolve) => setTimeout(resolve, 80))
  await flushPromises()
  return wrapper
}

describe('Estados de carga, vacío y error', () => {
  beforeEach(() => {
    session.role = 'student'
    session.binding = { enrollmentId: 'est-01', courseId: 'curso-1m-a', pseudonym: 'Zorro-01' }
    session.uid = 'test-uid'
  })
  afterEach(() => {
    demo.state = 'ok'
  })

  it('muestra el estado de carga', async () => {
    demo.state = 'loading'
    const wrapper = mount(LearningsView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
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
