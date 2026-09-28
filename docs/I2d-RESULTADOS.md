# RED-TIC — I2d · Seis misiones funcionales y robustez de archivos (solo emuladores)

**Estado:** las **seis misiones** (1, 3, 4, 5 y 6 además de la 2) son **recorridos funcionales** de contenido, entrega, revisión y progreso, reutilizando componentes, reglas y Functions de la misión 2. Incluye las **correcciones de robustez de archivos** pedidas. Solo **Firebase Emulator Suite** y datos 100 % sintéticos. **Sin despliegue ni datos reales.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` Fases 6 y 7 y revisión de I2c; continúa `docs/I2c-RESULTADOS.md`.

---

## 1. Comandos

```bash
npm ci
npm --prefix functions ci
npm run emu:test        # 75 pruebas de emulador (Vitest) + 38 de navegador (Playwright)
npm run emu:start       # emuladores + app en modo interactivo
```

---

## 2. Correcciones de robustez de archivos (Parte 0)

| Punto | Cambio |
|---|---|
| **Objeto inexistente ≠ fallo transitorio** | `cleanupExpiredUploads` usa `exists()` → `delete()` → **re-confirma** que el objeto ya no existe antes de marcar `expired`. Ante un error transitorio deja la reserva en `reserved` (con contador `pending`) para **reintentar** en la próxima ejecución. |
| **Bucket desde la configuración efectiva** | Se usa `getStorage().bucket()` (config de Admin), sin asumir el sufijo `.appspot.com`, tanto en `submitEvidence` (verificación del objeto) como en la limpieza. |
| **Reintento del mismo `submitKey` con otra reserva** | La interfaz **reutiliza la reserva** vigente y no vuelve a subir el archivo ya subido. En el servidor, si el `submitKey` ya existe y llega una reserva redundante, se **borra su objeto** y se marca `consumed`: no queda huérfano y no se muestra error. |
| **Alcance de los enlaces de descarga** | `evidenceDownloadUrl` usa `getDownloadURL`, que devuelve una **URL con token de larga duración** que **no vuelve a validarse con las reglas** en cada acceso: compartir el enlace otorga acceso. **Documentado**; antes del piloto se recomienda una **descarga autorizada y caducable** (ver §7). |

Pruebas: reintento con reserva redundante (sin huérfano, sin error, una sola evidencia), limpieza con objeto inexistente, limpieza idempotente (segunda ejecución `removed: 0`) y confirmación tras borrado.

---

## 3. Las seis misiones (Parte I2d)

Cada misión es un recorrido funcional con **consigna, evidencia, indicadores, hito, XP y modalidades** tomados de las Fases 6 y 7. El **XP representa avance narrativo**, nunca nota ni competencia.

| # | Misión | Consigna (evidencia) | Indicadores | Hito | XP | Modalidades |
|---|---|---|---|---:|---|---|
| 1 | **Abrir el mapa** | Pregunta abierta a un posible usuario (diagnóstico aparte, sin XP) | D1, E1 | Pregunta abierta | 20 | texto |
| 2 | **Escuchar la señal** | Ficha de necesidad + contraste de fuentes | D1 | Ficha de necesidad | 35 | texto, archivo |
| 3 | **Elegir una ruta** | Matriz de alternativas + propuesta de valor + plan | E2, E3 | Alternativas y plan | 20 | texto, archivo |
| 4 | **Construir el primer puente** | Prototipo v1 (guía, tutorial o microtaller) | D3, D4 | Prototipo v1 | 20 | archivo, texto |
| 5 | **Probar el puente** | Registro de prueba + versión 2 | D3, D5, E4 | Prueba y versión 2 | 45 | archivo, texto |
| 6 | **Compartir la ruta** | Presentación + reflexión | D1, E5 | Presentación y reflexión | 20 | texto, archivo |
| | | | | **Total** | **160** | |

**Mapeo a la tabla de XP de Fase 7 (8 acciones):** M1 = diagnóstico y pregunta (20); M2 = necesidad (20) + contraste (15); M3 = alternativas y plan (20); M4 = prototipo v1 (20); M5 = probar (20) + revisar v2 (25); M6 = presentar y reflexionar (20). Suma **160** (máximo base). El hito de cada misión agrupa sus acciones; se acredita **una vez** por estudiante.

**Reutilización:** `MissionDetailView` (texto/archivo, borrador, idempotencia, versiones, ajuste), `TeacherDeliveryReviewView` (valoración por indicador e integrante, ajuste/reabrir, corrección, XP), `registerEquivalentEvidence` (equivalencia), `validateMilestone` (XP idempotente). No se inventaron indicadores: se sembraron **los 10 indicadores D1–D5/E1–E5** de Fase 9.

**Modalidades por misión:** el hito declara `modalities`; la interfaz muestra solo las admitidas (M1 solo texto; M4/M5 archivo o texto; etc.). La **equivalencia en papel/audio/maqueta** sigue disponible para **cualquier** hito.

**Valoración individual en equipos, versiones, ajustes, retroalimentación e idempotencia:** se conservan del flujo de la misión 2 (por integrante, con historial y sin duplicar XP).

---

## 4. Pruebas

| Suite | Alcance nuevo | Resultado |
|---|---|---|
| Vitest emuladores (`tests-emu/`) | Recorrido de las seis misiones con **suma de 160 XP**; robustez de limpieza (objeto inexistente, idempotencia); reintento con reserva redundante sin huérfano; MIME/tamaño/curso/estado; concurrencia; aislamiento | **75/75** |
| Playwright (`e2e/`) | Seis misiones visibles y abribles **sin bloqueo por puntos**; modalidades por misión; misión 4 (archivo) con validación docente y XP; **equivalencia** para otra misión; teclado y 320 px | **38/38** |
| Unitarias (`tests/`) | Sin cambios | **18/18** |
| Calidad | `lint`, `typecheck`, `build` | ok |

**Captura:** `docs/capturas/16-misiones-completas.png`.

---

## 5. CI

- `.github/workflows/ci.yml` — trabajos `calidad` y **`emuladores`** (Java 21 + Chromium + `npm run emu:test`).
- **Estado confirmado:** ejecución **`36366217472`** (commit `d124189`): **success** (2 m 22 s), con 75 pruebas de emulador y 38 de navegador en verde.

---

## 6. Brechas y límites conocidos

1. **Contenido de misión mínimo:** consigna, evidencia e indicadores están definidos; falta **revisión pedagógica** del texto de cada misión y **materiales** (plantillas por misión).
2. **Una entrega por hito:** las acciones de Fase 7 se agrupan en un hito por misión (M2 y M5 agrupan dos acciones); si se requiere granularidad por acción, se separarían los hitos.
3. **Trabajo en equipo:** la valoración por integrante existe; la **contribución individual** aún no se captura en la entrega del estudiante (se registra en el flujo docente).
4. **Enlaces de descarga** con token de larga duración (ver §2/§7).
5. **Sin sincronización de borradores** entre dispositivos; limpieza de huérfanos sin programador automático.
6. **App Check, secretos, proveedor docente institucional y gobernanza de datos**: pendientes.
7. **Accesibilidad manual** (lector de pantalla, usuarios) **sin verificar**; **no** se declara WCAG.

---

## 7. Decisión pendiente: descarga autorizada

`getDownloadURL` entrega una URL con token que **evita las reglas** en cada acceso. Antes del piloto se propone una **descarga autorizada** (p. ej., `getBlob`/URL firmada con caducidad corta emitida por una Function que valide vínculo/curso), y **no** presentar el enlace como protegido. Queda como decisión institucional/técnica.

---

## 8. Confirmación de alcance

- **No hubo despliegue**: todo se ejecutó contra **Firebase Emulator Suite** (`demo-red-tic`).
- **No se usaron datos ni credenciales reales**: la carpeta externa `data/` **no se usó, importó ni versionó**.
- **No** se declara cumplimiento WCAG ni se cierra la Fase 10: faltan las **decisiones institucionales** y la **verificación manual** antes del piloto.
