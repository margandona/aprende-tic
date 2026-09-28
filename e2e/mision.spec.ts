import { test, expect } from '@playwright/test'
import { IDS, adminDb } from '../tests-emu/seed'

async function redeem(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código individual de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
}

async function abrirMision2(page: import('@playwright/test').Page) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Misiones' }).click()
  await expect(page.getByRole('heading', { name: 'Misiones', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: /Escuchar la señal/ }).click()
  await expect(page.getByTestId('mission-detail')).toBeVisible()
}

test.describe('I2a · misión con entrega de texto', () => {
  test('lista las seis misiones', async ({ page }) => {
    await redeem(page, IDS.codeS4)
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Misiones' }).click()
    await expect(page.locator('.mission-card')).toHaveCount(6)
    await expect(page.getByRole('link', { name: /Escuchar la señal/ })).toBeVisible()
  })

  test('inicia, guarda borrador, recarga, envía y confirma (versión 1)', async ({ page }) => {
    await redeem(page, IDS.codeS4)
    await abrirMision2(page)
    await expect(page.getByTestId('mission-state')).toContainText('Sin iniciar')

    await page.getByRole('button', { name: 'Iniciar misión' }).click()
    await expect(page.getByText('Misión iniciada.')).toBeVisible()

    await page.locator('#entrega-texto').fill('Ficha de necesidad: las personas mayores no encuentran el botón de reserva.')
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page.getByText('Borrador guardado solo en este dispositivo.')).toBeVisible()

    // El borrador persiste al recargar (solo en este dispositivo).
    await page.reload()
    await expect(page.locator('#entrega-texto')).toHaveValue(/no encuentran el botón/)

    await page.getByRole('button', { name: 'Enviar entrega' }).click()
    await expect(page.getByTestId('mission-receipt')).toBeVisible()
    await expect(page.getByTestId('mission-receipt')).toContainText('Versión 1')
    await expect(page.getByTestId('mission-state')).toContainText('Por revisar')
    await page.screenshot({ path: 'docs/capturas/11-mision-entrega.png', fullPage: true })
  })

  test('la revocación del vínculo antes de enviar cierra la sesión', async ({ page }) => {
    await redeem(page, IDS.codeS5)
    await abrirMision2(page)
    await page.getByRole('button', { name: 'Iniciar misión' }).click()
    await expect(page.getByText('Misión iniciada.')).toBeVisible()
    await page.locator('#entrega-texto').fill('Entrega que no debe registrarse.')

    const bindings = await adminDb
      .collection('sessionBindings')
      .where('enrollmentId', '==', IDS.s5)
      .where('state', '==', 'active')
      .get()
    for (const d of bindings.docs) await d.ref.update({ state: 'revoked' })

    await page.getByRole('button', { name: 'Enviar entrega' }).click()
    await expect(page.getByRole('heading', { name: 'Entrar a RED-TIC' })).toBeVisible()
  })

  test('teclado y móvil 320 px en el detalle de misión', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await redeem(page, IDS.codeS6)
    await abrirMision2(page)
    await page.getByRole('button', { name: 'Iniciar misión' }).click()
    await expect(page.getByText('Misión iniciada.')).toBeVisible()

    // El campo de entrega es alcanzable y enfocable por teclado.
    await page.locator('#entrega-texto').focus()
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? '')
    expect(focusedId).toBe('entrega-texto')

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
