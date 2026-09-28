/**
 * Repositorio Firestore del cliente (I1a/I1b) — solo Emulator Suite y datos sintéticos.
 * Mantiene la separación «Mi recorrido» (XP/insignias) vs «Mis aprendizajes» (indicadores).
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { db, functions, storage } from '../firebase/client'
import { demo, invalidateSession, session } from '../stores/session'
import type { SurveyAnswers } from './diagnosisSurvey'
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
      strength: (d.data().strength as string) ?? '',
      nextStep: (d.data().nextStep as string) ?? '',
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

export interface MissionEvidenceVersion {
  evidenceId: string
  version: number
  origin: string
  format: string
  testModality: string
  description: string
  storagePath: string | null
  createdAt: string | null
}

export interface MissionDetailData {
  mission: Mission | null
  milestone: { id: string; title: string; xpValue: number; indicatorCodes: string[] } | null
  deliveryId: string | null
  progress: MissionProgress | null
  evidence: Data | null
  versions: MissionEvidenceVersion[]
  adjustment: { action: string; at: string | null } | null
}

function toIso(value: unknown): string | null {
  const t = value as { toDate?: () => Date } | undefined
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null
}

export async function fetchMissionDetail(missionId: string): Promise<MissionDetailData> {
  const empty: MissionDetailData = { mission: null, milestone: null, deliveryId: null, progress: null, evidence: null, versions: [], adjustment: null }
  const b = session.binding
  if (!b) return empty
  await gate()
  if (demo.state === 'empty') return empty

  return guarded(async () => {
    const mSnap = await getDoc(doc(db, 'missions', missionId))
    const mission = mSnap.exists() ? ({ id: mSnap.id, ...(mSnap.data() as Omit<Mission, 'id'>) } as Mission) : null

    let progress: MissionProgress | null = null
    let evidence: Data | null = null
    let deliveryId: string | null = null
    let milestone: MissionDetailData['milestone'] = null
    let adjustment: MissionDetailData['adjustment'] = null
    const versions: MissionEvidenceVersion[] = []

    const msSnap = await getDocs(query(collection(db, 'milestones'), where('missionId', '==', missionId)))
    const msDoc = msSnap.docs.sort((a, c) => (a.data().order as number) - (c.data().order as number))[0]
    if (msDoc) {
      const ms = msDoc.data()
      milestone = {
        id: msDoc.id,
        title: ms.title as string,
        xpValue: (ms.xpValue as number) ?? 0,
        indicatorCodes: (ms.indicatorCodes as string[]) ?? [],
      }
      // Consulta (no getDoc) para no leer una entrega inexistente.
      const dSnap = await getDocs(
        query(
          collection(db, 'deliveries'),
          where('ownerEnrollmentId', '==', b.enrollmentId),
          where('milestoneId', '==', msDoc.id),
        ),
      )
      const docSnap = dSnap.docs[0]
      if (docSnap) {
        deliveryId = docSnap.id
        const d = docSnap.data()
        progress = {
          missionId,
          state: (d.state as MissionProgress['state']) ?? 'not_started',
          evidenceId: (d.currentEvidenceId as string | null) ?? null,
        }
        adjustment = d.adjustment
          ? { action: (d.adjustment as Data).action as string, at: toIso((d.adjustment as Data).at) }
          : null
        const evSnap = await getDocs(collection(db, `deliveries/${docSnap.id}/evidence`))
        for (const ev of evSnap.docs) {
          const e = ev.data() as Data
          versions.push({
            evidenceId: ev.id,
            version: (e.version as number) ?? 0,
            origin: (e.origin as string) ?? 'student_digital',
            format: (e.format as string) ?? 'text',
            testModality: (e.testModality as string) ?? 'not_applicable',
            description: (e.description as string) ?? '',
            storagePath: (e.storagePath as string | null) ?? null,
            createdAt: toIso(e.createdAt),
          })
        }
        versions.sort((a, c) => a.version - c.version)
        const current = versions.find((v) => v.evidenceId === d.currentEvidenceId) ?? versions[versions.length - 1]
        if (current) {
          evidence = {
            description: current.description,
            origin: current.origin,
            format: current.format,
            testModality: current.testModality,
          }
        }
      }
    }
    return { mission, milestone, deliveryId, progress, evidence, versions, adjustment }
  })
}

export async function startMission(milestoneId: string): Promise<string> {
  const call = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(functions, 'startDelivery')
  return (await call({ milestoneId })).data.deliveryId
}

export async function submitTextEvidence(input: {
  deliveryId: string
  submitKey: string
  description: string
}): Promise<{ evidenceId: string; version: number; reused: boolean }> {
  const call = httpsCallable<
    { deliveryId: string; submitKey: string; format: string; description: string },
    { evidenceId: string; version: number; reused: boolean }
  >(functions, 'submitEvidence')
  return (await call({ ...input, format: 'text' })).data
}

// ── Lectura docente de entregas pendientes (I2a; sin valoración ni XP) ───────

export interface PendingDelivery {
  deliveryId: string
  enrollmentId: string
  pseudonym: string
  missionName: string
  milestoneTitle: string
  milestoneId: string
  state: string
  origin: string
  format: string
  evidenceDescription: string
  evidenceVersion: number | null
  updatedAt: string | null
}

export async function fetchPendingDeliveries(): Promise<PendingDelivery[]> {
  const uid = session.uid
  if (!uid || session.role !== 'teacher') return []
  const tcs = await getDocs(query(collection(db, 'teacherCourses'), where('teacherUid', '==', uid)))
  const courseIds = tcs.docs.map((d) => d.data().courseId as string)

  const out: PendingDelivery[] = []
  for (const courseId of courseIds) {
    const dSnap = await getDocs(
      query(collection(db, 'deliveries'), where('courseId', '==', courseId), where('state', '==', 'pending_review')),
    )
    for (const d of dSnap.docs) {
      const data = d.data() as Data
      const enrollmentId = data.ownerEnrollmentId as string
      const milestoneId = data.milestoneId as string
      const [enroll, ms] = await Promise.all([
        getDoc(doc(db, 'enrollments', enrollmentId)),
        getDoc(doc(db, 'milestones', milestoneId)),
      ])
      const missionId = ms.data()?.missionId as string | undefined
      const missionSnap = missionId ? await getDoc(doc(db, 'missions', missionId)) : null

      let evidenceDescription = ''
      let evidenceVersion: number | null = null
      let origin = ''
      let format = ''
      if (data.currentEvidenceId) {
        const ev = await getDoc(doc(db, `deliveries/${d.id}/evidence/${data.currentEvidenceId as string}`))
        if (ev.exists()) {
          const e = ev.data() as Data
          evidenceDescription = (e.description as string) ?? ''
          evidenceVersion = (e.version as number) ?? null
          origin = (e.origin as string) ?? ''
          format = (e.format as string) ?? ''
        }
      }

      out.push({
        deliveryId: d.id,
        enrollmentId,
        pseudonym: (enroll.data()?.pseudonym as string) ?? 'Sin pseudónimo',
        missionName: (missionSnap?.data()?.name as string) ?? 'Misión',
        milestoneTitle: (ms.data()?.title as string) ?? 'Hito',
        milestoneId,
        state: (data.state as string) ?? 'pending_review',
        origin,
        format,
        evidenceDescription,
        evidenceVersion,
        updatedAt: toIso(data.updatedAt),
      })
    }
  }
  return out.sort((a, c) => a.pseudonym.localeCompare(c.pseudonym))
}

// ── Diagnóstico (I1b/I1c) ───────────────────────────────────────────────────

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
  survey: SurveyAnswers | null
  strength: string
  nextStep: string
}

function mapResponse(id: string, data: Data): DiagnosisResponse {
  return {
    taskCode: id,
    responseStatus: (data.responseStatus as DiagnosisResponse['responseStatus']) ?? 'not_answered',
    responseText: (data.responseText as string) ?? '',
    technicalIssue: Boolean(data.technicalIssue),
    supports: (data.supports as string[]) ?? [],
    score: (data.score as number | null) ?? null,
    reviewerComment: (data.reviewerComment as string) ?? '',
  }
}

export async function fetchDiagnosis(): Promise<DiagnosisData> {
  const b = session.binding
  const empty: DiagnosisData = {
    attemptId: null,
    status: null,
    responses: [],
    surveySubmitted: false,
    survey: null,
    strength: '',
    nextStep: '',
  }
  if (!b) return empty
  await gate()
  if (demo.state === 'empty') return empty

  return guarded(async () => {
    const [enrollSnap, attemptsSnap, surveySnap] = await Promise.all([
      getDoc(doc(db, 'enrollments', b.enrollmentId)),
      getDocs(query(collection(db, 'diagnosisAttempts'), where('enrollmentId', '==', b.enrollmentId))),
      getDoc(doc(db, 'conditionsSurveys', b.enrollmentId)),
    ])
    const attemptDoc = attemptsSnap.docs.find((d) => d.data().kind === 'pre') ?? attemptsSnap.docs[0] ?? null
    const attemptId = attemptDoc ? attemptDoc.id : `${b.enrollmentId}_pre`

    let status: 'draft' | 'submitted' | null = null
    let responses: DiagnosisResponse[] = []
    let strength = ''
    let nextStep = ''
    if (attemptDoc) {
      const a = attemptDoc.data()
      status = (a.status as 'draft' | 'submitted') ?? 'draft'
      strength = (a.strength as string) ?? ''
      nextStep = (a.nextStep as string) ?? ''
      const rSnap = await getDocs(collection(db, `diagnosisAttempts/${attemptId}/responses`))
      responses = rSnap.docs.map((d) => mapResponse(d.id, d.data() as Data))
    }
    return {
      attemptId,
      status,
      responses,
      surveySubmitted: Boolean(enrollSnap.data()?.surveySubmitted),
      survey: surveySnap.exists() ? (surveySnap.data()?.answers as SurveyAnswers) : null,
      strength,
      nextStep,
    }
  })
}

export async function startDiagnosis(kind: 'pre' | 'post' = 'pre'): Promise<string> {
  const call = httpsCallable<{ kind: string }, { attemptId: string }>(functions, 'startDiagnosisAttempt')
  return (await call({ kind })).data.attemptId
}

export async function saveSurvey(answers: SurveyAnswers): Promise<void> {
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

// ── Revisión docente (I1c) ──────────────────────────────────────────────────

export async function reviewDiagnosisResponse(input: {
  attemptId: string
  taskCode: string
  score: number | null
  reviewerComment: string
}): Promise<void> {
  await httpsCallable(functions, 'reviewDiagnosisResponse')(input)
}

export async function saveDiagnosisFeedback(input: {
  attemptId: string
  strength: string
  nextStep: string
}): Promise<void> {
  await httpsCallable(functions, 'saveDiagnosisFeedback')(input)
}

export interface TeacherDiagnosisSummary {
  attemptId: string
  enrollmentId: string
  pseudonym: string
  courseId: string
  submittedAt: string | null
  responseCount: number
  scoredCount: number
}

export interface ReviewHistoryEntry {
  id: string
  kind: 'score' | 'feedback'
  taskCode: string | null
  previousScore: number | null
  newScore: number | null
  previousStrength: string
  newStrength: string
  previousNextStep: string
  newNextStep: string
  changedAt: string | null
}

export interface TeacherDiagnosisDetail {
  attemptId: string
  enrollmentId: string
  pseudonym: string
  courseId: string
  status: string
  submittedAt: string | null
  strength: string
  nextStep: string
  survey: SurveyAnswers | null
  responses: DiagnosisResponse[]
  history: ReviewHistoryEntry[]
}

/** Diagnósticos enviados de los cursos del docente autenticado (solo lectura del propio curso). */
export async function fetchTeacherDiagnoses(): Promise<TeacherDiagnosisSummary[]> {
  const uid = session.uid
  if (!uid || session.role !== 'teacher') return []
  const tcs = await getDocs(query(collection(db, 'teacherCourses'), where('teacherUid', '==', uid)))
  const courseIds = tcs.docs.map((d) => d.data().courseId as string)

  const out: TeacherDiagnosisSummary[] = []
  for (const courseId of courseIds) {
    const attempts = await getDocs(
      query(collection(db, 'diagnosisAttempts'), where('courseId', '==', courseId), where('status', '==', 'submitted')),
    )
    for (const d of attempts.docs) {
      const data = d.data()
      const enrollmentId = data.enrollmentId as string
      const [enroll, responses] = await Promise.all([
        getDoc(doc(db, 'enrollments', enrollmentId)),
        getDocs(collection(db, `diagnosisAttempts/${d.id}/responses`)),
      ])
      const scored = responses.docs.filter((r) => (r.data().score as number | null) != null).length
      out.push({
        attemptId: d.id,
        enrollmentId,
        pseudonym: (enroll.data()?.pseudonym as string) ?? 'Sin pseudónimo',
        courseId,
        submittedAt: data.submittedAt ? String((data.submittedAt as { toDate?: () => Date }).toDate?.() ?? '') : null,
        responseCount: responses.size,
        scoredCount: scored,
      })
    }
  }
  return out.sort((a, c) => a.pseudonym.localeCompare(c.pseudonym))
}

