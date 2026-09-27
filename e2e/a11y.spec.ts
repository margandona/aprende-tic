import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'docs/accesibilidad'
mkdirSync(OUT, { recursive: true })

/**
 * Escaneo automático con axe-core.
 * NO declara conformidad WCAG: solo reporta hallazgos automatizables.
 */
test('axe-core: hallazgos automatizables en pantallas base', async ({ page }) => {
  await page.goto('/#/acceso')
  await page.getByRole('button', { name: 'Estudiante Zorro-01' }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()

  const screens = [
    '/#/estudiante/recorrido',
    '/#/estudiante/misiones',
    '/#/estudiante/aprendizajes',
    '/#/estudiante/ajustes',
  ]

  const report: Record<string, unknown> = {}

  for (const hash of screens) {
    await page.goto(hash)
    const results = await new AxeBuilder({ page }).analyze()
    report[hash] = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    }))
  }

  writeFileSync(`${OUT}/axe-report.json`, JSON.stringify(report, null, 2))

  const critical = Object.entries(report).flatMap(([screen, violations]) =>
    (violations as { impact: string | null; id: string }[])
      .filter((v) => v.impact === 'critical')
      .map((v) => `${screen}: ${v.id}`),
  )

  expect(critical, `Violaciones críticas: ${critical.join(', ')}`).toEqual([])
})
