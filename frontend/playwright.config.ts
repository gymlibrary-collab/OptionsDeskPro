import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',

  // Fail the build on CI if tests are accidentally left in .only state
  forbidOnly: !!process.env.CI,

  // Retry once on CI to reduce false positives from transient issues
  retries: process.env.CI ? 1 : 0,

  // Run tests in parallel — safe because all API calls are mocked
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:5173',

    // Save storage state from global setup (auth session)
    storageState: 'playwright/.auth/user.json',

    // Collect trace on first retry so failures are diagnosable
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
  ],

  // Start the Vite dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      // Provide minimal env vars so Vite builds without errors
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://mock.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key',
    },
  },
})
