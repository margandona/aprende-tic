import { test, expect } from '@playwright/test'

async function loginDocente(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código docente de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar como docente' }).click()
  await expect(page.getByRole('heading', { name: 'Diagnósticos del curso' })).toBeVisible()
}

async function loginStudent(page: import('@playwright/test').Page, code: string) {
  await page.goto('/#/acceso')
  await page.getByLabel('Código individual de demostración').fill(code)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
}

async function abrirRevision(page: import('@playwright/test').Page, pseudonym: string) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Revisión' }).click()
  await expect(page.getByRole('heading', { name: 'Entregas por revisar' })).toBeVisible()
  await page.locator('.review-item').filter({ hasText: pseudonym }).getByRole('link', { name: 'Revisar' }).click()
  await expect(page.getByTestId('delivery-review')).toBeVisible()
}

test.describe('I2b · ciclo de revisión de la misión 2', () => {
  test('valida el hito, otorga XP y lo muestra en los paneles separados', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await loginDocente(page, 'DOCENTE-01')
    await abrirRevision(page, 'Lobo-07')
    await expect(page.getByRole('heading', { name: /Escuchar la señal/ })).toBeVisible()

    // Reflow a 320 px y foco por teclado.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await page.locator('#lvl-enr-s7-D1').focus()
    expect(await page.evaluate(() => document.activeElement?.id ?? '')).toBe('lvl-enr-s7-D1')

    await page.locator('#lvl-enr-s7-D1').selectOption('achieved')
    await page.locator('#str-enr-s7-D1').fill('Contrasta la autoría de las fuentes.')
    await page.locator('#nxt-enr-s7-D1').fill('Verificar la fecha antes de decidir.')
    await page.getByRole('button', { name: 'Validar hito' }).click()
    await expect(page.getByText(/Hito validado/)).toBeVisible()
    await expect(page.getByText(/· 20 XP ·/)).toBeVisible()
    await expect(page.getByText(/vigente/)).toBeVisible()
    await page.screenshot({ path: 'docs/capturas/12-docente-revision.png', fullPage: true })

    // Recarga: la validación persiste.
    await page.reload()
    await expect(page.getByText(/vigente/)).toBeVisible()

    // Paneles separados en el estudiante.
    await page.getByRole('button', { name: 'Salir' }).click()
    await loginStudent(page, 'LOBO-07')
    await expect(page.getByTestId('journey-xp')).toContainText('20')
    await expect(page.getByText('Buscar y valorar información')).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Mis aprendizajes' }).click()
    await expect(page.getByRole('heading', { name: 'Mis aprendizajes observados' })).toBeVisible()
    await expect(page.getByText('Contrasta la autoría de las fuentes.')).toBeVisible()
    await expect(page.getByText('Verificar la fecha antes de decidir.')).toBeVisible()
    await page.screenshot({ path: 'docs/capturas/13-aprendizajes-validado.png', fullPage: true })
  })

  test('pide ajuste, el estudiante envía una nueva versión y conserva versiones', async ({ page }) => {
    // El estudiante con un ajuste pendiente (Mono-09) envía la versión 2.
    await loginStudent(page, 'MONO-09')
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Misiones' }).click()
    await page.getByRole('link', { name: /Escuchar la señal/ }).click()
    await expect(page.getByTestId('mission-adjustment')).toBeVisible()
    await expect(page.getByText(/Añade una fuente/)).toBeVisible()
    await page.locator('#entrega-texto').fill('Ficha v2 con fuente añadida y qué confirmar.')
    await page.getByRole('button', { name: 'Enviar entrega' }).click()
    await expect(page.getByTestId('mission-receipt')).toContainText('Versión 2')
    await expect(page.getByText('Versión 1', { exact: true })).toBeVisible()

    // El docente pide un nuevo ajuste sobre la entrega por revisar.
    await page.getByRole('button', { name: 'Salir' }).click()
    await loginDocente(page, 'DOCENTE-01')
    await abrirRevision(page, 'Mono-09')
    await page.locator('#adjustment-action').fill('Revisa el enlace simulado del mensaje.')
    await page.getByRole('button', { name: 'Pedir ajuste' }).click()
    await expect(page.getByText(/Ajuste solicitado/)).toBeVisible()
  })

  test('registra entrega equivalente, la valida y ofrece la plantilla imprimible', async ({ page }) => {
    await loginDocente(page, 'DOCENTE-01')
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Equivalencia' }).click()
    await expect(page.getByRole('heading', { name: 'Registrar entrega equivalente' })).toBeVisible()

    await page.locator('#eq-student').selectOption('enr-s8')
    await page.locator('#eq-milestone').selectOption('milestone-2')
    await page.getByRole('checkbox', { name: 'Lectura guiada' }).check()
    await page.getByRole('checkbox', { name: 'Más tiempo' }).check()
    await page.locator('#eq-description').fill('Ficha en papel registrada por el docente.')
    await page.getByRole('button', { name: 'Registrar entrega equivalente' }).click()

    // Queda por revisar y se valora con el mismo XP.
    await expect(page.getByRole('heading', { name: /Escuchar la señal/ })).toBeVisible()
    await expect(page.getByText(/registro docente \(equivalencia\)/)).toBeVisible()
    await expect(page.getByText(/Lectura guiada/)).toBeVisible()
    await page.locator('#lvl-enr-s8-D1').selectOption('achieved')
    await page.getByRole('button', { name: 'Validar hito' }).click()
    await expect(page.getByText(/Hito validado/)).toBeVisible()

    await page.getByRole('button', { name: 'Salir' }).click()
    await loginStudent(page, 'TIGRE-08')
    await expect(page.getByTestId('journey-xp')).toContainText('20')
    await page.screenshot({ path: 'docs/capturas/14-equivalencia.png', fullPage: true })

    // Plantilla imprimible.
    await page.getByRole('button', { name: 'Salir' }).click()
    await loginDocente(page, 'DOCENTE-01')
    await page.goto('/#/docente/plantilla')
    await expect(page.getByRole('heading', { name: /Entrega en papel/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Imprimir plantilla' })).toBeVisible()
  })

  test('un docente de otro curso no ve ni revisa estas entregas', async ({ page }) => {
    await loginDocente(page, 'DOCENTE-02')
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Revisión' }).click()
    await expect(page.getByRole('heading', { name: 'Entregas por revisar' })).toBeVisible()
    await expect(page.getByText('Lobo-07')).toHaveCount(0)
    await expect(page.getByText('Mono-09')).toHaveCount(0)
    await expect(page.getByText('Tigre-08')).toHaveCount(0)
  })
})