/** Detalle de un diagnóstico enviado: respuestas, apoyos, barreras, encuesta e historial. */
export async function fetchTeacherDiagnosis(attemptId: string): Promise<TeacherDiagnosisDetail> {
  const aSnap = await getDoc(doc(db, 'diagnosisAttempts', attemptId))
  if (!aSnap.exists()) throw new Error('Diagnóstico no encontrado.')
  const a = aSnap.data() as Data
  const enrollmentId = a.enrollmentId as string
  const courseId = a.courseId as string

  const [enroll, survey, responses, history] = await Promise.all([
    getDoc(doc(db, 'enrollments', enrollmentId)),
    getDoc(doc(db, 'conditionsSurveys', enrollmentId)),
    getDocs(collection(db, `diagnosisAttempts/${attemptId}/responses`)),
    getDocs(
      query(collection(db, 'diagnosisReviewHistory'), where('courseId', '==', courseId), where('attemptId', '==', attemptId)),
    ),
  ])

  const historyEntries: ReviewHistoryEntry[] = history.docs
    .map((d) => {
      const h = d.data() as Data
      return {
        id: d.id,
        kind: (h.kind as ReviewHistoryEntry['kind']) ?? 'score',
        taskCode: (h.taskCode as string | null) ?? null,
        previousScore: (h.previousScore as number | null) ?? null,
        newScore: (h.newScore as number | null) ?? null,
        previousStrength: (h.previousStrength as string) ?? '',
        newStrength: (h.newStrength as string) ?? '',
        previousNextStep: (h.previousNextStep as string) ?? '',
        newNextStep: (h.newNextStep as string) ?? '',
        changedAt: h.changedAt ? String((h.changedAt as { toDate?: () => Date }).toDate?.() ?? '') : null,
      }
    })
    .sort((x, y) => (x.changedAt ?? '').localeCompare(y.changedAt ?? ''))

  return {
    attemptId,
    enrollmentId,
    pseudonym: (enroll.data()?.pseudonym as string) ?? 'Sin pseudónimo',
    courseId,
    status: (a.status as string) ?? 'draft',
    submittedAt: a.submittedAt ? String((a.submittedAt as { toDate?: () => Date }).toDate?.() ?? '') : null,
    strength: (a.strength as string) ?? '',
    nextStep: (a.nextStep as string) ?? '',
    survey: survey.exists() ? (survey.data()?.answers as SurveyAnswers) : null,
    responses: responses.docs.map((d) => mapResponse(d.id, d.data() as Data)),
    history: historyEntries,
  }
}

