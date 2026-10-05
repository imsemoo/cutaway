import { expect, test } from '@playwright/test'

/* The clinic read from its BIM model (public/buildings/clinic.json), with its simulated day. */

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

test('the hospital links to the clinic, which opens at 14:30 with its care rooms and that minute’s two alerts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'The twin on a real clinic' }).click()
  await expect(page).toHaveURL(/building=clinic/)
  await expect(page).toHaveTitle('Cutaway: a clinic from its BIM model')
  await expect(page.getByRole('heading', { name: /Care rooms at\s+14:30/ })).toBeVisible()
  await expect(page.locator('.lede')).toContainText('18 of 49 in use')
  await expect(page.locator('.board__cell')).toHaveCount(49)
  await expect(page.locator('.alert')).toHaveCount(2)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('Simulated data')).toBeVisible()
  await expect(page.getByRole('link', { name: 'The model’s source' })).toHaveAttribute('href', /buildingsmart-community/)
})

test('a room picked from the board opens its day, keeps it in the link, and Escape leaves it', async ({ page }) => {
  await page.goto('/?building=clinic')
  await page.locator('.board__cell', { hasText: '2A12' }).first().click()
  await expect(page.locator('.title')).toContainText('2A12')
  await expect(page.locator('.title')).toContainText('X-RAY')
  await expect(page).toHaveURL(/room=2A12/)
  await expect(page.locator('.alert', { hasText: 'Room too warm' })).toBeVisible()
  const tag = page.locator('.tag--strong')
  await expect(tag).toContainText('2A12')
  await expect(tag).toHaveCSS('visibility', 'visible')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: /Care rooms at/ })).toBeVisible()
  await expect(page).not.toHaveURL(/room=/)
})

test('a shared link opens its room, layer and minute', async ({ page }) => {
  await page.goto('/?building=clinic&room=2A12&layer=temp&t=16:00')
  await expect(page.locator('.title')).toContainText('2A12')
  await expect(page.locator('.clock')).toHaveText('16:00')
  await expect(page.getByRole('radio', { name: 'Temperature' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.tag--strong')).toContainText('°C')
})

test('one floor at a time, and the plan and list views', async ({ page }) => {
  await page.goto('/?building=clinic')
  await page.getByRole('radio', { name: 'Second Floor' }).click()
  await expect(page.locator('.board__group')).toHaveCount(1)
  await expect(page.locator('.lede')).toContainText('of 17 in use')
  await page.getByRole('radio', { name: 'Both floors' }).click()
  await page.getByRole('radio', { name: 'Plan' }).click()
  await expect(page).toHaveURL(/view=plan/)
  await page.getByRole('radio', { name: 'List' }).click()
  await expect(page).toHaveURL(/view=list/)
  await expect(page.locator('.rooms tbody tr')).toHaveCount(259)
  await page.locator('.rooms').getByRole('button', { name: /^1D05 / }).click()
  await expect(page.locator('.title')).toContainText('1D05')
})

test('the clinic in Arabic: right to left, its floors by their Arabic names', async ({ page }) => {
  await page.goto('/?building=clinic&lang=ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: /غرف الكشف الساعة/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'الطابق الأرضي' })).toBeVisible()
  await expect(page).toHaveTitle('مقطع: عيادة من نموذج BIM الخاص بها')
})

test('live, the clinic builds itself from its own feed, an alert is acknowledged there, and replay comes back', async ({ page }) => {
  await page.goto('/?building=clinic&mode=live')
  await expect(page.locator('.feed')).toHaveAttribute('data-state', 'live')
  await expect(page.locator('.board__cell')).toHaveCount(49)
  const warm = page.locator('.panel .alert-item', { hasText: 'Room too warm' })
  await warm.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(warm).toContainText('Acknowledged')
  await expect(warm.getByRole('button', { name: 'Send to Facilities' })).toBeVisible()
  await page.getByRole('radio', { name: 'Replay' }).click()
  await expect(page.locator('.clock')).toHaveText('14:30')
  await expect(page).not.toHaveURL(/mode=live/)
})
