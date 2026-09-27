# RED-TIC — I1b · Sesión endurecida y diagnóstico en la interfaz (solo emuladores)

**Estado:** sesión y entorno con **fallo cerrado**, y **flujo de diagnóstico** (encuesta A1–A6 + tareas T1–T5) implementado de extremo a extremo contra **Firebase Emulator Suite**. **Sin datos reales ni despliegue.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` §«I1b»; continúa `docs/I1a-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 43 pruebas de emulador (Vitest) + 14 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Parte A — Sesión y entorno endurecidos

| Pieza | Cambio |
|---|---|
| `src/firebase/config.ts` | `resolveFirebaseConfig(env)` **falla cerrado**: sin `VITE_FIREBASE_*` lanza; con proyecto `demo-red-tic` y sin `VITE_USE_EMULATORS=true` lanza (build no autorizada). |
| `env.d.ts` / `.env.development` / `.env.example` | Variables `VITE_*` tipadas y documentadas; desarrollo fija `VITE_USE_EMULATORS=true`. |
| `src/stores/session.ts` | Vínculo (`{uid, binding}`) persistido en `sessionStorage` (`redtic_session`); `revalidateBinding()` lee `sessionBindings/{uid}` (estado `active`, `expiresAt > now`, coincidencia de matrícula/curso); `invalidateSession()`, `logout()`, `ensureSession()`, `ensureAuth()` con `auth.authStateReady()`. |
| `src/router/index.ts` / `src/App.vue` | Guarda **async** llama `ensureSession()`; `App.vue` observa `session.invalidated` y redirige a `/acceso`. |
| `src/data/firebaseRepository.ts` | `loadMilestones` por lotes de 10; `guarded()` invalida la sesión ante `permission-denied`; lecturas por **consulta** (no `getDoc` de documento inexistente). |

> **Corrección clave:** el observador de `onAuthStateChanged` trataba la **restauración inicial** (`null → uid`) como rotación de UID y borraba el vínculo persistido, forzando el regreso al acceso tras recargar. Ahora solo limpia ante una **rotación real** (había UID y cambió).

---

## 3. Parte B — Diagnóstico (backend + interfaz)

| Pieza | Cambio |
|---|---|
| `functions/src/diagnosis.ts` | `saveConditionsSurvey`, `startDiagnosisAttempt`, `saveDiagnosisResponse`, `submitDiagnosisAttempt`, `reviewDiagnosisResponse`; exportadas en `index.ts`. |
| `functions/src/deliveries.ts` | `submitEvidence` idempotente por `submitKey`; verificación de **reserva y metadata del objeto** (`getMetadata`) **fuera** de la transacción; la transacción re-valida estado/reserva y consume. |
| `firestore.rules` | `conditionsSurveys` `write:false` (solo servidor; lectura docente); `diagnosisAttempts`/`responses` lectura propia/docente, `write:false`; helper `validAnswers` eliminado. |
| `src/data/firebaseRepository.ts` | `fetchDiagnosis` por consulta; `fetchMissionDetail` consulta entregas; `fetchLearnings` con descripciones de evidencia. |
| `src/views/DiagnosisView.vue` | Encuesta A1–A6 (selects/input) + tareas T1–T5 con `responseStatus` (`answered`/`not_answered`/`skipped`), `technicalIssue`, apoyos independientes del puntaje; guardar borrador; **envío inmutable**; solo lectura tras enviar. |
| `src/router` / `src/components/BottomNav.vue` | Ruta `/estudiante/diagnostico` e ítem «Diagnóstico» en la navegación. |
| `tests-emu/seed.ts` / `e2e/global-setup.ts` | Siembra `{uid,binding}`, docentes t1/t2 activos y t3 inactivo, entrega cross-course, XP/insignias/valoraciones de S1 y **diagnóstico enviado de S1**; encuesta `conditionsSurveys/enr-s1` y `enrollments/enr-s1.surveySubmitted=true`. |

**Separación de paneles:** «Mi recorrido» conserva XP/insignias/nivel; el diagnóstico **no** los expone (verificado por prueba). La subida de archivos sigue **deshabilitada en la interfaz**.

---

## 4. Pruebas

| Suite | Alcance | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Reglas Firestore/Storage, Functions, concurrencia y esquema de diagnóstico | **43/43** |
| Playwright (`e2e/`) | Acceso, aislamiento, revocación, recarga, diagnóstico, 320 px/teclado/movimiento reducido/axe | **14/14** |
| Unitarias (`tests/`) | Config con fallo cerrado, navegación, separación de paneles, estado | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

Casos de diagnóstico en navegador: separación diagnóstico/XP; **envío inmutable** (A1–A6 + T1–T5); **reintento de carga** (el borrador persiste tras recargar); **revocación** durante la sesión redirige al acceso.

Capturas: `docs/capturas/08-diagnostico.png` (diagnóstico enviado, solo lectura).

---

## 5. CI

- `.github/workflows/ci.yml` — trabajos `calidad` (lint, tipos, pruebas, build) y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado:** pendiente de confirmar la ejecución de este commit (I1b).

---

## 6. Pendientes para el siguiente paso

1. **App Check exigido** en producción (`ENFORCE_APP_CHECK=true` + registro de la app).
2. **Secretos administrados**: `CODE_PEPPER` mediante secretos de Functions en el proyecto objetivo.
3. **Proveedor institucional de docentes**: hoy se **simula en emuladores**; falta alta/baja institucional y su UI.
4. **Subida de archivos en la UI**: habilitar `reserveUpload` + subida a Storage solo tras validar en un proyecto accesible.
5. **Panel docente del diagnóstico**: `reviewDiagnosisResponse` existe en backend; falta su superficie en la UI.
6. **Retención/consentimiento, residencia y responsables** (validación institucional).
7. **Verificación manual de accesibilidad** (lector de pantalla, contraste medido, prueba con estudiantes).
8. **Costos/cuotas** y estrategia de retención en Firestore/Storage.

> La carpeta externa `data/` con credenciales Firebase Admin **no se usó, importó ni versionó**; solo emuladores y datos sintéticos.
