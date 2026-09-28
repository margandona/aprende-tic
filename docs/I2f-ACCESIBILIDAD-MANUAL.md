# RED-TIC — Protocolo de verificación manual de accesibilidad (pendiente)

> **No se ejecutó con lector de pantalla real en este entorno** (no hay NVDA/VoiceOver/Narrator disponibles). Este documento deja un **protocolo reproducible** y el **criterio pendiente**. Las pruebas automatizadas (axe, contraste medido, 320 px, teclado) **no** sustituyen esta verificación ni declaran WCAG 2.2 AA.

---

## 1. Entorno y preparación

- Navegador: Chrome/Edge (Windows) con **NVDA**; o Safari + **VoiceOver** (macOS); o **Narrator** (Windows).
- App en emuladores: `npm run emu:start` → `http://localhost:4173`.
- Datos sintéticos: `ZORRO-01`/`PUMA-02` (estudiantes), `DOCENTE-01` (docente).
- Grabar audio/video y anotar hallazgos con severidad (bloqueante / importante / menor).

## 2. Recorridos a revisar (uno por uno)

| # | Flujo | Qué comprobar con el lector |
|---|---|---|
| 1 | **Acceso** (`/#/acceso`) | Se anuncian título y campos; el botón «Entrar» tiene nombre; el error de código se anuncia (`role=alert`). |
| 2 | **Diagnóstico** (`/#/estudiante/diagnostico`) | Encabezados por sección; caso y fuentes legibles; A1 (casillas) y A5 (tres selects) etiquetados; «prefiero no responder»; estado de respuesta y apoyos comprensibles. |
| 3 | **Entrega** (`/#/estudiante/misiones/mission-2`) | Consigna y plantilla anunciadas; selección Texto/Archivo; en archivo, límites y errores anunciados; progreso (`role=status`) y confirmación. |
| 4 | **Revisión docente** (`/#/docente/revision/:id`) | Evidencia y versiones; confirmación de evidencia mínima por ítem; valoración por indicador; «Pedir ajuste»/«Reabrir»; avisos (`role=status`/`role=alert`). |

## 3. Criterios por flujo

- Orden de foco lógico; sin trampas de foco.
- Todo control operable con teclado; **foco visible** (contorno ≥ 2 px).
- Nombres accesibles en enlaces, botones, campos y grupos (`fieldset`/`legend`).
- Mensajes de estado y error anunciados sin mover el foco de forma inesperada.
- Contraste de texto ≥ 4.5:1 (normal) y ≥ 3:1 (grande), ya medido automáticamente; **confirmar visualmente** con alto contraste.
- Reflow a 320 px sin scroll horizontal (ya probado automáticamente).

## 4. Resultado esperado

Registrar por flujo: **aprobado**, **hallazgo** (con captura y pasos) o **bloqueante**. Cualquier bloqueante impide el piloto.

## 5. Estado

- **Automatizado y en verde:** axe-core (pantallas base), contraste medido, 320 px, teclado/foco, semántica del flujo de archivo.
- **Pendiente:** prueba con lector de pantalla (este protocolo) y **prueba con estudiantes**. **No** se declara cumplimiento WCAG.
