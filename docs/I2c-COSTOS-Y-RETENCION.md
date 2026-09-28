# RED-TIC — Costos/cuotas y retención propuesta (decisión institucional)

> **Estado:** propuesta para **decisión institucional**. No hay despliegue ni datos reales; las cifras son **estimaciones de orden de magnitud** para Firebase (plan Blaze) y deben confirmarse con el uso real. **No** constituyen un compromiso de costo.

---

## 1. Supuestos

- 1 cohorte = **30 estudiantes**, 6 misiones, **1 evidencia vigente + 1 versión de reintento** por hito (~12 objetos por estudiante).
- Evidencia **≤ 5 MB** (límite vigente); la mayoría son **texto** (decenas de KB) o **PDF/imagen** livianos.
- Diagnóstico y misiones generan lecturas/escrituras acotadas; no hay analítica en tiempo real ni video.
- Uso en aula (no 24/7) durante ~9 sesiones.

## 2. Estimación por servicio (plan Blaze)

| Servicio | Cuota gratuita | Estimación por cohorte | Nota |
|---|---|---|---|
| **Auth** | Anónimo/custom: sin costo | ~0 | Proveedor institucional futuro podría añadir costo de identidad |
| **Cloud Functions** | 2 M invocaciones/mes | < 5.000 invocaciones | Muy por debajo de la cuota |
| **Firestore** | 50 k lecturas y 20 k escrituras/día | Dentro de cuota en uso de aula | Vigilar lecturas del panel docente (consultas por curso) |
| **Storage** | 5 GB y 1 GB/día de descarga | **~0,3–1,2 GB** (texto bajo; archivos suben el total) | La subida de archivos es lo que más crece |
| **Hosting** | 10 GB/mes | < 1 GB | Estático |
| **App Check** | — | Requerido en producción | Sin costo directo |

**Escenario de peor caso** (todos suben archivos de 5 MB en cada hito, 2 versiones): ~1,8 GB por cohorte. Con varias cohortes/año, conviene definir **cuotas** (ver §3).

## 3. Cuotas y controles propuestos

- **Tamaño por archivo:** 5 MB (ya aplicado en reglas y Functions).
- **Tipos:** texto, PDF, PNG, JPG, DOCX (ya aplicado).
- **Objetos por hito:** 1 vigente + reintentos; **reabrir no duplica** el XP.
- **Reservas caducables** (30 min) y **limpieza** de objetos huérfanos (`cleanupExpiredUploads`), más un programador (Cloud Scheduler) en producción.
- **Aviso de costo** al docente antes de habilitar subidas masivas si se acercan las cuotas.

## 4. Retención propuesta (para decidir)

| Dato | Retención propuesta | Responsable |
|---|---|---|
| Evidencias (Storage) | Mientras el curso esté activo + **1 año escolar**; luego eliminar objetos | Institución |
| Valoraciones/XP/historial (Firestore) | Igual periodo; luego **anonimizar** | Institución |
| Encuesta de condiciones | Periodo mínimo necesario; no se muestra a compañeros | Institución |
| Clave de correspondencia código↔estudiante | **Custodia institucional**, fuera de la plataforma | Institución |
| Reservas caducadas | Se **eliminan** al limpiar | Sistema |
| Borradores locales | Se **borran** al cerrar sesión / cambiar de estudiante | Sistema (dispositivo) |

**Principios:** minimización (guardar solo lo necesario), separación (XP narrativo vs competencia observada), y **borrado verificable** al vencer la retención. El **consentimiento informado** y la **residencia de datos** deben definirse con la institución antes de un piloto.

## 5. Decisiones pendientes

1. Periodo exacto de retención y responsable del borrado.
2. ¿Se permiten archivos de estudiantes o solo texto? (impacta costo y privacidad).
3. Presupuesto mensual máximo y alertas de cuota.
4. Proveedor de identidad institucional (docentes) y su costo.
5. Política de exportación/eliminación a solicitud (derecho de las personas).
