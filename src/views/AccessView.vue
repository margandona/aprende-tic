<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/client'
import { ensureAuth, setBinding, signInAsTeacher } from '../stores/session'

const router = useRouter()
const code = ref('')
const teacherCode = ref('')
const error = ref<string | null>(null)
const teacherError = ref<string | null>(null)
const busy = ref(false)

const MESSAGES: Record<string, string> = {
  invalid: 'El código no es válido.',
  revoked: 'El código fue revocado. Pídele uno nuevo a tu docente.',
  expired: 'El código caducó. Pídele uno nuevo a tu docente.',
  locked: 'Demasiados intentos. Intenta más tarde.',
  rate_limited: 'Demasiados intentos. Espera unos minutos.',
  no_session: 'No se pudo iniciar sesión. Recarga la página.',
}

async function entrar(): Promise<void> {
  const value = code.value.trim().toUpperCase()
  error.value = null
  if (!value) {
    error.value = 'Escribe un código para continuar.'
    return
  }
  busy.value = true
  try {
    await ensureAuth()
    const redeem = httpsCallable<
      { code: string },
      { status: string; enrollmentId?: string; courseId?: string; pseudonym?: string }
    >(functions, 'redeemCode')
    const res = await redeem({ code: value })
    if (res.data.status === 'ok' && res.data.enrollmentId && res.data.courseId && res.data.pseudonym) {
      setBinding({ enrollmentId: res.data.enrollmentId, courseId: res.data.courseId, pseudonym: res.data.pseudonym })
      router.push('/estudiante/recorrido')
      return
    }
    error.value = MESSAGES[res.data.status] ?? 'No se pudo canjear el código.'
  } catch {
    error.value = 'No se pudo conectar con el servidor. ¿Están activos los emuladores?'
  } finally {
    busy.value = false
  }
}

function usarCodigo(valor: string): void {
  code.value = valor
  entrar()
}

async function entrarDocente(): Promise<void> {
  const value = teacherCode.value.trim().toUpperCase()
  teacherError.value = null
  if (!value) {
    teacherError.value = 'Escribe un código docente para continuar.'
    return
  }
  busy.value = true
  try {
    await ensureAuth()
    const signIn = httpsCallable<
      { code: string },
      { token: string; teacherUid: string; displayName: string }
    >(functions, 'teacherDemoSignIn')
    const res = await signIn({ code: value })
    await signInAsTeacher(res.data.token, res.data.teacherUid, res.data.displayName)
    router.push('/docente/diagnosticos')
  } catch {
    teacherError.value = 'Código docente inválido (solo disponible en emuladores).'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="access" aria-labelledby="access-title">
    <h1 id="access-title">Entrar a RED-TIC</h1>
    <p>
      Demostración con <strong>Firebase Emulator Suite</strong> y datos ficticios. Se inicia una sesión anónima y el
      código individual se canjea en el servidor; no se piden datos personales.
    </p>

    <form class="card" @submit.prevent="entrar">
      <label for="codigo">Código individual de demostración</label>
      <input
        id="codigo"
        v-model="code"
        class="input"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        :aria-describedby="error ? 'codigo-error' : 'codigo-ayuda'"
        :aria-invalid="Boolean(error)"
      />
      <p id="codigo-ayuda" class="hint">Ejemplo: ZORRO-01 o PUMA-02.</p>
      <p v-if="error" id="codigo-error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn--primary" :disabled="busy">
        {{ busy ? 'Canjeando…' : 'Entrar' }}
      </button>
    </form>

    <div class="card">
      <h2>Códigos de ejemplo (ficticios)</h2>
      <p class="hint">Al elegir uno, la app canjea el código contra los emuladores.</p>
      <div class="code-group">
        <button type="button" class="btn btn--secondary" @click="usarCodigo('ZORRO-01')">Estudiante Zorro-01</button>
        <button type="button" class="btn btn--secondary" @click="usarCodigo('PUMA-02')">Estudiante Puma-02</button>
      </div>
      <p class="hint">
        El acceso docente se <strong>simula en los emuladores</strong> (pruebas de Functions con token de docente). El
        <strong>proveedor institucional</strong> queda pendiente y no se expone aquí.
      </p>
    </div>

    <div class="card">
      <h2>Acceso docente (demostración)</h2>
      <p class="hint">Solo en emuladores con docentes sintéticos. Ejemplo: DOCENTE-01 o DOCENTE-02.</p>
      <form @submit.prevent="entrarDocente">
        <label for="codigo-docente">Código docente de demostración</label>
        <input
          id="codigo-docente"
          v-model="teacherCode"
          class="input"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          :aria-describedby="teacherError ? 'codigo-docente-error' : undefined"
          :aria-invalid="Boolean(teacherError)"
        />
        <p v-if="teacherError" id="codigo-docente-error" class="error" role="alert">{{ teacherError }}</p>
        <button type="submit" class="btn btn--secondary" :disabled="busy">Entrar como docente</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.access {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}
.input {
  width: 100%;
  min-height: var(--rt-touch);
  padding: var(--rt-space-2) var(--rt-space-3);
  margin: var(--rt-space-2) 0;
  font: inherit;
  border: 2px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-surface);
  color: var(--rt-text);
}
.hint {
  color: var(--rt-text-muted);
  font-size: var(--rt-font-size-sm);
}
.error {
  color: #7f1d1d;
  background: var(--rt-danger-soft);
  border: 1px solid var(--rt-danger);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-2);
  font-weight: 600;
}
.code-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rt-space-2);
}
</style>
