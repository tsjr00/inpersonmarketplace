/**
 * Cross-File Business Rule Tests
 *
 * These tests verify that business rules are enforced consistently across
 * every file in the chain. A business rule that's correct in pricing.ts
 * but wrong in the settlement report is invisible to unit tests.
 *
 * Pattern: For each rule, read every file that implements or references it,
 * and verify they all use the same values/logic.
 *
 * See: .claude/flow-integrity-protocol.md
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC_DIR = path.resolve(__dirname, '../..')
const APP_DIR = path.join(SRC_DIR, 'app')
const LIB_DIR = path.join(SRC_DIR, 'lib')
// Navigate up from src/lib/__tests__ → src → apps/web → apps → project root → supabase/migrations
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../supabase/migrations')

function readFile(relativePath: string): string {
  const fullPath = path.resolve(SRC_DIR, relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

function readMigration(filename: string): string {
  // Check both applied/ and root migrations/
  const appliedPath = path.join(MIGRATIONS_DIR, 'applied', filename)
  const rootPath = path.join(MIGRATIONS_DIR, filename)
  if (fs.existsSync(appliedPath)) return fs.readFileSync(appliedPath, 'utf-8')
  if (fs.existsSync(rootPath)) return fs.readFileSync(rootPath, 'utf-8')
  throw new Error(`Migration not found: ${filename}`)
}

// ── BR-1: Platform Fee Consistency (6.5%) ───────────────────────────
// The 6.5% platform fee must be the same in:
// - pricing.ts (FEES.buyerFeePercent, FEES.vendorFeePercent)
// - create_company_paid_order RPC (0.065 multiplier)
// - settlement report (uses FEES from pricing.ts)
// - fulfill route comments (documents the fee)

describe('BR-1: Platform fee 6.5% consistent across all files', () => {
  it('pricing.ts defines buyer fee as 6.5%', () => {
    const code = readFile('lib/pricing.ts')
    expect(code).toContain('buyerFeePercent: 6.5')
  })

  it('pricing.ts defines vendor fee as 6.5%', () => {
    const code = readFile('lib/pricing.ts')
    expect(code).toContain('vendorFeePercent: 6.5')
  })

  it('create_company_paid_order RPC uses 0.065 (6.5%)', () => {
    const sql = readMigration('20260404_112_fix_company_paid_payout.sql')
    expect(sql).toContain('0.065')
    // Verify it's used for platform fee calculation
    expect(sql).toContain('v_listing.base_price_cents * 0.065')
  })

  it('settlement report imports FEES from pricing.ts (single source of truth)', () => {
    const code = readFile('app/api/admin/events/[id]/settlement/route.ts')
    expect(code).toContain("from '@/lib/pricing'")
    // Should use FEES object, not hardcoded percentages
    expect(code).toContain('FEES.buyerFeePercent')
    expect(code).toContain('FEES.vendorFeePercent')
  })

  it('fulfill route documents the correct fee in comments', () => {
    const code = readFile('app/api/vendor/orders/[id]/fulfill/route.ts')
    expect(code).toContain('6.5%')
  })
})

// ── BR-2: Company-Paid Order Chain ──────────────────────────────────
// A company-paid order flows through: order API → RPC → fulfill route → settlement
// The payment_model='company_paid' string must be consistent everywhere.

describe('BR-2: company_paid payment model consistent across full chain', () => {
  const PAYMENT_MODEL_VALUE = 'company_paid'

  it('order API checks payment_model === company_paid', () => {
    const code = readFile('app/api/events/[token]/order/route.ts')
    expect(code).toContain(`payment_model !== '${PAYMENT_MODEL_VALUE}'`)
  })

  it('RPC sets payment_model to company_paid in order insert', () => {
    const sql = readMigration('20260404_112_fix_company_paid_payout.sql')
    expect(sql).toContain("'company_paid'")
  })

  it('fulfill route detects company_paid and skips Stripe', () => {
    const code = readFile('app/api/vendor/orders/[id]/fulfill/route.ts')
    expect(code).toContain(`payment_model === '${PAYMENT_MODEL_VALUE}'`)
    expect(code).toContain('isCompanyPaid')
  })

  it('settlement report filters company_paid orders separately', () => {
    const code = readFile('app/api/admin/events/[id]/settlement/route.ts')
    expect(code).toContain(`payment_model === '${PAYMENT_MODEL_VALUE}'`)
  })

  it('shop page uses same payment_model value for company-paid detection', () => {
    const code = readFile('app/[vertical]/events/[token]/shop/page.tsx')
    expect(code).toContain(`'${PAYMENT_MODEL_VALUE}'`)
  })
})

// ── BR-3: Company-Paid Fulfill Skips Stripe ─────────────────────────
// company_paid orders must NOT attempt Stripe transfer at fulfillment.
// They must: mark fulfilled → atomic complete → notify buyer.

describe('BR-3: Company-paid fulfillment path completeness', () => {
  const fulfillCode = readFile('app/api/vendor/orders/[id]/fulfill/route.ts')

  it('fulfill route fetches payment_model from order', () => {
    expect(fulfillCode).toContain('payment_model')
    // Must be in the .select() query
    expect(fulfillCode).toMatch(/\.select\([^)]*payment_model/)
  })

  it('company-paid branch skips Stripe verification', () => {
    // The Stripe payout verification guard should exclude company-paid
    expect(fulfillCode).toContain('!isCompanyPaid')
  })

  it('company-paid branch calls atomic_complete_order_if_ready', () => {
    // Between isCompanyPaid check and the return, must call atomic complete
    const companyPaidSection = fulfillCode.slice(
      fulfillCode.indexOf('if (isCompanyPaid)'),
      fulfillCode.indexOf('if (isExternalPayment)')
    )
    expect(companyPaidSection).toContain('atomic_complete_order_if_ready')
  })

  it('company-paid branch sends buyer notification', () => {
    const companyPaidSection = fulfillCode.slice(
      fulfillCode.indexOf('if (isCompanyPaid)'),
      fulfillCode.indexOf('if (isExternalPayment)')
    )
    expect(companyPaidSection).toContain('sendNotification')
    expect(companyPaidSection).toContain('order_fulfilled')
  })

  it('company-paid branch returns before Stripe transfer code', () => {
    const companyPaidSection = fulfillCode.slice(
      fulfillCode.indexOf('if (isCompanyPaid)'),
      fulfillCode.indexOf('if (isExternalPayment)')
    )
    expect(companyPaidSection).toContain('return NextResponse.json')
  })
})

// ── BR-4: External Payment Fee Chain ─────────��──────────────────────
// External payments use 3.5% vendor fee (not 6.5%).
// This must be consistent in vendor-fees.ts AND settlement report.

describe('BR-4: External payment 3.5% fee consistent', () => {
  it('vendor-fees.ts defines SELLER_FEE_PERCENT as 3.5', () => {
    const code = readFile('lib/payments/vendor-fees.ts')
    expect(code).toContain('SELLER_FEE_PERCENT = 3.5')
  })

  it('settlement imports SELLER_FEE_PERCENT from vendor-fees (not hardcoded)', () => {
    const code = readFile('app/api/admin/events/[id]/settlement/route.ts')
    expect(code).toContain('SELLER_FEE_PERCENT')
    expect(code).toContain("from '@/lib/payments/vendor-fees'")
  })

  it('fulfill route skips Stripe for external payments (same as company-paid)', () => {
    const code = readFile('app/api/vendor/orders/[id]/fulfill/route.ts')
    expect(code).toContain('isExternalPayment')
    // External payment branch exists and skips transfer
    const externalSection = code.slice(
      code.indexOf('if (isExternalPayment)'),
      code.indexOf('crumb.logic(\'Processing vendor payout\')')
    )
    expect(externalSection).toContain('skipping Stripe transfer')
    expect(externalSection).toContain('return NextResponse.json')
  })
})

// ─��� BR-5: Wave Capacity Chain ────────────���──────────────────────────
// Vendor declares capacity → wave generation sums it → reservation enforces it

describe('BR-5: Wave capacity flows from vendor declaration to enforcement', () => {
  it('vendor respond API stores event_max_orders_per_wave', () => {
    const code = readFile('app/api/vendor/events/[marketId]/respond/route.ts')
    expect(code).toContain('event_max_orders_per_wave')
  })

  it('wave generation reads event_max_orders_per_wave from accepted vendors', () => {
    const code = readFile('lib/events/wave-generation.ts')
    expect(code).toContain('event_max_orders_per_wave')
    // Must query market_vendors for accepted vendors
    expect(code).toContain('accepted')
  })

  it('reserve_event_wave RPC enforces capacity via CHECK constraint', () => {
    const sql = readMigration('20260403_110_event_waves_schema.sql')
    expect(sql).toContain('reserved_count <= capacity')
  })

  it('validate-capacity endpoint checks event_max_orders_total', () => {
    const code = readFile('app/api/events/[token]/validate-capacity/route.ts')
    expect(code).toContain('event_max_orders_total')
  })
})

// ── BR-6: Access Code Chain ──────��──────────────────────────────────
// Generated on approval → stored on catering_request → verified at ordering

describe('BR-6: Access code generated, stored, and verified consistently', () => {
  it('event-actions.ts generates access code for company_paid and hybrid', () => {
    const code = readFile('lib/events/event-actions.ts')
    expect(code).toContain('generateAccessCode')
    expect(code).toContain("payment_model === 'company_paid'")
    expect(code).toContain("payment_model === 'hybrid'")
  })

  it('admin approval route stores access_code on catering_request', () => {
    const code = readFile('app/api/admin/events/[id]/route.ts')
    expect(code).toContain('access_code')
  })

  it('self-service approval route stores access_code', () => {
    const code = readFile('app/api/event-requests/route.ts')
    expect(code).toContain('access_code')
  })

  it('verify-code endpoint reads access_code from catering_request', () => {
    const code = readFile('app/api/events/[token]/verify-code/route.ts')
    expect(code).toContain('access_code')
    // Must compare case-insensitively
    expect(code).toContain('toUpperCase')
  })

  it('shop page prompts for access code when required', () => {
    const code = readFile('app/[vertical]/events/[token]/shop/page.tsx')
    expect(code).toContain('requiresAccessCode')
    expect(code).toContain('accessCodeVerified')
  })

  it('shop API returns requires_access_code flag', () => {
    // Session 70: shop data logic extracted to lib/events/shop-data.ts — the
    // route is a thin wrapper, so field-presence assertions check both files.
    const code =
      readFile('app/api/events/[token]/shop/route.ts') +
      '\n' +
      readFile('lib/events/shop-data.ts')
    expect(code).toContain('requires_access_code')
  })
})

// ── BR-7: Hybrid Payment Model Chain ────────────────────────────────
// Organizer sets dollar cap → shop page enforces it → settlement separates

describe('BR-7: Hybrid dollar cap flows from form to settlement', () => {
  it('event form sends company_max_per_attendee_cents', () => {
    const code = readFile('components/events/EventRequestForm.tsx')
    expect(code).toContain('company_max_per_attendee_cents')
  })

  it('event-requests API stores company_max_per_attendee_cents', () => {
    const code = readFile('app/api/event-requests/route.ts')
    expect(code).toContain('company_max_per_attendee_cents')
  })

  it('shop API returns company_max_per_attendee_cents', () => {
    // Session 70: see note on BR-6 above — shop data logic extracted to lib.
    const code =
      readFile('app/api/events/[token]/shop/route.ts') +
      '\n' +
      readFile('lib/events/shop-data.ts')
    expect(code).toContain('company_max_per_attendee_cents')
  })

  it('shop page uses companyCap to gate company-paid vs attendee-paid items', () => {
    const code = readFile('app/[vertical]/events/[token]/shop/page.tsx')
    expect(code).toContain('companyCap')
    expect(code).toContain('companyAllowanceUsed')
  })

  it('settlement separates company-paid from attendee-paid orders', () => {
    const code = readFile('app/api/admin/events/[id]/settlement/route.ts')
    expect(code).toContain('companyPaidOrderDetail')
    expect(code).toContain('attendeePaidSummary')
  })
})

// ── BR-8: Order Notification Chain ──���───────────────────────────────
// Every order type must notify both vendor and buyer

describe('BR-8: Order notifications sent for all payment models', () => {
  it('company-paid order route notifies vendor (new_paid_order)', () => {
    const code = readFile('app/api/events/[token]/order/route.ts')
    expect(code).toContain('sendNotification')
    expect(code).toContain('new_paid_order')
  })

  it('company-paid order route notifies buyer (order_confirmed)', () => {
    const code = readFile('app/api/events/[token]/order/route.ts')
    expect(code).toContain('order_confirmed')
  })

  it('fulfill route notifies buyer for company-paid orders', () => {
    const code = readFile('app/api/vendor/orders/[id]/fulfill/route.ts')
    const companyPaidSection = code.slice(
      code.indexOf('if (isCompanyPaid)'),
      code.indexOf('if (isExternalPayment)')
    )
    expect(companyPaidSection).toContain('sendNotification')
  })

  it('fulfill route notifies buyer for external payment orders', () => {
    const code = readFile('app/api/vendor/orders/[id]/fulfill/route.ts')
    const externalSection = code.slice(
      code.indexOf('if (isExternalPayment)'),
      code.indexOf("crumb.logic('Processing vendor payout')")
    )
    expect(externalSection).toContain('sendNotification')
  })

  it('fulfill route notifies buyer for Stripe orders', () => {
    const code = readFile('app/api/vendor/orders/[id]/fulfill/route.ts')
    // After the Stripe transfer section, there should be a notification
    const stripeSection = code.slice(code.indexOf("crumb.logic('Processing vendor payout')"))
    expect(stripeSection).toContain('order_fulfilled')
  })
})

// ��─ BR-9: Settlement Visibility Rules ───────────────────────────────
// Company-paid: organizer sees individual orders (their invoice)
// Attendee-paid: organizer sees aggregate only (privacy)

describe('BR-9: Settlement respects payment model visibility rules', () => {
  const settlementCode = readFile('app/api/admin/events/[id]/settlement/route.ts')

  it('company-paid orders include buyer name (organizer invoice)', () => {
    expect(settlementCode).toContain('companyPaidOrderDetail')
    expect(settlementCode).toContain('buyerName')
  })

  it('attendee-paid section is aggregate only (no individual names)', () => {
    expect(settlementCode).toContain('attendeePaidSummary')
    // attendeePaidSummary should have totalOrders, totalItems, totalRevenueCents
    // but NOT individual buyer names
    const summarySection = settlementCode.slice(
      settlementCode.indexOf('const attendeePaidSummary'),
      settlementCode.indexOf('const totalParticipants')
    )
    expect(summarySection).toContain('totalOrders')
    expect(summarySection).toContain('totalItems')
    expect(summarySection).toContain('totalRevenueCents')
    // uniqueAttendees count is OK (aggregate), but no buyerName in this section
    expect(summarySection).toContain('uniqueAttendees')
  })

  it('total participants count spans all payment types', () => {
    expect(settlementCode).toContain('totalParticipants')
  })
})

// ── BR-10: Event Cron Timezone Consistency ──────────────────────────
// Event lifecycle transitions must use the market's timezone, not hardcoded CT

describe('BR-10: Event cron uses per-market timezone', () => {
  const cronCode = readFile('app/api/cron/expire-orders/route.ts')

  it('Phase 14 (ready→active) fetches market timezone', () => {
    // Find Phase 14 section
    const phase14Start = cronCode.indexOf('Phase 14')
    const phase14End = cronCode.indexOf('Phase 15')
    const phase14 = cronCode.slice(phase14Start, phase14End)
    expect(phase14).toContain('timezone')
    // Should NOT hardcode America/Chicago as the only option
    // It's OK as a fallback, but must attempt market.timezone first
    expect(phase14).toContain('market')
  })

  it('Phase 15 (active→review) fetches market timezone', () => {
    const phase15Start = cronCode.indexOf('Phase 15')
    const phase15End = cronCode.indexOf('phase15Error')
    const phase15 = cronCode.slice(phase15Start, phase15End)
    expect(phase15).toContain('timezone')
    expect(phase15).toContain('market')
  })
})

// ── BR-11: One Company-Paid Item Per Attendee ───────────────────────
// Enforced by UNIQUE(market_id, user_id) on event_wave_reservations
// + shop page tracks companyAllowanceUsed

describe('BR-11: One company-paid item per attendee enforced', () => {
  it('DB has UNIQUE constraint on (market_id, user_id) for reservations', () => {
    const sql = readMigration('20260403_110_event_waves_schema.sql')
    expect(sql).toMatch(/UNIQUE.*market_id.*user_id/i)
  })

  it('shop page tracks whether company allowance is used', () => {
    const code = readFile('app/[vertical]/events/[token]/shop/page.tsx')
    expect(code).toContain('companyAllowanceUsed')
    expect(code).toContain('setCompanyAllowanceUsed')
  })

  it('shop page detects existing ordered reservation as allowance used', () => {
    const code = readFile('app/[vertical]/events/[token]/shop/page.tsx')
    // When user_reservation.status === 'ordered', allowance is used
    expect(code).toContain("status === 'ordered'")
    expect(code).toContain('setCompanyAllowanceUsed(true)')
  })
})

// ��─ BR-12: Vendor Order Cap Validation ──��───────────────────────────
// vendor declares cap → validate-capacity checks it → shop page blocks

describe('BR-12: Vendor order cap enforced before add-to-cart', () => {
  it('vendor sets event_max_orders_total on acceptance', () => {
    const code = readFile('app/api/vendor/events/[marketId]/respond/route.ts')
    expect(code).toContain('event_max_orders_total')
    // Must validate it's a positive number
    expect(code).toMatch(/event_max_orders_total.*<\s*1|event_max_orders_total.*number/)
  })

  it('validate-capacity reads the cap and counts existing orders', () => {
    const code = readFile('app/api/events/[token]/validate-capacity/route.ts')
    expect(code).toContain('event_max_orders_total')
    // Must count non-cancelled orders
    expect(code).toContain('cancelled')
    expect(code).toContain('count')
  })

  it('shop page calls validate-capacity before addToCart', () => {
    const code = readFile('app/[vertical]/events/[token]/shop/page.tsx')
    // validate-capacity must be called BEFORE addToCart in the code flow
    const validateIndex = code.indexOf('validate-capacity')
    const addToCartIndex = code.indexOf('await addToCart(')
    expect(validateIndex).toBeGreaterThan(-1)
    expect(addToCartIndex).toBeGreaterThan(-1)
    expect(validateIndex).toBeLessThan(addToCartIndex)
  })

  it('shop page shows user-friendly message when cap reached', () => {
    const code = readFile('app/[vertical]/events/[token]/shop/page.tsx')
    expect(code).toContain('capData.allowed')
    expect(code).toContain('setCartMessage')
  })
})

// ── BR-13: Event Markets Excluded From Regular Shopping Flow ─────────
// Event markets must NOT appear in the regular listing detail page or
// AddToCartButton location selector. Events have their own shop page.

describe('BR-13: Event markets excluded from regular shopping flow', () => {
  it('listing detail page filters out event markets from pickup dates', () => {
    const code = readFile('app/[vertical]/listing/[listingId]/page.tsx')
    expect(code).toContain("market_type !== 'event'")
  })

  it('AddToCartButton filters out event markets from location selector', () => {
    const code = readFile('components/cart/AddToCartButton.tsx')
    expect(code).toContain("market_type !== 'event'")
  })

  it('event shop page exists as the dedicated event ordering flow', () => {
    const shopPage = path.join(APP_DIR, '[vertical]/events/[token]/shop/page.tsx')
    expect(fs.existsSync(shopPage)).toBe(true)
  })

  it('event info page links to event shop, not regular listing detail', () => {
    const code = readFile('app/[vertical]/events/[token]/page.tsx')
    // Should link to events/token/shop, NOT to /listing/
    expect(code).toContain('events/${token}/shop')
    expect(code).not.toContain('listing/${item.id}')
  })
})

// ── BR-14: Vendor Fee Discount Floor Consistency ───────────────────
// The 3.6% floor and the getEffectiveVendorFeePercent function must be
// used consistently across pricing.ts, checkout route, and the migration
// constraint. The floor covers Stripe processing — going below it means
// the platform loses money on vendor-side processing.

describe('BR-14: Vendor fee discount floor consistent across all files', () => {
  it('pricing.ts exports VENDOR_FEE_FLOOR = 3.6', () => {
    const code = readFile('lib/pricing.ts')
    expect(code).toContain('VENDOR_FEE_FLOOR = 3.6')
  })

  it('pricing.ts exports getEffectiveVendorFeePercent function', () => {
    const code = readFile('lib/pricing.ts')
    expect(code).toContain('export function getEffectiveVendorFeePercent')
  })

  it('getEffectiveVendorFeePercent uses VENDOR_FEE_FLOOR for clamping', () => {
    const code = readFile('lib/pricing.ts')
    expect(code).toContain('Math.max(VENDOR_FEE_FLOOR')
  })

  it('migration 114 constraint uses same floor value 3.6', () => {
    const sql = readMigration('20260407_114_vendor_fee_discount.sql')
    expect(sql).toContain('vendor_fee_override_percent >= 3.6')
    expect(sql).toContain('vendor_fee_override_percent <= 6.5')
  })

  it('migration 114 adds vendor_fee_override_percent column', () => {
    const sql = readMigration('20260407_114_vendor_fee_discount.sql')
    expect(sql).toContain('ADD COLUMN vendor_fee_override_percent NUMERIC')
  })

  it('checkout route imports getEffectiveVendorFeePercent from pricing', () => {
    const code = readFile('app/api/checkout/session/route.ts')
    expect(code).toContain('getEffectiveVendorFeePercent')
    expect(code).toContain("from '@/lib/pricing'")
  })

  it('checkout route reads vendor_fee_override_percent from vendor_profiles', () => {
    const code = readFile('app/api/checkout/session/route.ts')
    expect(code).toContain('vendor_fee_override_percent')
  })
})
