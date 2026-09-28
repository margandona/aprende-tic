# RED-TIC — I2a · Primera misión funcional con entrega de texto (solo emuladores)

**Estado:** la misión **2 «Escuchar la señal»** (ficha de necesidad, texto) está conectada de extremo a extremo a **Firestore + Cloud Functions** (inicio, borrador, envío idempotente y versiones), con estados de carga/error/reintento/confirmación y una **lectura docente de entregas pendientes** (sin valoración ni XP). Solo **Firebase Emulator Suite** y datos sintéticos; **sin despliegue ni datos reales**.
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` Fase 10 (I1c) y plan de I2a; continúa `docs/I1c-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 57 pruebas de emulador (Vitest) + 25 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Misión elegida y flujo

**Misión 2 «Escuchar la señal»** — hito **«Ficha de necesidad»** (texto, 20 XP al validar en I2b).

| Pieza | Cambio |
|---|---|
| `tests-emu/seed.ts` | **Seis misiones** con sus hitos (mission-1..6, milestone-1..6); el hito de la misión 2 (`milestone2`) ya no cuelga de la misión 1. |
| `src/views/MissionDetailView.vue` | Detalle con reto, entregable, hito, indicadores y estado. Acciones: **Iniciar misión** (`startDelivery`), **borrador** local, **Enviar entrega** (`submitEvidence`, texto), **reintento** y **confirmación** con versión. |
| `src/data/firebaseRepository.ts` | `fetchMissionDetail` devuelve hito, entrega y **versiones de evidencia**; `startMission`, `submitTextEvidence` y `fetchPendingDeliveries`. |
| `src/data/drafts.ts` | Borrador **solo en este dispositivo** (`localStorage`), con aviso explícito. |
| `src/views/TeacherReviewView.vue` | **Lectura** de entregas `pending_review` de los cursos del docente: estudiante, misión, hito, origen, formato, versión y texto. **Sin** valoración ni XP. |

**Estados mostrados:** carga (`Cargando la misión…`), error (`StatePanel`), reintento (botón «Reintentar envío» con la **misma** `submitKey`), confirmación (`Entrega confirmada · Versión N · fecha`).

**Versiones e idempotencia:** el mismo `submitKey` devuelve el mismo recibo sin duplicar; un `submitKey` distinto tras **reabrir** el hito crea la versión siguiente. La entrega conserva todas las versiones.

---

## 3. Correcciones pedidas

### 3.1 Revalidación del vínculo al volver a foco y antes de enviar
- `src/stores/session.ts`: `refreshSession()` fuerza una relectura de `sessionBindings/{uid}`; si el vínculo guardado ya no es válido, cierra la sesión y marca `invalidated` (redirección al acceso).
- `src/App.vue`: escucha `visibilitychange` (visible) y `focus` de la ventana → `refreshSession()`.
- `MissionDetailView.enviar()`: llama a `refreshSession()` **antes de enviar**; si el vínculo se revocó, no envía y vuelve al acceso.

### 3.2 El postest no puede presentarse ni enviarse como instrumento vigente
- `functions/src/diagnosis.ts`: `startDiagnosisAttempt` con `kind: 'post'` **falla cerrado**; `submitDiagnosisAttempt` rechaza cualquier intento con `kind === 'post'`.
- La versión paralela `post` sigue definida en `src/data/diagnosisCase.ts` **solo como borrador documentado** (no validado) y no se expone en la interfaz.

### 3.3 Procedimiento de entrega equivalente en papel
- Documentado en `docs/I2a-ENTREGA-EQUIVALENTE-PAPEL.md`, con el backend ya existente (`registerEquivalentEvidence`) y lo que falta para I2b (interfaz P-D-04).

---

## 4. Pruebas

| Suite | Alcance nuevo | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Entrega de texto y versiones tras reabrir; aislamiento entre estudiantes; envío ajeno rechazado; doble envío concurrente (misma y distinta clave); postest bloqueado; aislamiento de evidencia y de entregas entre cursos | **57/57** |
| Playwright (`e2e/`) | Seis misiones; inicio, borrador, recarga, envío y confirmación; revocación antes de enviar; lectura docente de pendientes; aislamiento de curso; teclado y 320 px | **25/25** |
| Unitarias (`tests/`) | Sin cambios (navegación, separación de paneles, estados) | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

**Separación conservada:** «Mi recorrido» mantiene XP/insignias/nivel y **no** muestra indicadores; «Mis aprendizajes» muestra indicadores y **no** XP. El XP **no** se otorga en I2a (solo al validar en I2b).

**Capturas:** `docs/capturas/11-mision-entrega.png`.

---

## 5. CI

- `.github/workflows/ci.yml` — trabajos `calidad` y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado confirmado:** ejecución **`36360744874`** (commit `a8f4d4e`): **success** (2 m 21 s), con 57 pruebas de emulador y 25 de navegador en verde.

---

## 6. Límites conocidos

1. **Sin valoración ni XP**: la revisión docente de I2a es **solo lectura**; validar indicadores y otorgar XP llega en I2b.
2. **Borrador solo local**: si el estudiante cambia de dispositivo o borra datos, el borrador se pierde; no hay sincronización de borradores.
3. **Sin subida de archivos**: la entrega es **solo texto**; `reserveUpload`/Storage siguen **deshabilitados en la interfaz** (I2c).
4. **Una misión funcional**: solo la misión 2; las demás se muestran pero su detalle es informativo.
5. **Nueva versión tras enviar**: requiere que el docente **reabra** el hito (flujo de reintento completo en I2b).
6. **Revalidación**: al volver a foco y antes de enviar; el refresco periódico/por acción no esencial no está automatizado.
7. **Entrega equivalente**: backend listo y probado, **interfaz pendiente** (I2b).
8. **Accesibilidad**: automatizada (axe, contraste medido, 320 px, teclado) — **no** sustituye revisión manual WCAG 2.2 AA.

---

## 7. Pendientes para el siguiente paso (I2b)

1. **Revisión docente** con valoración por indicador, «pedir ajuste», reintento y **XP idempotente**.
2. **Interfaz de registro equivalente** (papel/audio/maqueta) con el mismo XP.
3. **App Check exigido**, **secretos administrados** y **proveedor docente institucional**.
4. **Retención/consentimiento**, residencia y responsables; **costos/cuotas**.
5. **Verificación manual de accesibilidad** con lector de pantalla y estudiantes.

> La carpeta externa `data/` con credenciales Firebase Admin **no se usó, importó ni versionó**; solo emuladores y datos sintéticos.
