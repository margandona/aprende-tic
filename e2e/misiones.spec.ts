import { test, expect } from '@playwright/test'
import { IDS } from '../tests-emu/seed'

async function redeem(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código individual de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
}

async function irAMisiones(page: import('@playwright/test').Page) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Misiones' }).click()
  await expect(page.getByRole('heading', { name: 'Misiones', level: 1 })).toBeVisible()
}

async function abrirMision(page: import('@playwright/test').Page, name: RegExp) {
  await page.getByRole('link', { name }).click()
  await expect(page.getByTestId('mission-detail')).toBeVisible()
}

async function volver(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: /Volver a misiones/ }).click()
  await expect(page.getByRole('heading', { name: 'Misiones', level: 1 })).toBeVisible()
}

const MISSIONS: Array<[string, RegExp]> = [
  ['Abrir el mapa', /Abrir el mapa/],
  ['Escuchar la señal', /Escuchar la señal/],
  ['Elegir una ruta', /Elegir una ruta/],
  ['Construir el primer puente', /Construir el primer puente/],
  ['Probar el puente', /Probar el puente/],
  ['Compartir la ruta', /Compartir la ruta/],
]

test.describe('I2d · recorrido de las seis misiones', () => {
  test('muestra las seis misiones con su consigna, sin bloquear por puntos', async ({ page }) => {
    await redeem(page, IDS.codeS12)
    await irAMisiones(page)
    await expect(page.locator('.mission-card')).toHaveCount(6)

    // Ningún contenido esencial queda bloqueado por XP: todas las misiones abren desde el inicio.
    for (const [, name] of MISSIONS) {
      await abrirMision(page, name)
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
      await expect(page.getByText(/No incluyas contraseñas ni datos personales/)).toBeVisible()
      await volver(page)
    }
  })

  test('cada misión admite las modalidades definidas (texto / archivo)', async ({ page }) => {
    await redeem(page, IDS.codeS12)
    await irAMisiones(page)

    // Misión 1: solo texto.
    await abrirMision(page, /Abrir el mapa/)
    await page.getByRole('button', { name: 'Iniciar misión' }).click()
    await expect(page.getByText(/Modalidad admitida:.*texto/)).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Archivo' })).toHaveCount(0)
    await volver(page)

    // Misión 4: texto o archivo.
    await abrirMision(page, /Construir el primer puente/)
    await page.getByRole('button', { name: 'Iniciar misión' }).click()
    await expect(page.getByRole('group', { name: 'Formato de entrega' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Archivo' })).toBeVisible()
  })

  test('misión 4: entrega de archivo, validación docente y XP', async ({ page }) => {
    await redeem(page, IDS.codeS12)
    await irAMisiones(page)
    await abrirMision(page, /Construir el primer puente/)
    await page.getByRole('radio', { name: 'Archivo' }).check()
    await page.setInputFiles('#entrega-archivo', { name: 'guia.txt', mimeType: 'text/plain', buffer: Buffer.from('Guía v1.') })
    await page.getByRole('button', { name: 'Subir y enviar' }).click()
    await expect(page.getByTestId('mission-receipt')).toContainText('Versión 1')

    // Docente valida D3 y D4.
    await page.getByRole('button', { name: 'Salir' }).click()
    await page.goto('/#/acceso')
    await page.getByLabel('Código docente de demostración').fill('DOCENTE-01')
    await page.getByRole('button', { name: 'Entrar como docente' }).click()
    await expect(page.getByRole('heading', { name: 'Diagnósticos del curso' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Revisión' }).click()
    await page.locator('.review-item').filter({ hasText: 'Garza-12' }).getByRole('link', { name: 'Revisar' }).click()
    await expect(page.getByTestId('delivery-review')).toBeVisible()
    await page.locator('#lvl-enr-s12-D3').selectOption('achieved')
    await page.locator('#lvl-enr-s12-D4').selectOption('achieved')
    await page.getByRole('button', { name: 'Validar hito' }).click()
    await expect(page.getByText(/Hito validado/)).toBeVisible()
    await expect(page.getByText(/· 20 XP ·/)).toBeVisible()

    // El estudiante ve el XP en «Mi recorrido» y la valoración en «Mis aprendizajes».
    await page.getByRole('button', { name: 'Salir' }).click()
    await redeem(page, IDS.codeS12)
    await expect(page.getByTestId('journey-xp')).toContainText('20')
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Mis aprendizajes' }).click()
    await expect(page.getByText('Crear un recurso comprensible y accesible')).toBeVisible()
    await page.screenshot({ path: 'docs/capturas/16-misiones-completas.png', fullPage: true })
  })

  test('misión 6 a 320 px y con teclado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await redeem(page, IDS.codeS12)
    await irAMisiones(page)
    await abrirMision(page, /Compartir la ruta/)
    await page.getByRole('button', { name: 'Iniciar misión' }).click()
    await expect(page.getByText('Misión iniciada.')).toBeVisible()

    await page.locator('#entrega-texto').focus()
    expect(await page.evaluate(() => document.activeElement?.id ?? '')).toBe('entrega-texto')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('equivalencia en papel para una misión distinta (misión 4)', async ({ page }) => {
    await page.goto('/#/acceso')
    await page.getByLabel('Código docente de demostración').fill('DOCENTE-01')
    await page.getByRole('button', { name: 'Entrar como docente' }).click()
    await expect(page.getByRole('heading', { name: 'Diagnósticos del curso' })).toBeVisible()

    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Equivalencia' }).click()
    await page.locator('#eq-student').selectOption(IDS.s11)
    await page.locator('#eq-milestone').selectOption(IDS.milestone4)
    await page.locator('#eq-description').fill('Prototipo v1 en papel registrado por el docente.')
    await page.getByRole('button', { name: 'Registrar entrega equivalente' }).click()

    await expect(page.getByRole('heading', { name: /Construir el primer puente/ })).toBeVisible()
    await page.locator('#lvl-enr-s11-D3').selectOption('achieved')
    await page.locator('#lvl-enr-s11-D4').selectOption('achieved')
    await page.getByRole('button', { name: 'Validar hito' }).click()
    await expect(page.getByText(/Hito validado/)).toBeVisible()

    await page.getByRole('button', { name: 'Salir' }).click()
    await redeem(page, IDS.codeS11)
    await expect(page.getByTestId('journey-xp')).toContainText('20')
  })
})
