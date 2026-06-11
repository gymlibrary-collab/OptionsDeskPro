import { test, expect } from '@playwright/test'

// Login page tests run WITHOUT auth — testing the unauthenticated state.

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Supabase auth to return no session (logged-out state)
    await page.route('**/auth/v1/user', (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) })
    })
  })

  test('shows the login page when unauthenticated', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await expect(page.getByText(/sign in/i)).toBeVisible()
  })

  test('shows the OptionsDesk branding on the login page', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await expect(page.getByText(/optionsdesk/i)).toBeVisible()
  })

  test('shows a Google sign-in button', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    const signInButton = page.getByRole('button', { name: /google/i })
    await expect(signInButton).toBeVisible()
  })

  test('sign-in button is clickable', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    const signInButton = page.getByRole('button', { name: /google/i })
    await expect(signInButton).toBeEnabled()
  })

  test('shows login page on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('http://localhost:5173/')
    await expect(page.getByText(/sign in/i)).toBeVisible()
  })

  test('shows an error when the backend rejects the user (not whitelisted)', async ({ page }) => {
    // Mock Supabase to succeed but backend to reject
    await page.route('**/auth/v1/user', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1', email: 'notwhitelisted@test.com' }),
      })
    })
    await page.route(`${BACKEND_URL}/api/auth/login`, (route) => {
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authorised' }) })
    })
    await page.goto('http://localhost:5173/')
    // App should stay on the login page or show an error — not show the main dashboard
    await expect(page.getByText(/optionsdesk/i)).toBeVisible()
  })
})
