# RED-TIC — I1c · Diagnóstico completo y vista docente mínima (solo emuladores)

**Estado:** instrumento A1–A6 y T1–T5 con **estímulos reales** (caso, fichas A/B, mensaje y plantilla), transiciones cerradas (encuesta atómica, corrección antes del envío, envío inmutable), **revisión docente con puntaje nulo correcto e historial** y **vista docente mínima**. Todo contra **Firebase Emulator Suite** y datos 100 % sintéticos. **Sin despliegue ni datos reales.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` Fase 5 y Fase 10 (revisión de I1b); continúa `docs/I1b-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 50 pruebas de emulador (Vitest) + 19 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Instrumento completo (Parte 1)

| Pieza | Cambio |
|---|---|
| `src/data/diagnosisCase.ts` | Caso de la **biblioteca** (versión `pre`) y caso paralelo de la **actividad municipal** (`post`): resumen, **Fuente A** (oficial, con responsable, fecha, horario y procedimiento), **Fuente B** (anónima, sin fecha, con requisito contradictorio de pago), **mensaje sospechoso** sin enlace activo, **plantilla de carpeta** e instrucciones. Consignas T1–T5 literales de Fase 5. |
| `src/data/diagnosisSurvey.ts` | Opciones de A1–A6 compartidas por la UI. |
| `src/views/DiagnosisView.vue` | Muestra el caso completo, las dos fichas contrastables y el mensaje (enlace **solo como texto**, sin `<a>`). Ajustes de encuesta abajo. |
| `functions/src/diagnosis.ts` | Esquema de encuesta **v2** validado en el servidor. |

**Ajustes de la encuesta A1–A6**

| Ítem | Instrumento (Fase 5) | Implementación |
|---|---|---|
| A1 | Selección **múltiple** | Checkboxes; `A1: string[]`. «prefiero no responder» no se combina con otras. |
| A2 / A3 | Elección única | Select con «prefiero no responder». |
| A4 | Condición + «otra que quieras indicar» | Select + texto breve obligatorio si se elige «otra». |
| A5 | **Tres experiencias por separado** | Tres campos (`created`, `verified`, `explained`). |
| A6 | **Opcional** | Texto libre que puede quedar vacío. |
| Todos | «puedes dejar en blanco» | Cada ítem admite vacío. |

Se preservan **«prefiero no responder»**, **«no respondido»**, **«barrera técnica»** y **apoyos** como datos **distintos de un puntaje 0** (campos y estados propios, nunca convertidos a 0).

**Comparación real, no pista superficial:** ambas fichas tienen longitud y legibilidad semejantes; la diferencia exige razonar sobre **autoría, fecha y una afirmación contradictoria** (la Fuente B añade un pago y un enlace simulado). La Fuente A no se reconoce por un logotipo.

---

## 3. Transiciones cerradas (Parte 2)

| Regla | Implementación | Prueba |
|---|---|---|
| Encuesta + marca de completitud **atómica** | `saveConditionsSurvey` escribe `conditionsSurveys/{id}` y `enrollments/{id}.surveySubmitted` en **una transacción**. | `functions.spec` |
| **Corregir antes de enviar** | La encuesta se puede re-guardar mientras el intento no esté `submitted`; tras el envío queda cerrada. | `functions.spec` |
| Envío **inmutable** para el estudiante | `submitDiagnosisAttempt` transiciona `draft → submitted` y exige encuesta registrada; `saveDiagnosisResponse` rechaza tras el envío. | `functions.spec`, `diagnostico.spec` |
| Revisión **exige respuesta existente** | `reviewDiagnosisResponse` falla si no existe el documento de respuesta (no crea uno con puntaje). | `functions.spec` |
| **Puntaje nulo** por no respuesta o barrera técnica | Si `responseStatus != answered` o `technicalIssue`, solo se admite puntaje `null`. | `functions.spec`, `docente-diagnostico.spec` |
| **Historial** de cambios docentes | `diagnosisReviewHistory` registra cambios de puntaje y de devolución (anterior → nuevo). | `functions.spec`, `rules.spec` |
| Devolución por intento | `saveDiagnosisFeedback` guarda **fortaleza observada** y **siguiente paso** (también con historial). | `functions.spec`, `docente-diagnostico.spec` |

