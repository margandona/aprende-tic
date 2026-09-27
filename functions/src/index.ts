/**
 * RED-TIC · Cloud Functions (I0d)
 * Identidad, entregas, validación con XP idempotente y diagnóstico.
 * Las Admin SDK omiten las reglas del cliente: cada función valida el actor internamente.
 */
export { redeemCode, regenerateCode, revokeSession, teacherDemoSignIn } from './identity'
export { startDelivery, submitEvidence, registerEquivalentEvidence, reserveUpload } from './deliveries'
export { validateMilestone, correctAssessment, revokeXp, reopenMilestone } from './validation'
export {
  saveConditionsSurvey,
  startDiagnosisAttempt,
  saveDiagnosisResponse,
  submitDiagnosisAttempt,
  reviewDiagnosisResponse,
  saveDiagnosisFeedback,
} from './diagnosis'
