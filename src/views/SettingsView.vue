<script setup lang="ts">
import { ref } from 'vue'

type TextSize = 'normal' | 'grande'
const textSize = ref<TextSize>('normal')

function apply(size: TextSize): void {
  textSize.value = size
  document.documentElement.style.setProperty(
    '--rt-font-size-base',
    size === 'grande' ? '1.125rem' : '1rem',
  )
}
</script>

<template>
  <section aria-labelledby="settings-title">
    <h1 id="settings-title">Ajustes</h1>

    <div class="card">
      <h2>Tamaño del texto</h2>
      <div class="options">
        <button
          type="button"
          class="btn btn--secondary"
          :aria-pressed="textSize === 'normal'"
          @click="apply('normal')"
        >
          Normal
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          :aria-pressed="textSize === 'grande'"
          @click="apply('grande')"
        >
          Grande
        </button>
      </div>
    </div>

    <div class="card">
      <h2>Movimiento reducido</h2>
      <p>
        RED-TIC respeta la preferencia del sistema <code>prefers-reduced-motion</code>. Si la activas en tu
        dispositivo, se desactivan las animaciones.
      </p>
    </div>

    <div class="card">
      <h2>Privacidad</h2>
      <p>
        Esta demostración no pide datos personales y no se conecta a ningún servidor. Los datos que ves son
        ficticios.
      </p>
    </div>
  </section>
</template>

<style scoped>
.options {
  display: flex;
  gap: var(--rt-space-2);
}
</style>
