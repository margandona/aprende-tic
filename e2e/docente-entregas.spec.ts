import { test, expect } from '@playwright/test'

async function loginDocente(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código docente de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar como docente' }).click()
  await expect(page.getByRole('heading', { name: 'Diagnósticos del curso' })).toBeVisible()
}

test.describe('I2a · lectura docente de entregas pendientes', () => {
  test('lista las entregas por revisar del propio curso (sin valoración)', async ({ page }) => {
    await loginDocente(page, 'DOCENTE-01')
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Revisión' }).click()

    await expect(page.getByRole('heading', { name: 'Entregas por revisar' })).toBeVisible()
    await expect(page.getByText('Zorro-01')).toBeVisible()
    await expect(page.getByText(/Escuchar la señal/).first()).toBeVisible()

    // Sin valoración ni XP en esta porción.
    await expect(page.getByRole('button', { name: /Validar/i })).toHaveCount(0)
    await expect(page.getByRole('combobox')).toHaveCount(0)
  })

  test('un docente de otro curso no ve estas entregas', async ({ page }) => {
    await loginDocente(page, 'DOCENTE-02')
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Revisión' }).click()
    await expect(page.getByRole('heading', { name: 'Entregas por revisar' })).toBeVisible()
    await expect(page.getByText('Zorro-01')).toHaveCount(0)
  })
})
