/*
  Records the demo film frame by frame.

    npm run build && npm run preview   (in another terminal)
    node tools/film/capture.mjs [out-dir]
    node tools/film/encode.mjs [out-dir]

  The page runs on Playwright's fake clock: every frame advances time by
  exactly 1/30 s and is screenshotted, so the film is smooth whatever the
  machine renders at. The storyboard below is the whole film.
*/
/* global document -- evaluate callbacks run in the page */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? 'film-frames'
const BASE = process.env.FILM_URL ?? 'http://localhost:5181/'
const FPS = 30
const W = 1280
const H = 720

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await page.clock.install({ time: new Date('2026-09-28T08:00:00Z') })
await page.goto(BASE + '?quality=3', { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)

let frame = 0
async function hold(seconds) {
  const n = Math.round(seconds * FPS)
  for (let i = 0; i < n; i++) {
    await page.clock.runFor(1000 / FPS)
    await page.screenshot({ path: join(OUT, `f${String(frame++).padStart(5, '0')}.png`) })
  }
}
const click = (selector) => page.locator(selector).first().click()
const radio = (name) => page.getByRole('radio', { name }).click()

// Wait for the simulated day, which arrives from a worker on real time.
for (let i = 0; i < 100 && !(await page.locator('.alert').count()); i++) await page.waitForTimeout(100)
await page.waitForTimeout(1500) // the models, fetched on real time too

// 0 s: the opening shot, the plan rising into the building.
await hold(4.5)
// The four layers, one at a time.
await radio('Temperature')
await hold(2.2)
await radio('Air')
await hold(2.2)
await radio('Call lights')
await hold(2.0)
await radio('Beds')
await hold(1.2)
// Into the warm room.
await page.keyboard.press('/')
await page.keyboard.type('4A09', { delay: 60 })
await page.keyboard.press('Enter')
await radio('Temperature')
await hold(4.5)
// Play the afternoon: the room's temperature crosses its limit.
await page.getByRole('button', { name: /Play/ }).first().click()
await hold(5.5)
await page.getByRole('button', { name: 'Pause the replay' }).click()
await hold(1.0)
// The plan: the walls sink to a section cut.
await radio('Beds')
await radio('Plan')
await hold(3.5)
// The low pump, found by search.
await radio('3D')
await page.keyboard.press('/')
await page.keyboard.type('IVP-01', { delay: 60 })
await page.keyboard.press('Enter')
await hold(4.0)
// Back to the whole floor.
await click('.tool')
await hold(3.5)

console.log(`${frame} frames, ${(frame / FPS).toFixed(1)} s`)
await browser.close()
