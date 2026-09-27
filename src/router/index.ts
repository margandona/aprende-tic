import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { session } from '../stores/session'
import AccessView from '../views/AccessView.vue'
import JourneyView from '../views/JourneyView.vue'
import MissionsView from '../views/MissionsView.vue'
import MissionDetailView from '../views/MissionDetailView.vue'
import LearningsView from '../views/LearningsView.vue'
import SettingsView from '../views/SettingsView.vue'
import TeacherPanelView from '../views/TeacherPanelView.vue'
import TeacherReviewView from '../views/TeacherReviewView.vue'
import NotFoundView from '../views/NotFoundView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/acceso' },
  { path: '/acceso', name: 'acceso', component: AccessView, meta: { public: true } },
  {
    path: '/estudiante',
    redirect: '/estudiante/recorrido',
    meta: { role: 'student' },
  },
  { path: '/estudiante/recorrido', name: 'estudiante-recorrido', component: JourneyView, meta: { role: 'student' } },
  { path: '/estudiante/misiones', name: 'estudiante-misiones', component: MissionsView, meta: { role: 'student' } },
  {
    path: '/estudiante/misiones/:id',
    name: 'estudiante-mision-detalle',
    component: MissionDetailView,
    meta: { role: 'student' },
  },
  {
    path: '/estudiante/aprendizajes',
    name: 'estudiante-aprendizajes',
    component: LearningsView,
    meta: { role: 'student' },
  },
  { path: '/estudiante/ajustes', name: 'estudiante-ajustes', component: SettingsView, meta: { role: 'student' } },
  { path: '/docente', redirect: '/docente/panel', meta: { role: 'teacher' } },
  { path: '/docente/panel', name: 'docente-panel', component: TeacherPanelView, meta: { role: 'teacher' } },
  { path: '/docente/revision', name: 'docente-revision', component: TeacherReviewView, meta: { role: 'teacher' } },
  { path: '/docente/ajustes', name: 'docente-ajustes', component: SettingsView, meta: { role: 'teacher' } },
  { path: '/:pathMatch(.*)*', name: 'no-encontrado', component: NotFoundView, meta: { public: true } },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const requiredRole = to.meta.role as 'student' | 'teacher' | undefined
  if (!requiredRole) return true
  if (session.role !== requiredRole) {
    return { path: '/acceso' }
  }
  return true
})

export default router
