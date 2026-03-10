/**
 * Vitest Integration Test Config
 *
 * Separate config for tests that connect to dev Supabase.
 * These tests require .env.local with valid Supabase credentials.
 *
 * Run: npx vitest run --config vitest.integration.config.ts
 *
 * NOT included in regular `npx vitest run` — only runs when explicitly invoked.
 * Test data is created with identifiable prefixes and cleaned up after each test.
 */
import { defineConfig, loadEnv } from 'vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load .env and .env.local — includes NEXT_PUBLIC_* and SUPABASE_SERVICE_ROLE_KEY
  const env = loadEnv(mode, process.cwd(), '')

  return {
    test: {
      include: ['src/**/*.integration.test.ts'],
      testTimeout: 15000,
      hookTimeout: 10000,
      env,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
