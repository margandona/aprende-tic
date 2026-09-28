# RED-TIC — I2c · Correcciones de transición y archivos en la misión 2 (solo emuladores)

**Estado:** cerradas las dos transiciones pendientes de I2b (**reapertura segura** y regla de **«no evaluado»**) e **integrada la subida de archivos** en la misión 2 (`reserveUpload` + Firebase Storage + `submitEvidence` con verificación del objeto real), con progreso, errores, reintento y confirmación. Solo **Firebase Emulator Suite** y datos 100 % sintéticos. **Sin despliegue ni datos reales.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` Fase 10 (I2b) y plan de I2c; continúa `docs/I2b-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 72 pruebas de emulador (Vitest) + 33 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Correcciones de I2b (Parte 1)

### 2.1 Reapertura segura
- Se eliminó el botón imposible «Revalidar tras ajuste» (aparecía en `achieved`, donde `validateMilestone` no admite).
- `reopenMilestone` ahora es una **transición controlada**: solo desde `pending_review` o `achieved` → `in_progress`; **rechaza** `not_started` e `in_progress`; **registra historial** (`deliveryHistory`, kind `reopen`) y una **acción** opcional para el estudiante.
- UI docente: en `achieved` aparece **«Reabrir para corrección»** (con acción concreta); en `pending_review`, **«Pedir ajuste»**. Reabrir **no reinicia el XP**.

### 2.2 Regla de «no evaluado»
**Decisión documentada:** el **XP acredita el hito (avance narrativo)**, no la competencia. Validar con **todos los indicadores en `not_evaluated`** es **posible**: el hito pasa a `achieved` y se otorga XP, pero la **competencia observada queda «No evaluado»**, nunca 0 ni «incipiente».
- Servidor: `validateMilestone` marca `competenceObserved: false` cuando ningún indicador se observó (`true` si hay al menos uno).
- Interfaz: la vista docente avisa antes de validar («Todos los indicadores están «No evaluado»… el hito se acredita como avance narrativo»); «Mis aprendizajes» muestra «No evaluado» con estilo neutro, distinto de una valoración baja.
- **Separación mantenida:** XP narrativo (Mi recorrido) vs competencia observada (Mis aprendizajes).

---

## 3. Subida de archivos en la misión 2 (Parte 2)

| Pieza | Cambio |
|---|---|
| `src/views/MissionDetailView.vue` | Selector **Texto / Archivo**. En archivo: `accept`, **límites de tipo y tamaño (5 MB)**, validación en cliente, **progreso** (`<progress role="status">`), errores (`role="alert"`), **reintento** y **confirmación**. |
| `src/data/firebaseRepository.ts` | `reserveUpload`, `uploadEvidenceFile` (`uploadBytesResumable` con progreso), `submitFileEvidence`, `evidenceDownloadUrl`, `cleanupExpiredUploads`. |
| `functions/src/deliveries.ts` | `cleanupExpiredUploads` (limpia reservas caducadas sin evidencia y borra el objeto huérfano). |
| `storage.rules` | Ya exigían **reserva** (curso/matrícula/entrega/nombre/MIME/tamaño) + **vínculo activo** + estado abierto. |

**Flujo:** reserva con **caducidad** y **ruta ligada a curso/matrícula/entrega** → subida a Storage con progreso → `submitEvidence` **verifica el objeto real** (existencia, MIME y tamaño contra la reserva) y **consume** la reserva → **confirmación** con la **fecha del servidor**. Idempotencia por `submitKey`: un reintento no duplica evidencia ni XP; versiones conservadas.

**Huérfanos:** las reglas solo permiten crear objetos **con reserva**; las reservas caducadas sin evidencia se limpian con `cleanupExpiredUploads` (docente del curso), que borra el objeto y marca la reserva `expired`. En producción se añadiría **Cloud Scheduler**. Documentado en `docs/I2c-COSTOS-Y-RETENCION.md`.

**Entrega textual y equivalencia en papel** siguen disponibles con **el mismo criterio de acreditación** (mismo XP al validar).

---

## 4. Pruebas

| Suite | Alcance nuevo | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Reapertura segura (rechaza estados improcedentes; `achieved → in_progress` con historial; reintento sin duplicar XP); regla `not_evaluated` (`competenceObserved` false/true); **MIME falsificado** rechazado; **limpieza de reservas/objetos huérfanos**; Storage Rules (MIME, tamaño, nombre, reserva vencida/consumida, curso/matrícula ajenos, entrega cerrada, vínculo revocado, lectura docente); carrera de dos envíos e idempotencia | **72/72** |
| Playwright (`e2e/`) | Subida de archivo (tipo inválido, archivo válido, confirmación con fecha del servidor, 320 px); **vínculo revocado antes de subir**; el docente ve y abre el archivo; reapertura para corrección; aviso de «no evaluado»; paneles separados; teclado | **33/33** |
| Unitarias (`tests/`) | Sin cambios | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

**Casos adversariales cubiertos:** archivo propio/ajeno, docente de otro curso, vínculo revocado, MIME/tamaño incorrectos, reserva vencida/consumida, entrega cerrada, dos envíos concurrentes y reintentos.

**Capturas:** `docs/capturas/15-archivo-entrega.png` (y `12`–`14` de I2b).

---

## 5. Accesibilidad (revisión manual básica) — **sin declarar WCAG**

- **Automatizado:** axe-core en pantallas base, **contraste medido** (razón WCAG calculada), reflow a **320 px**, navegación por **teclado** y **foco visible**.
- **Semántica del flujo de archivo (inspección + prueba):** grupo «Formato de entrega» con **leyenda**, campo de archivo **etiquetado** (`getByLabel`), errores con `role="alert"`, progreso con `role="status"`/`aria-live`, confirmación con `role="status"`.
- **Sin verificar:** prueba con **lector de pantalla real** (NVDA/VoiceOver/Narrator) y con **estudiantes**; **no** se declara cumplimiento WCAG 2.2 AA.

---

## 6. Costos y retención

Propuesta en `docs/I2c-COSTOS-Y-RETENCION.md`: cuotas por archivo/tipo, limpieza de reservas y objetos, y **retención sugerida** (evidencias y valoraciones: curso activo + 1 año escolar; luego borrado/anonimización bajo custodia institucional). **Pendiente de decisión institucional.**

---

## 7. CI

- `.github/workflows/ci.yml` — trabajos `calidad` y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado confirmado:** ejecución **`36364684273`** (commit `a86c2b8`): **success** (2 m 42 s), con 72 pruebas de emulador y 33 de navegador en verde.

---

## 8. Límites conocidos

1. **Una misión funcional** (la 2); las otras cinco siguen informativas.
2. **Sin analítica de cuotas** en la interfaz; la limpieza de huérfanos es manual/callable (falta programador).
3. **Borradores** solo locales (sin sincronización entre dispositivos).
4. **App Check**, **secretos administrados**, **proveedor docente institucional** y **gobernanza de datos**: pendientes.
5. **Accesibilidad manual** (lector de pantalla, usuarios) **sin verificar**; no se declara WCAG.
6. La **Fase 10 no se cierra**: faltan las demás misiones y las decisiones institucionales previas al piloto.

---

## 9. Confirmación de alcance

- **No hubo despliegue**: todo se ejecutó contra **Firebase Emulator Suite** (`demo-red-tic`).
- **No se usaron datos ni credenciales reales**: la carpeta externa `data/` **no se usó, importó ni versionó**.
- La **subida de archivos** quedó **habilitada solo en la misión 2** con reserva y verificación; el resto del MVP no expone cargas.
- **No** se declara cumplimiento WCAG ni se cierra la Fase 10.
