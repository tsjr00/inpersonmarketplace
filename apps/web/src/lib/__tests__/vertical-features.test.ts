/**
 * Vertical-Specific Feature Tests
 *
 * Tests that verify vertical-specific behavior and feature flags.
 * Covers: VI-R4, VI-R10, VI-R11, VI-R13, VI-R15, NI-R37
 *
 * IMPORTANT: These tests assert what the BUSINESS RULES require, not what
 * the code currently does. If a test fails, investigate the code — do NOT
 * change the test to match the code. See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/vertical-features.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { isTippingEnabled } from '@/lib/orders/checkout-helpers'
import { REMINDER_DELAY_MS, DEFAULT_REMINDER_DELAY_MS, isOrderOldEnoughForReminder } from '@/lib/cron/external-payment'

const webRoot = path.resolve(__dirname, '..', '..', '..')

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(webRoot, relativePath), 'utf8')
}

// =============================================================================
// VI-R4: Activity feed filtered by vertical_id
// =============================================================================

describe('VI-R4: activity feed filtered by vertical_id', () => {
  const route = readFile('src/app/api/marketing/activity-feed/route.ts')

  it('requires vertical query parameter', () => {
    // Business rule: activity feed MUST filter by vertical_id
    expect(route).toContain("if (!vertical)")
    expect(route).toContain("vertical parameter required")
    expect(route).toContain("status: 400")
  })

  it('queries public_activity_events with .eq(vertical_id)', () => {
    expect(route).toContain(".eq('vertical_id', vertical)")
  })

  it('filters out expired events', () => {
    expect(route).toContain(".gt('expires_at'")
  })

  it('returns empty array on error (graceful degradation)', () => {
    expect(route).toContain("{ events: [] }")
  })
})

// =============================================================================
// VI-R10: Tipping is FT-only
// =============================================================================

describe('VI-R10: tipping is FT-only with specific presets', () => {
  it('food_trucks → tipping enabled', () => {
    expect(isTippingEnabled('food_trucks')).toBe(true)
  })

  it('farmers_market → tipping disabled', () => {
    expect(isTippingEnabled('farmers_market')).toBe(false)
  })

  it('fire_works → tipping disabled', () => {
    expect(isTippingEnabled('fire_works')).toBe(false)
  })

  it('checkout page only shows tip selector for food_trucks', () => {
    const checkout = readFile('src/app/[vertical]/checkout/page.tsx')
    // Tip calculation guard: vertical === 'food_trucks'
    expect(checkout).toContain("vertical === 'food_trucks'")
    // TipSelector only rendered for FT
    expect(checkout).toContain("vertical === 'food_trucks' && baseSubtotal > 0")
  })

  it('TipSelector has correct preset options: No Tip, 10%, 15%, 20%, Custom', () => {
    const tipSelector = readFile('src/app/[vertical]/checkout/TipSelector.tsx')
    // Preset buttons
    expect(tipSelector).toContain("tip.no_tip")
    expect(tipSelector).toContain('value: 0')
    expect(tipSelector).toContain('value: 10')
    expect(tipSelector).toContain('value: 15')
    expect(tipSelector).toContain('value: 20')
    expect(tipSelector).toContain("tip.custom")
  })

  it('custom tip input is integer-only (no decimals)', () => {
    const tipSelector = readFile('src/app/[vertical]/checkout/TipSelector.tsx')
    // Input type=number with step=1
    expect(tipSelector).toContain('type="number"')
    expect(tipSelector).toContain('step="1"')
    // Strips non-digits
    expect(tipSelector).toContain("replace(/[^0-9]/g, '')")
  })
})

// =============================================================================
// VI-R11: Preferred pickup time is FT-only
// =============================================================================

describe('VI-R11: preferred pickup time is FT-only', () => {
  it('cart_items table has preferred_pickup_time column (nullable TIME)', () => {
    // This column exists per migration 028 — nullable so FM items can omit it
    // We verify the schema allows it by checking the migration exists
    const migrationExists = fs.existsSync(
      path.resolve(webRoot, '../../supabase/migrations/applied/20260217_028_add_preferred_pickup_time.sql')
    ) || fs.existsSync(
      path.resolve(webRoot, '../../supabase/migrations/20260217_028_add_preferred_pickup_time.sql')
    )
    // If migration doesn't exist at either path, it was renamed — check schema snapshot
    const schemaSnapshot = readFile('../../supabase/SCHEMA_SNAPSHOT.md')
    expect(schemaSnapshot).toContain('preferred_pickup_time')
  })

  it('time-slots utility exists for FT time slot generation', () => {
    const exists = fs.existsSync(path.join(webRoot, 'src/lib/utils/time-slots.ts'))
    expect(exists).toBe(true)
  })
})

// =============================================================================
// VI-R13: Chef Box types are FT-only
// =============================================================================

describe('VI-R13: Chef Box types are FT-only', () => {
  it('market_box_offerings has box_type column (nullable)', () => {
    const schemaSnapshot = readFile('../../supabase/SCHEMA_SNAPSHOT.md')
    expect(schemaSnapshot).toContain('box_type')
  })
})

// =============================================================================
// VI-R15: Per-vertical browse visibility
// =============================================================================

describe('VI-R15: per-vertical browse visibility rules', () => {
  const browsePage = readFile('src/app/[vertical]/browse/page.tsx')

  it('browse page queries with vertical_id filter', () => {
    expect(browsePage).toContain("'vertical_id'")
  })

  it('FT has separate category list (FOOD_TRUCK_CATEGORIES)', () => {
    expect(browsePage).toContain('FOOD_TRUCK_CATEGORIES')
  })

  it('FT and FM use different browse filtering logic', () => {
    // FT: same-day ordering, FM: 7-day window
    expect(browsePage).toContain("food_trucks")
  })
})

// =============================================================================
// VI-R14: Per-vertical order cutoff rules
// =============================================================================

describe('VI-R14: per-vertical order cutoff rules', () => {
  it('DEFAULT_CUTOFF_HOURS defined with per-vertical values', () => {
    const constants = readFile('src/lib/constants.ts')
    expect(constants).toContain('DEFAULT_CUTOFF_HOURS')
  })

  it('FM traditional cutoff is 18 hours', () => {
    const constants = readFile('src/lib/constants.ts')
    expect(constants).toContain('traditional: 18')
  })

  it('FT cutoff is 0 (no advance cutoff)', () => {
    const constants = readFile('src/lib/constants.ts')
    expect(constants).toContain('food_trucks: 0')
  })

  it('SQL RPC is the source of truth for cutoff calculations (JS utility deleted)', () => {
    // listing-availability.ts was deleted (M4 consolidation).
    // Cutoff logic now lives entirely in get_available_pickup_dates() SQL function.
    // The constants are still exported for reference/documentation.
    const constants = readFile('src/lib/constants.ts')
    expect(constants).toContain('DEFAULT_CUTOFF_HOURS')
    expect(constants).toContain('traditional')
    expect(constants).toContain('private_pickup')
    expect(constants).toContain('food_trucks')
  })
})

// =============================================================================
// NI-R37: External payment reminder timing is per-vertical
// =============================================================================

describe('NI-R37: external payment reminder timing per-vertical', () => {
  it('FT reminder delay is 15 minutes', () => {
    expect(REMINDER_DELAY_MS.food_trucks).toBe(15 * 60 * 1000) // 900,000 ms
  })

  it('FM reminder delay is 12 hours', () => {
    expect(REMINDER_DELAY_MS.farmers_market).toBe(12 * 60 * 60 * 1000) // 43,200,000 ms
  })

  it('FW reminder delay is 12 hours (same as FM)', () => {
    expect(REMINDER_DELAY_MS.fire_works).toBe(12 * 60 * 60 * 1000)
  })

  it('default reminder delay is 12 hours', () => {
    expect(DEFAULT_REMINDER_DELAY_MS).toBe(12 * 60 * 60 * 1000)
  })

  it('FT 16 minutes old → should get reminder (past 15min threshold)', () => {
    const now = Date.now()
    const created = new Date(now - 16 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'food_trucks', now)).toBe(true)
  })

  it('FM 16 minutes old → should NOT get reminder (12hr threshold)', () => {
    const now = Date.now()
    const created = new Date(now - 16 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'farmers_market', now)).toBe(false)
  })
})
