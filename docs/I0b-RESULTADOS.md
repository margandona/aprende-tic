# RED-TIC — I0b · Resultados del incremento

**Estado:** migraciones versionadas + pruebas de integración ejecutadas en un entorno aislado, con datos **exclusivamente sintéticos**. **Sin datos reales, sin credenciales, sin producción.**
**Base:** `RED-TIC-DOCUMENTO-MAESTRO.md` (Fase 10, revisión de I0a) y cierre de Fase 9.
**Advertencia:** este incremento **no** declara RLS conforme ni autoriza producción. Las pruebas demuestran comportamiento del esquema en un entorno controlado; la validación institucional sigue pendiente.

---

## 1. Entorno aislado de pruebas

- **No había Docker** en el entorno de ejecución, por lo que `supabase start` (Supabase CLI local) no pudo usarse.
- Se usó **PostgreSQL 18 real compilado a WebAssembly** (`@electric-sql/pglite`), en memoria, sin red ni credenciales.
- Se emula lo que Supabase provee mediante `tests-db/shim.sql`: esquema `auth` (`auth.uid()`), esquema `storage` (`storage.objects`, `storage.foldername`) y roles `anon`, `authenticated`, `service_role`.
- Las **migraciones de `supabase/migrations/` son las de producción** (asumen que Supabase ya provee `auth` y `storage`); el shim **no** se aplica en producción.
- Para correr en Supabase local con Docker: ver §3.2.

> Limitación declarada: PGlite es de **una sola conexión**, por lo que no reproduce concurrencia real de transacciones en paralelo (ver §6).

---

## 2. Archivos creados

```
supabase/
├── config.toml                         # config mínima para Supabase CLI (Docker)
├── migrations/
│   ├── 20260927090000_schema.sql       # entidades (correcciones 6 y 7)
│   ├── 20260927090100_functions.sql    # helpers + operaciones (correcciones 1,2,3,5)
│   ├── 20260927090200_rls.sql          # políticas RLS + grants
│   └── 20260927090300_storage.sql      # Storage privado (corrección 4)
└── seed.sql                            # 2 alumnos de X, 1 de Y, 2 docentes (sintético)

tests-db/
├── shim.sql                            # auth/storage/roles del entorno aislado
├── harness.ts                          # crea la BD, aplica migraciones y semilla; simula identidad
├── fixtures.ts                         # UUID sintéticos
├── permissions.spec.ts                 # aislamiento entre cursos y escritura directa
├── identity.spec.ts                    # canje, revocación, límite de intentos
├── idempotency.spec.ts                 # entrega, XP, reinstauración
├── storage.spec.ts                     # autorización de Storage
└── team.spec.ts                        # propiedad de entregas de equipo

vitest.db.config.ts
docs/i0b/matriz-*.json                  # resultados permitido/denegado por área
.github/workflows/ci.yml                # CI (ajustes de I0a)
```

---

## 3. Comandos reproducibles

### 3.1 Entorno aislado (sin Docker) — lo ejecutado aquí

```bash
npm ci
npm run test:db        # 40 pruebas de integración sobre PostgreSQL aislado
npm run lint
npm run typecheck
npm test               # 15 pruebas de componentes
npm run build
npm run e2e            # 6 pruebas de navegador (320 px, teclado, movimiento reducido, axe)
```

### 3.2 Supabase local (con Docker), para verificación posterior

```bash
npx supabase start                 # levanta Postgres + Auth + Storage + Studio
npx supabase db reset              # aplica migraciones y seed.sql
npx supabase db lint               # linter de esquema
# Las mismas pruebas pueden adaptarse para conectarse al Postgres local y probar concurrencia real.
```

---

## 4. Correcciones de Fase 9 (los siete puntos)

