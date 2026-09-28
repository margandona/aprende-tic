# RED-TIC — I2e · Indicadores observados, consignas y plantillas

> **Alcance:** aclarar qué indicadores **observa cada hito** frente a los **priorizados** en Fase 6, revisar las **consignas** de las seis misiones y registrar las **plantillas mínimas accesibles**. **No** se convierte «no evaluado» en 0. XP = avance narrativo; competencia = escala cualitativa aparte.

---

## 1. Priorizados (Fase 6) vs observados (hito)

| Sesión / Misión | Priorizados (Fase 6) | Observados en el hito | Priorizados **no** observados aquí |
|---|---|---|---|
| S1 · M1 Abrir el mapa | D1, D4, D5, E1 | **D1, E1** | D4, D5 (se observan en M4/M5) |
| S2 · M2 Escuchar la señal | E1, D1, D4 | **D1** | E1 (en M1), D4 (tarea de seguridad, M4) |
| S3 · M3 Elegir una ruta | E2, E3, D2 | **E2, E3** | D2 (coedición, fuera de la app individual) |
| S4 · M4 Construir el puente | D2, D3, D4, E3 | **D3, D4** | D2 (coedición), E3 (plan, en M3) |
| S5 · M5 Probar el puente | D3, D5, E4 | **D3, D5, E4** | — |
| S6 · M6 Compartir la ruta | D1, D4, D5, E5 | **D1, E5** | D4, D5 (observados antes) |

**Regla:** un indicador priorizado que el hito no observa queda **«No evaluado»** (estado neutro), **nunca** como valoración baja ni 0. Se observa en la actividad complementaria o durante el proyecto. **D2 (coedición)** no se califica en esta aplicación individual (nota de Fase 5).

---

## 2. Contratos de evidencia por bloque

| Hito | XP | Contrato |
|---|---:|---|
| M1 Pregunta abierta | 20 | Se acredita con **diagnóstico entregado** (intento `submitted`) **o barrera técnica registrada** (`technicalIssue`) **y** la pregunta. El **puntaje del diagnóstico no afecta el XP**. Lo aplica el servidor (`requiresDiagnosis`). |
| M2 Ficha de necesidad | 35 | Agrupa **necesidad (20) + contraste (15)**. El bloque exige **evidencia de ambas** (lista `evidenceChecklist`); el docente verifica antes de acreditar. |
| M3 Alternativas y plan | 20 | Comparar ≥2 alternativas, elegir con razón, propuesta de valor y plan con responsables. |
| M4 Prototipo v1 | 20 | Versión mínima usable, lenguaje claro y sin datos sensibles. |
| M5 Prueba y v2 | 45 | Agrupa **probar (20) + revisar v2 (25)**. Exige **evidencia de ambas** (observación + cambio documentado). |
| M6 Presentación y reflexión | 20 | Problema, evidencia, solución, prueba, límite y reflexión. |
| **Total** | **160** | Máximo base por estudiante. |

**Contribución individual (equipos):** el XP por integrante exige una **contribución propia registrada** (`deliveries/{id}/contributors/{enrollmentId}`), con **vía docente equivalente**. Sin constancia, no se otorga XP a ese integrante (lo aplica `validateMilestone`).

---

## 3. Revisión de consignas (Fase 6)

| Misión | Consigna (texto del hito) |
|---|---|
| M1 | «Escribe una pregunta abierta que le harías a un posible usuario; separa lo que sabes de lo que supones. El hito se acredita con el diagnóstico entregado (o una barrera técnica registrada) y la pregunta; el puntaje del diagnóstico no afecta el XP.» |
| M2 | «Formula la necesidad y contrasta dos fuentes. El bloque de 35 XP (necesidad 20 + contraste 15) se acredita con evidencia de ambas acciones.» |
| M3 | «Compara al menos dos alternativas (utilidad, accesibilidad, recursos), elige una con una razón, escribe la propuesta de valor y un plan mínimo con responsables.» |
| M4 | «Produce una versión mínima (guía, tutorial o microtaller) que otra persona pueda intentar usar: lenguaje claro, pasos visibles y sin datos sensibles.» |
| M5 | «Observa a alguien usando el prototipo, registra un hallazgo (observación, no inferencia) y modifica la versión 2 explicando el cambio y su efecto.» |
| M6 | «Presenta problema, evidencia, solución, prueba y límite; reflexiona qué mejorarías y qué evidencia sostiene la utilidad.» |

**Revisión:** consignas **breves, con una acción por paso**, sin datos sensibles y con **modalidad declarada** por hito. Se conserva la separación entre proceso (evidencia) y competencia (indicador).

---

## 4. Plantillas mínimas accesibles

En `/estudiante/plantillas` (ruta `estudiante-plantillas`, enlace desde el detalle de misión y desde la plantilla de papel):

- **M1** Pregunta abierta (persona, lo que sé, lo que supongo, mi pregunta).
- **M2** Ficha de necesidad (destinatario, tarea, obstáculo, evidencia) + fichas de Fuente A/B y afirmación por verificar.
- **M3** Matriz de alternativas (utilidad, facilidad, accesibilidad, recursos) + propuesta de valor + plan.
- **M4** Guion del prototipo (3 pasos + camino de ayuda) + lista de comprobación.
- **M5** Hoja de observación + cambio en la v2 y su efecto.
- **M6** Presentación (problema/evidencia/solución/prueba/límite) + reflexión.

**Accesibilidad:** encabezados por misión, texto claro, campos con borde punteado, tabla con encabezados, botón **«Imprimir plantillas»** y estilos `@media print`. **No** se declara conformidad WCAG; falta revisión manual con lector de pantalla.
