import { expect, test } from '@playwright/test'

let errors: string[] = []

test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
})

test.afterEach(() => {
  expect(errors, 'console errors').toEqual([])
})

test('opens on the ward at 14:30, with the four alerts of that minute', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Beds at\s+14:30/ })).toBeVisible()
  await expect(page.locator('.alert')).toHaveCount(4)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('Simulated data')).toBeVisible()
})

test('a shared link opens the room, layer and minute it names', async ({ page }) => {
  await page.goto('/?select=4A09&layer=temp&t=15:30')
  await expect(page.locator('.title')).toContainText('4A09')
  await expect(page.locator('.clock')).toHaveText('15:30')
  await expect(page.getByRole('radio', { name: 'Temperature' })).toHaveAttribute('aria-checked', 'true')
  const tag = page.locator('.tag--strong')
  await expect(tag).toContainText('4A09')
  await expect(tag).toContainText('°C')
  await expect(tag).toHaveCSS('visibility', 'visible')
})

test('switching layers keeps the address in step', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Air' }).click()
  await expect(page).toHaveURL(/layer=air/)
  await page.getByRole('radio', { name: 'Plan' }).click()
  await expect(page).toHaveURL(/view=plan/)
})

test('list view lists every room, and a row opens its day', async ({ page }) => {
  await page.goto('/?view=list')
  await expect(page.locator('.rooms tbody tr')).toHaveCount(38)
  await page.locator('.rooms').getByRole('button', { name: '4B04' }).click()
  await expect(page.locator('.title')).toContainText('4B04')
  await expect(page).toHaveURL(/select=4B04/)
})

test('search finds a piece of equipment', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.alert').first()).toBeVisible()
  await page.keyboard.press('/')
  await page.keyboard.type('IVP-07')
  await page.keyboard.press('Enter')
  await expect(page.locator('.title')).toContainText('IVP-07')
})

test('the timeline plays and pauses', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play the day' }).click()
  await expect(page.locator('.clock')).not.toHaveText('14:30')
  await page.getByRole('button', { name: 'Pause the replay' }).click()
  const stopped = await page.locator('.clock').textContent()
  await page.waitForTimeout(600)
  await expect(page.locator('.clock')).toHaveText(stopped ?? '')
})

test('never scrolls sideways', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.alert').first()).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('a lost WebGL context pauses the scene and rebuilds it when restored', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.alert').first()).toBeVisible()
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))!
    const ext = gl.getExtension('WEBGL_lose_context')!
    ext.loseContext()
    setTimeout(() => ext.restoreContext(), 800)
  })
  await expect(page.getByText('The 3D view paused')).toBeVisible()
  await expect(page.getByText('The 3D view paused')).toBeHidden()
  await expect(page.locator('canvas')).toBeVisible()
  const lost = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))!.isContextLost()
  })
  expect(lost).toBe(false)
})

test('live mode streams the day, and catches up after the server goes down', async ({ page }) => {
  await page.goto('/?mode=live')
  await expect(page.getByRole('radio', { name: 'Live' })).toHaveAttribute('aria-checked', 'true')
  const status = page.locator('.feed [role="status"]')
  await expect(status).toHaveText('Live')
  const clock = page.locator('.clock')
  const first = await clock.textContent()
  await expect(clock).not.toHaveText(first ?? '')

  await page.getByRole('button', { name: 'Take the server down for 4 seconds' }).click()
  await expect(status).toContainText('Offline')
  await expect(page.locator('.stale')).toBeVisible()
  await expect(status).toContainText('replayed', { timeout: 20_000 })
  await expect(page.locator('.stale')).toBeHidden()

  await page.getByRole('radio', { name: 'Replay' }).click()
  await expect(clock).toHaveText('14:30')
  await expect(page.locator('.alert')).toHaveCount(4)
  await expect(page).not.toHaveURL(/mode=live/)
})

test('the whole hospital: six levels, and any wing one click away', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.alert')).toHaveCount(4)
  // The building map on a wide screen, the panel's button on a phone.
  await page.getByRole('button', { name: /^(All levels|The whole hospital)$/ }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/at=hospital/)
  await expect(page.locator('.brand__where')).toContainText('36 wings')
  await expect(page.locator('.levels__row')).toHaveCount(6)
  await expect(page.getByText(/of 1,008 occupied/)).toBeVisible()

  await page.getByRole('button', { name: /^Level 6, R wing:/ }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/at=6r/)
  await expect(page.locator('.brand__where')).toContainText('Level 6, R wing')
  await expect(page.locator('.board__cell')).toHaveCount(28)

  await page.getByRole('radio', { name: 'List' }).click()
  await expect(page.locator('.rooms tbody tr')).toHaveCount(38)
})

test('a link to the hospital view lists every wing', async ({ page }) => {
  await page.goto('/?at=hospital&view=list')
  await expect(page.locator('.rooms tbody tr')).toHaveCount(36)
  await page.locator('.rooms').getByRole('button', { name: 'Level 2, K wing' }).click()
  await expect(page).toHaveURL(/at=2k/)
  await expect(page.locator('.rooms tbody tr')).toHaveCount(38)
})

test('a level shows its six wings, and the trail leads back up', async ({ page }) => {
  await page.goto('/?at=level-4')
  await expect(page.locator('.brand__where')).toContainText('Level 4 · six wings, 168 beds')
  await expect(page.locator('.levels__wings--level .chip')).toHaveCount(6)
  await page.getByRole('button', { name: /^Level 4, D wing:/ }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/at=4d/)
  await expect(page.locator('.board__cell')).toHaveCount(28)
  const trail = page.getByRole('navigation', { name: 'Where you are' })
  await trail.getByRole('button', { name: 'Level 4' }).click()
  await expect(page).toHaveURL(/at=level-4/)
  await trail.getByRole('button', { name: 'Hospital' }).click()
  await expect(page).toHaveURL(/at=hospital/)
})

test('finds the nearest free pump for a room and draws the way to it', async ({ page }) => {
  await page.goto('/?select=4A09')
  await expect(page.locator('.title')).toContainText('4A09')
  await page.getByRole('button', { name: 'Infusion pump', exact: true }).click()
  const found = page.locator('.route')
  await expect(found).toContainText(/IVP-\d{2} in the equipment store: \d+ m, \d+ s away/)
  await expect(page.locator('.tag--strong', { hasText: /IVP-/ })).toBeVisible()
  await page.getByRole('button', { name: 'Clear the way' }).click()
  await expect(found).toHaveCount(0)
})
