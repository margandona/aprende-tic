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

```bash
cd red-tic-app
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

## Fuera de alcance de I0a

- Sin Supabase ni políticas SQL (se abordarán en I1a, con las correcciones del documento maestro).
- Sin autenticación real, sin subida de archivos, sin despliegue.
- Las acciones de entrega/revisión aparecen deshabilitadas o en modo lectura.

## Qué falta para I0b

Ver `docs/I0a-RESULTADOS.md`.
