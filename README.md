# RED-TIC — MVP · Incremento I1b

Esqueleto local de RED-TIC (Vue 3 + Vite + TypeScript) con **datos 100 % sintéticos**.
**Sin Supabase, sin credenciales, sin datos reales y sin despliegue público.**

Este incremento sirve para validar, antes de construir identidad y datos:

- navegación móvil por roles (estudiante y docente);
- componentes y tokens visuales accesibles;
- pantallas base: acceso, «Mi recorrido», misiones y «Mis aprendizajes observados»;
- separación estricta entre **XP/insignias** (recorrido) e **indicadores/retroalimentación** (aprendizajes);
- estados de **carga, vacío y error** demostrables con los fixtures.

## Requisitos

- Node.js 20 o superior (probado con Node 24).
- npm.

## Ejecutar

El proyecto está en la **raíz del repositorio** (no hay subcarpeta).

```bash
git clone https://github.com/margandona/aprende-tic.git
cd aprende-tic
npm install
npm run dev
# abre http://localhost:4173
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `http://localhost:4173` |
| `npm run build` | Verificación de tipos + build de producción |
| `npm run preview` | Sirve el build |
| `npm run typecheck` | Chequeo de tipos (`vue-tsc`) |
| `npm run lint` | ESLint |
| `npm test` | Pruebas unitarias/componentes (Vitest) |
| `npm run e2e:install` | Descarga el navegador de Playwright (una vez) |
| `npm run e2e` | Pruebas de 320 px, teclado, movimiento reducido y axe-core |
| `npm run emu:test` | Firebase Emulator Suite: reglas, Functions, Storage, concurrencia y diagnóstico |
| `npm run emu:start` | Emuladores en modo interactivo |

## Backend (Firebase, I0d / I1a)

- **Decisión vigente:** Firebase (Auth, Firestore, Storage, Functions, Hosting). El SQL de Supabase queda como **histórico** en `docs/archivo-supabase/` (**no ejecutar**).
- Reglas: `firestore.rules`, `storage.rules`; índices: `firestore.indexes.json`.
- Functions en `functions/`; pruebas con emuladores en `tests-emu/` (Vitest) y `e2e/` (Playwright).
- **I1a:** el frontend Vue consume Firebase contra **Emulator Suite** (Auth anónimo, canje `redeemCode` y lecturas por rol). La subida de archivos permanece **deshabilitada en la interfaz**.
- **I1b:** sesión/entorno con **fallo cerrado** y **flujo de diagnóstico** (encuesta A1–A6 + tareas T1–T5, borrador y envío inmutable) en la interfaz.
- **I1c:** instrumento completo (caso de la biblioteca, fichas A/B, mensaje simulado), encuesta múltiple/opcional, transiciones cerradas y **vista docente mínima** con revisión, puntaje nulo e historial.
- **I2a:** **misión 2 «Escuchar la señal»** funcional con entrega de **texto** (inicio, borrador local, envío idempotente, versiones, reintento y confirmación) y **lectura docente de entregas pendientes** (sin valoración ni XP). El **postest** no puede iniciarse ni enviarse; el **registro equivalente en papel** queda documentado para I2b.
- **I2b:** **revisión docente accionable** de la misión 2 (valoración por indicador, «no evaluado» separado, fortaleza/siguiente paso), **validación con XP único**, **pedir ajuste** y reintento, **entrega equivalente** (papel/audio/maqueta/dictado/adaptación) y **plantilla imprimible**.
- **I2c:** **reapertura segura** y regla de **«no evaluado»** (XP narrativo vs competencia), y **subida de archivos** en la misión 2 (`reserveUpload` + Storage + `submitEvidence` con verificación real, progreso y limpieza de huérfanos).
- **I2d:** **seis misiones funcionales** (consigna, evidencia, indicadores, hito, XP y modalidades según Fases 6–7; total 160 XP) y **robustez de archivos** (bucket efectivo, limpieza confirmada, reintento sin huérfanos).
- **I2e:** **autorización** de `submitEvidence` antes de responder, **modalidades** en Functions, **contribución individual** para el XP de equipos, contrato de **M1** (diagnóstico/barrera), **plantillas** accesibles y **descarga autorizada** (sin enlaces persistentes).
- Modelo y contratos: `docs/I0d-MODELO-FIRESTORE.md`. Informes: `docs/I0e-RESULTADOS.md`, `docs/I1a-RESULTADOS.md`, `docs/I1b-RESULTADOS.md`, `docs/I1c-RESULTADOS.md`, `docs/I2a-RESULTADOS.md`, `docs/I2b-RESULTADOS.md`, `docs/I2c-RESULTADOS.md`, `docs/I2d-RESULTADOS.md`, `docs/I2e-RESULTADOS.md`.

```bash
npm run emu:test        # 79 pruebas de emulador + 39 de navegador
npm run emu:start       # emuladores + app en modo interactivo
```

> Solo proyecto `demo-red-tic` y datos sintéticos. **No** se despliega ni se usan datos reales.

## Códigos de demostración (fixtures)

| Código | Rol | Datos |
|---|---|---|
| `ZORRO-01` | Estudiante | Recorrido avanzado; diagnóstico enviado |
| `PUMA-02` | Estudiante | Diagnóstico enviado con una tarea no respondida |
| `DOCENTE-01` | Docente (demostración) | Curso de Zorro-01/Puma-02 |
| `DOCENTE-02` | Docente (demostración) | Otro curso (aislamiento) |

