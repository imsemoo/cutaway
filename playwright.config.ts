import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// WebGL in headless Chrome renders through SwiftShader.
const gl = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
const phone = devices['Pixel 7']

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5181/',
    // Locally the installed Chrome is enough; CI installs Playwright's Chromium.
    channel: CI ? undefined : 'chrome',
    launchOptions: { args: gl },
    trace: 'retain-on-failure',
  },
  // The accessibility checks run last, as their own stage: axe is heavy on a page that renders WebGL on the CPU,
  // and beside it the live-mode test's pages were starved until the feed's silence check dropped them.
  projects: [
    { name: 'desktop', testIgnore: /a11y/, use: desktop },
    { name: 'phone', testIgnore: /a11y/, use: phone },
    { name: 'a11y desktop', testMatch: /a11y/, dependencies: ['desktop', 'phone'], use: desktop },
    { name: 'a11y phone', testMatch: /a11y/, dependencies: ['desktop', 'phone'], use: phone },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:5181/',
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
})
