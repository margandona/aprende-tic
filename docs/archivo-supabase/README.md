# Archivo histórico — Supabase (NO EJECUTAR)

> **Estado: histórico. Sustituido por Firebase.**
> La decisión de arquitectura del responsable del proyecto (27 de septiembre de 2026) establece que
> RED-TIC usará **exclusivamente Firebase** (Authentication, Cloud Firestore, Cloud Storage, Cloud Functions
> y Hosting) con frontend Vue 3 + Vite + TypeScript.
>
> Este directorio conserva, solo como **antecedente de reglas de negocio**, el esquema SQL, las funciones,
> las políticas RLS, el Storage y las pruebas PostgreSQL (PGlite y `embedded-postgres`) desarrollados en
> I0b/I0c. **No es el backend que se desplegará** y **no forma parte de la puerta de I1a**.
>
> - No ejecutar `supabase start`, `supabase db reset` ni `npm run test:db` (script retirado).
> - No usar RLS, Edge Functions ni `service_role` en la arquitectura vigente.
> - Se conservan: separación XP/aprendizajes, estados del diagnóstico, evidencia equivalente, reintentos,
>   revocación, idempotencia y aislamiento por curso, ahora expresados en Firestore/Functions.

Contenido:

- `supabase/` — migraciones, semilla y configuración (histórico).
- `tests-db/` — pruebas de integración PostgreSQL (histórico).
- `vitest.db.config.ts` — configuración de aquellas pruebas (histórico).

Las dependencias `@electric-sql/pglite`, `embedded-postgres` y `pg` se retiraron del `package.json`
activo; reinstalarlas solo si se desea reproducir el archivo histórico de forma aislada.
