/**
 * Repositorio Firestore del cliente (I1a/I1b) — solo Emulator Suite y datos sintéticos.
 * Mantiene la separación «Mi recorrido» (XP/insignias) vs «Mis aprendizajes» (indicadores).
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase/client'
import { demo, invalidateSession, session } from '../stores/session'
import type {
  Assessment,
  Badge,
  Course,
  Indicator,
  Mission,
  MissionProgress,
  Student,
} from '../types'

type Data = Record<string, unknown>

async function gate(): Promise<void> {
  if (demo.state === 'loading') {
    await new Promise((r) => setTimeout(r, 6000))
  }
  if (demo.state === 'error') {
    throw new Error('No se pudieron cargar los datos (estado de demostración: error).')
  }
}

function isPermissionDenied(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'permission-denied'
}

/** Ejecuta una lectura; si el vínculo fue revocado, invalida la sesión y propaga. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (isPermissionDenied(e)) invalidateSession()
    throw e
  }
}

interface MilestoneDoc {
  id: string
  missionId: string
  order: number
  title: string
  xpValue: number
  indicatorCodes: string[]
}

/** Carga hitos por misiones en lotes de 10 (el operador `in` tiene límite). */
async function loadMilestones(missionIds: string[]): Promise<MilestoneDoc[]> {
  const out: MilestoneDoc[] = []
  for (let i = 0; i < missionIds.length; i += 10) {
    const chunk = missionIds.slice(i, i + 10)
    const snap = await getDocs(query(collection(db, 'milestones'), where('missionId', 'in', chunk)))
    out.push(...snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MilestoneDoc, 'id'>) })))
  }
  return out
}

function levelFromXp(xp: number): string {
  if (xp >= 135) return 'Colaborador'
  if (xp >= 95) return 'Probador'
  if (xp >= 55) return 'Diseñador'
  if (xp >= 20) return 'Investigador'
  return 'Explorador'
}

export interface JourneyData {
  student: Student | null
  course: Course | null
  missions: Mission[]
  badges: Badge[]
}

/** «Mi recorrido»: misiones, XP e insignias. NUNCA indicadores D/E. */
export async function fetchJourney(): Promise<JourneyData> {
  const empty: JourneyData = { student: null, course: null, missions: [], badges: [] }
  const b = session.binding
  if (!b) return empty
  await gate()
  if (demo.state === 'empty') return empty

  return guarded(async () => {
    const [enrollSnap, courseSnap, badgesSnap] = await Promise.all([
      getDoc(doc(db, 'enrollments', b.enrollmentId)),
      getDoc(doc(db, 'courses', b.courseId)),
      getDocs(collection(db, 'badges')),
    ])
    const courseData = courseSnap.exists() ? (courseSnap.data() as Data) : null
    const course: Course | null = courseData
      ? {
          id: courseSnap.id,
          name: courseData.name as string,
          level: courseData.level as string,
          year: courseData.year as number,
          programVersion: courseData.programVersionId as string,
        }
      : null

    const missionsSnap = courseData
      ? await getDocs(query(collection(db, 'missions'), where('programVersionId', '==', courseData.programVersionId)))
      : null
    const missions: Mission[] = missionsSnap
      ? missionsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Mission, 'id'>) }))
          .sort((a, c) => a.order - c.order)
      : []

    const milestones = await loadMilestones(missions.map((m) => m.id))
    const [deliveriesSnap, xpSnap, awardsSnap] = await Promise.all([
      getDocs(query(collection(db, 'deliveries'), where('ownerEnrollmentId', '==', b.enrollmentId))),
      getDocs(query(collection(db, 'xpEvents'), where('enrollmentId', '==', b.enrollmentId))),
      getDocs(query(collection(db, 'badgeAwards'), where('enrollmentId', '==', b.enrollmentId))),
    ])

    const deliveries = deliveriesSnap.docs.map((d) => d.data() as Data)
    const xpEvents = xpSnap.docs.map((d) => d.data() as Data)
    const xpTotal = xpEvents.filter((e) => !e.revokedAt).reduce((sum, e) => sum + ((e.xpValue as number) ?? 0), 0)

    const milestoneByMission = new Map(milestones.map((m) => [m.missionId, m]))
    const deliveryByMilestone = new Map(deliveries.map((d) => [d.milestoneId as string, d]))
    const missionProgress: MissionProgress[] = missions.map((m) => {
      const ms = milestoneByMission.get(m.id)
      const del = ms ? deliveryByMilestone.get(ms.id) : undefined
      return {
        missionId: m.id,
        state: ((del?.state as string) ?? 'not_started') as MissionProgress['state'],
        evidenceId: (del?.currentEvidenceId as string | null) ?? null,
      }
    })

    const student: Student = {
      id: b.enrollmentId,
      pseudonym: (enrollSnap.data()?.pseudonym as string) ?? b.pseudonym,
      courseId: b.courseId,
      xpTotal,
      narrativeLevel: levelFromXp(xpTotal),
      xpEvents: xpEvents.map((e) => ({ missionId: e.milestoneId as string, value: e.xpValue as number, validated: !e.revokedAt })),
      badges: awardsSnap.docs.map((d) => ({ badgeId: d.data().badgeId as string, awardedAt: '' })),
      missions: missionProgress,
      assessments: [],
      reflections: [],
    }

    const badges: Badge[] = badgesSnap.docs.map((d) => ({
      id: d.id,
      name: d.data().name as string,
      criterion: d.data().criterion as string,
    }))

    return { student, course, missions, badges }
  })
}