| # | Problema | Corrección | Archivo | Prueba |
|---|---|---|---|---|
| 1 | `delivery` permitía escritura directa de `state`/`current_evidence_id` | El cliente solo tiene `SELECT`; toda escritura pasa por `start_delivery`, `submit_evidence`, `validate_milestone`, etc. | `20260927090200_rls.sql` | permissions: «no puede cambiar el estado», «no puede insertar una entrega» |
| 2 | `submit_evidence` comprobaba el estado antes de la idempotencia | Se busca el `submit_key` **antes** del estado, con `SELECT … FOR UPDATE` sobre la entrega | `20260927090100_functions.sql` | idempotency: «reenviar con la misma clave», «repetición tras pending_review» |
| 3 | `validate_milestone` aceptaba datos inválidos y no registraba historial | Exige evidencia vigente, `milestone_indicator`, niveles válidos y escribe `assessment_history`; XP calculado antes del cambio de estado, todo en una transacción | `20260927090100_functions.sql` | idempotency: «validar dos veces»; team: «valida por integrante» |
| 4 | Storage autorizaba por `enrollment_id` en la ruta | `evidence_object_allowed()` verifica la entrega real, su curso y la matrícula; el docente se autoriza por curso | `20260927090300_storage.sql` | storage: «ruta con curso ajeno», «matrícula ajena» |
| 5 | `redeem_code` no escalaba ni limitaba intentos | Lookup por **hash indexado**, límite por cliente, bloqueo, `FOR UPDATE` y binding activo único | `20260927090100_functions.sql`, `20260927090000_schema.sql` | identity: «límite de intentos», «segundo canje revoca el primero» |
| 6 | `teacher_id = auth.uid()` sin FK | `teacher.auth_user_id` con FK a `auth.users`; `is_teacher_of_course` une por `auth_user_id` | `20260927090000_schema.sql`, `20260927090100_functions.sql` | permissions: docente de X vs Y; identity: regenerar de otro curso |
| 7 | Entrega de equipo con doble propietario lógico | `owner_enrollment_id` único + `scope`/`team_id`; acceso vía `can_access_delivery`; valoración por integrante | `20260927090000_schema.sql`, `20260927090100_functions.sql` | team: propietario, coautor, tercero, valoración individual |

---

## 5. Matriz de resultados (permitido/denegado)

Resultados completos en `docs/i0b/matriz-*.json`. Resumen:

### 5.1 Permisos y aislamiento (`matriz-permisos.json`)
| Caso | Actor | Esperado | Obtenido |
|---|---|---|---|
| Ve sus entregas | Zorro-01 | permitido | permitido |
| No ve la entrega individual de otro alumno del mismo curso | Puma-02 | denegado | denegado |
| No ve entregas de otro curso | Condor-03 | denegado | denegado |
| Docente de X ve X | Docente Uno | permitido | permitido |
| Docente de Y no ve X | Docente Dos | denegado | denegado |
| No ve evidencia/XP ajenos | Zorro-01 | denegado | denegado |
| No inserta entrega directa | Zorro-01 | denegado | denegado |
| No cambia `state` directamente | Zorro-01 | denegado | denegado |
| No inserta valoración directa | Zorro-01 | denegado | denegado |
| Encuesta: no la lee | Zorro-01 | denegado | denegado |
| Encuesta: la lee el docente del curso | Docente Uno | permitido | permitido |
| Encuesta: no la lee otro docente | Docente Dos | denegado | denegado |
| No registra encuesta ajena | Zorro-01 | denegado | denegado |

### 5.2 Identidad y revocación (`matriz-identidad.json`)
| Caso | Esperado | Obtenido |
|---|---|---|
| Canje válido | permitido | permitido |
| Canje inválido (queda registrado) | denegado | denegado (`invalid`) |
| Revocar binding corta el acceso | denegado | denegado |
| Regenerar código invalida el anterior | denegado | denegado (`revoked`) |
| Código revocado | denegado | denegado |
| Límite de 10 intentos | denegado | denegado (`rate_limited`) |
| Segundo canje revoca el primero | denegado | denegado |
| Docente de otro curso regenera | denegado | denegado |

### 5.3 Idempotencia (`matriz-idempotencia.json`)
| Caso | Esperado | Obtenido |
|---|---|---|
| Reenvío con la misma clave | permitido | permitido (1 versión) |
| Clave nueva en `pending_review` | denegado | denegado |
| Reintento tras ajuste | permitido | permitido (nueva versión) |
| Validar dos veces | permitido | permitido (1 `xp_event`) |
| Reinstaurar XP revocado | permitido | permitido (misma fila) |
| Insertar segundo `xp_event` | denegado | denegado (UNIQUE) |