// ── Revisión docente de misiones (I2b) ──────────────────────────────────────

export interface DeliveryEvidenceVersion {
  evidenceId: string
  version: number
  origin: string
  format: string
  testModality: string
  description: string
  supports: string[]
  storagePath: string | null
  createdAt: string | null
}

export interface DeliveryAssessment {
  assessmentId: string
  enrollmentId: string
  indicatorCode: string
  level: string
  comment: string
  strength: string
  nextStep: string
}

export interface DeliveryXp {
  xpEventId: string
  enrollmentId: string
  xpValue: number
  revoked: boolean
}

export interface DeliveryReview {
  deliveryId: string
  courseId: string
  enrollmentId: string
  milestoneId: string
  scope: string
  teamId: string | null
  state: string
  missionName: string
  milestoneTitle: string
  xpValue: number
  programVersionId: string
  indicatorCodes: string[]
  currentEvidenceId: string | null
  adjustment: { action: string; at: string | null } | null
  evidences: DeliveryEvidenceVersion[]
  members: { enrollmentId: string; pseudonym: string }[]
  assessments: DeliveryAssessment[]
  xp: DeliveryXp[]
}

export async function fetchDeliveryReview(deliveryId: string): Promise<DeliveryReview> {
  const dSnap = await getDoc(doc(db, 'deliveries', deliveryId))
  if (!dSnap.exists()) throw new Error('Entrega no encontrada.')
  const d = dSnap.data() as Data
  const courseId = d.courseId as string
  const milestoneId = d.milestoneId as string

  const msSnap = await getDoc(doc(db, 'milestones', milestoneId))
  const missionId = msSnap.data()?.missionId as string | undefined
  const missionSnap = missionId ? await getDoc(doc(db, 'missions', missionId)) : null
  const programVersionId = (missionSnap?.data()?.programVersionId as string) ?? ''

  const evSnap = await getDocs(collection(db, `deliveries/${deliveryId}/evidence`))
  const evidences: DeliveryEvidenceVersion[] = evSnap.docs.map((e) => {
    const x = e.data() as Data
    return {
      evidenceId: e.id,
      version: (x.version as number) ?? 0,
      origin: (x.origin as string) ?? 'student_digital',
      format: (x.format as string) ?? 'text',
      testModality: (x.testModality as string) ?? 'not_applicable',
      description: (x.description as string) ?? '',
      supports: (x.supports as string[]) ?? [],
      storagePath: (x.storagePath as string | null) ?? null,
      createdAt: toIso(x.createdAt),
    }
  })
  evidences.sort((a, c) => a.version - c.version)

  // Integrantes (equipo) o propietario individual.
  let memberIds: string[] = [d.ownerEnrollmentId as string]
  if (d.scope === 'team' && d.teamId) {
    const memSnap = await getDocs(collection(db, `teams/${d.teamId as string}/members`))
    memberIds = memSnap.docs.map((m) => m.id)
  }
  const members = await Promise.all(
    memberIds.map(async (enrollmentId) => {
      const e = await getDoc(doc(db, 'enrollments', enrollmentId))
      return { enrollmentId, pseudonym: (e.data()?.pseudonym as string) ?? 'Sin pseudónimo' }
    }),
  )

  const [asSnap, xpSnap] = await Promise.all([
    getDocs(query(collection(db, 'assessments'), where('courseId', '==', courseId), where('milestoneId', '==', milestoneId))),
    getDocs(query(collection(db, 'xpEvents'), where('courseId', '==', courseId), where('milestoneId', '==', milestoneId))),
  ])
  const memberSet = new Set(memberIds)
  const assessments: DeliveryAssessment[] = asSnap.docs
    .map((a) => {
      const x = a.data() as Data
      return {
        assessmentId: a.id,
        enrollmentId: x.enrollmentId as string,
        indicatorCode: x.indicatorCode as string,
        level: x.level as string,
        comment: (x.comment as string) ?? '',
        strength: (x.strength as string) ?? '',
        nextStep: (x.nextStep as string) ?? '',
      }
    })
    .filter((a) => memberSet.has(a.enrollmentId))
  const xp: DeliveryXp[] = xpSnap.docs
    .map((x) => {
      const v = x.data() as Data
      return {
        xpEventId: x.id,
        enrollmentId: v.enrollmentId as string,
        xpValue: (v.xpValue as number) ?? 0,
        revoked: Boolean(v.revokedAt),
      }
    })
    .filter((x) => memberSet.has(x.enrollmentId))

  return {
    deliveryId,
    courseId,
    enrollmentId: d.ownerEnrollmentId as string,
    milestoneId,
    scope: (d.scope as string) ?? 'individual',
    teamId: (d.teamId as string | null) ?? null,
    state: (d.state as string) ?? 'not_started',
    missionName: (missionSnap?.data()?.name as string) ?? 'Misión',
    milestoneTitle: (msSnap.data()?.title as string) ?? 'Hito',
    xpValue: (msSnap.data()?.xpValue as number) ?? 0,
    programVersionId,
    indicatorCodes: (msSnap.data()?.indicatorCodes as string[]) ?? [],
    currentEvidenceId: (d.currentEvidenceId as string | null) ?? null,
    adjustment: d.adjustment ? { action: (d.adjustment as Data).action as string, at: toIso((d.adjustment as Data).at) } : null,
    evidences,
    members,
    assessments,
    xp,
  }
}

