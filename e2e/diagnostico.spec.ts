import { test, expect } from '@playwright/test'
import { IDS, adminDb } from '../tests-emu/seed'

async function redeem(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código individual de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
}

async function completarEncuesta(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: 'Encuesta de condiciones (A1–A6)' })).toBeVisible()
  const selects = page.locator('.diag select')
  for (let i = 0; i < 5; i++) await selects.nth(i).selectOption({ index: 1 })
  await page.getByRole('textbox', { name: /A6/ }).fill('usar ClaveÚnica')
  await page.getByRole('button', { name: 'Guardar encuesta' }).click()
  await expect(page.getByRole('heading', { name: 'Tareas T1–T5' })).toBeVisible()
}

test.describe('I1b · diagnóstico en la interfaz', () => {
  test('separación entre diagnóstico y XP', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    // El recorrido muestra XP…
    await expect(page.getByTestId('journey-xp')).toBeVisible()
    // …y el diagnóstico (solo lectura) no muestra XP.
    await page.getByRole('link', { name: 'Diagnóstico' }).click()
    await expect(page.getByTestId('diagnosis-view')).toBeVisible()
    await expect(page.getByText('Diagnóstico enviado (inmutable)')).toBeVisible()
    await page.screenshot({ path: 'docs/capturas/08-diagnostico.png', fullPage: true })
    // El diagnóstico no expone el panel narrativo (XP/insignias/nivel).
    await expect(page.getByTestId('diagnosis-view').getByText('Nivel narrativo')).toHaveCount(0)
    await expect(page.getByTestId('diagnosis-view').getByText('Puntos Totales')).toHaveCount(0)
  })

  test('envío inmutable del diagnóstico (A1–A6 + T1–T5)', async ({ page }) => {
    await redeem(page, IDS.codeS2)
    await page.getByRole('link', { name: 'Diagnóstico' }).click()
    await completarEncuesta(page)

    await page.locator('#resp-T1').fill('Comparo las fuentes A y B y justifico dos razones.')
    // Apoyo independiente del puntaje + barrera técnica.
    await page.locator('[data-task="T2"] input[type="checkbox"]').first().check()
    await page.getByRole('button', { name: 'Enviar diagnóstico' }).click()
    await expect(page.getByText('Diagnóstico enviado (inmutable)')).toBeVisible()

    // Tras el envío, la respuesta queda en solo lectura.
    await expect(page.locator('#resp-T1')).toBeDisabled()
  })

  test('reintento de carga: el borrador persiste al recargar', async ({ page }) => {
    await redeem(page, IDS.codeS3)
    await page.getByRole('link', { name: 'Diagnóstico' }).click()
    await completarEncuesta(page)

    await page.locator('#resp-T1').fill('Borrador que debe persistir.')
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page.getByText('Borrador guardado.')).toBeVisible()

    await page.reload()
    await page.getByRole('link', { name: 'Diagnóstico' }).click()
    await expect(page.locator('#resp-T1')).toHaveValue('Borrador que debe persistir.')
  })

  test('revocación durante la sesión redirige al acceso', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    await page.getByRole('link', { name: 'Diagnóstico' }).click()
    await expect(page.getByTestId('diagnosis-view')).toBeVisible()

    const bindings = await adminDb
      .collection('sessionBindings')
      .where('enrollmentId', '==', IDS.s1)
      .where('state', '==', 'active')
      .get()
    for (const d of bindings.docs) await d.ref.update({ state: 'revoked' })

    await page.getByRole('link', { name: 'Misiones' }).click()
    await expect(page.getByRole('heading', { name: 'Entrar a RED-TIC' })).toBeVisible()
  })
})