export interface LearningsData {
  pseudonym: string | null
  indicators: Indicator[]
  assessments: Assessment[]
  evidenceDescriptions: Map<string, string>
}

/** «Mis aprendizajes observados»: indicadores, evidencias y retroalimentación. NUNCA XP. */
export async function fetchLearnings(): Promise<LearningsData> {
  const empty: LearningsData = { pseudonym: null, indicators: [], assessments: [], evidenceDescriptions: new Map() }
  const b = session.binding
  if (!b) return empty
  await gate()
  if (demo.state === 'empty') return empty

  return guarded(async () => {
    const [indSnap, asSnap, enrollSnap] = await Promise.all([
      getDocs(collection(db, 'indicators')),
      getDocs(query(collection(db, 'assessments'), where('enrollmentId', '==', b.enrollmentId))),
      getDoc(doc(db, 'enrollments', b.enrollmentId)),
    ])

    const indicators: Indicator[] = indSnap.docs
      .map((d) => ({
        code: d.data().code as string,
        axis: d.data().axis as Indicator['axis'],
        name: d.data().name as string,
        descriptor: (d.data().descriptor as string) ?? '',
        criterion: (d.data().criterion as string) ?? '',
      }))
      .sort((a, c) => a.code.localeCompare(c.code))

    const assessments: Assessment[] = asSnap.docs.map((d) => ({
      indicatorCode: d.data().indicatorCode as string,
      level: d.data().level as Assessment['level'],
      comment: (d.data().comment as string) ?? '',
      evidenceId: (d.data().evidenceId as string | null) ?? null,
    }))

    const evidenceDescriptions = new Map<string, string>()
    for (const d of asSnap.docs) {
      const a = d.data() as Data
      if (!a.evidenceId) continue
      const deliveryId = `${b.enrollmentId}_${a.milestoneId as string}`
      try {
        const ev = await getDoc(doc(db, `deliveries/${deliveryId}/evidence/${a.evidenceId as string}`))
        if (ev.exists()) evidenceDescriptions.set(a.evidenceId as string, (ev.data().description as string) ?? '')
      } catch {
        /* evidencia no accesible */
      }
    }

    return { pseudonym: (enrollSnap.data()?.pseudonym as string) ?? b.pseudonym, indicators, assessments, evidenceDescriptions }
  })
}

export interface MissionDetailData {
  mission: Mission | null
  progress: MissionProgress | null
  evidence: Data | null
}

