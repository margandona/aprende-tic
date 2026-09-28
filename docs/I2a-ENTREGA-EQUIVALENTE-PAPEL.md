# RED-TIC — Entrega equivalente en papel/audio (procedimiento para I2b)

> **Estado:** procedimiento **documentado** y **backend ya disponible** (`registerEquivalentEvidence` + `validateMilestone`, probados en emuladores). **Falta la interfaz docente** (P-D-04) y su prueba de navegador; se implementará en **I2b**.
> **Regla de oro:** la equivalencia otorga **el mismo XP** y el mismo estado `logrado` que la entrega digital. **No** hay recompensas separadas por formato.

---

## 1. Para qué sirve

Un estudiante sin conexión, sin dispositivo personal o que trabajó en papel/audio/maqueta no puede subir un archivo. La plataforma **no bloquea el aprendizaje** por eso: el docente registra la entrega equivalente y el hito se acredita igual.

## 2. Soportes admitidos

| Soporte | `format` | Ejemplo |
|---|---|---|
| Papel | `paper` | Ficha escrita, hoja de observación |
| Audio local | `audio_local` | Grabación en el dispositivo del docente |
| Maqueta | `model` | Prototipo físico |
| Dictado | `dictation` | El docente transcribe lo que el estudiante explica |
| Adaptación autorizada | `adaptation` | Formato acordado con el equipo de apoyo |

`testModality` registra si fue **simulación** o **prueba real autorizada**; no cambia el XP.

## 3. Procedimiento del docente (P-D-04)

1. En la ficha del estudiante y el hito, pulsa **«Registrar entrega equivalente»**.
2. Elige el **soporte** (§2).
3. Describe la evidencia en texto breve (y, si corresponde, adjunta una nota; **no** se exige foto).
4. Marca el **indicador** (D/E) y el **nivel** cualitativo (incipiente / en desarrollo / logrado / transferible).
5. Deja un **comentario** (fortaleza + siguiente paso) para el estudiante.
6. Guarda → la entrega pasa a `logrado`, se otorga el XP **una sola vez** y el estudiante ve la retroalimentación en «Mis aprendizajes».

## 4. Reglas de corrección y seguridad

- **Idempotencia:** se usa una `submitKey`; reenviar el mismo registro no duplica evidencia ni XP.
- **Una sola acreditación por hito y versión de programa** (igual que la entrega digital).
- Si la entrega ya está `achieved`, el registro se rechaza; si el docente **reabre** el hito, puede registrarse una nueva versión.
- La evidencia equivalente queda con `origin = 'teacher_equivalent'` y `createdBy = uid` del docente; se registra en `auditLogs`.
- **Autorización:** solo un **docente activo del curso** de la matrícula puede registrar; el hito debe pertenecer al programa del curso.
- **Privacidad:** no se suben contraseñas, ClaveÚnica ni datos personales; el texto breve describe la evidencia, no expone datos sensibles.

## 5. Backend ya implementado (probado en emuladores)

```ts
// functions/src/deliveries.ts
registerEquivalentEvidence({ enrollmentId, milestoneId, format, description, testModality, submitKey })
// → crea/reutiliza deliveries/{enrollmentId}_{milestoneId}, evidencia origin 'teacher_equivalent', estado pending_review
```

- `milestoneInCourse` valida pertenencia al programa; `assertTeacherOfCourse` valida el rol.
- La valoración y el XP se completan con `validateMilestone` (indicador + nivel), que ya es **idempotente por (matrícula, hito, versión de programa)**.
- Pruebas existentes: `tests-emu/functions.spec.ts` («registro docente de evidencia equivalente sin entrega previa») y `tests-emu/concurrency.spec.ts`.

## 6. Lo que falta para I2b

1. **Interfaz docente** en `/docente/revision/:entrega/equivalencia` (P-D-04) con los campos del §3.
2. **Registrar el apoyo** (lectura, tiempo, dictado) como dato separado del puntaje.
3. **Prueba de navegador** del flujo completo (docente de otro curso no puede registrar) y de teclado/móvil.
4. **Plantilla descargable** de instrucciones para la ruta papel (O5 de Fase 8).
5. **Retención/consentimiento** de la evidencia equivalente según política institucional.

## 7. Datos de prueba (emuladores, sintéticos)

- Docente **`DOCENTE-01`** (curso de Zorro-01/Puma-02) y **`DOCENTE-02`** (otro curso).
- Estudiante **`PUDU-04`** (sin entrega previa) sirve para probar el registro equivalente desde cero.
- Estudiante **`CONDOR-03`** pertenece a otro curso: el docente del curso X **no** puede registrar su equivalencia.
