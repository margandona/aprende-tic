# RED-TIC — I1a · Frontend conectado a Firebase (solo emuladores)

**Estado:** la app Vue 3 se conecta a **Firebase Emulator Suite** con Auth anónimo, canje de código y lecturas por rol; fixtures sustituidos en «Mi recorrido», misiones y «Mis aprendizajes observados». **Sin datos reales ni despliegue.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` §«Fase 10 — revisión de I0e Firebase».

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 40 pruebas de emulador (Vitest) + 10 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Frontend conectado (I1a)

| Pieza | Cambio |
|---|---|
| `src/firebase/client.ts` | SDK público + conexión a emuladores (Auth 9099, Firestore 8080, Functions 5001, Storage 9199) |
| `src/stores/session.ts` | Auth anónimo (`signInAnonymously`), vínculo (binding) persistido en `sessionStorage`, cierre de sesión |
| `src/data/firebaseRepository.ts` | Lecturas Firestore por rol: `fetchJourney`, `fetchLearnings`, `fetchMissionDetail` |
| `src/views/AccessView.vue` | Canje real vía callable `redeemCode`; mensajes por estado (`invalid`, `revoked`, `expired`, `locked`, `rate_limited`) |
| `src/views/JourneyView/MissionsView/MissionDetailView/LearningsView` | Consumen Firestore; conservan la separación recorrido/aprendizajes y los estados carga/vacío/error |
| `src/App.vue` / `src/router` | Sesión anónima al iniciar; guarda por vínculo (no por rol local) |
| `e2e/firebase.spec.ts` | Pruebas de navegador del acceso, aislamiento, código revocado, revocación y cambio de usuario |
| `e2e/global-setup.ts` | Siembra sintética antes de las pruebas de navegador |

**Subida de archivos:** sigue **deshabilitada en la interfaz** (no hay control de subida; el botón de entrega permanece deshabilitado). El backend de reservas ya está probado, pero no se expone en la UI.

---

## 3. Correcciones de I0e (tres hallazgos)

| # | Hallazgo | Corrección | Pruebas |
|---|---|---|---|
| 1 | Storage `allow create` no verificaba estado ni coherencia de la entrega | Se exige `delivery.courseId == courseId`, `delivery.ownerEnrollmentId == enrollmentId` y `delivery.state in ['not_started','in_progress']` | Carga tras **cierre** → denegada; tras **vínculo revocado** → denegada; con entrega abierta y vínculo activo → permitida |
| 2 | `submitEvidence` no verificaba objeto, metadata ni caducidad antes de consumir | Verifica **objeto real** (existencia, MIME y tamaño) en Cloud Storage y **caducidad** de la reserva; idempotencia devuelve el mismo recibo **sin re-consumir** | Objeto ausente → denegado (reserva sigue `reserved`); tamaño distinto → denegado; reserva caducada entre subida y envío → denegada; reenvío idempotente → mismo recibo |
| 3 | `actorKeyFrom` confiaba solo en `x-forwarded-for` | Límite **por `auth.uid`** (10) además del borde (IP, 60, señal no confiable) y del **bloqueo por credencial**; `enforceAppCheck` opcional | Mismo uid con códigos distintos → `rate_limited`; 12 cuentas anónimas no se bloquean entre sí; docente desactivado y vínculo revocado siguen denegados |

> La señal IP se trata como **potencialmente controlable**; no es la defensa principal. App Check exigido y secretos administrados quedan como puertas de piloto (§6).

---

## 4. Matriz permitido / denegado (50 pruebas)

### 4.1 Navegador (Playwright, 10)
| Caso | Resultado |
|---|---|
| Acceso propio con código individual (ve su pseudónimo y XP) | permitido |
| «Mis aprendizajes» muestra solo lo del vínculo activo | permitido |
| Cambio de usuario (Salir + otro código) no muestra datos del anterior | permitido |
| Código revocado | denegado |
| Revocación de sesión activa corta las lecturas (estado de error) | denegado |
| 320 px, teclado, movimiento reducido, axe (recorridos esenciales) | ok |

### 4.2 Emulador (Vitest, 40)
- **Firestore Rules (19):** aislamiento por curso/estudiante; equipo de otro curso denegado; escritura cliente denegada; identidad/rol no escribibles; docente desactivado denegado; vínculo revocado denegado; sesión sin vínculo no lee catálogo/cursos/equipos; consultas reales por rol; encuesta con esquema validado.
- **Storage Rules (5):** reserva válida permitida; sin reserva/caducada/consumida denegada; nombre/tamaño distintos denegados; curso/matrícula ajenos denegados; **entrega cerrada y vínculo revocado denegados**; docente del curso lee, otro no.
- **Functions y concurrencia (16):** canje/revocación/regeneración; envío idempotente; validación completa e idempotencia de XP; equivalencia docente; reserva + **verificación de objeto/metadata/caducidad**; docente desactivado; 2 envíos/2 validaciones concurrentes; **límite por uid**; `startDelivery` sin reinicio.

---

## 5. CI

- `.github/workflows/ci.yml` — trabajos `calidad` (lint, tipos, pruebas, build) y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`, que ejecuta Vitest y Playwright con emuladores).
- **Estado confirmado:** ejecución **`36354124007`** (commit `a8881d7`): **success** (2 m 8 s), con 40 pruebas de emulador y 10 de navegador en verde.

---

## 6. Pendientes para el siguiente paso

1. **App Check exigido** en producción (`ENFORCE_APP_CHECK=true` + registro de la app). Hoy el borde es la IP.
2. **Secretos administrados**: `CODE_PEPPER` mediante el mecanismo de secretos de Functions en el proyecto objetivo (fuera del emulador el hash **falla cerrado**).
3. **Proveedor institucional de docentes**: el acceso docente se **simula en emuladores** con tokens personalizados; falta el alta/baja institucional y su UI.
4. **Subida de archivos en la UI**: habilitar `reserveUpload` + subida a Storage **solo tras** validar en un proyecto accesible; hoy permanece deshabilitada.
5. **Flujo de diagnóstico en cliente** (respuestas y envío) — no implementado.
6. **Retención/consentimiento, residencia y responsables** (validación institucional).
7. **Verificación manual de accesibilidad** (lector de pantalla, contraste medido, prueba con estudiantes).
8. **Costos/cuotas** y estrategia de retención en Firestore/Storage.

> La carpeta externa `data/` con credenciales Firebase Admin **no se usó, importó ni versionó**; solo emuladores y datos sintéticos.