export interface RosterEntry {
  enrollmentId: string
  pseudonym: string
}

/** Estudiantes de los cursos del docente autenticado. */
export async function fetchTeacherRoster(): Promise<RosterEntry[]> {
  const uid = session.uid
  if (!uid || session.role !== 'teacher') return []
  const tcs = await getDocs(query(collection(db, 'teacherCourses'), where('teacherUid', '==', uid)))
  const out: RosterEntry[] = []
  for (const tc of tcs.docs) {
    const courseId = tc.data().courseId as string
    const enrollments = await getDocs(query(collection(db, 'enrollments'), where('courseId', '==', courseId)))
    for (const e of enrollments.docs) {
      out.push({ enrollmentId: e.id, pseudonym: (e.data().pseudonym as string) ?? 'Sin pseudónimo' })
    }
  }
  return out.sort((a, c) => a.pseudonym.localeCompare(c.pseudonym))
}

export interface CourseMilestone {
  id: string
  title: string
  missionName: string
  missionOrder: number
  indicatorCodes: string[]
}

/** Hitos del programa de los cursos del docente autenticado. */
export async function fetchCourseMilestones(): Promise<CourseMilestone[]> {
  const uid = session.uid
  if (!uid || session.role !== 'teacher') return []
  const tcs = await getDocs(query(collection(db, 'teacherCourses'), where('teacherUid', '==', uid)))
  const programVersions = new Set<string>()
  for (const tc of tcs.docs) {
    const course = await getDoc(doc(db, 'courses', tc.data().courseId as string))
    const pv = course.data()?.programVersionId as string | undefined
    if (pv) programVersions.add(pv)
  }

  const out: CourseMilestone[] = []
  for (const pv of programVersions) {
    const missions = await getDocs(query(collection(db, 'missions'), where('programVersionId', '==', pv)))
    for (const m of missions.docs) {
      const msSnap = await getDocs(query(collection(db, 'milestones'), where('missionId', '==', m.id)))
      for (const ms of msSnap.docs) {
        out.push({
          id: ms.id,
          title: (ms.data().title as string) ?? 'Hito',
          missionName: (m.data().name as string) ?? 'Misión',
          missionOrder: (m.data().order as number) ?? 0,
          indicatorCodes: (ms.data().indicatorCodes as string[]) ?? [],
        })
      }
    }
  }
  return out.sort((a, c) => a.missionOrder - c.missionOrder)
}

