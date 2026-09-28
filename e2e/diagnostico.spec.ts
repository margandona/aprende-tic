import { test, expect } from '@playwright/test'
import { IDS, adminDb } from '../tests-emu/seed'

async function redeem(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código individual de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
}

async function abrirDiagnostico(page: import('@playwright/test').Page) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Diagnóstico' }).click()
}

/** Completa la encuesta con valores válidos (A1 múltiple, A4 «otra», A6 vacío opcional). */
async function completarEncuesta(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Encuesta de condiciones (A1–A6)' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'teléfono propio' }).check()
  await page.getByRole('checkbox', { name: 'computador compartido' }).check()
  await page.getByLabel('A2 · ¿Dónde tienes conexión para una tarea?').selectOption({ index: 1 })
  await page.getByLabel('A3 · ¿Qué te resulta más cómodo para aprender una tarea nueva?').selectOption({ index: 1 })
  await page.getByLabel('A4 · ¿Necesitas alguna condición para participar mejor?').selectOption('otra')
  await page.getByLabel(/Describe la condición/).fill('espacio con menos ruido')
  await page.locator('#A5-created').selectOption({ index: 1 })
  await page.locator('#A5-verified').selectOption({ index: 1 })
  // A5-explained y A6 se dejan en blanco a propósito (opcionales).
  await page.getByRole('button', { name: 'Guardar encuesta' }).click()
  await expect(page.getByRole('heading', { name: 'Tareas T1–T5' })).toBeVisible()
}

test.describe('I1b/I1c · diagnóstico en la interfaz', () => {
  test('separación entre diagnóstico y XP', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    await expect(page.getByTestId('journey-xp')).toBeVisible()
    await abrirDiagnostico(page)
    await expect(page.getByTestId('diagnosis-view')).toBeVisible()
    await expect(page.getByText('Diagnóstico enviado (inmutable)')).toBeVisible()
    await expect(page.getByTestId('diagnosis-view').getByText('Nivel narrativo')).toHaveCount(0)
    await expect(page.getByTestId('diagnosis-view').getByText('Puntos Totales')).toHaveCount(0)
    await page.screenshot({ path: 'docs/capturas/08-diagnostico.png', fullPage: true })
  })

  test('presenta el caso, las fichas A/B y el mensaje sin enlace activo', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    await abrirDiagnostico(page)
    const caso = page.getByTestId('diagnosis-case')
    await expect(caso).toBeVisible()
    await expect(caso.getByText('Biblioteca del Barrio Los Aromos')).toBeVisible()
    await expect(caso.getByText(/Marta Ibáñez/)).toBeVisible()
    await expect(caso.getByText(/publicación anónima/i)).toBeVisible()
    await expect(caso.getByText(/\$2.000/)).toBeVisible()

    const mensaje = page.getByTestId('suspicious-message')
    await expect(mensaje.getByText('reserva-rapida.example/ingreso')).toBeVisible()
    // El enlace simulado no es un ancla: no hay ningún <a> en el mensaje.
    await expect(mensaje.locator('a')).toHaveCount(0)
    await page.screenshot({ path: 'docs/capturas/09-caso-fuentes.png', fullPage: true })
  })

  test('encuesta múltiple/opcional habilita las tareas', async ({ page }) => {
    await redeem(page, IDS.codeS4)
    await abrirDiagnostico(page)
    await completarEncuesta(page)
    await expect(page.getByRole('heading', { name: 'Tareas T1–T5' })).toBeVisible()
  })

  test('el borrador persiste al recargar', async ({ page }) => {
    await redeem(page, IDS.codeS5)
    await abrirDiagnostico(page)
    await completarEncuesta(page)

    await page.locator('#resp-T1').fill('Borrador que debe persistir.')
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page.getByText('Borrador guardado.')).toBeVisible()

    await page.reload()
    await abrirDiagnostico(page)
    await expect(page.locator('#resp-T1')).toHaveValue('Borrador que debe persistir.')
  })

  test('envío inmutable del diagnóstico (A1–A6 + T1–T5)', async ({ page }) => {
    await redeem(page, IDS.codeS6)
    await abrirDiagnostico(page)
    await completarEncuesta(page)

    await page.locator('#resp-T1').fill('Comparo las fuentes A y B y justifico dos razones.')
    await page.locator('[data-task="T2"]').getByRole('checkbox', { name: 'Audio o lectura guiada' }).check()
    await page.getByRole('button', { name: 'Enviar diagnóstico' }).click()
    await expect(page.getByText('Diagnóstico enviado (inmutable)')).toBeVisible()

    // Tras el envío, la respuesta queda en solo lectura.
    await expect(page.locator('#resp-T1')).toBeDisabled()
  })

  test('revocación durante la sesión redirige al acceso', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    await abrirDiagnostico(page)
    await expect(page.getByTestId('diagnosis-view')).toBeVisible()

    const bindings = await adminDb
      .collection('sessionBindings')
      .where('enrollmentId', '==', IDS.s1)
      .where('state', '==', 'active')
      .get()
    for (const d of bindings.docs) await d.ref.update({ state: 'revoked' })

    // Al volver el foco, la revalidación detecta la revocación y cierra la sesión.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('heading', { name: 'Entrar a RED-TIC' })).toBeVisible()
  })
})
