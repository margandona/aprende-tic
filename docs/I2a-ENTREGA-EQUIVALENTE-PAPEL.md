# RED-TIC — Entrega equivalente en papel/audio (procedimiento)

> **Estado:** **implementado en I2b**. Backend (`registerEquivalentEvidence` + `validateMilestone`, probados en emuladores) e **interfaz docente** (`/docente/equivalencia` → P-D-04) más **plantilla imprimible** (`/docente/plantilla`).
> **Regla de oro:** la equivalencia otorga **el mismo XP** y el mismo estado `logrado` que la entrega digital, **en dos pasos**: registrar (`pending_review`) y luego valorar/validar. **No** hay recompensas separadas por formato.

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

**Paso 1 — Registrar (no acredita todavía).**

1. En `/docente/equivalencia`, elige **estudiante** e **hito** (funciona **aunque no exista entrega digital**).
2. Elige el **soporte** (§2) y la **modalidad de prueba** (simulación / real autorizada).
3. Describe la evidencia en texto breve (no se exige foto).
4. Marca los **apoyos** (lectura guiada, más tiempo, dictado, material adaptado, dispositivo compartido, otro), **por separado** de la valoración.
5. Guarda → la entrega queda **`pending_review`** (por revisar). **No** se otorga XP en este paso.

**Paso 2 — Valorar y validar (acredita).**

6. Abre la entrega en la bandeja de revisión; valora **todos los indicadores** del hito (incipiente / en desarrollo / logrado / transferible o **«no evaluado»**, que no es una valoración baja), con **comentario, fortaleza observada y siguiente paso**.
7. Pulsa **«Validar hito»** → la entrega pasa a **`logrado`** y se otorga el **XP una sola vez** por estudiante, hito y versión del programa. El estudiante ve la retroalimentación en «Mis aprendizajes» y el XP en «Mi recorrido».

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

## 6. Estado de implementación (I2b)

1. **Interfaz docente** `/docente/equivalencia` (P-D-04) con estudiante + hito, soporte, modalidad, descripción y apoyos. ✔
2. **Apoyos** registrados por separado de la valoración (campo `supports` en la evidencia). ✔
3. **Prueba de navegador** del flujo completo (docente de otro curso no registra ni valida) y teclado/móvil. ✔
4. **Plantilla imprimible** en `/docente/plantilla` (O5 de Fase 8). ✔
5. **Retención/consentimiento** de la evidencia equivalente según política institucional — **pendiente** (I2c/gobernanza).

## 7. Datos de prueba (emuladores, sintéticos)

- Docente **`DOCENTE-01`** (curso de Zorro-01/Puma-02) y **`DOCENTE-02`** (otro curso).
- Estudiante **`TIGRE-08`** (`enr-s8`, sin entrega previa) sirve para probar el registro equivalente desde cero.
- Estudiante **`LOBO-07`** (`enr-s7`) tiene una entrega individual **por revisar** para valorar y validar.
- Estudiante **`MONO-09`** (`enr-s9`) tiene un **ajuste pedido** para probar el reintento.
- Estudiante **`CONDOR-03`** pertenece a otro curso: el docente del curso X **no** puede registrar ni validar su equivalencia.
