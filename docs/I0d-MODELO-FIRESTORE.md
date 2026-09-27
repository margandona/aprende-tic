# RED-TIC — I0d · Modelo Firestore y contratos

> **Decisión vigente:** RED-TIC usa **exclusivamente Firebase** (Authentication, Cloud Firestore, Cloud Storage,
> Cloud Functions, Hosting). El SQL de Supabase queda como **antecedente histórico** en `docs/archivo-supabase/`
> (no ejecutar). Este documento describe el modelo vigente.

---

## 1. Convenciones

- **IDs deterministas** para invariantes de negocio (evitan duplicados sin consultas):
  - `deliveries/{enrollmentId}_{milestoneId}`
  - `assessments/{enrollmentId}_{milestoneId}_{indicatorCode}`
  - `xpEvents/{enrollmentId}_{milestoneId}_{programVersionId}` → **XP idempotente**
  - `deliveries/{deliveryId}/evidence/{submitKey}` → **envío idempotente**
  - `codeCredentials/{codeHash}` → búsqueda O(1) del código
  - `sessionBindings/{authUid}` → binding consultable por regla
- **Sin PII nominal**: `enrollments` usa `pseudonym`. La correspondencia real vive fuera.
- **Separación dura**: gamificación (`xpEvents`, `badgeAwards`) no referencia indicadores; competencias (`assessments`) no referencia XP.

---

## 2. Colecciones

| Ruta | Campos clave | Acceso cliente |
|---|---|---|
| `institutions/{id}` | name, status | lectura autenticada |
| `programVersions/{id}` | label, publishedAt | lectura autenticada |
| `courses/{id}` | institutionId, name, level, year, programVersionId | lectura autenticada |
| `missions/{id}` | programVersionId, order, name | lectura autenticada |
| `milestones/{id}` | missionId, order, title, xpValue, indicatorCodes[] | lectura autenticada |
| `indicators/{code}` | code, axis, name, descriptor | lectura autenticada |
| `badges/{id}` | code, name, criterion | lectura autenticada |
| `teachers/{uid}` | displayName, status | propio |
| `teacherCourses/{uid}_{courseId}` | teacherUid, courseId, role | propio |
| `enrollments/{enrollmentId}` | courseId, pseudonym, state, activeCodeHash, activeBindingUid | propio o docente del curso |
| `codeCredentials/{codeHash}` | enrollmentId, courseId, state, expiresAt, failedAttempts, lockedUntil | **sin acceso cliente** |
| `sessionBindings/{authUid}` | enrollmentId, courseId, state, issuedAt, expiresAt | propio (lectura) |
| `teams/{teamId}` + `members/{enrollmentId}` | courseId, name / role | lectura autenticada |
| `deliveries/{deliveryId}` | courseId, ownerEnrollmentId, milestoneId, scope, teamId, state, currentEvidenceId, evidenceCount | propietario, coautor o docente |
| `deliveries/{deliveryId}/evidence/{submitKey}` | version, origin, format, testModality, description, deletedAt | ídem |
| `deliveries/{deliveryId}/contributors/{enrollmentId}` | note | ídem |
| `assessments/{enrollmentId}_{milestoneId}_{indicatorCode}` | courseId, level, comment, evidenceId, validatedBy | propio o docente |
| `assessmentHistory/{autoId}` | assessmentId, previousLevel, newLevel, changedBy | propio o docente |
| `xpEvents/{enrollmentId}_{milestoneId}_{programVersionId}` | xpValue, validatedBy, revokedAt | propio o docente |
| `badgeAwards/{enrollmentId}_{badgeId}` | badgeId, evidenceId | propio o docente |
| `diagnosisAttempts/{id}` + `responses/{taskCode}` | courseId, enrollmentId, status, score, technicalIssue | propio o docente |
| `conditionsSurveys/{enrollmentId}` | courseId, answers | crea el estudiante; lee el docente |
| `redeemAttempts/{autoId}`, `auditLogs/{autoId}` | actorKey/actorUid, acción | **sin acceso cliente** |

**Estados de entrega:** `not_started` → `in_progress` → `pending_review` → `achieved`.
**Estados del diagnóstico:** `draft` → `submitted` (inmutable después).

---

## 3. Consultas por rol e índices

| Rol | Consulta | Índice |
|---|---|---|
| Estudiante | su entrega por hito | `deliveries(ownerEnrollmentId, milestoneId)` |
| Docente | cola del curso | `deliveries(courseId, state)` |
| Docente | valoraciones de un hito | `assessments(enrollmentId, milestoneId)` |
| Borde | intentos de canje por actor | `redeemAttempts(actorKey, attemptedAt desc)` |
| Cualquiera | catálogo por programa | filtros de igualdad simples (índices automáticos) |

Índices declarados en `firestore.indexes.json`.

---

## 4. Transacciones e invariantes

| Operación | Invariante | Mecanismo |
|---|---|---|
| `redeemCode` | 1 binding activo por matrícula y por uid | transacción + `enrollments.activeBindingUid` |
| `submitEvidence` | 1 evidencia por `submitKey` | transacción + `tx.create` sobre `evidence/{submitKey}` |
| `registerEquivalentEvidence` | sin entrega digital previa; versión incremental | transacción + merge |
| `validateMilestone` | validación completa; 1 XP por (matrícula, hito, versión) | transacción + ID determinista de `xpEvents` |
| `correctAssessment` / `revokeXp` / `reopenMilestone` | historial y revocación trazables | transacción / update |
| `submitDiagnosisAttempt` | inmutable tras envío | transacción draft→submitted; escritura cliente denegada |

- **La Admin SDK omite las reglas del cliente**: cada función valida el actor (binding activo o docente del curso).
- **Pimiento del código** (`CODE_PEPPER`) vive solo en el servidor; el cliente nunca ve el hash ni el código almacenado.

---

## 5. Reglas de seguridad (resumen)

- **Firestore:** toda operación protegida consulta `sessionBindings/{request.auth.uid}` (estado `active` y no expirado). Docentes por `teacherCourses/{uid}_{courseId}`. Escrituras sensibles: denegadas al cliente.
- **Storage:** ruta `courses/{courseId}/enrollments/{enrollmentId}/deliveries/{deliveryId}/uploads/{reservationId}/{fileName}`; exige vínculo activo, curso y matrícula coincidentes, entrega `not_started`/`in_progress`, tipo permitido y tamaño < 5 MiB. Docente del curso puede leer; otro no.

---

## 6. Retención (propuesta, pendiente institucional)

| Dato | Retención | Acción |
|---|---|---|
| `conditionsSurveys` | fin de año escolar | anonimizar/eliminar |
| `diagnosisAttempts` | fin de año escolar | anonimizar |
| objetos de Storage | fin de año + 1 | eliminar |
| `assessments` / `xpEvents` | 2 años | anonimizar |
| `sessionBindings` | 30 días tras expirar | eliminar |
| `auditLogs` | 1 año | eliminar |

> Plazos **propuestos**; se fijan con la institución antes de cualquier piloto real.
