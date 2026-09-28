<script setup lang="ts">
/**
 * Plantillas mínimas accesibles de las seis misiones (Fase 6).
 * Texto claro, sin datos sensibles y con versión imprimible para la ruta en papel.
 */
function imprimir(): void {
  window.print()
}
</script>

<template>
  <section aria-labelledby="tpl-title" data-testid="templates-view">
    <div class="no-print">
      <p><RouterLink to="/estudiante/misiones">← Volver a misiones</RouterLink></p>
      <h1 id="tpl-title">Plantillas de las misiones</h1>
      <p class="hint">
        Úsalas como guía de la entrega. No escribas contraseñas ni datos personales. También puedes imprimirlas.
      </p>
      <button type="button" class="btn btn--primary" @click="imprimir">Imprimir plantillas</button>
    </div>

    <article class="sheet">
      <section>
        <h2>M1 · Abrir el mapa — Pregunta abierta</h2>
        <p>Persona a la que quiero ayudar: ____________________________________</p>
        <p>Lo que <strong>ya sé</strong> del caso: ______________________________</p>
        <p>Lo que <strong>supongo</strong> (sin evidencia): ______________________</p>
        <p>Mi pregunta abierta: ______________________________________________</p>
      </section>

      <section>
        <h2>M2 · Escuchar la señal — Ficha de necesidad y fuentes</h2>
        <p>Para <strong>[destinatario]</strong>: ______________________________</p>
        <p>La tarea <strong>[tarea]</strong> se dificulta cuando <strong>[obstáculo]</strong>: ______</p>
        <p>Según <strong>[evidencia]</strong>: __________________________________</p>
        <p>Fuente A — autor/fecha/afirmación: ________________________________</p>
        <p>Fuente B — autor/fecha/afirmación: ________________________________</p>
        <p>Una afirmación por verificar: ______________________________________</p>
      </section>

      <section>
        <h2>M3 · Elegir una ruta — Alternativas, propuesta y plan</h2>
        <table>
          <thead>
            <tr><th>Criterio</th><th>Alternativa 1</th><th>Alternativa 2</th></tr>
          </thead>
          <tbody>
            <tr><td>Utilidad</td><td></td><td></td></tr>
            <tr><td>Facilidad de uso</td><td></td><td></td></tr>
            <tr><td>Accesibilidad</td><td></td><td></td></tr>
            <tr><td>Recursos</td><td></td><td></td></tr>
          </tbody>
        </table>
        <p>Propuesta de valor: ayudamos a ______ a ______ mediante ______ para que ______.</p>
        <p>Plan: tarea / responsable / tiempo / recurso: ________________________</p>
      </section>

      <section>
        <h2>M4 · Construir el primer puente — Guion del prototipo v1</h2>
        <p>Paso 1: ____________ · Paso 2: ____________ · Paso 3: ____________</p>
        <p>Camino de ayuda si algo falla: ____________________________________</p>
        <p>Comprobación: información correcta · secuencia · legibilidad · sin datos sensibles</p>
      </section>

      <section>
        <h2>M5 · Probar el puente — Observación y versión 2</h2>
        <p>Tarea pedida: ____________ · ¿Se logró? sí / no · Dudas: ____________</p>
        <p>Hallazgo (observación, no suposición): ____________________________</p>
        <p>Cambio en la versión 2: ____________ · Efecto esperado: ____________</p>
      </section>

      <section>
        <h2>M6 · Compartir la ruta — Presentación y reflexión</h2>
        <p>Problema · evidencia · solución · prueba · límite: ____________________</p>
        <p>Antes pensaba/hacía: ________________ · Ahora pruebo: ________________</p>
        <p>Evidencia que sostiene la utilidad: ________________________________</p>
        <p>Próxima mejora: __________________________________________________</p>
      </section>
    </article>
  </section>
</template>

<style scoped>
.hint {
  color: var(--rt-text-muted);
}
.sheet {
  background: var(--rt-surface);
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  padding: var(--rt-space-4);
  margin-top: var(--rt-space-3);
  color: var(--rt-text);
}
.sheet section {
  break-inside: avoid;
  margin-bottom: var(--rt-space-4);
}
h2 {
  font-size: var(--rt-font-size-base);
}
p {
  min-height: 1.6em;
  border-bottom: 1px dotted var(--rt-border);
  margin: var(--rt-space-1) 0;
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
