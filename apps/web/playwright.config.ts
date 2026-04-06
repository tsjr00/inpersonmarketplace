import { defineConfig } from '@playwright/test'

/**
 * Playwright Smoke Tests Configuration
 *
 * SCOPE: Page loads + basic structure verification. NOT visual/CSS testing.
 * These tests verify that pages render without crashing and show expected elements.
 * They are intentionally resilient to styling changes and minor UI tweaks.
 *
 * NEVER set baseURL to production domains (farmersmarketing.app, foodtruckn.app).
 * Tests only run against staging or localhost.
 *
 * ── WHEN TO UPDATE TESTS ──────────────────────────────────────────────
 *
 * Update a test ONLY when you intentionally change what a page shows:
 *
 * - Added a new page route → Add a page load test for it
 * - Removed a page route → Remove its test
 * - Changed a page from public to auth-required → Move test to auth redirect section
 * - Changed a page from auth-required to public → Move test to public pages section
 * - Renamed a route (e.g., /vendor/markets → /vendor/locations) → Update the URL in the test
 * - Changed login page to NOT have email input → Update the assertion
 *
 * DO NOT update tests for:
 * - CSS/styling changes (tests don't check CSS)
 * - Adding/removing components within a page (tests check h1 + key inputs, not full DOM)
 * - Reordering page sections
 * - Changing text content (unless the test explicitly checks for that text)
 *
 * ── HOW TO RUN ────────────────────────────────────────────────────────
 *
 * npm run e2e           → runs against localhost:3002 (start dev server first)
 * npm run e2e:staging   → runs against staging Vercel URL
 *
 * ── HOW TO ADD A TEST ─────────────────────────────────────────────────
 *
 * 1. Open e2e/smoke.spec.ts
 * 2. Add to the appropriate section:
 *    - Public page → "Public pages load" describe block
 *    - Auth-required page → "Auth-required pages redirect to login" describe block
 *    - API endpoint → "API health" describe block
 * 3. Follow the pattern: navigate to URL, assert one visible element
 * 4. Run: npm run e2e:staging
 * 5. If it passes, commit. If it fails, fix the test OR fix the page.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1, // Sequential to avoid rate limiting
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    // Default to staging. Override with PLAYWRIGHT_BASE_URL env var.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002',
    // No screenshots/videos by default — keep it lightweight
    screenshot: 'only-on-failure',
    video: 'off',
    // Reasonable timeouts
    navigationTimeout: 15_000,
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  // Auto-start dev server if not already running
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: true, // Skip startup if already running
    timeout: 120_000,
  },
})
