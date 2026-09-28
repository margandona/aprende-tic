# RED-TIC — I2f · Cierre de contratos y preparación de piloto (solo emuladores)

**Estado:** cerrados los tres contratos pendientes (evidencia mínima con confirmación docente, aportes de equipo con autorización/versionado, limpieza redundante segura), con pruebas adversariales y de concurrencia; matriz de salida de Fase 10 y preparación de piloto documentadas. Solo **Firebase Emulator Suite** y datos sintéticos. **Sin despliegue ni datos reales.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` revisión de I2e; continúa `docs/I2e-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 83 pruebas de emulador (Vitest) + 39 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Contrato 1 — Evidencia mínima M2/M5

- `confirmChecklistItem({ deliveryId, itemIndex })`: **solo docente del curso**, entrega `pending_review`; registra **quién, qué ítem y cuándo**, **ligado a la versión vigente** (`evidenceId`). Historial conservado (documentos por confirmación).
- `validateMilestone` **exige la confirmación completa** de la evidencia mínima del bloque para la **versión vigente**; si falta, rechaza con mensaje que sugiere **«Pedir ajuste»**.
- **Nueva versión** → las confirmaciones anteriores no cuentan (se vinculan a `evidenceId`).
- **Juicio docente:** el servidor **no interpreta el contenido**; solo registra la confirmación. Documentado en la UI y en el código.
- UI: la vista docente muestra cada ítem con botón **«Confirmar ítem N»** y estado «✔ Confirmado». Al confirmar se recarga sin perder la valoración en curso.

## 3. Contrato 2 — Aportes de equipo

`registerContribution` ahora comprueba:
- **curso del vínculo** (`binding.courseId === delivery.courseId`),
- **pertenencia al equipo** (miembro del `teamId`),
- **estado permitido** (`pending_review`/`in_progress`; **rechaza** si `achieved`),
- **vínculo a la versión vigente** (`evidenceId = currentEvidenceId`),
- **historial** de cambios en `deliveryHistory` (kind `contribution`),
- **vía docente equivalente** (docente registra el aporte de un integrante).

`validateMilestone` exige contribución **con la versión vigente** antes de otorgar XP por integrante. No se altera el sustento de un **XP ya validado** (entrega `achieved`).

## 4. Contrato 3 — Limpieza redundante

`cleanupRedundantReservation` comprueba **matrícula y curso del vínculo** (además de propietario y entrega), **no toca** una reserva **referenciada por otra evidencia**, y ante un **fallo transitorio** la deja `reserved` para reintentar. Marca `consumed` **solo tras confirmar** el borrado. Pruebas: reserva **ajena**, **referenciada** y **dos reintentos concurrentes** (una sola limpieza).

---

## 5. Pruebas

| Suite | Alcance nuevo | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Confirmación de evidencia mínima (parcial/completa/reinicio por versión/estudiante no autorizado); aportes (curso/estado/versión/inmutabilidad/historial); limpieza redundante (ajena/referenciada/concurrente); rutas de archivo, XP 160, aislamiento | **83/83** |
| Playwright (`e2e/`) | Seis misiones, modalidades, entrega de archivo, **confirmación de evidencia mínima + validación**, equivalencia, plantillas, aislamiento, teclado y 320 px | **39/39** |
| Unitarias (`tests/`) | Sin cambios | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

> Nota: en una ejecución el **emulador de Firestore** falló de forma esporádica (no reproducible); la repetición quedó verde. Se documenta como flake de entorno.

---

## 6. Salida de Fase 10 y preparación de piloto

- **Matriz de salida:** `docs/I2f-MATRIZ-SALIDA-FASE-10.md` (criterio · evidencia · estado).
- **Preparación de piloto (sin activar):** `docs/I2f-PREPARACION-PILOTO.md` (App Check, secreto administrado, identidad docente institucional, presupuesto/alertas, limpieza programada, retención/exportación/borrado + decisiones institucionales).
- **Accesibilidad manual:** `docs/I2f-ACCESIBILIDAD-MANUAL.md` (protocolo reproducible; **no ejecutado** con lector de pantalla real).

---

## 7. CI

- `.github/workflows/ci.yml` — trabajos `calidad` y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado:** pendiente de confirmar la ejecución de este commit (I2f).

---

## 8. Límites y puertas abiertas

1. **App Check, secreto administrado, identidad docente institucional, presupuesto/alertas, limpieza programada y retención**: configurados/documentados, **no activados**.
2. **Accesibilidad manual** con lector de pantalla y **prueba con estudiantes**: pendientes.
3. **Revisión pedagógica** del contenido y de la evidencia mínima: pendiente.
4. **Descarga** vía `getBytes` (para archivos grandes convendría URL firmada breve).
5. La **Fase 10 no se cierra**; Fases 11–15 siguen pendientes.

## 9. Confirmación de alcance

- **No hubo despliegue**: todo contra **Firebase Emulator Suite** (`demo-red-tic`).
- **No se usaron datos ni credenciales reales**; la carpeta externa `data/` no se usó, importó ni versionó.
- **No** se declara cumplimiento WCAG ni se cierra la Fase 10.
