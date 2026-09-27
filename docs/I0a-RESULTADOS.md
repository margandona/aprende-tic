# RED-TIC — I0a · Resultados del incremento

**Estado:** completado y verificado en local. **Sin Supabase, sin credenciales, sin datos reales, sin despliegue.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` (§ Fase 10 I0a), entregables de Fase 8 y `PLAN-DE-CONSTRUCCION.md` (Fase 9).

---

## 1. Cómo ejecutar

El proyecto está en la **raíz del repositorio** (no hay subcarpeta).

```bash
git clone https://github.com/margandona/aprende-tic.git
cd aprende-tic
npm install
npm run dev        # http://localhost:4173
```

Códigos de demostración (fixtures): `ZORRO-01`, `PUMA-02` (estudiantes) y `DOCENTE-01`, `DOCENTE-02` (docentes).

| Comando | Resultado |
|---|---|
| `npm run dev` | Servidor local |
| `npm run lint` | ESLint (0 problemas) |
| `npm run typecheck` | `vue-tsc --noEmit` (sin errores) |
| `npm test` | Vitest (15 pruebas) |
| `npm run build` | Build de producción |
| `npm run e2e` | Playwright (6 pruebas: 320 px, teclado, movimiento reducido, axe) |

---

## 2. Archivos creados

```
red-tic-app/
├── index.html
├── package.json · tsconfig.json · tsconfig.app.json · tsconfig.node.json
├── vite.config.ts · playwright.config.ts · eslint.config.js · env.d.ts
├── README.md · .gitignore
├── src/
│   ├── main.ts · App.vue
│   ├── types.ts
│   ├── router/index.ts
│   ├── stores/session.ts                # sesión local + estado de demo
│   ├── data/repository.ts               # repositorio local sobre fixtures
│   ├── fixtures/synthetic.ts            # 1 curso · 6 misiones · 2 estudiantes · 2 docentes
│   ├── composables/useAsync.ts
│   ├── utils/labels.ts
│   ├── styles/tokens.css · styles/base.css
│   ├── components/AppShell.vue · BottomNav.vue · SkipLink.vue · StatePanel.vue
│   │              DemoStateBar.vue · MissionCard.vue · ProgressBar.vue
│   │              BadgeGrid.vue
│   └── views/AccessView.vue · JourneyView.vue · MissionsView.vue
│            MissionDetailView.vue · LearningsView.vue · TeacherPanelView.vue
│            TeacherReviewView.vue · SettingsView.vue · NotFoundView.vue
├── tests/navigation.spec.ts · tests/panel-separation.spec.ts · tests/state.spec.ts
├── e2e/layout.spec.ts · e2e/a11y.spec.ts
└── docs/capturas/*.png · docs/accesibilidad/axe-report.json
```

---

## 3. Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Vue 3 + Vite + TypeScript** con `vue-router` en modo hash. | Stack aprobado para Fase 10; hash evita configuración de servidor en local. |
| D2 | **Sin Pinia**: estado mínimo en un módulo `reactive`. | Menos dependencias para I0a. |
| D3 | **Repositorio local sobre fixtures** con estados `ok/loading/empty/error` conmutables. | Permite demostrar carga, vacío y error sin backend. |
| D4 | **Separación dura de paneles**: `JourneyView` no importa indicadores; `LearningsView` no importa XP. | Requisito del documento maestro (Fase 7) y de la Fase 9. |
| D5 | **Tema propio RED-TIC** (verde azulado + ámbar), sin branding institucional. | Desacoplamiento institucional. |
| D6 | **Tokens de accesibilidad**: foco visible, `prefers-reduced-motion`, objetivos ≥ 44 px. | WCAG 2.2 AA en recorridos esenciales. |
| D7 | **Evidencia con ejes separados** (`origin`/`format`/`testModality`) y estados «No evaluado». | Correcciones de Fase 9. |
| D8 | **`vitest` v3** para alinear con Vite 6. | Evita conflicto de tipos entre versiones de Vite. |
| D9 | **Acciones de entrega/revisión deshabilitadas o en solo lectura.** | I0a es interfaz; identidad/datos van en I0b/I1a. |
| D10 | **`axe-core` informa, no certifica.** | El documento maestro prohíbe declarar cumplimiento sin pruebas. |

---

## 4. Pruebas ejecutadas y resultados

### 4.1 Lint y tipos
- `npm run lint` → **0 problemas**.
- `npm run typecheck` (`vue-tsc --noEmit`) → **sin errores**.

### 4.2 Pruebas unitarias/componentes (Vitest) — 15/15
`tests/navigation.spec.ts` (8): rutas base presentes; rol declarado; guarda redirige sin sesión; permite estudiante; impide estudiante→panel docente; navegación inferior por rol; nombre accesible.
`tests/panel-separation.spec.ts` (4): recorrido muestra XP/insignias y **no** indicadores; aprendizajes muestra indicadores/retroalimentación y **no** XP/insignias; «No evaluado» visible; recarga al cambiar el estado de demo.
`tests/state.spec.ts` (3): estado de carga; estado vacío; estado de error con `role="alert"`.

### 4.3 Build
- `npm run build` → `index.html` 0,47 kB · CSS 12,42 kB (gzip 2,79) · JS 125,51 kB (gzip 46,55).

### 4.4 Pruebas de navegador (Playwright, viewport 320×720) — 6/6
| Prueba | Resultado |
|---|---|
| Reflow sin scroll horizontal a 320 px en recorrido, misiones, aprendizajes y panel docente | ✓ |
| Primer `Tab` enfoca «Saltar al contenido principal» | ✓ |
| Enlaces de navegación alcanzables con teclado y con nombre accesible | ✓ |
| `prefers-reduced-motion` reduce `animation-duration` del indicador de carga a < 0,05 s | ✓ |
| Estados vacío y error visibles en «Mis aprendizajes» | ✓ |
| `axe-core`: hallazgos automatizables en 4 pantallas | **0 hallazgos** |

**`axe-core` (reporte en `docs/accesibilidad/axe-report.json`):** sin hallazgos automatizables en `/#/estudiante/recorrido`, `/misiones`, `/aprendizajes` y `/ajustes`.
> Esto **no** declara conformidad WCAG 2.2 AA: solo cubre reglas automatizables. Falta verificación manual con lector de pantalla, contraste medido y prueba con estudiantes.

### 4.5 Capturas (`docs/capturas/`)
`01-recorrido.png` · `02-misiones.png` · `03-aprendizajes.png` · `04-panel-docente.png` · `05-estado-carga-reduced-motion.png` · `06-estado-vacio.png` · `07-estado-error.png`.

---

## 5. Qué falta para I0b

1. **Entorno Supabase** (de pruebas) y migraciones del modelo con datos sintéticos.
2. **Identidad real**: `redeem_code` + `student_session_binding` + helper `current_enrollment_id()`.
3. **Correcciones SQL pendientes** del documento maestro antes de I1a:
   - `delivery`: denegar escritura directa a `state`/`current_evidence_id` y exponer operaciones controladas.
   - `submit_evidence`: comprobar idempotencia **antes** del estado y serializar por `delivery`.
   - `validate_milestone`: exigir evidencia vigente, descriptores válidos y `milestone_indicator`; registrar `assessment_history`.
   - Storage: amarrar la ruta a filas reales (curso/matrícula/entrega), no solo a `enrollment_id`.
   - `redeem_code`: lookup escalable por identificador seguro, límite de intentos y bloqueo.
   - Confirmar `teacher.id` ↔ `teacher.auth_user_id` con clave foránea.
   - Definir un único propietario lógico para entregas de equipo y autorización de coautores.
4. **Pruebas de integración locales** con ≥2 alumnos del mismo curso, 1 de otro curso y 2 docentes.
5. **Acciones reales** de entrega, reintento, revisión y registro de evidencia equivalente.
6. **Verificación manual de accesibilidad** (lector de pantalla, contraste medido, prueba con estudiantes).

---

## 6. Declaraciones honestas

- El MVP **no** es offline-first: en I0a no hay persistencia; en I1a se definirán borradores limitados y equivalencia fuera de plataforma.
- **No** se declara cumplimiento de RLS ni de WCAG. Las políticas SQL de Fase 9 **no** se implementaron en I0a.
- Los datos son **ficticios**; no hay datos de estudiantes ni credenciales.