export async function validateDelivery(input: {
  deliveryId: string
  comment: string
  assessments: { enrollmentId?: string; indicatorCode: string; level: string; comment?: string; strength?: string; nextStep?: string }[]
}): Promise<void> {
  await httpsCallable(functions, 'validateMilestone')(input)
}

export async function requestAdjustment(input: { deliveryId: string; action: string }): Promise<void> {
  await httpsCallable(functions, 'requestAdjustment')(input)
}

/** Reapertura segura (pending_review o achieved → in_progress) con historial y acción opcional. */
export async function reopenMilestone(input: { deliveryId: string; action?: string }): Promise<void> {
  await httpsCallable(functions, 'reopenMilestone')(input)
}

export async function correctAssessment(input: { assessmentId: string; newLevel: string; comment: string }): Promise<void> {
  await httpsCallable(functions, 'correctAssessment')(input)
}

export async function revokeXp(input: { xpEventId: string; reason: string }): Promise<void> {
  await httpsCallable(functions, 'revokeXp')(input)
}

export async function restoreXp(input: { xpEventId: string }): Promise<void> {
  await httpsCallable(functions, 'restoreXp')(input)
}

export async function registerEquivalent(input: {
  enrollmentId: string
  milestoneId: string
  format: string
  description: string
  testModality: string
  supports: string[]
  submitKey: string
}): Promise<{ deliveryId: string }> {
  const call = httpsCallable<typeof input, { deliveryId: string }>(functions, 'registerEquivalentEvidence')
  return (await call(input)).data
}

