# RED-TIC — I0d · Migración a Firebase (solo entorno de desarrollo)

**Estado:** backend Firebase implementado y probado con **Emulator Suite**. Frontend Vue 3 conservado (sigue con fixtures). **Sin datos reales, sin credenciales, sin despliegue.** El SQL de Supabase queda como histórico.

---

## 1. Entorno y versiones

| Componente | Versión |
|---|---|
| firebase-tools | 15.31.0 |
| Java (Firestore Emulator) | Temurin 21 |
| Node.js | v24.18.0 (runtime declarado `nodejs20`; el emulador usó node 24) |
| firebase (cliente) | 12.19.0 |
| firebase-admin | 14.5.0 |
| firebase-functions | 7.4.0 |
| @firebase/rules-unit-testing | 5.0.2 |

Emuladores: **Auth (9099)**, **Firestore (8080)**, **Storage (9199)**, **Functions (5001)**, **Hosting (5000)**, proyecto `demo-red-tic`.

---

## 2. Comandos reproducibles

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # arranca emuladores y corre 22 pruebas
npm run emu:start       # emuladores en modo interactivo
```

El comando `emu:test` ejecuta `firebase emulators:exec` con Auth, Firestore, Storage y Functions, y dentro corre `vitest --config vitest.emu.config.ts`.

---

## 3. Inventario y archivos

- `firebase.json`, `.firebaserc` (`demo-red-tic`), `firestore.rules`, `firestore.indexes.json`, `storage.rules`.
- `functions/` — TypeScript: `identity.ts`, `deliveries.ts`, `validation.ts`, `diagnosis.ts`, `guards.ts`, `index.ts`.
- `tests-emu/` — `helpers.ts` (semilla sintética + clientes), `rules.spec.ts`, `functions.spec.ts`, `concurrency.spec.ts`.
- `docs/archivo-supabase/` — SQL, pruebas PostgreSQL y `vitest.db.config.ts` rotulados **«no ejecutar / sustituido por Firebase»**.
- `docs/I0d-MODELO-FIRESTORE.md` — modelo, índices, transacciones y reglas.

---

## 4. Functions implementadas

| Función | Rol | Descripción |
|---|---|---|
| `redeemCode` | estudiante (anónimo) | canje del código individual → binding revocable; límite por borde + bloqueo por credencial |
| `regenerateCode` | docente | revoca código anterior y bindings; nuevo código de alta entropía (24 hex) |
| `revokeSession` | docente | revocación inmediata del binding |
| `startDelivery` | estudiante | crea entrega determinista por hito |
| `submitEvidence` | estudiante | envío idempotente por `submitKey` |
| `registerEquivalentEvidence` | docente | evidencia equivalente sin entrega previa |
| `validateMilestone` | docente | validación completa + valoraciones + historial + XP idempotente |
| `correctAssessment` / `revokeXp` / `reopenMilestone` | docente | corrección, revocación y reapertura |
| `submitDiagnosisAttempt` | estudiante | transición draft→submitted (inmutable después) |

---

## 5. Matriz permitido / denegado (22/22 en verde)

### 5.1 Firestore Rules
| Caso | Actor | Resultado |
|---|---|---|
| Lee su matrícula | Zorro-01 | permitido |
| Lee matrícula de otro curso | Zorro-01 | denegado |
| Lee su entrega y la de su equipo | Zorro-01 / Puma-02 | permitido |
| Lee entrega individual ajena | Puma-02 | denegado |
| Escribe entrega/valoración/XP | Zorro-01 | denegado |
| Lee entrega del curso | Docente Uno | permitido |
| Lee entrega de otro curso | Docente Dos | denegado |
| Catálogo autenticado / anónimo | — | permitido / denegado |
| Tras revocar el binding | Zorro-01 | denegado |
| Encuesta: crear / leer propia / docente del curso / otro docente | varios | permitido / denegado / permitido / denegado |

### 5.2 Storage Rules
| Caso | Resultado |
|---|---|
| Subir a entrega propia y abierta | permitido |
| Curso ajeno | denegado |
| Tipo no permitido | denegado |
| Tamaño > 5 MiB | denegado |
| Tras cierre de la entrega | denegado |
| Docente del curso lee / otro docente | permitido / denegado |

### 5.3 Functions
| Caso | Resultado |
|---|---|
| Canje válido | `ok` + binding activo |
| Código inválido | `invalid` sin binding |
| Revocación docente | binding `revoked` |
| Regenerar código | anterior `revoked`; nuevo `ok` (≥ 20 chars) |
| `submitEvidence` con misma clave | misma evidencia, versión 1 |
| Validación completa | `achieved`; segunda validación rechazada |
| Reabrir + reenviar + revalidar | **1 `xpEvent`** |
| Validación incompleta | rechazada |
| Evidencia equivalente | `pending_review`, `origin=teacher_equivalent`; hito inexistente → rechazado |
| Docente de otro curso valida | rechazado |
| **Concurrencia:** 2 envíos misma clave | **1 evidencia** |
| **Concurrencia:** 2 validaciones | **1 `xpEvent`, 1 éxito** |

---

## 6. Diferencias frente a la etapa Supabase (histórica)

| Aspecto | Supabase (archivo) | Firebase (vigente) |
|---|---|---|
| Permisos | RLS en PostgreSQL | Firestore/Storage Rules |
| Lógica privilegiada | Edge Functions / `service_role` | Cloud Functions (Admin SDK omite reglas → valida actor) |
| Identidad estudiante | `auth.uid()` + binding | Auth anónimo + `sessionBindings/{uid}` |
| Pruebas | PGlite + `embedded-postgres` | Firebase Emulator Suite (Auth/Firestore/Storage/Functions) |
| Idempotencia | restricción única SQL | IDs deterministas + transacciones |
| Estado | **histórico, no ejecutar** | **backend del MVP** |

---

## 7. CI

- `.github/workflows/ci.yml` — trabajos: `calidad` (lint, tipos, pruebas, build), `e2e` (Playwright + axe) y **`emuladores`** (instala Java 21, `npm ci`, `npm --prefix functions ci`, `npm run emu:test`).
- El trabajo `db` (Supabase/PGlite) se retiró junto con `npm run test:db`.
- **Estado confirmado:** ejecución **`36349301159`** (commit `10d8f1b`): **success** (1 m 15 s), con las 22 pruebas de emuladores en verde.
- Incidencias resueltas para que CI compilara: tipos explícitos de `Transaction`/`QueryDocumentSnapshot`, `moduleResolution: node16` en `functions`, y dependencias explícitas `@google-cloud/firestore`/`@google-cloud/storage` (en `firebase-admin` v14 son opcionales y no se instalaban en el runner).

---

## 8. Condiciones pendientes para I1a (conectar identidad y lecturas)

I0d **no** habilita por sí solo el uso con estudiantes. Pendiente:

1. **Conectar el frontend** a Firebase Auth (anónimo) y a las lecturas de Firestore/Storage, sustituyendo los fixtures (I1a).
2. **Proveedor institucional** de docentes definido para el piloto.
3. **App Check** y atenuación de abuso en `redeemCode` (hoy el borde es la IP del servidor; falta verificar App Check).
4. **Validación institucional**: alojamiento, identidad, consentimiento, retención, responsables.
5. **Verificación manual de accesibilidad** (lector de pantalla, contraste medido, prueba con estudiantes).
6. **Revisión de costos/cuotas** y estrategia de retención en Firestore/Storage.

---

## 9. Nota sobre credenciales

La carpeta externa `data/` con credenciales **Firebase Admin** **no se usó, no se importó y no se versionó**. La semilla es 100 % sintética y el proyecto de trabajo es `demo-red-tic` (solo emuladores). Si alguna credencial estuvo expuesta, debe **revocarse/rotarse**.