---

## 4. Vista docente mínima (Parte 3)

| Pieza | Cambio |
|---|---|
| `src/views/TeacherDiagnosisView.vue` | Lista los diagnósticos **enviados** de los cursos del docente; muestra respuestas T1–T5, **apoyos y barreras**, la encuesta de condiciones y el historial. Permite registrar puntuación (0–2) según la pauta, comentario, **fortaleza observada** y **siguiente paso**. |
| `functions/src/identity.ts` | `teacherDemoSignIn`: acceso docente **de demostración solo en emuladores** (resuelve un código sintético a un docente activo y emite token personalizado). Fuera del emulador **falla cerrado**. |
| `src/views/AccessView.vue` / `src/stores/session.ts` | Entrada con código docente (`DOCENTE-01`, `DOCENTE-02`) y rol docente persistido. |
| `firestore.rules` | El docente del curso lee diagnóstico, respuestas e historial; **otro curso o docente desactivado no puede**; el cliente nunca escribe. |

**Aislamiento:** un docente de otro curso (o desactivado) no ve ni corrige; un estudiante solo ve lo propio; no se exponen respuestas individuales a otros estudiantes.

---

## 5. Pruebas

| Suite | Alcance | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Reglas, Functions, concurrencia, encuesta v2, transiciones, revisión, historial, aislamiento | **50/50** |
| Playwright (`e2e/`) | Caso/fuentes, encuesta múltiple/opcional, borrador, envío inmutable, revisión docente, puntaje nulo, historial, revocación, aislamiento, 320 px/teclado/foco/axe/contraste | **19/19** |
| Unitarias (`tests/`) | Config con fallo cerrado, navegación, separación de paneles, estado | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

**Contraste medido:** prueba de navegador que calcula la razón de contraste real (WCAG) de textos clave y exige ≥ 4.5:1 (normal) o ≥ 3:1 (grande).

**Capturas:** `docs/capturas/08-diagnostico.png`, `09-caso-fuentes.png`, `10-docente-diagnostico.png`.

---

## 6. Versión paralela del caso (futuro postest) — **no validada**

En `src/data/diagnosisCase.ts` queda definida una **versión paralela** (`post`) equivalente, no idéntica: reservar un cupo en una **actividad municipal ficticia**, con dos fichas de calidad contrastante (Fuente A oficial con responsable/fecha/procedimiento; Fuente B anónima sin fecha que exige transferencia y una foto de carnet) y un **mensaje de fraude distinto** (pide un código de tarjeta). Mantiene cinco tareas, tiempos y descriptores.

> **Aviso:** este borrador **no ha sido pilotado ni validado**; no hay evidencia de validez o fiabilidad. Antes de aplicarlo hay que revisar que la diferencia entre fichas exija razonar, que la dificultad sea semejante y que no se penalice a quien usa audio, lector o tiempo adicional.

---

## 7. CI

- `.github/workflows/ci.yml` — trabajos `calidad` (lint, tipos, pruebas, build) y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado confirmado:** ejecución **`36358812766`** (commit `6670577`): **success** (2 m 19 s), con 50 pruebas de emulador y 19 de navegador en verde.

---

## 8. Pendientes para el siguiente paso

1. **App Check exigido**, **secretos administrados** (`CODE_PEPPER`) y **proveedor docente institucional** (hoy simulado en emuladores).
2. **Papel/equivalencia documentada** y aplicación del **postest** con revisión de contenido previa.
3. **Refresco de sesión al volver a foco / antes de acciones sensibles** (hoy se revalida al volver a leer).
4. **Subida de archivos en la UI** sigue **deshabilitada**.
5. **Retención/consentimiento, residencia y responsables**; **costos/cuotas**.
6. **Verificación manual de accesibilidad** (lector de pantalla, contraste medido, prueba con estudiantes).

> La carpeta externa `data/` con credenciales Firebase Admin **no se usó, importó ni versionó**; solo emuladores y datos sintéticos.
