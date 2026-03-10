/**
 * Supabase Test Client
 *
 * Creates a service-role Supabase client for integration tests.
 * Uses .env.local credentials (dev project) — bypasses RLS for
 * test setup and teardown.
 *
 * IMPORTANT:
 * - All test data uses the prefix TEST_PREFIX to enable cleanup
 * - cleanupTestData() must be called in afterEach/afterAll
 * - Never use this client in production code
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const TEST_PREFIX = '__test_'

/**
 * Create a service-role Supabase client for integration tests.
 * Throws if required env vars are missing.
 */
export function createTestClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Integration tests require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
    )
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

/**
 * Generate a test-prefixed ID for easy identification and cleanup.
 */
export function testId(suffix: string): string {
  return `${TEST_PREFIX}${suffix}_${Date.now()}`
}

/**
 * Clean up test data from a table by matching the test prefix.
 * Uses the specified column (defaults to 'id') to match prefixed values.
 */
export async function cleanupTestData(
  supabase: SupabaseClient,
  table: string,
  column = 'id',
) {
  const { error } = await supabase
    .from(table)
    .delete()
    .like(column, `${TEST_PREFIX}%`)

  if (error) {
    console.warn(`Cleanup warning for ${table}.${column}: ${error.message}`)
  }
}

/**
 * Clean up multiple tables in order (respects FK constraints).
 * Tables should be listed child-first, parent-last.
 */
export async function cleanupAllTestData(
  supabase: SupabaseClient,
  tables: Array<{ table: string; column?: string }>,
) {
  for (const { table, column } of tables) {
    await cleanupTestData(supabase, table, column)
  }
}
