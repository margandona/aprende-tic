# RED-TIC — I0c · Cierre de backend de pruebas (corrección de los siete bloqueantes)

**Estado:** los siete bloqueantes de la revisión de I0b se corrigieron en **migraciones nuevas** (no se reescribió ninguna migración publicada) y se probaron con **pruebas adversariales** en PostgreSQL real multiconexión. **Sin datos reales, sin credenciales, sin producción.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` §«Fase 10 — revisión de I0b».

---

## 1. Entorno y versiones

| Componente | Versión | Uso |
|---|---|---|
| PostgreSQL (PGlite, WASM) | **18.3** (PGlite 0.5.8) | Suite principal, una conexión |
| PostgreSQL (nativo) | **18.4** (`embedded-postgres` 18.4.0-beta.17, Windows x64) | Concurrencia multiconexión |
| Node.js | v24.18.0 | — |
| Docker / Supabase local | **No disponible** | No se ejecutó `supabase start` |

- **Auth anónimo y Storage API reales no se ejecutaron** (requieren Supabase local con Docker). Se probó su lógica a nivel SQL: `auth.uid()` y las políticas de `storage.objects` sobre un shim equivalente.
- **La clave de servicio nunca se usa en el cliente**; en las pruebas se opera con los roles `authenticated`/`service_role` del entorno aislado.

---

## 2. Comandos reproducibles

```bash
npm ci
npm run test:db        # 61 pruebas (7 archivos), incluye concurrencia en PostgreSQL nativo multiconexión
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

`npm run test:db` levanta automáticamente una instancia aislada de PostgreSQL nativo (sin Docker) para el archivo de concurrencia y usa PGlite para el resto.

Con Docker disponible, la verificación equivalente en Supabase local:

```bash
npx supabase start && npx supabase db reset   # aplica las migraciones nuevas y el seed sintético
```

---

## 3. Los siete bloqueantes: corrección y prueba

| # | Bloqueante (revisión I0b) | Corrección (migración nueva) | Prueba adversarial |
|---|---|---|---|
| 1 | `client_key` elegido por el cliente; rotarlo evade el límite; recuento no serializado; `failed_attempts` no aumenta | `redeem_code(p_code, p_actor_key)` con `p_actor_key` **del borde confiable**; `pg_advisory_xact_lock` por hash; **límite global** por ventana + límite por actor + **bloqueo por credencial** persistente | B1: 10 canjes con **claves rotatorias** → `locked`; concurrencia: 12 intentos en paralelo no pierden incrementos |
| 2 | `hash_code` SHA-256 sin secreto; códigos cortos adivinables | `hash_code` con **pimiento secreto** (`security_pepper`, solo propietario); `regenerate_code` de **alta entropía** (24 hex) y **caducidad** (`expires_at`) | B2: código ≥ 20 chars; caducado → `expired`; el hash cambia al rotar el pimiento |
| 3 | `register_equivalent_evidence` sin coherencia de curso, versión fija y sin idempotencia | Verifica `milestone_in_course`; versión incremental; `submit_key` idempotente; rechaza entrega cerrada | B3: hito de **otro programa** → denegado; versiones 1→2; misma clave → mismo id |
| 4 | `delivery`/`team_member` sin coherencia de curso/programa | Triggers `trg_delivery_coherence` y `trg_team_member_coherence` | B4: coautor de **otro curso** → denegado; entrega con hito ajeno y con equipo ajeno → denegado |
| 5 | `evidence_object_allowed` permitía escribir cualquier nombre; sin estado ni reserva | **Reserva controlada** (`reserve_evidence_upload`: estado, MIME y tamaño) + ruta `.../uploads/{reserva}/{archivo}`; la política exige reserva vigente, estado abierto, propietario y coherencia de curso/matrícula | B5: MIME/tamaño inválidos → denegado; subir a ruta reservada → permitido; sin reserva → denegado; reservar tras cierre → denegado |
| 6 | `validate_milestone` no comprobaba evidencia vigente ni completitud ni estado | Exige estado `pending_review`; la evidencia debe pertenecer a la entrega, no estar eliminada y ser la vigente; exige **todos los indicadores del hito** por integrante y **todos los integrantes** en equipo; sin duplicados | B6: estado distinto → denegado; parciales/duplicados/ajenos → denegado; evidencia cruzada → denegado; validación completa → `achieved` |
| 7 | Diagnóstico mutable tras el envío | Se revoca `UPDATE` directo; `submit_diagnosis_attempt` (draft→submitted); respuestas/apoyos solo en `draft` | B7: respuesta en borrador → permitida; tras envío → denegada; mutar o reenviar → denegado |

