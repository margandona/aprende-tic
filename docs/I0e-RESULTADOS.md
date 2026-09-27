# RED-TIC — I0e · Endurecimiento del backend Firebase

**Estado:** seis puntos de la revisión de I0d corregidos y probados en **Emulator Suite**. Frontend Vue 3 sin cambios (fixtures). **Sin datos reales, sin despliegue.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` §«Fase 10 — revisión de I0d Firebase».

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 34 pruebas con Auth, Firestore, Storage y Functions
```

---

## 2. Correcciones y pruebas

| # | Punto (revisión I0d) | Corrección | Pruebas |
|---|---|---|---|
| 1 | `reservationId` en la ruta pero Storage no leía reserva | **`reserveUpload`** crea `uploadReservations/{id}` (curso, matrícula, entrega, propietario, nombre, MIME, tamaño, caducidad). `storage.rules` **coteja cada campo** y exige estado `reserved` y no expirado. `submitEvidence` consume la reserva (`consumed`). | Sin reserva / caducada / consumida / nombre o tamaño distintos → denegado; reserva válida → permitido; consumo al enviar; archivo huérfano (ruta sin reserva) → denegado |
| 2 | Límite por actor fuera de transacción; `Math.random()`; pepper por defecto | **Contador transaccional** `redeemRate/{actor}` (una escritura acotada por actor y ventana); **`crypto.randomBytes`** (128 bits); `actorKeyFrom` usa `x-forwarded-for` (proxy/NAT) y bucket `unknown-edge`; **pepper falla cerrado** fuera del emulador; opción `enforceAppCheck`. | 12 canjes concurrentes con códigos distintos y mismo actor → `rate_limited`; código de alta entropía; hash con pimiento |
| 3 | `startDelivery` con `set` podía reiniciar | **`ref.create`** + manejo de existencia; no reinicia estado | `startDelivery` concurrente → una entrega `not_started`; tras enviar, otro `startDelivery` no reinicia (`pending_review`) |
| 4 | Catálogo, cursos y equipos legibles por cualquier sesión autenticada | Catálogo/cursos/equipos requieren **vínculo activo o docente activo del curso**; lectura de entrega con **coherencia de curso** (equipo de otro curso → denegado) | Sesión autenticada **sin vínculo** → denegado; vínculo revocado → denegado; miembro de equipo de otro curso → denegado; consultas reales (`where`) por rol |
| 5 | `isTeacherOfCourse` sin verificar `status` | Guard y reglas exigen `teachers/{uid}.status == 'active'` | **Docente desactivado** → lectura y Functions denegadas |
| 6 | Encuesta con campos arbitrarios | Esquema validado en reglas: claves exactas, `schemaVersion=1`, A1–A6 como texto ≤ 500 | Campos extra / faltantes / valor largo / matrícula ajena → denegado; creación válida → permitida; lectura solo docente del curso |

Además: **documentos de identidad y rol no escribibles desde el cliente** (`sessionBindings`, `codeCredentials`, `enrollments`, `teachers`, `teacherCourses`, `uploadReservations`).

---

## 3. Matriz permitido / denegado (34/34)

### Firestore Rules (18)
| Caso | Resultado |
|---|---|
| Lee su matrícula / otra matrícula | permitido / denegado |
| Lee su entrega y la de su equipo / individual ajena | permitido / denegado |
| Miembro de equipo de **otro curso** sobre entrega del curso X | denegado |
| Escribe entrega / valoración / XP | denegado |
| Escribe documentos de identidad/rol | denegado |
| Docente del curso / otro curso | permitido / denegado |
| **Docente desactivado** | denegado |
| Vínculo revocado | denegado |
| Sesión autenticada **sin vínculo** (catálogo, cursos, equipos) | denegado |
| Catálogo: sesión vinculada / anónima | permitido / denegado |
| Cursos y equipos por vínculo o docente | permitido / denegado |
| **Consulta real** `deliveries where ownerEnrollmentId` (estudiante) | permitido (devuelve lo suyo) |
| **Consulta real** `deliveries where courseId` (docente del curso / otro) | permitido / denegado-o-vacío |
| Encuesta: esquema válido / extra / faltante / largo / ajena | permitido / denegado ×4 |
| Encuesta: lectura propia / docente del curso / otro docente | denegado / permitido / denegado |

### Storage Rules (5)
| Caso | Resultado |
|---|---|
| Reserva válida que coincide | permitido |
| Sin reserva / caducada / consumida | denegado |
| Nombre o tamaño distintos de la reserva | denegado |
| Curso ajeno o matrícula ajena | denegado |
| Lectura docente del curso / otro docente | permitido / denegado |

### Functions y concurrencia (11)
| Caso | Resultado |
|---|---|
| Canje válido / inválido / revocado | ok / invalid / revoked |
| Regenerar código (alta entropía) | anterior `revoked`, nuevo `ok` |
| `submitEvidence` idempotente | 1 versión |
| Validación completa + XP único; segunda validación rechazada | ok |
| Reabrir + reenviar + revalidar | 1 `xpEvent` |
| Evidencia equivalente (docente) | `pending_review`, `teacher_equivalent` |
| **`reserveUpload`** → reserva `reserved` → consumo al enviar | ok |
| `reserveUpload` tipo/tamaño inválidos | denegado |
| Docente desactivado (revoke/regenerate/validate) | denegado |
| **Concurrencia:** 2 envíos misma clave / 2 validaciones | 1 evidencia / 1 `xpEvent` |
| **Concurrencia:** canjes multi-código mismo actor | `rate_limited` |
| **Concurrencia:** `startDelivery` x2 | 1 entrega sin reinicio |

---

## 4. CI

- `.github/workflows/ci.yml` — trabajos `calidad`, `e2e` y **`emuladores`** (Java 21 + `npm --prefix functions ci` + `npm run emu:test`).
- Ejecución a confirmar tras publicar este commit.

---

## 5. Pendientes concretos para I1a

1. **Conectar el frontend** a Auth anónimo, canje (`redeemCode`), lecturas por rol y subida con `reserveUpload` — sustituir fixtures.
2. **App Check**: activar `ENFORCE_APP_CHECK=true` y registrar la app; hoy el borde es la IP y App Check está disponible pero no exigido en emulador.
3. **Proveedor institucional** de docentes (hoy `teachers/{uid}` con `status`; falta el alta/baja real y el proveedor).
4. **Flujo de diagnóstico en cliente** (respuestas y envío) — **no** declarado implementado.
5. **Retención y consentimiento** por institución; residencia y responsables.
6. **Verificación manual de accesibilidad** (lector de pantalla, contraste, prueba con estudiantes).
7. **Costos/cuotas** y estrategia de retención en Firestore/Storage.

> La carpeta externa `data/` con credenciales Firebase Admin **no se usó, importó ni versionó**; el proyecto de trabajo es `demo-red-tic` (solo emuladores).
