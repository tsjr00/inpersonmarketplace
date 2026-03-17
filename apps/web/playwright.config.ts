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
})
