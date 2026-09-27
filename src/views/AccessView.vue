<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { demoStudentCodes, demoTeacherCodes } from '../fixtures/synthetic'
import { signInStudent, signInTeacher } from '../stores/session'

const router = useRouter()
const code = ref('')
const error = ref<string | null>(null)

function entrar(): void {
  const value = code.value.trim().toUpperCase()
  error.value = null

  if (!value) {
    error.value = 'Escribe un código para continuar.'
    return
  }
  if (demoStudentCodes[value]) {
    signInStudent(demoStudentCodes[value])
    router.push('/estudiante/recorrido')
    return
  }
  if (demoTeacherCodes[value]) {
    signInTeacher(demoTeacherCodes[value])
    router.push('/docente/panel')
    return
  }
  error.value = 'El código no es válido en esta demostración. Usa uno de los códigos de ejemplo.'
}

function usarCodigo(valor: string): void {
  code.value = valor
  entrar()
}
</script>

<template>
  <section class="access" aria-labelledby="access-title">
    <h1 id="access-title">Entrar a RED-TIC</h1>
    <p>
      Esta es una <strong>demostración local con datos ficticios</strong>. No se piden datos personales y no hay
      conexión a ningún servidor.
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
      <p id="codigo-ayuda" class="hint">Ejemplo: ZORRO-01 (estudiante) o DOCENTE-01 (docente).</p>
      <p v-if="error" id="codigo-error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn--primary">Entrar</button>
    </form>

    <div class="card">
      <h2>Códigos de ejemplo (ficticios)</h2>
      <p class="hint">Al elegir uno, la app entra con esos fixtures.</p>
      <div class="code-group">
        <button type="button" class="btn btn--secondary" @click="usarCodigo('ZORRO-01')">
          Estudiante Zorro-01
        </button>
        <button type="button" class="btn btn--secondary" @click="usarCodigo('PUMA-02')">
          Estudiante Puma-02
        </button>
        <button type="button" class="btn btn--secondary" @click="usarCodigo('DOCENTE-01')">
          Docente Uno
        </button>
        <button type="button" class="btn btn--secondary" @click="usarCodigo('DOCENTE-02')">
          Docente Dos
        </button>
      </div>
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
