import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// WebGL in headless Chrome renders through SwiftShader.
const gl = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']

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
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:5181/',
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
})
