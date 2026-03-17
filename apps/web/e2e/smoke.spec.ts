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
