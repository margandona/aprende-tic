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

  // La prueba falla ante CUALQUIER infracción automatizable en estas pantallas.
  const allViolations = Object.entries(report).flatMap(([screen, violations]) =>
    (violations as { impact: string | null; id: string }[]).map(
      (v) => `${screen}: ${v.id} (${v.impact ?? 'sin impacto'})`,
    ),
  )

  expect(allViolations, `Infracciones automatizables: ${allViolations.join(', ')}`).toEqual([])
})

/**
 * Contraste medido (no delegado a axe): calcula la razón de contraste real de
 * textos clave y exige ≥ 4.5:1 (texto normal) o ≥ 3:1 (texto grande).
 */
test('contraste medido en pantallas clave a 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/#/acceso')
  await page.getByRole('button', { name: 'Estudiante Zorro-01' }).click()
  await expect(page.getByRole('heading', { name: 'Mi recorrido' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Diagnóstico' }).click()
  await expect(page.getByTestId('diagnosis-case')).toBeVisible()

  const selectors = [
    '.diag p',
    '.diag .hint',
    '.diag .lede',
    '.diag .consigna',
    '.diag .provenance',
    '.diag .sim',
    '.diag .barrier',
    '.diag label',
    '.diag .btn',
    '.bottom-nav__link',
  ]

  const results = await page.evaluate((sels) => {
    const parse = (color: string): [number, number, number, number] => {
      const m = color.match(/rgba?\(([^)]+)\)/)
      if (!m) return [0, 0, 0, 1]
      const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
      return [parts[0], parts[1], parts[2], parts[3] ?? 1]
    }
    const lum = ([r, g, b]: [number, number, number, number]) => {
      const f = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a: [number, number, number, number], b: [number, number, number, number]) => {
      const l1 = lum(a)
      const l2 = lum(b)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }
    const bgOf = (el: Element): [number, number, number, number] => {
      let node: Element | null = el
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor)
        if (c[3] > 0) return c
        node = node.parentElement
      }
      return [255, 255, 255, 1]
    }
    const out: { selector: string; ratio: number; size: number }[] = []
    for (const sel of sels) {
      const el = document.querySelector(sel)
      if (!el) continue
      const style = getComputedStyle(el)
      const fg = parse(style.color)
      const bg = bgOf(el)
      out.push({ selector: sel, ratio: Number(ratio(fg, bg).toFixed(2)), size: parseFloat(style.fontSize) })
    }
    return out
  }, selectors)

  expect(results.length).toBeGreaterThan(3)
  for (const r of results) {
    const min = r.size >= 24 ? 3 : 4.5
    expect(r.ratio, `${r.selector} contraste ${r.ratio} < ${min}`).toBeGreaterThanOrEqual(min)
  }
})
