import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Every view a visitor can open by link, checked against WCAG 2.2 A and AA. The check reads the whole
// page, the canvas included, which is slow beside the WebGL work on a shared CI machine.
test.describe.configure({ timeout: 120_000 })

const PAGES = [
  ['a wing', '/'],
  ['a room, in the temperature layer', '/?select=4A09&layer=temp&t=15:30'],
  ['the plan view', '/?view=plan'],
  ['the list view of the whole hospital', '/?at=hospital&view=list'],
  ['a level', '/?at=level-4'],
  ['live mode', '/?mode=live'],
  ['the Arabic interface', '/?lang=ar&select=4A09'],
  ['the demo host page', '/host/'],
] as const

for (const [name, path] of PAGES) {
  test(`${name} passes the automated accessibility checks`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator(path.startsWith('/host') ? '#alerts li' : '.panel h2').first()).toBeVisible()
    await page.waitForTimeout(1500)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    const found = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`)
    expect(found).toEqual([])
  })
}
