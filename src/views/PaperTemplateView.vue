<script setup lang="ts">
/**
 * Plantilla imprimible para la ruta en papel (O5 de Fase 8).
 * No requiere sesión ni conexión: se imprime y se entrega en mano.
 */
function imprimir(): void {
  window.print()
}
</script>

<template>
  <section aria-labelledby="pt-title" data-testid="paper-template">
    <div class="no-print">
      <p><RouterLink to="/docente/equivalencia">← Volver a registrar entrega equivalente</RouterLink></p>
      <button type="button" class="btn btn--primary" @click="imprimir">Imprimir plantilla</button>
    </div>

    <article class="sheet">
      <h1 id="pt-title">RED-TIC · Entrega en papel (registro)</h1>
      <p class="lead">
        Esta hoja permite acreditar una entrega cuando no hay conexión o dispositivo personal. El docente la registra
        después en la plataforma; otorga el <strong>mismo XP</strong> que una entrega digital.
      </p>

      <section>
        <h2>Datos</h2>
        <p>Estudiante (seudónimo): ______________________________</p>
        <p>Misión / hito: _______________________________________</p>
        <p>Soporte: ☐ papel  ☐ audio local  ☐ maqueta  ☐ dictado  ☐ adaptación autorizada</p>
        <p>Fecha: ______ / ______ / __________</p>
      </section>

      <section>
        <h2>Descripción de la evidencia</h2>
        <p class="lines">_______________________________________________________________________</p>
        <p class="lines">_______________________________________________________________________</p>
        <p class="lines">_______________________________________________________________________</p>
      </section>

      <section>
        <h2>Valoración por indicador (no evaluado ≠ valoración baja)</h2>
        <table>
          <thead>
            <tr><th>Indicador</th><th>No evaluado</th><th>Incipiente</th><th>En desarrollo</th><th>Logrado</th><th>Transferible</th></tr>
          </thead>
          <tbody>
            <tr v-for="code in ['D1', 'E1']" :key="code">
              <td>{{ code }}</td>
              <td>☐</td><td>☐</td><td>☐</td><td>☐</td><td>☐</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Devolución al estudiante</h2>
        <p>Fortaleza observada: ________________________________________________</p>
        <p>Siguiente paso: ______________________________________________________</p>
      </section>

      <section>
        <h2>Apoyos registrados (por separado)</h2>
        <p>☐ lectura guiada  ☐ más tiempo  ☐ dictado  ☐ material adaptado  ☐ dispositivo compartido  ☐ otro</p>
      </section>
    </article>
  </section>
</template>

<style scoped>
.sheet {
  background: var(--rt-surface);
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-4);
  margin-top: var(--rt-space-3);
  color: var(--rt-text);
}
.lead {
  color: var(--rt-text-muted);
}
h2 {
  margin-top: var(--rt-space-4);
  font-size: var(--rt-font-size-base);
}
.lines {
  border-bottom: 1px solid var(--rt-border);
  min-height: 1.6em;
  margin: var(--rt-space-2) 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--rt-font-size-sm);
}
th,
td {
  border: 1px solid var(--rt-border);
  padding: var(--rt-space-1);
  text-align: center;
}
th:first-child,
td:first-child {
  text-align: left;
}
@media print {
  .no-print {
    display: none;
  }
  .sheet {
    border: none;
    padding: 0;
    margin: 0;
  }
}
</style>
