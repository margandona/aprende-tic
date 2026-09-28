import { test, expect } from '@playwright/test'
import { IDS, adminDb } from '../tests-emu/seed'

async function redeem(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código individual de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
}

async function abrirMision2Archivo(page: import('@playwright/test').Page) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Misiones' }).click()
  await page.getByRole('link', { name: /Escuchar la señal/ }).click()
  await expect(page.getByTestId('mission-detail')).toBeVisible()
  await page.getByRole('button', { name: 'Iniciar misión' }).click()
  await expect(page.getByText('Misión iniciada.')).toBeVisible()
  await page.getByRole('radio', { name: 'Archivo' }).check()
}

test.describe('I2c · subida de archivos en la misión 2', () => {
  test('rechaza tipo inválido y sube un archivo autorizado con confirmación', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await redeem(page, IDS.codeS10)
    await abrirMision2Archivo(page)

    // Semántica básica: grupo con leyenda y campo etiquetado.
    await expect(page.getByRole('group', { name: 'Formato de entrega' })).toBeVisible()
    await expect(page.getByLabel(/Archivo \(texto, PDF/)).toBeVisible()

    // Tipo no permitido (validación en cliente).
    await page.setInputFiles('#entrega-archivo', { name: 'malware.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('x') })
    await expect(page.getByRole('alert')).toContainText('Tipo de archivo no permitido')

    // Archivo válido.
    await page.setInputFiles('#entrega-archivo', { name: 'guia.txt', mimeType: 'text/plain', buffer: Buffer.from('Ficha de necesidad en archivo.') })
    await expect(page.getByText(/guia.txt/)).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    await page.getByRole('button', { name: 'Subir y enviar' }).click()
    await expect(page.getByTestId('mission-receipt')).toContainText('Versión 1')
    await expect(page.getByTestId('mission-receipt')).toContainText('fecha del servidor')
    await expect(page.getByTestId('mission-state')).toContainText('Por revisar')
    await page.screenshot({ path: 'docs/capturas/15-archivo-entrega.png', fullPage: true })
  })

  test('la revocación del vínculo antes de subir cierra la sesión', async ({ page }) => {
    await redeem(page, IDS.codeS11)
    await abrirMision2Archivo(page)
    await page.setInputFiles('#entrega-archivo', { name: 'guia.txt', mimeType: 'text/plain', buffer: Buffer.from('No debe subir.') })

    const bindings = await adminDb
      .collection('sessionBindings')
      .where('enrollmentId', '==', IDS.s11)
      .where('state', '==', 'active')
      .get()
    for (const d of bindings.docs) await d.ref.update({ state: 'revoked' })

    await page.getByRole('button', { name: 'Subir y enviar' }).click()
    await expect(page.getByRole('heading', { name: 'Entrar a RED-TIC' })).toBeVisible()
  })

  test('el docente ve la evidencia de archivo y puede abrirla', async ({ page }) => {
    await page.goto('/#/acceso')
    await page.getByLabel('Código docente de demostración').fill('DOCENTE-01')
    await page.getByRole('button', { name: 'Entrar como docente' }).click()
    await expect(page.getByRole('heading', { name: 'Diagnósticos del curso' })).toBeVisible()

    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Revisión' }).click()
    await page.locator('.review-item').filter({ hasText: 'Cuervo-10' }).getByRole('link', { name: 'Revisar' }).click()
    await expect(page.getByTestId('delivery-review')).toBeVisible()
    await expect(page.getByText(/guia.txt/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ver archivo' })).toBeVisible()
  })
})
