import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SHOTS = 'docs/capturas'
mkdirSync(SHOTS, { recursive: true })

async function enterAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/#/acceso')
  await page.getByRole('button', { name: 'Estudiante Zorro-01' }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
}

test.describe('Ancho de 320 px (reflow sin scroll horizontal)', () => {
  test('las pantallas base no desbordan a 320 px', async ({ page }) => {
    await page.goto('/#/acceso')
    await expect(page.getByRole('heading', { name: 'Entrar a RED-TIC' })).toBeVisible()

    const pages = [
      { hash: '/estudiante/recorrido', heading: 'Mi recorrido', shot: '01-recorrido.png' },
      { hash: '/estudiante/misiones', heading: 'Misiones', shot: '02-misiones.png' },
      { hash: '/estudiante/aprendizajes', heading: 'Mis aprendizajes observados', shot: '03-aprendizajes.png' },
    ]

    await enterAsStudent(page)

    for (const p of pages) {
      await page.goto(`/#${p.hash}`)
      await expect(page.getByRole('heading', { name: p.heading, level: 1 })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `desborde horizontal en ${p.hash}`).toBeLessThanOrEqual(1)
      await page.screenshot({ path: `${SHOTS}/${p.shot}`, fullPage: true })
    }

    // Vista docente
    await page.goto('/#/acceso')
    await page.getByRole('button', { name: 'Docente Uno' }).click()
    await expect(page.getByRole('heading', { name: 'Panel del curso' })).toBeVisible()
    const overflowDocente = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflowDocente).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `${SHOTS}/04-panel-docente.png`, fullPage: true })
  })
})

test.describe('Teclado y foco', () => {
  test('el primer Tab enfoca el enlace «saltar al contenido»', async ({ page }) => {
    await enterAsStudent(page)
    await page.keyboard.press('Tab')
    const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
    expect(focusedText).toContain('Saltar al contenido')
  })

  test('los enlaces de navegación son alcanzables con teclado y tienen nombre accesible', async ({ page }) => {
    await enterAsStudent(page)
    const nav = page.getByRole('navigation', { name: 'Navegación principal' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Mi recorrido' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Mis aprendizajes' })).toBeVisible()
  })
})

test.describe('Movimiento reducido', () => {
  test('prefers-reduced-motion desactiva la animación del indicador de carga', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await enterAsStudent(page)
    await page.getByRole('button', { name: 'Carga' }).click()
    // Navegamos a una pantalla que se monta en estado de carga (determinista).
    await page.getByRole('link', { name: 'Misiones' }).click()
    const spinner = page.locator('.spinner')
    await expect(spinner).toBeVisible()
    const duration = await spinner.evaluate((el) => getComputedStyle(el).animationDuration)
    const seconds = duration.endsWith('ms') ? parseFloat(duration) / 1000 : parseFloat(duration)
    expect(seconds, `animation-duration=${duration}`).toBeLessThan(0.05)
    await page.screenshot({ path: `${SHOTS}/05-estado-carga-reduced-motion.png` })
  })
})

test.describe('Estados de demostración', () => {
  test('vacío y error son visibles en «Mis aprendizajes»', async ({ page }) => {
    await enterAsStudent(page)
    await page.goto('/#/estudiante/aprendizajes')

    await page.getByRole('button', { name: 'Vacío' }).click()
    await expect(page.getByText('Aún no hay aprendizajes observados')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/06-estado-vacio.png`, fullPage: true })

    await page.getByRole('button', { name: 'Error' }).click()
    await expect(page.getByRole('alert')).toContainText('Ocurrió un problema')
    await page.screenshot({ path: `${SHOTS}/07-estado-error.png`, fullPage: true })
  })
})
