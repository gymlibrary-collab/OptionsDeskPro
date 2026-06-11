import { test, expect } from '../fixtures/auth'
import {
  MOCK_WATCHLIST,
  MOCK_PORTFOLIO,
  MOCK_AI_SETTINGS,
} from '../mock-data'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

test.describe('AI Features tab', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/watchlist`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_WATCHLIST) })
    })
    await authedPage.route(`${BACKEND_URL}/api/portfolio`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIO) })
    })
    await authedPage.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
    })
    await authedPage.route(`${BACKEND_URL}/api/ai/chat`, (route) => {
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
    await authedPage.getByRole('tab', { name: /ai/i }).click()
    await expect(authedPage.getByText(/ai|artificial intelligence/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows AI feature toggles', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /ai/i }).click()
    // AI settings has toggles for narrative, chat, risk summary, strategy reasoning
    await expect(authedPage.getByText(/narrative/i)).toBeVisible({ timeout: 10000 })
    await expect(authedPage.getByText(/chat/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows chat interface when chat is enabled', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /ai/i }).click()
    // Chat input should be visible
    const chatInput = authedPage.getByRole('textbox', { name: /ask|question|chat/i })
      .or(authedPage.locator('input[placeholder*="ask"], textarea[placeholder*="ask"]'))
    await expect(chatInput).toBeVisible({ timeout: 10000 })
  })

  test('submits a chat question and shows the answer', async ({ authedPage }) => {
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /ai/i }).click()

    const chatInput = authedPage.getByRole('textbox', { name: /ask|question|chat/i })
      .or(authedPage.locator('input[placeholder*="ask"], textarea[placeholder*="ask"]'))
    if (await chatInput.isVisible()) {
      await chatInput.fill('What is a bull call spread?')
      await authedPage.keyboard.press('Enter')
      await expect(authedPage.getByText(/bull call spread/i)).toBeVisible({ timeout: 10000 })
    }
  })

  test('shows disabled state when chat toggle is off', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_AI_SETTINGS, chat_enabled: false }),
      })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /ai/i }).click()
    // Chat should be disabled or hidden when toggle is off
    const disabledChat = authedPage.getByText(/disabled|enable.*chat/i)
      .or(authedPage.locator('input[disabled], button[disabled]'))
    await expect(disabledChat.first()).toBeVisible({ timeout: 10000 })
  })

  test('shows error when AI chat endpoint fails', async ({ authedPage }) => {
    await authedPage.route(`${BACKEND_URL}/api/ai/chat`, (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'AI unavailable' }) })
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /ai/i }).click()

    const chatInput = authedPage.getByRole('textbox', { name: /ask|question|chat/i })
      .or(authedPage.locator('input[placeholder*="ask"], textarea[placeholder*="ask"]'))
    if (await chatInput.isVisible()) {
      await chatInput.fill('test question')
      await authedPage.keyboard.press('Enter')
      const errorText = authedPage.getByText(/error|unavailable|failed/i)
      await expect(errorText).toBeVisible({ timeout: 10000 })
    }
  })

  test('saves settings when a toggle is changed', async ({ authedPage }) => {
    let settingsSaved = false
    await authedPage.route(`${BACKEND_URL}/api/ai/settings`, (route) => {
      if (route.request().method() === 'PUT') {
        settingsSaved = true
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ saved: true }) })
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AI_SETTINGS) })
      }
    })
    await authedPage.goto('http://localhost:5173/')
    await authedPage.waitForLoadState('networkidle')
    await authedPage.getByRole('tab', { name: /ai/i }).click()
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
    const aiTab = authedPage.getByRole('tab', { name: /ai/i })
    if (await aiTab.isVisible()) {
      await aiTab.click()
    }
    await expect(authedPage.getByText(/narrative|chat/i)).toBeVisible({ timeout: 10000 })
  })
})