También se puede escribir el código en el campo de acceso. El **acceso docente** es una **simulación en emuladores** (token personalizado); el proveedor institucional queda pendiente.

## Datos sintéticos incluidos

- **1 curso**: «1º Medio A».
- **6 misiones**: Abrir el mapa · Escuchar la señal · Elegir una ruta · Construir el primer puente · Probar el puente · Compartir la ruta.
- **2 estudiantes** y **2 docentes** ficticios.
- **10 indicadores** (D1–D5, E1–E5), **6 insignias**, evidencias con ejes separados
  (`origen` / `formato` / `modalidad de prueba`) y valoraciones con «No evaluado».

## Estados demostrables

Usa la barra **«Demo (fixtures)»** en la parte superior para alternar entre:

- **Datos**: contenido normal.
- **Carga**: se muestra el estado de carga.
- **Vacío**: se muestran los estados vacíos.
- **Error**: se muestra el estado de error.

## Separación de paneles (verificada por pruebas)

- `/#/estudiante/recorrido` muestra misiones, XP, nivel narrativo e insignias. **No** muestra indicadores D/E.
- `/#/estudiante/aprendizajes` muestra indicadores, evidencias y retroalimentación. **No** muestra XP ni insignias.

## Accesibilidad (verificada, no «certificada»)

- Enlace «saltar al contenido», foco visible, navegación por teclado.
- Reflow sin scroll horizontal a **320 px**.
- Respeto de `prefers-reduced-motion`.
- `axe-core` reporta hallazgos automatizables; **no** se declara conformidad WCAG.

## Alcance

- **I0a:** interfaz local con fixtures, sin backend ni credenciales.
- **I0b / I0c:** esquema SQL y pruebas PostgreSQL → **archivados** en `docs/archivo-supabase/` (sustituidos por Firebase).
- **I0d / I0e:** backend Firebase (Auth, Firestore, Storage, Functions) con reglas endurecidas, probado con Emulator Suite.
- **I1a:** frontend Vue conectado a Firebase **solo en emuladores** (Auth anónimo, canje, lecturas por rol). Subida de archivos deshabilitada en la UI.
- **I1b:** sesión/entorno con fallo cerrado y flujo de diagnóstico (encuesta A1–A6 + T1–T5) en la interfaz, solo en emuladores.
- **I1c:** instrumento completo con estímulos (caso, fichas A/B, mensaje simulado), encuesta múltiple/opcional, corrección antes del envío, envío inmutable y **vista docente mínima** (revisión, puntaje nulo e historial).
- **I2a:** misión 2 funcional con entrega de texto (inicio, borrador, envío idempotente y versiones) y lectura docente de entregas pendientes; valoración y XP quedan para I2b.
- **I2b:** revisión docente con valoración por indicador y XP único, pedir ajuste/reintento, entrega equivalente (papel/audio/maqueta/dictado/adaptación) y plantilla imprimible.
- **I2c:** reapertura segura, regla de «no evaluado» (XP narrativo vs competencia) y subida de archivos en la misión 2 con reserva, verificación y limpieza de huérfanos.
- **I2d:** seis misiones funcionales (consigna, evidencia, indicadores, hito y XP según Fases 6–7; 160 XP) con entrega textual/archivo y equivalencia.
- **I2e:** autorización y modalidades en Functions, contribución individual en equipos, contrato de M1, plantillas accesibles y descarga autorizada.
- **Fuera de alcance todavía:** revisión pedagógica del contenido, prueba con estudiantes, App Check exigido, proveedor institucional docente, retención/consentimiento, despliegue y datos reales.

## Informes

- `docs/I0a-RESULTADOS.md` — interfaz, pruebas y ajustes cerrados.
- `docs/I0b-RESULTADOS.md` / `docs/I0c-RESULTADOS.md` — histórico Supabase (archivado).
- `docs/I0d-RESULTADOS.md` — backend Firebase, matriz permitido/denegado y pendientes.
- `docs/I0e-RESULTADOS.md` — endurecimiento (reservas, rate limit, permisos, encuesta).
- `docs/I1a-RESULTADOS.md` — frontend conectado a Firebase y correcciones de I0e.
- `docs/I1b-RESULTADOS.md` — sesión/entorno con fallo cerrado y flujo de diagnóstico.
- `docs/I1c-RESULTADOS.md` — instrumento completo, transiciones cerradas y vista docente mínima.
- `docs/I2a-RESULTADOS.md` — primera misión funcional con entrega de texto y lectura docente.
- `docs/I2b-RESULTADOS.md` — revisión docente, XP único, ajuste/reintento y entrega equivalente.
- `docs/I2c-RESULTADOS.md` — reapertura segura, regla de «no evaluado» y subida de archivos.
- `docs/I2d-RESULTADOS.md` — seis misiones funcionales y robustez de archivos.
- `docs/I2e-RESULTADOS.md` — autorización, coherencia pedagógica y lectura de archivos.
- `docs/I2e-INDICADORES-Y-PLANTILLAS.md` — indicadores observados, consignas y plantillas.
- `docs/I2c-COSTOS-Y-RETENCION.md` — costos/cuotas estimados y retención propuesta.
- `docs/I2a-ENTREGA-EQUIVALENTE-PAPEL.md` — procedimiento de entrega equivalente (papel/audio).
- `docs/I0d-MODELO-FIRESTORE.md` — modelo de documentos, índices y reglas.

