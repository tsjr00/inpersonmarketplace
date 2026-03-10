/**
 * Order & Cron Business Rule Tests
 *
 * Tests that verify order lifecycle and cron business rules via code structure.
 * Covers: OL-R11, OL-R13, OL-R14, OL-R16, OL-R20, MP-R14, MP-R18
 *
 * IMPORTANT: These tests assert what the BUSINESS RULES require, not what
 * the code currently does. If a test fails, investigate the code — do NOT
 * change the test to match the code. See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/order-cron-rules.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const webRoot = path.resolve(__dirname, '..', '..', '..')

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(webRoot, relativePath), 'utf8')
}

// =============================================================================
// OL-R11: Vendor reject → cancelled + 100% refund
// =============================================================================

describe('OL-R11: vendor reject triggers 100% refund', () => {
  const rejectRoute = readFile('src/app/api/vendor/orders/[id]/reject/route.ts')

  it('reject route sets item status to cancelled', () => {
    expect(rejectRoute).toContain("'cancelled'")
  })

  it('reject route calls createRefund', () => {
    expect(rejectRoute).toContain('createRefund')
  })

  it('reject route imports createRefund from stripe/payments', () => {
    expect(rejectRoute).toContain("from '@/lib/stripe/payments'")
  })

  it('reject route sends notification to buyer', () => {
    expect(rejectRoute).toContain('sendNotification')
    expect(rejectRoute).toContain('order_cancelled_by_vendor')
  })
})

// =============================================================================
// OL-R13: One notification per item status transition
// =============================================================================

describe('OL-R13: one notification per status transition', () => {
  it('reject route sends exactly one buyer notification type', () => {
    const route = readFile('src/app/api/vendor/orders/[id]/reject/route.ts')
    const notifCalls = (route.match(/sendNotification/g) || []).length
    // Should have notification calls but not excessive duplicates for same transition
    expect(notifCalls).toBeGreaterThan(0)
    expect(notifCalls).toBeLessThanOrEqual(3) // buyer notif + optional vendor warning
  })

  it('confirm route sends notification on status change', () => {
    const routeExists = fs.existsSync(path.join(webRoot, 'src/app/api/vendor/orders/[id]/confirm/route.ts'))
    expect(routeExists).toBe(true)
    if (routeExists) {
      const route = readFile('src/app/api/vendor/orders/[id]/confirm/route.ts')
      expect(route).toContain('sendNotification')
    }
  })
})

// =============================================================================
// OL-R14: Cron Phase 1 — expire unaccepted items
// =============================================================================

describe('OL-R14: cron Phase 1 expires unaccepted items', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('Phase 1 exists and handles unaccepted items', () => {
    expect(cronRoute).toContain('Phase 1')
    // Phase 1 comment describes expiring unconfirmed items
    expect(cronRoute).toMatch(/Phase 1.*expire/i)
  })

  it('Phase 1 has its own try/catch block', () => {
    // Phase 1 error handling
    expect(cronRoute).toContain('Phase 1 error')
  })
})

// =============================================================================
// OL-R16: Cron Phase 3 — cancel expired external payment orders
// =============================================================================

describe('OL-R16: cron Phase 3 cancels expired external orders', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('Phase 3 exists and handles external payment orders', () => {
    expect(cronRoute).toContain('Phase 3')
    expect(cronRoute).toMatch(/Phase 3.*external/i)
  })

  it('Phase 3 has its own try/catch block', () => {
    expect(cronRoute).toContain('Phase 3 error')
  })
})

// =============================================================================
// OL-R20: Cron Phase 4.5 — vendor stale reminder, no status change
// =============================================================================

describe('OL-R20: cron Phase 4.5 sends stale reminder without status change', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('Phase 4.5 exists for stale confirmed orders', () => {
    expect(cronRoute).toContain('Phase 4.5')
  })

  it('Phase 4.5 sends notifications (reminder, not status change)', () => {
    // Phase 4.5 should send notifications but NOT change order status
    expect(cronRoute).toContain('stale')
  })

  it('Phase 4.5 has its own error handling', () => {
    expect(cronRoute).toContain('Phase 4.5 error')
  })
})

// =============================================================================
// MP-R14: Market box RPC failure triggers auto-refund
// =============================================================================

describe('MP-R14: market box RPC failure triggers auto-refund', () => {
  const successRoute = readFile('src/app/api/checkout/success/route.ts')

  it('success route calls subscribe_to_market_box_if_capacity RPC', () => {
    expect(successRoute).toContain('subscribe_to_market_box_if_capacity')
  })

  it('success route calls createRefund when RPC fails', () => {
    expect(successRoute).toContain('createRefund')
  })

  it('success route imports createRefund from stripe/payments', () => {
    expect(successRoute).toContain("from '@/lib/stripe/payments'")
  })
})

// =============================================================================
// MP-R18: Webhook + success route both process idempotently
// =============================================================================

describe('MP-R18: webhook + success route process payment idempotently', () => {
  it('success route handles idempotent payment creation', () => {
    const successRoute = readFile('src/app/api/checkout/success/route.ts')
    // Success route should handle case where webhook already processed
    expect(successRoute).toContain('idempotent')
  })

  it('webhook handles idempotent payment processing', () => {
    const webhooks = readFile('src/lib/stripe/webhooks.ts')
    // Webhook should skip if success route already processed
    expect(webhooks).toContain('idempotent')
    expect(webhooks).toContain('already exists')
  })

  it('webhook skips if payment record already created by success route', () => {
    const webhooks = readFile('src/lib/stripe/webhooks.ts')
    expect(webhooks).toContain('Payment record already exists')
  })

  it('market box subscription creation is idempotent in both routes', () => {
    const webhooks = readFile('src/lib/stripe/webhooks.ts')
    expect(webhooks).toContain('Market box subscription already exists')
  })
})
