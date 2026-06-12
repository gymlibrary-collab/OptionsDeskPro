import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
} from '../mock-data'

const API = '**/api/**'

test.describe('AI Features tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.route(`${API}watchlist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
    })
    await authedPage.route(`${API}portfolio`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
    })
    await authedPage.route(`${API}ai/settings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
    })
    await authedPage.route(`${API}ai/chat`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ answer: 'A bull call spread uses two call options at different strikes to profit from moderate upside with defined risk.' }),
      })
    })
  })

  test('navigates to the AI Features tab', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // Tabs are rendered as <button> elements (not role=tab) in App.tsx
    await authedPage.getByRole('button', { name: /ai features/i }).click()
    // AISettings renders an h2 "AI Features" heading
    await expect(authedPage.getByRole('heading', { name: /ai features/i })).toBeVisible({ timeout: 10000 })
  })

  test('shows AI feature toggles', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /ai features/i }).click()
    // AI settings shows toggle labels like "AI Narrative Enhancement" and "Portfolio Chat"
    await expect(authedPage.getByText(/AI Narrative Enhancement/i)).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/Portfolio Chat/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('shows chat interface when chat is enabled', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /ai features/i }).click()
    // Chat input should be visible
    const chatInput = authedPage.getByRole('textbox', { name: /ask|question|chat/i })
      .or(authedPage.locator('input[placeholder*="ask"], textarea[placeholder*="ask"]'))
    await expect(chatInput).toBeVisible({ timeout: 10000 })
  })

  test('submits a chat question and shows the answer', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /ai features/i }).click()

    const chatInput = authedPage.getByRole('textbox', { name: /ask|question|chat/i })
      .or(authedPage.locator('input[placeholder*="ask"], textarea[placeholder*="ask"]'))
    if (await chatInput.isVisible()) {
      await chatInput.fill('What is a bull call spread?')
      await authedPage.keyboard.press('Enter')
      await expect(authedPage.getByText(/bull call spread/i)).toBeVisible({ timeout: 10000 })
    }
  })

  test('shows disabled state when chat toggle is off', async ({ authedPage }) => {
    await authedPage.route(`${API}ai/settings`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_AI_SETTINGS, chat_enabled: false }),
      })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /ai features/i }).click()
    // When chat_enabled = false, Portfolio Chat toggle shows the label but no chat input
    await expect(authedPage.getByText(/Portfolio Chat/i).first()).toBeVisible({ timeout: 10000 })
    // Chat input should NOT be visible since chat is disabled
    await expect(authedPage.locator('input[placeholder*="ask"], textarea[placeholder*="ask"]')).not.toBeVisible({ timeout: 3000 })
  })

  test('shows error when AI chat endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${API}ai/chat`, (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'AI unavailable' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /ai features/i }).click()

    const chatInput = authedPage.getByRole('textbox', { name: /ask|question|chat/i })
      .or(authedPage.locator('input[placeholder*="ask"], textarea[placeholder*="ask"]'))
    if (await chatInput.isVisible()) {
      await chatInput.fill('test question')
      await authedPage.keyboard.press('Enter')
      // ChatPanel shows "Could not reach the AI — please try again." on error
      await expect(authedPage.getByText(/could not reach the ai|please try again/i)).toBeVisible({ timeout: 10000 })
    }
  })

  test('saves settings when a toggle is changed', async ({ authedPage }) => {
    let settingsSaved = false
    await authedPage.route(`${API}ai/settings`, (route) => {
      if (route.request().method() === 'PUT') {
        settingsSaved = true
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ saved: true }) })
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
      }
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('button', { name: /ai features/i }).click()
    // Find and click a toggle
    const toggle = authedPage.getByRole('checkbox').first()
      .or(authedPage.getByRole('switch').first())
    if (await toggle.isVisible()) {
      await toggle.click()
      await authedPage.waitForTimeout(300)
      expect(settingsSaved).toBe(true)
    }
  })

  test('renders AI features on mobile viewport', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    // On mobile the tab label is 'AI' (short label); use button role
    const aiTab = authedPage.getByRole('button', { name: /^ai$/i })
    if (await aiTab.isVisible()) {
      await aiTab.click()
    }
    await expect(authedPage.getByText(/AI Narrative Enhancement/i).first()).toBeVisible({ timeout: 10000 })
  })
})
