# RED-TIC — I2b · Ciclo de revisión de la misión 2 (solo emuladores)

**Estado:** la misión **2 «Escuchar la señal»** cierra su ciclo: **revisión docente accionable** (valoración por indicador, «no evaluado» separado, fortaleza/siguiente paso), **validación con XP único**, **«pedir ajuste» y reintento** con versiones e historial, **entrega equivalente** (papel/audio/maqueta/dictado/adaptación) con interfaz docente, y **plantilla imprimible**. Solo **Firebase Emulator Suite** y datos 100 % sintéticos. **Sin despliegue ni datos reales.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` Fase 10 (I2a) y plan de I2b; continúa `docs/I2a-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 65 pruebas de emulador (Vitest) + 30 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Revisión docente accionable (Parte 1)

| Pieza | Cambio |
|---|---|
| `src/views/TeacherReviewView.vue` | La bandeja enlaza cada entrega a su **detalle de revisión**. |
| `src/views/TeacherDeliveryReviewView.vue` | Muestra la **evidencia vigente y todas sus versiones** (con origen, formato y **apoyos**); valora **todos los indicadores exigidos por el hito**, **por estudiante cuando la entrega es de equipo**; registra **comentario, fortaleza observada y siguiente paso**. |
| `functions/src/validation.ts` | `validateMilestone` admite `strength`/`nextStep` por indicador y el nivel **`not_evaluated`**. |

**«No evaluado» ≠ valoración baja:** es un nivel explícito (`not_evaluated`) que no cuenta como incipiente y se muestra con estilo neutro en «Mis aprendizajes».

---

## 3. Validación y XP (Parte 2)

- `validateMilestone` pasa la entrega de **`pending_review` → `achieved`** en una transacción; exige la evidencia vigente y **todos los indicadores requeridos** por integrante.
- El **XP se otorga solo al validar**, **una vez por (matrícula, hito y versión del programa)**: el `xpEvent` tiene id determinista, así que revalidar no duplica.
- **Separación de paneles:** la valoración aparece en **«Mis aprendizajes observados»** (nivel, comentario, fortaleza, siguiente paso) y el **XP** en **«Mi recorrido»**; ninguno mezcla ambos.

---

## 4. Pedir ajuste y reintento (Parte 3)

| Función / UI | Efecto |
|---|---|
| `requestAdjustment` | `pending_review → in_progress` con una **acción concreta**; registra el cambio en `deliveryHistory`. |
| `reopenMilestone` | Reapertura simple (se mantiene para usos internos). |
| `MissionDetailView` | El estudiante ve la **devolución** («Tu docente pidió un ajuste»), corrige y **envía una nueva versión**. |
| Evidencia/valoraciones/historial | Se **conservan**; el reintento **no resta ni duplica XP** (mismo `xpEvent` al revalidar). |
| `correctAssessment` / `revokeXp` / `restoreXp` | Corrección de nivel (con historial), **retirada y reinstauración** del XP sin duplicar. |

---

## 5. Entrega equivalente (Parte 4) y plantilla (Parte 5)

- `src/views/TeacherEquivalentView.vue` (`/docente/equivalencia`): **estudiante + hito** aunque **no exista entrega digital**; soportes **papel, audio local, maqueta, dictado, adaptación autorizada**; **modalidad** de prueba; descripción; **apoyos por separado**.
- `registerEquivalentEvidence` crea la entrega en **`pending_review`**; después se **valora y valida con los mismos indicadores y XP** que una entrega digital.
- `src/views/PaperTemplateView.vue` (`/docente/plantilla`): **plantilla imprimible** de la ruta en papel (con `window.print()` y estilos `@media print`).
- `docs/I2a-ENTREGA-EQUIVALENTE-PAPEL.md` **corregido**: el paso 6 ya **no** promete acreditación inmediata; describe los dos pasos (registrar → valorar/validar).

**Borradores en equipos compartidos:** botón **«Borrar borrador local»** en la misión; el borrador se limpia **al cerrar sesión** (`clearAllDrafts`) y al **cambiar de estudiante** (`clearDraftsExcept`). La **confirmación** de envío usa la **fecha del servidor** (`createdAt` de la evidencia), no el reloj del dispositivo. El listener `visibilitychange` de `App.vue` ahora se **elimina** al desmontar.

---

## 6. Pruebas

| Suite | Alcance nuevo | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Validación + XP único; `not_evaluated`; pedir ajuste + reintento sin duplicar XP; valoración por estudiante en equipo; equivalente con apoyos + validación; docente de otro curso/inactivo; retirada/reinstauración de XP; aislamiento e historial por Rules | **65/65** |
| Playwright (`e2e/`) | Revisión accionable + XP + paneles separados; pedir ajuste + reintento; equivalente + validación + plantilla; aislamiento entre cursos; borrado de borrador local; teclado y 320 px | **30/30** |
| Unitarias (`tests/`) | Sin cambios | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

**Capturas:** `docs/capturas/12-docente-revision.png`, `13-aprendizajes-validado.png`, `14-equivalencia.png`.

---

## 7. CI

- `.github/workflows/ci.yml` — trabajos `calidad` y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado:** pendiente de confirmar la ejecución de este commit (I2b).

---

## 8. Límites conocidos

1. **Subida de archivos deshabilitada**: la entrega digital es solo **texto**; Storage/`reserveUpload` irán en **I2c**.
2. **Una misión funcional** (la 2); las otras cinco siguen informativas.
3. **Borrador local**: no hay sincronización de borradores entre dispositivos.
4. **Retención/consentimiento** de la evidencia equivalente, **App Check**, **secretos** y **proveedor docente institucional**: pendientes de gobernanza.
5. **Accesibilidad automatizada** (axe, contraste medido, 320 px, teclado) **no** sustituye revisión manual WCAG 2.2 AA ni validación pedagógica.
6. La **Fase 10 no se declara cerrada**; el postest paralelo sigue sin validar.

---

## 9. Confirmación de alcance

- **No hubo despliegue**: todo se ejecutó contra **Firebase Emulator Suite** con el proyecto `demo-red-tic`.
- **No se usaron datos ni credenciales reales**: la carpeta externa `data/` **no se usó, importó ni versionó**.
- La **subida de archivos** permanece **deshabilitada en la interfaz**.
- **No** se declara cumplimiento WCAG ni se cierra la Fase 10.

> Una ejecución de navegador falló por un **crash esporádico del emulador de Firestore** (no reproducible); la repetición quedó **verde** (30/30). Se documenta como flake de entorno, no como fallo del código.
