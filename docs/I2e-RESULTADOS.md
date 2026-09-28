# RED-TIC — I2e · Autorización, coherencia pedagógica y lectura de archivos (solo emuladores)

**Estado:** cerrada la **autorización** de `submitEvidence` (antes de cualquier recibo o mutación), aplicadas las **modalidades** en Functions, exigida la **contribución individual** para el XP de equipos, concretado el **contrato de M1** (diagnóstico/barrera), añadidas **plantillas** accesibles y sustituidos los **enlaces persistentes** por una **descarga autorizada** que respeta el vínculo/curso al acceder. Solo **Firebase Emulator Suite** y datos sintéticos. **Sin despliegue ni datos reales.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` Fases 6 y 7 y revisión de I2d; continúa `docs/I2d-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 79 pruebas de emulador (Vitest) + 39 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Prioridad 1 — Autorización

`submitEvidence` ahora:

1. **Autoriza primero**: carga la entrega y exige `ownerEnrollmentId` y `courseId` del **vínculo activo** **antes** de devolver un recibo idempotente o tocar Storage.
2. **Aplica la modalidad del hito** en el servidor (`text`/`file`), además de la UI; `reserveUpload` también exige `file`.
3. **Reserva ajena**: la verificación exige `deliveryId`, `ownerEnrollmentId`, `enrollmentId` y `courseId` coincidentes.
4. **Limpieza redundante segura**: solo borra la reserva si es del **mismo estudiante y entrega**; marca `consumed` **solo tras confirmar** el borrado (best-effort, reintentable ante fallo transitorio).

**Pruebas adversariales:** entrega/clave ajenas (no hay recibo idempotente), reserva ajena (rechazada y **sin consumir**), modalidad no permitida (texto en M1), limpieza que no toca reservas ajenas.

---

## 3. Prioridad 2 — Coherencia pedagógica

- **M1 (20 XP):** contrato explícito — se acredita con **diagnóstico entregado** (`submitted`) **o barrera técnica registrada** (`technicalIssue`) **y** la pregunta; **el puntaje no afecta el XP**. Lo aplica el servidor (`requiresDiagnosis`). Prueba: sin diagnóstico → rechaza; con barrera técnica → acredita.
- **M2 (35) y M5 (45):** bloques de dos acciones; cada hito declara una **lista de evidencia mínima** (`evidenceChecklist`) que el docente verifica antes de acreditar. Documentado en `docs/I2e-INDICADORES-Y-PLANTILLAS.md`.
- **Indicadores:** tabla **priorizado (Fase 6) vs observado (hito)**, con explicación de las omisiones. Lo no observado queda **«No evaluado»**, nunca 0. **D2** (coedición) no se califica en la app individual.
- **Contribuciones en equipos:** `registerContribution` registra el aporte propio (o el docente, vía equivalente); `validateMilestone` **exige** contribución de cada integrante antes de otorgar XP individual.
- **Consignas y plantillas:** consignas revisadas (una acción por paso, sin datos sensibles) y **plantillas accesibles** por misión en `/estudiante/plantillas` (imprimibles).

**XP = avance narrativo**, separado de la competencia observada.

---

## 4. Prioridad 3 — Lectura de archivos

- Se **eliminó** `getDownloadURL` (URL con token de larga duración que no revalida reglas).
- La descarga usa **`getBytes`** del SDK con la sesión del usuario: las **Storage Rules se evalúan en cada acceso** (vínculo activo, propiedad/curso). El contenido se entrega como **Blob efímero en memoria** (no compartible como enlace).
- **Pruebas de Storage Rules:** el docente del curso lee; **otro curso**, **otro estudiante** y el **vínculo revocado** no leen; al reactivar, vuelve a permitirse.

---

## 5. Pruebas

| Suite | Alcance nuevo | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Autorización adversarial de `submitEvidence`; modalidades en Functions; contribuciones de equipo (propia/docente/ajena); contrato M1 (barrera técnica); limpieza segura; rutas de texto/archivo; XP 160; aislamiento | **79/79** |
| Playwright (`e2e/`) | Seis misiones, modalidades, entrega de archivo, validación docente y XP, equivalencia, plantillas accesibles, aislamiento, teclado y 320 px | **39/39** |
| Unitarias (`tests/`) | Sin cambios | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

---

## 6. CI

- `.github/workflows/ci.yml` — trabajos `calidad` y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado confirmado:** ejecución **`36368119257`** (commit `3bedf59`): **success** (2 m 58 s), con 79 pruebas de emulador y 39 de navegador en verde.

---

## 7. Decisiones pedagógicas (resumen)

1. El XP **acredita el hito** (avance narrativo); la competencia se valora aparte y puede quedar **«No evaluado»**.
2. **M1** exige diagnóstico **o** barrera técnica (no penaliza fallos técnicos) y la pregunta; el puntaje no afecta XP.
3. **M2/M5** exigen evidencia de **ambas** acciones antes de acreditar el bloque.
4. Indicadores **no observados** en un hito quedan «No evaluado» (nunca 0); **D2** fuera de la app individual.
5. El **XP por integrante** exige **contribución propia** registrada (con vía docente equivalente).

---

## 8. Límites conocidos

1. **Contribución individual** se registra por texto; falta adjuntar/adjuntar evidencia por integrante.
2. **Descarga autorizada** vía `getBytes`: válida y revalidada por reglas; para archivos grandes convendría una URL firmada de caducidad breve emitida tras autorización.
3. **Revisión pedagógica** de contenidos y **prueba con estudiantes**: pendiente.
4. **App Check**, **secretos**, **proveedor docente institucional** y **gobernanza de datos**: pendientes.
5. **Accesibilidad manual** (lector de pantalla) **sin verificar**; **no** se declara WCAG.

---

## 9. Confirmación de alcance

- **No hubo despliegue**: todo contra **Firebase Emulator Suite** (`demo-red-tic`).
- **No se usaron datos ni credenciales reales**; la carpeta externa `data/` no se usó, importó ni versionó.
- **No** se declara cumplimiento WCAG ni se cierra la Fase 10: faltan decisiones institucionales y verificación manual antes del piloto.