### 5.4 Storage (`matriz-storage.json`)
| Caso | Actor | Esperado | Obtenido |
|---|---|---|---|
| Lee objeto propio | Zorro-01 | permitido | permitido |
| Ruta con curso ajeno | Zorro-01 | denegado | denegado |
| Objetos de X | Condor-03 | denegado | denegado |
| Objeto de su curso | Docente Uno | permitido | permitido |
| Objeto de otro curso | Docente Dos | denegado | denegado |
| Insertar en ruta propia | Zorro-01 | permitido | permitido |
| Insertar en ruta de otro curso | Zorro-01 | denegado | denegado |
| Insertar con matrícula ajena | Zorro-01 | denegado | denegado |

### 5.5 Equipo (`matriz-equipo.json`)
| Caso | Actor | Esperado | Obtenido |
|---|---|---|---|
| Accede a la entrega de equipo | Zorro-01 (propietario) | permitido | permitido |
| Accede a la entrega de equipo | Puma-02 (coautor) | permitido | permitido |
| Accede a la entrega de equipo | Condor-03 (tercero) | denegado | denegado |
| Valida por integrante | Docente Uno | permitido | permitido |
| Ve solo su valoración | Zorro-01 | denegado (ajena) | denegado |
| Ve ambas valoraciones | Docente Uno | permitido | permitido |
| Valida a no-miembro | Docente Uno | denegado | denegado |

**Resultado global:** `npm run test:db` → **40/40 pruebas en verde**.

---

## 6. Discrepancias y límites encontrados

1. **Sin Docker → no se usó Supabase local.** Se usó PostgreSQL 18 (WASM). El esquema y las políticas son portables, pero **la concurrencia real de transacciones no se pudo probar**: PGlite es de una sola conexión, así que los casos «simultáneos» se ejecutan serializados. **Pendiente:** repetir la prueba de concurrencia en Supabase local (Docker) o en un Postgres multiconconexión.
2. **`pgcrypto` no está disponible en PGlite.** El hash de códigos se implementó con **`sha256`** (núcleo de PostgreSQL) en vez de bcrypt. Es funcional y portable, pero para producción conviene `crypt`/`gen_salt` (o un KDF lento). La función `public.hash_code(text)` está aislada para cambiarla sin tocar a los llamadores.
3. **Versión de PostgreSQL distinta.** PGlite corre PostgreSQL 18; Supabase usa 15/17. No se detectaron incompatibilidades en este esquema, pero debe re-ejecutarse en la versión objetivo.
4. **`storage.objects` es un shim.** La autorización se probó sobre la política SQL real, pero la API de Storage de Supabase añade comportamiento (URLs firmadas, límites). **Pendiente:** verificar políticas en el Storage real.
5. **La app Vue no está conectada a la base todavía.** I0b es esquema + pruebas; el cliente sigue con fixtures. La conexión va en un incremento posterior.
6. **El límite de intentos se registra por `client_key`.** En producción debe ligarse a un identificador de cliente confiable (IP/edge) para no ser evadible.
7. **No se declara RLS conforme.** Las pruebas demuestran el comportamiento esperado en el entorno aislado; **no** sustituyen una auditoría ni la validación institucional.
8. **Retención y consentimiento** siguen como parámetros pendientes de decisión institucional.

---

## 7. Ajustes de I0a cerrados

| Ajuste (documento maestro) | Estado |
|---|---|
| `e2e/a11y.spec.ts` debe fallar ante **cualquier** infracción automatizable | Cerrado: la prueba ahora exige lista vacía de violaciones (no solo `critical`). Sigue en 0 hallazgos. |
| Añadir `.github/workflows/ci.yml` (lint, tipos, pruebas, build, Playwright/axe) | Cerrado: workflow con 3 trabajos (`calidad`, `e2e`, `db`). |
| Corregir la ruta `cd red-tic-app` (el `package.json` está en la raíz) | Cerrado: README e informe usan la raíz del repositorio. |

Además se actualizó el subtítulo de interfaz a «Aprende, crea y aporta a tu comunidad», acordado en el documento maestro.

---

## 8. Qué falta (no bloquea cerrar I0b)

- Repetir concurrencia real y Storage real en Supabase local (Docker).
- Conectar la app Vue a la base (identidad + lectura) en el siguiente incremento.
- Validación institucional: identidad, retención, consentimiento, alojamiento.
- Verificación manual de accesibilidad (lector de pantalla, contraste medido, prueba con estudiantes).