// ── Subida de archivos (I2c) ────────────────────────────────────────────────

export interface UploadReservation {
  reservationId: string
  path: string
  expiresAt: number
}

export async function reserveUpload(input: {
  deliveryId: string
  fileName: string
  contentType: string
  sizeBytes: number
}): Promise<UploadReservation> {
  const call = httpsCallable<typeof input, UploadReservation>(functions, 'reserveUpload')
  return (await call(input)).data
}

/** Sube el archivo a la ruta reservada con progreso; resuelve cuando Storage confirma. */
export function uploadEvidenceFile(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type })
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => resolve(),
    )
  })
}

export async function submitFileEvidence(input: {
  deliveryId: string
  submitKey: string
  description: string
  reservationId: string
}): Promise<{ evidenceId: string; version: number; reused: boolean }> {
  const call = httpsCallable<
    { deliveryId: string; submitKey: string; format: string; description: string; reservationId: string },
    { evidenceId: string; version: number; reused: boolean }
  >(functions, 'submitEvidence')
  return (await call({ ...input, format: 'file' })).data
}

export async function cleanupExpiredUploads(courseId: string): Promise<number> {
  const call = httpsCallable<{ courseId: string }, { removed: number }>(functions, 'cleanupExpiredUploads')
  return (await call({ courseId })).data.removed
}

export async function evidenceDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(storageRef(storage, storagePath))
}