export async function fetchMissionDetail(missionId: string): Promise<MissionDetailData> {
  const b = session.binding
  if (!b) return { mission: null, progress: null, evidence: null }
  await gate()
  if (demo.state === 'empty') return { mission: null, progress: null, evidence: null }

  return guarded(async () => {
    const mSnap = await getDoc(doc(db, 'missions', missionId))
    const mission = mSnap.exists() ? ({ id: mSnap.id, ...(mSnap.data() as Omit<Mission, 'id'>) } as Mission) : null

    let progress: MissionProgress | null = null
    let evidence: Data | null = null
    const msSnap = await getDocs(query(collection(db, 'milestones'), where('missionId', '==', missionId)))
    const milestone = msSnap.docs[0]
    if (milestone) {
      // Consulta (no getDoc) para no leer una entrega inexistente.
      const dSnap = await getDocs(
        query(
          collection(db, 'deliveries'),
          where('ownerEnrollmentId', '==', b.enrollmentId),
          where('milestoneId', '==', milestone.id),
        ),
      )
      const docSnap = dSnap.docs[0]
      if (docSnap) {
        const d = docSnap.data()
        progress = { missionId, state: (d.state as MissionProgress['state']) ?? 'not_started', evidenceId: (d.currentEvidenceId as string | null) ?? null }
        if (d.currentEvidenceId) {
          const ev = await getDoc(doc(db, `deliveries/${docSnap.id}/evidence/${d.currentEvidenceId as string}`))
          if (ev.exists()) evidence = ev.data() as Data
        }
      }
    }
    return { mission, progress, evidence }
  })
}

// ── Diagnóstico (I1b) ───────────────────────────────────────────────────────

export interface DiagnosisResponse {
  taskCode: string
  responseStatus: 'answered' | 'not_answered' | 'skipped'
  responseText: string
  technicalIssue: boolean
  supports: string[]
  score: number | null
  reviewerComment: string
}

export interface DiagnosisData {
  attemptId: string | null
  status: 'draft' | 'submitted' | null
  responses: DiagnosisResponse[]
  surveySubmitted: boolean
}

export async function fetchDiagnosis(): Promise<DiagnosisData> {
  const b = session.binding
  const empty: DiagnosisData = { attemptId: null, status: null, responses: [], surveySubmitted: false }
  if (!b) return empty
  await gate()
  if (demo.state === 'empty') return empty

  return guarded(async () => {
    // Se usa una consulta (no getDoc por id) para no leer un documento inexistente.
    const enrollSnap = await getDoc(doc(db, 'enrollments', b.enrollmentId))
    const attemptsSnap = await getDocs(query(collection(db, 'diagnosisAttempts'), where('enrollmentId', '==', b.enrollmentId)))
    const attemptDoc = attemptsSnap.docs.find((d) => d.data().kind === 'pre') ?? attemptsSnap.docs[0] ?? null
    const attemptId = attemptDoc ? attemptDoc.id : `${b.enrollmentId}_pre`

    let status: 'draft' | 'submitted' | null = null
    let responses: DiagnosisResponse[] = []
    if (attemptDoc) {
      status = (attemptDoc.data().status as 'draft' | 'submitted') ?? 'draft'
      const rSnap = await getDocs(collection(db, `diagnosisAttempts/${attemptId}/responses`))
      responses = rSnap.docs.map((d) => {
        const data = d.data() as Data
        return {
          taskCode: d.id,
          responseStatus: (data.responseStatus as DiagnosisResponse['responseStatus']) ?? 'not_answered',
          responseText: (data.responseText as string) ?? '',
          technicalIssue: Boolean(data.technicalIssue),
          supports: (data.supports as string[]) ?? [],
          score: (data.score as number | null) ?? null,
          reviewerComment: (data.reviewerComment as string) ?? '',
        }
      })
    }
    return { attemptId, status, responses, surveySubmitted: Boolean(enrollSnap.data()?.surveySubmitted) }
  })
}

export async function startDiagnosis(kind: 'pre' | 'post' = 'pre'): Promise<string> {
  const call = httpsCallable<{ kind: string }, { attemptId: string }>(functions, 'startDiagnosisAttempt')
  return (await call({ kind })).data.attemptId
}

export async function saveSurvey(answers: Record<string, string>): Promise<void> {
  await httpsCallable(functions, 'saveConditionsSurvey')({ answers })
}

export async function saveDiagnosisResponse(input: {
  attemptId: string
  taskCode: string
  responseStatus: string
  responseText: string
  technicalIssue: boolean
  supports: string[]
}): Promise<void> {
  await httpsCallable(functions, 'saveDiagnosisResponse')(input)
}

export async function submitDiagnosis(attemptId: string): Promise<void> {
  await httpsCallable(functions, 'submitDiagnosisAttempt')({ attemptId })
}
