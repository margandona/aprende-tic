import { test, expect } from '@playwright/test'
import { IDS, adminDb, hashCode } from '../tests-emu/seed'

async function redeem(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código individual de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

test.describe('I1a · frontend conectado a Firebase Emulator Suite', () => {
  test('acceso propio con código individual', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
    await expect(page.getByText('Zorro-01').first()).toBeVisible()
    await expect(page.getByTestId('journey-xp')).toBeVisible()
  })

  test('aislamiento entre estudiantes y cambio de usuario', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    await expect(page.getByText('Zorro-01').first()).toBeVisible()

    // «Mis aprendizajes» muestra solo lo propio del vínculo activo.
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Mis aprendizajes' }).click()
    await expect(page.getByRole('heading', { name: 'Mis aprendizajes observados' })).toBeVisible()
    await expect(page.getByText('D1', { exact: true })).toBeVisible()

    // Cierre de sesión y cambio de usuario.
    await page.getByRole('button', { name: 'Salir' }).click()
    await expect(page.getByRole('heading', { name: 'Entrar a RED-TIC' })).toBeVisible()

    await redeem(page, IDS.codeS2)
    await expect(page.getByText('Puma-02').first()).toBeVisible()
    await expect(page.getByText('Zorro-01')).toHaveCount(0)
  })

  test('un código revocado no permite entrar', async ({ page }) => {
    await adminDb.doc(`codeCredentials/${hashCode(IDS.codeS2)}`).update({ state: 'revoked' })
    await redeem(page, IDS.codeS2)
    await expect(page.getByRole('alert')).toContainText('revocado')
  })

  test('la revocación de una sesión activa corta las lecturas', async ({ page }) => {
    await redeem(page, IDS.codeS1)
    await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()

    const bindings = await adminDb
      .collection('sessionBindings')
      .where('enrollmentId', '==', IDS.s1)
      .where('state', '==', 'active')
      .get()
    for (const d of bindings.docs) await d.ref.update({ state: 'revoked' })

    // Navegación dentro de la SPA: fuerza una nueva lectura que detecta la revocación.
    await page.evaluate(() => {
      window.location.hash = '#/estudiante/misiones'
    })
    await expect(page.getByRole('heading', { name: 'Entrar a RED-TIC' })).toBeVisible()
  })
})