**Resultado:** `npm run test:db` → **61/61** pruebas en verde (7 archivos), incluidas 5 de concurrencia multiconexión.

Matrices permitido/denegado: `docs/i0b/matriz-*.json` y `docs/i0b/matriz-i0c.json` y `docs/i0b/matriz-concurrencia.json`.

---

## 4. Concurrencia multiconexión (PostgreSQL nativo)

| Caso | Resultado |
|---|---|
| Dos canjes inválidos concurrentes | Ambos `invalid`; **2 intentos contados** (advisory lock) |
| Dos envíos concurrentes con la misma clave | **1 sola versión** |
| Dos validaciones concurrentes | **1 éxito, 1 rechazado**; **1 `xp_event`** |
| Doce intentos concurrentes sobre credencial caducada/revocada | `failed_attempts` ≥ 10 y bloqueo (sin incrementos perdidos) |
| Dos canjes válidos concurrentes | **1 binding activo** |

---

## 5. Diferencias frente a PGlite

| Aspecto | PGlite (WASM) | PostgreSQL nativo (`embedded-postgres`) |
|---|---|---|
| Conexiones | **Una** (serializa) | **Varias** (concurrencia real) |
| Bloqueos de fila / advisory | Limitados por una sola sesión | **Reales** entre transacciones |
| Versión | 18.3 | 18.4 |
| Auth anónimo / Storage API | Emulados (shim) | Emulados (shim) — **no son los servicios de Supabase** |
| Uso en esta entrega | Suite funcional y adversarial | Suite de concurrencia |

Ninguna de las dos ejecuta **Auth anónimo real** ni **Storage API real**: eso requiere Supabase local (Docker), que no estaba disponible.

---

## 6. Estado real de CI

- `gh run list --repo margandona/aprende-tic` → ejecución **`36345200565`** sobre el commit de I0b (`099be78`): **success**, 54 s.
- El workflow `.github/workflows/ci.yml` tiene tres trabajos: `calidad` (lint, tipos, pruebas, build), `e2e` (Playwright + axe) y `db` (`npm run test:db`).
- El trabajo `db` ahora incluye el archivo de concurrencia (PostgreSQL nativo). Debe comprobarse la ejecución del **nuevo commit** tras publicarlo.

---

## 7. Condiciones pendientes para conectar identidad y lecturas (I1a)

I0c **no habilita I1a por sí solo**. Quedan pendientes, de forma expresa:

1. **Supabase local real con Docker** (`supabase start`) y `supabase db reset` para aplicar las migraciones nuevas y verificar RLS en el entorno objetivo.
2. **Auth anónimo real** de Supabase (`signInAnonymously`) y canje de código con una **Edge Function** que aporte el `p_actor_key` del borde (no del cliente).
3. **Storage API real**: subida con URL firmada, límites de tamaño/tipo del bucket y verificación de las políticas contra el servicio.
4. **Repetición de la concurrencia** en el Postgres de Supabase (no solo en el binario local).
5. **Decisión de proveedor y residencia de datos** `[VALIDACIÓN INSTITUCIONAL]`.
6. **Autorización institucional** antes de datos de menores o producción: identidad, retención, consentimiento, responsable.
7. **Conexión del frontend** a identidad y lecturas (siguiente incremento), sustituyendo los fixtures.
8. **Verificación manual de accesibilidad** (lector de pantalla, contraste medido, prueba con estudiantes).

> **No** se declara RLS conforme ni se habilita producción. La puerta se supera cuando 1–4 se ejecutan y registran.

---

## 8. Nota sobre credenciales

Se indicó una carpeta `data/` con credenciales de **Firebase** (`red-tic-firebase-adminsdk-fbsvc-*.json`). Esa carpeta está **fuera del repositorio** `aprende-tic` y **no se usó** ni se incluyó en ningún commit. La arquitectura de RED-TIC usa **Supabase**, no Firebase. Se recomienda **no** compartir ni versionar esos archivos y **rotarlos** si estuvieron expuestos.
