import { test, expect } from '@playwright/test'

async function loginDocente(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código docente de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar como docente' }).click()
  await expect(page.getByRole('heading', { name: 'Diagnósticos del curso' })).toBeVisible()
}

test.describe('I1c · vista docente del diagnóstico', () => {
  test('lista los diagnósticos enviados del propio curso y permite valorar', async ({ page }) => {
    await loginDocente(page, 'DOCENTE-01')

    // Solo los estudiantes del curso X (Zorro-01 y Puma-02), nunca otros cursos.
    await expect(page.getByRole('button', { name: /Zorro-01/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Puma-02/ })).toBeVisible()
    await expect(page.getByText('Condor-03')).toHaveCount(0)

    await page.getByRole('button', { name: /Zorro-01/ }).click()
    await expect(page.getByRole('heading', { name: 'Zorro-01' })).toBeVisible()
    await expect(page.getByText('Respuesta sintética de T1')).toBeVisible()
    // Apoyos y barrera se muestran por separado del puntaje.
    await expect(page.getByText('Audio o lectura guiada')).toBeVisible()

    // T4 tiene barrera técnica: el puntaje queda nulo y el selector está deshabilitado.
    const t4 = page.locator('[data-task="T4"]')
    await expect(t4.getByText(/puntaje queda/i)).toBeVisible()
    await expect(t4.locator('#score-T4')).toBeDisabled()

    // Corregir T1 (de 2 a 1) registra historial.
    await page.locator('#score-T1').selectOption('1')
    await page.locator('#comment-T1').fill('Puede profundizar en la fecha.')
    await page.getByRole('button', { name: 'Guardar T1' }).click()
    await expect(page.getByText('Valoración de T1 guardada.')).toBeVisible()
    await expect(page.getByText(/T1: 2 → 1/)).toBeVisible()

    // Devolución: fortaleza observada y siguiente paso.
    await page.locator('#strength').fill('Contrasta la autoría de las fuentes.')
    await page.locator('#next-step').fill('Verificar la fecha antes de decidir.')
    await page.getByRole('button', { name: 'Guardar devolución' }).click()
    await expect(page.getByText('Devolución guardada.')).toBeVisible()
    await expect(page.getByText(/Contrasta la autoría de las fuentes/)).toBeVisible()

    await page.screenshot({ path: 'docs/capturas/10-docente-diagnostico.png', fullPage: true })
  })

  test('un docente de otro curso no ve los diagnósticos ajenos', async ({ page }) => {
    await loginDocente(page, 'DOCENTE-02')
    // El curso Y solo tiene a Condor-03; no debe aparecer ningún estudiante del curso X.
    await expect(page.getByText('Zorro-01')).toHaveCount(0)
    await expect(page.getByText('Puma-02')).toHaveCount(0)
  })
})
