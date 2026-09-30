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
  // Air and temperature estimate the corridors, and say so under the key.
  await expect(page.getByText('Corridors: estimated from the doors')).toBeVisible()
  await page.getByRole('radio', { name: 'Plan' }).click()
  await expect(page).toHaveURL(/view=plan/)
  await page.getByRole('radio', { name: 'Beds' }).click()
  await expect(page.getByText('Corridors: estimated from the doors')).toHaveCount(0)
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

// The effects (ambient occlusion and SMAA, desktop only) may be running when the context goes, or still on their way
// over a slow connection and arrive while it is gone; either way the scene must pause and come back.
for (const late of [false, true]) {
  test(`a lost WebGL context pauses the scene and rebuilds it when restored${late ? ', with the effects arriving after the loss' : ''}`, async ({ page }) => {
    let release = () => {}
    const lostFirst = new Promise<void>((resolve) => (release = resolve))
    if (late) {
      await page.route('**/assets/Effects-*.js', async (route) => {
        await lostFirst
        await route.continue()
      })
    }
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
    release()
    await expect(page.getByText('The 3D view paused')).toBeVisible()
    await expect(page.getByText('The 3D view paused')).toBeHidden()
    await expect(page.locator('canvas')).toBeVisible()
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!
      return (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))!.isContextLost()
    })
    expect(lost).toBe(false)
  })
}

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

test('a new place opens at the top of the panel, not where the last one was scrolled to', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.alert')).toHaveCount(4)
  const panel = page.locator('.panel')
  await panel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await page.locator('.alert').last().click()
  await expect(page.locator('.title')).toBeVisible()
  await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBe(0)
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

test('switches to Arabic, right to left, keeps the choice, and switches back', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.locator('.alert')).toHaveCount(4)
  await page.getByRole('button', { name: 'العربية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page).toHaveURL(/lang=ar/)
  await expect(page.getByRole('heading', { name: /يحتاج انتباهًا/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  // The panel mirrors to the left of the model on a wide screen; on a phone it sits below.
  if (info.project.name === 'desktop') {
    const panel = (await page.locator('.panel').boundingBox())!
    const stage = (await page.locator('.stage').boundingBox())!
    expect(panel.x).toBeLessThan(stage.x)
  }
  // The choice is remembered without the link.
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page).not.toHaveURL(/lang=/)
  await expect(page.getByRole('heading', { name: /Needs attention/ })).toBeVisible()
})

test('an Arabic link opens in Arabic, with readings, times and room numbers intact', async ({ page }) => {
  await page.goto('/?lang=ar&select=4A09&t=15:30')
  await expect(page.locator('.title')).toContainText('4A09')
  await expect(page.locator('.alert__title')).toContainText('الغرفة أدفأ من اللازم')
  await expect(page.locator('.alert__detail')).toContainText('°م الآن، والحد 25.5 °م')
  await page.getByRole('radio', { name: 'قائمة' }).click()
  await expect(page.getByRole('columnheader', { name: 'الغرفة' })).toBeVisible()
  await expect(page.locator('.rooms tbody tr')).toHaveCount(38)
})

// A host on another origin: Playwright serves this page at a made-up address, and the twin comes from the preview server.
// Chrome asks before a page from elsewhere loads anything from this machine; the test grants that, as it can for a secure page.
const HOST = 'https://host.test/'
const hostPage = (twin: string) => `<!doctype html>
<script src="${twin}embed.js" defer></script>
<ward-twin at="4a" style="height: 640px"></ward-twin>
<script>
  window.heard = []
  for (const type of ['twin-ready', 'twin-select', 'twin-alerts', 'twin-alert', 'twin-error'])
    document.addEventListener(type, (e) => heard.push({ type, ...e.detail }))
</script>`

type Heard = { type: string; id?: string; key?: string; alerts?: { title: string; target: { id: string } }[]; alert?: { title: string } }

test('a page on another origin moves the embedded twin and hears what happens in it', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['local-network-access'], { origin: HOST })
  await page.route(HOST, (route) => route.fulfill({ contentType: 'text/html', body: hostPage(baseURL!) }))
  await page.goto(HOST)
  const heard = (type: string) => page.evaluate((t) => (window as unknown as { heard: Heard[] }).heard.filter((h) => h.type === t), type)
  const twin = page.frameLocator('ward-twin iframe')
  await expect(twin.getByRole('heading', { name: /Beds at\s+14:30/ })).toBeVisible()
  await expect.poll(() => heard('twin-ready')).toHaveLength(1)

  // The host sets what a link sets.
  await page.evaluate(() => (document.querySelector('ward-twin') as HTMLElement & { set: (s: object) => void }).set({ select: '4A09', layer: 'temp' }))
  await expect(twin.locator('.title')).toContainText('4A09')
  await expect(twin.getByRole('radio', { name: 'Temperature' })).toHaveAttribute('aria-checked', 'true')

  // A room picked inside the twin reaches the host.
  await twin.locator('#search').fill('4B04')
  await twin.locator('#search').press('Enter')
  await expect(twin.locator('.title')).toContainText('4B04')
  await expect.poll(async () => (await heard('twin-select')).map((h) => h.id)).toContain('4B04')

  // The host hears the open alerts, and each one opening while the day plays.
  const [listed] = (await heard('twin-alerts')).slice(-1)
  expect(listed.alerts?.length).toBeGreaterThan(0)
  expect(listed.alerts?.[0]).toMatchObject({ title: expect.any(String), target: { id: expect.any(String) } })
  await page.evaluate(() => (document.querySelector('ward-twin') as HTMLElement & { set: (s: object) => void }).set({ playing: true }))
  await expect.poll(async () => (await heard('twin-alert')).length, { timeout: 15_000 }).toBeGreaterThan(0)

  // A setting the twin cannot take comes back as an error, and nothing else changes.
  await page.evaluate(() => (document.querySelector('ward-twin') as HTMLElement & { set: (s: object) => void }).set({ playing: false, layer: 'heat' }))
  await expect.poll(async () => (await heard('twin-error')).map((h) => h.key)).toEqual(['layer'])
  await expect(twin.getByRole('radio', { name: 'Temperature' })).toHaveAttribute('aria-checked', 'true')
})

test('the demo host page drives the twin from its own controls', async ({ page }) => {
  await page.goto('/host/')
  const twin = page.frameLocator('ward-twin iframe')
  await expect(page.locator('#now-at')).toHaveText('Wing 4A')
  await expect(page.locator('#alerts li').first()).toBeVisible()
  await page.getByRole('button', { name: 'Level 4' }).click()
  await expect(twin.locator('.brand__where')).toContainText('Level 4 · six wings')
  await page.getByLabel('Room or equipment').fill('4a09')
  await page.getByRole('button', { name: 'Show' }).click()
  await expect(page.locator('#now-select')).toHaveText('4A09')
  await expect(twin.locator('.title')).toContainText('4A09')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})
