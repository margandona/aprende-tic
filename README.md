# RED-TIC — MVP · Incremento I0a

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
| `npm run emu:test` | Firebase Emulator Suite: reglas, Functions, Storage y concurrencia |
| `npm run emu:start` | Emuladores en modo interactivo |

## Backend (Firebase, I0d)

- **Decisión vigente:** Firebase (Auth, Firestore, Storage, Functions, Hosting). El SQL de Supabase queda como **histórico** en `docs/archivo-supabase/` (**no ejecutar**).
- Reglas: `firestore.rules`, `storage.rules`; índices: `firestore.indexes.json`.
- Functions en `functions/`; pruebas con emuladores en `tests-emu/`.
- Modelo y contratos: `docs/I0d-MODELO-FIRESTORE.md`. Informe: `docs/I0d-RESULTADOS.md`.

```bash
npm run emu:test        # 22 pruebas con Auth, Firestore, Storage y Functions
```

> I0d usa solo el proyecto `demo-red-tic` y datos sintéticos. **No** conecta el frontend a registros reales todavía (eso es I1a) y **no** habilita producción.

## Códigos de demostración (fixtures)

| Código | Rol | Datos |
|---|---|---|
| `ZORRO-01` | Estudiante | Recorrido avanzado; varios indicadores evaluados |
| `PUMA-02` | Estudiante | Recorrido inicial; útil para estados parciales |
| `DOCENTE-01` | Docente | Panel del curso |
| `DOCENTE-02` | Docente | Panel del curso |

También se puede escribir el código en el campo de acceso.

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
- **I0d:** backend Firebase (Auth, Firestore, Storage, Functions) probado con Emulator Suite. La app **aún no está conectada** a registros reales.
- **Fuera de alcance todavía (I1a):** conexión del frontend a Auth/lecturas Firebase, proveedor institucional docente, App Check, despliegue y datos de personas reales.

## Informes

- `docs/I0a-RESULTADOS.md` — interfaz, pruebas y ajustes cerrados.
- `docs/I0b-RESULTADOS.md` / `docs/I0c-RESULTADOS.md` — histórico Supabase (archivado).
- `docs/I0d-RESULTADOS.md` — backend Firebase, matriz permitido/denegado y pendientes.
- `docs/I0d-MODELO-FIRESTORE.md` — modelo de documentos, índices y reglas.

