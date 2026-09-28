# RED-TIC — Matriz de salida de Fase 10

> **Estado global:** el MVP funciona **solo en Firebase Emulator Suite** con datos sintéticos. La Fase 10 **no se cierra**: quedan **decisiones institucionales** y **verificación manual** antes de un piloto. Estados: **Verificado (emulador)**, **Parcial**, **Pendiente (institución)**.

| Criterio | Evidencia de prueba | Estado |
|---|---|---|
| **Diagnóstico** (A1–A6, T1–T5, «no evaluado», barrera técnica, envío inmutable, postest bloqueado) | `functions.spec` (encuesta v2, transiciones, revisión, historial), `diagnostico.spec`, `rules.spec` | Verificado (emulador) |
| **Seis misiones** (consigna, evidencia, modalidades, hito, XP) | `misiones.spec`, `mision.spec`, `functions.spec` (XP 160), seed de 6 misiones/hitos | Verificado (emulador) |
| **Evidencia mínima M2/M5** (confirmación docente por ítem, ligada a versión) | `functions.spec` (I2f), `revision.spec` | Verificado (emulador) |
| **Valoración** (por indicador e integrante, fortaleza/siguiente paso, corrección con historial, «no evaluado» ≠ 0) | `functions.spec`, `rules.spec`, `revision.spec` | Verificado (emulador) |
| **Equivalencia** (papel/audio/maqueta/dictado/adaptación, mismo XP) | `functions.spec`, `revision.spec`, `misiones.spec`, `I2a-ENTREGA-EQUIVALENTE-PAPEL.md` | Verificado (emulador) |
| **Aportes de equipo** (contribución propia/docente, ligada a versión, inmutable tras XP) | `functions.spec` (I2e/I2f) | Verificado (emulador) |
| **XP** (idempotente, 160, narrativo vs competencia) | `functions.spec`, `concurrency.spec` | Verificado (emulador) |
| **Roles y permisos** (estudiante/docente, curso ajeno, docente inactivo, vínculo revocado) | `rules.spec`, `functions.spec`, `firebase.spec` | Verificado (emulador) |
| **Storage** (reserva con caducidad, MIME/tamaño, estado abierto, limpieza de huérfanos, descarga autorizada) | `rules.spec` (Storage), `functions.spec`, `archivos.spec` | Verificado (emulador) |
| **Privacidad** (sin datos sensibles en evidencia, borradores locales con borrado, descarga por reglas, no compartir enlaces) | `archivos.spec`, `mision.spec`, `I2c/I2e` | Parcial (falta política de retención institucional) |
| **Accesibilidad** (axe, contraste medido, 320 px, teclado, foco, semántica) | `a11y.spec`, `layout.spec`, `misiones.spec` | Parcial (**falta verificación manual con lector de pantalla y con estudiantes**) |
| **Contenido** (consignas, plantillas, indicadores observados) | `I2e-INDICADORES-Y-PLANTILLAS.md`, `/estudiante/plantillas` | Parcial (falta revisión pedagógica del texto) |
| **Operación** (CI verde, emuladores, costos, limpieza) | `.github/workflows/ci.yml`, `I2c-COSTOS-Y-RETENCION.md`, `I2f-PREPARACION-PILOTO.md` | Parcial (limpieza programada y presupuesto: decisión institucional) |

## Puertas antes del piloto (no verificadas)

1. **App Check exigido** y **secreto administrado** (`CODE_PEPPER`) en el proyecto real.
2. **Identidad docente institucional** (hoy simulada con token de demostración).
3. **Alojamiento, residencia, consentimiento, retención/exportación/borrado** y responsables.
4. **Presupuesto y alertas** de cuota.
5. **Limpieza programada** de reservas/objetos huérfanos.
6. **Verificación manual WCAG 2.2 AA** (lector de pantalla y usuarios) y **revisión pedagógica** del contenido.

> Ninguna fila «Parcial» o «Pendiente» se declara superada. La Fase 10 permanece **abierta**.
