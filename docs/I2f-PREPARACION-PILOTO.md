# RED-TIC — Preparación de piloto (sin activar producción)

> **Nada de esto está activado.** Son **configuraciones y procedimientos verificables** para que la institución decida y habilite. Todo el desarrollo actual corre en **Firebase Emulator Suite** con datos sintéticos. No se usan credenciales ni datos reales.

---

## 1. App Check (exigido)

**Objetivo:** rechazar llamadas de clientes no verificados.

- Registrar la app web en Firebase App Check con **reCAPTCHA v3** (o Enterprise).
- Exigir App Check en **Firestore**, **Storage** y **Functions**.
- En Functions ya existe la bandera `ENFORCE_APP_CHECK=true` (`functions/src/identity.ts`), que activa `enforceAppCheck` en las callables.
- **Verificación:** con la app sin token → la callable responde `unauthenticated`; con token válido → responde normal. (Prueba a ejecutar en el proyecto real, no en emulador.)

**Decisión institucional:** clave de reCAPTCHA y quién administra App Check.

## 2. Secreto administrado (`CODE_PEPPER`)

**Objetivo:** que el hash de códigos no dependa de un valor por defecto.

- Crear el secreto en **Secret Manager**: `CODE_PEPPER`.
- Declararlo en las Functions que hashean códigos (`redeemCode`, `regenerateCode`) con `runWith({ secrets: ['CODE_PEPPER'] })`.
- El código **falla cerrado**: sin `CODE_PEPPER` fuera del emulador, el hash lanza error (`functions/src/guards.ts`).
- **Verificación:** sin el secreto, un canje falla con error; con el secreto, funciona.

**Decisión institucional:** custodia y rotación del secreto.

## 3. Identidad docente institucional

**Objetivo:** reemplazar el acceso docente de demostración.

- Integrar el proveedor institucional (OIDC/SAML o Google Workspace con `hd`).
- Mapear la identidad a `teachers/{uid}` (estado `active`) y `teacherCourses/{uid}_{courseId}`.
- **Retirar** `teacherDemoSignIn` (hoy falla cerrado fuera del emulador).
- **Verificación:** docente sin registro `active` → denegado; docente de curso ajeno → denegado.

**Decisión institucional:** proveedor, altas/bajas y responsable del padrón.

## 4. Presupuesto y alertas

- Presupuesto de GCP con alertas al 50/80/100 % y umbrales de cuota (Firestore/Storage/Functions).
- Límite de tamaño/tipo de archivo ya aplicado (5 MB; texto/PDF/PNG/JPG/DOCX).
- **Verificación:** alerta de prueba al superar un umbral configurado.

**Decisión institucional:** tope mensual y responsable de aprobación.

## 5. Limpieza programada

- Programar `cleanupExpiredUploads` (o un job equivalente) con **Cloud Scheduler**.
- El job borra objetos de reservas caducadas sin evidencia y marca `expired`; deja `reserved` si el borrado no se confirma (reintentable).
- **Verificación:** reserva caducada + objeto → el job lo elimina en la siguiente ejecución.

**Decisión institucional:** frecuencia y ventana de ejecución.

## 6. Retención, exportación y borrado

- **Retención propuesta:** curso activo + 1 año escolar (ver `docs/I2c-COSTOS-Y-RETENCION.md`).
- **Exportación:** `gcloud firestore export` (Firestore) y listado de Storage; conservar la **clave de correspondencia** fuera de la plataforma.
- **Borrado:** `recursiveDelete` de la matrícula/hito y borrado de objetos de Storage; borrado a solicitud de la persona.
- **Verificación:** exportar y borrar una matrícula de prueba y comprobar que no quedan objetos ni documentos.

**Decisiones institucionales (explícitas):**
1. Periodo exacto de retención y responsable del borrado.
2. ¿Se permiten **archivos de estudiantes** o solo texto?
3. Región de alojamiento y **residencia de datos**.
4. Texto de **consentimiento informado** y canal de solicitudes.
5. ¿Se usan **datos reales** en el piloto o una cohorte sintética?
6. Política de **insignias/XP** como avance narrativo (nunca nota ni competencia).

---

## 7. Criterio de salida

El piloto **no** debe iniciarse hasta que: App Check y el secreto estén activos; la identidad docente sea institucional; existan presupuesto/alertas y limpieza programada; y la institución apruebe retención/consentimiento/residencia. La **verificación manual de accesibilidad** y la **revisión pedagógica** del contenido son además requisitos previos.
