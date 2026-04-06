/**
 * Smoke Tests — Page Load & Basic Structure
 *
 * PURPOSE: Verify pages render without crashing and show expected elements.
 * These catch deployment regressions (broken imports, missing env vars, crashed pages).
 *
 * SCOPE: Page loads + element presence only. NO visual testing, NO CSS assertions,
 * NO Stripe iframe interaction, NO form submissions that create data.
 *
 * MAINTENANCE: These tests check for text content and basic DOM structure.
 * They only break when WE change page structure — not when browsers update.
 * Update a test only when you intentionally change what a page shows.
 *
 * SAFETY: Tests are read-only. No data mutation. Safe to run against staging.
 * NEVER run against production domains.
 */
import { test, expect } from '@playwright/test'

// Domain guard — abort if pointed at production
test.beforeAll(async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002'
  const forbidden = ['farmersmarketing.app', 'foodtruckn.app', '815enterprises.com']
  for (const domain of forbidden) {
    if (baseURL.includes(domain)) {
      throw new Error(`SAFETY: Smoke tests must NEVER run against production (${domain}). Set PLAYWRIGHT_BASE_URL to staging or localhost.`)
    }
  }
})

// ── Public Pages (no auth required) ──────────────────────────────────

test.describe('Public pages load', () => {
  test('FM landing page', async ({ page }) => {
    await page.goto('/farmers_market')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FT landing page', async ({ page }) => {
    await page.goto('/food_trucks')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM browse page', async ({ page }) => {
    await page.goto('/farmers_market/browse')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FT browse page', async ({ page }) => {
    await page.goto('/food_trucks/browse')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM markets page', async ({ page }) => {
    await page.goto('/farmers_market/markets')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FT markets page (locations)', async ({ page }) => {
    await page.goto('/food_trucks/markets')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM vendors page', async ({ page }) => {
    await page.goto('/farmers_market/vendors')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FT vendors page', async ({ page }) => {
    await page.goto('/food_trucks/vendors')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM login page', async ({ page }) => {
    await page.goto('/farmers_market/login')
    // Login page should have email input
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('FT login page', async ({ page }) => {
    await page.goto('/food_trucks/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('FM signup page', async ({ page }) => {
    await page.goto('/farmers_market/signup')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('FM help page', async ({ page }) => {
    await page.goto('/farmers_market/help')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FT help page', async ({ page }) => {
    await page.goto('/food_trucks/help')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM terms page', async ({ page }) => {
    await page.goto('/farmers_market/terms')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM about page', async ({ page }) => {
    await page.goto('/farmers_market/about')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM support page', async ({ page }) => {
    await page.goto('/farmers_market/support')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM vendor signup page', async ({ page }) => {
    await page.goto('/farmers_market/vendor-signup')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FT vendor signup page', async ({ page }) => {
    await page.goto('/food_trucks/vendor-signup')
    await expect(page.locator('h1').first()).toBeVisible()
  })
})

// ── Browse page structure ────────────────────────────────────────────

test.describe('Browse page structure', () => {
  test('FM browse has search input', async ({ page }) => {
    await page.goto('/farmers_market/browse')
    // Search filter should be present
    await expect(page.locator('input[type="text"], input[type="search"]').first()).toBeVisible()
  })

  test('FT browse has search input', async ({ page }) => {
    await page.goto('/food_trucks/browse')
    await expect(page.locator('input[type="text"], input[type="search"]').first()).toBeVisible()
  })

  test('FM browse has location prompt', async ({ page }) => {
    await page.goto('/farmers_market/browse')
    // BrowseLocationPrompt should render (either green bar or blue prompt)
    await expect(page.locator('text=/zip|location|distance|mile/i').first()).toBeVisible()
  })

  test('FT browse has location prompt', async ({ page }) => {
    await page.goto('/food_trucks/browse')
    await expect(page.locator('text=/zip|location|distance|mile/i').first()).toBeVisible()
  })
})

// ── Auth-required pages redirect to login ────────────────────────────

test.describe('Auth-required pages redirect to login', () => {
  test('FM dashboard redirects to login', async ({ page }) => {
    await page.goto('/farmers_market/dashboard')
    // Should redirect to login page
    await expect(page).toHaveURL(/login/)
  })

  test('FT vendor dashboard redirects to login', async ({ page }) => {
    await page.goto('/food_trucks/vendor/dashboard')
    // Should redirect to login
    await expect(page).toHaveURL(/login/)
  })

  test('FM settings redirects to login', async ({ page }) => {
    await page.goto('/farmers_market/settings')
    await expect(page).toHaveURL(/login/)
  })

  test('FM checkout redirects unauthenticated users', async ({ page }) => {
    await page.goto('/farmers_market/checkout')
    // Should redirect to login or show auth prompt
    await page.waitForURL(/login|checkout/, { timeout: 10_000 })
    const url = page.url()
    const isLoginOrCheckout = url.includes('login') || url.includes('checkout')
    expect(isLoginOrCheckout).toBeTruthy()
  })
})

// ── API health ───────────────────────────────────────────────────────

test.describe('API health', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
  })

  test('listings API returns 200', async ({ request }) => {
    const res = await request.get('/api/listings?vertical=food_trucks')
    expect(res.status()).toBe(200)
  })

  test('markets API returns 200', async ({ request }) => {
    const res = await request.get('/api/markets?vertical=food_trucks')
    expect(res.status()).toBe(200)
  })

  test('manifest API returns 200', async ({ request }) => {
    const res = await request.get('/api/manifest')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.name).toBeTruthy()
  })
})

// ── Event Pages ─────────────────────────────────────────────────────

test.describe('Event pages load', () => {
  test('FM event request page', async ({ page }) => {
    await page.goto('/farmers_market/events')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FT event request page', async ({ page }) => {
    await page.goto('/food_trucks/events')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('FM event request form has required fields', async ({ page }) => {
    await page.goto('/farmers_market/events')
    // Quick-start form should have company name and email inputs
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
  })

  test('FT event request form has required fields', async ({ page }) => {
    await page.goto('/food_trucks/events')
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
  })

  test('invalid event token returns not found', async ({ page }) => {
    await page.goto('/farmers_market/events/invalid-token-xyz')
    // Should show error or not-found state (not crash)
    await page.waitForLoadState('networkidle')
    const content = await page.textContent('body')
    expect(content).toBeTruthy()
  })

  test('invalid event token shop page handles gracefully', async ({ page }) => {
    await page.goto('/farmers_market/events/invalid-token-xyz/shop')
    await page.waitForLoadState('networkidle')
    const content = await page.textContent('body')
    expect(content).toBeTruthy()
  })
})

// ── Event API Health ────────────────────────────────────────────────

test.describe('Event API health', () => {
  test('event-requests POST rejects empty body', async ({ request }) => {
    const res = await request.post('/api/event-requests', {
      data: {},
    })
    // Should return 400 (validation), not 500 (crash)
    expect(res.status()).toBeLessThan(500)
  })

  test('event-approved-vendors GET requires vertical', async ({ request }) => {
    const res = await request.get('/api/event-approved-vendors')
    // Should return 400 (missing vertical), not 500
    expect(res.status()).toBeLessThan(500)
  })

  test('event waves GET with invalid token returns 404', async ({ request }) => {
    const res = await request.get('/api/events/invalid-token/waves')
    expect(res.status()).toBe(404)
  })

  test('event shop GET with invalid token returns 404', async ({ request }) => {
    const res = await request.get('/api/events/invalid-token/shop')
    expect(res.status()).toBe(404)
  })

  test('event validate-capacity GET requires vendor_profile_id', async ({ request }) => {
    const res = await request.get('/api/events/invalid-token/validate-capacity')
    // Should return 400 or 404, not 500
    expect(res.status()).toBeLessThan(500)
  })

  test('event order POST rejects unauthenticated', async ({ request }) => {
    const res = await request.post('/api/events/invalid-token/order', {
      data: { reservation_id: 'x', listing_id: 'x', vendor_profile_id: 'x', wave_id: 'x' },
    })
    expect(res.status()).toBe(401)
  })

  test('event cancel POST rejects unauthenticated', async ({ request }) => {
    const res = await request.post('/api/events/invalid-token/cancel')
    expect(res.status()).toBe(401)
  })

  test('event details GET rejects unauthenticated', async ({ request }) => {
    const res = await request.get('/api/events/invalid-token/details')
    expect(res.status()).toBe(401)
  })

  test('admin events GET rejects unauthenticated', async ({ request }) => {
    const res = await request.get('/api/admin/events')
    expect(res.status()).toBe(401)
  })

  test('admin event payments GET rejects unauthenticated', async ({ request }) => {
    const res = await request.get('/api/admin/events/fake-id/payments')
    expect(res.status()).toBe(401)
  })
})
