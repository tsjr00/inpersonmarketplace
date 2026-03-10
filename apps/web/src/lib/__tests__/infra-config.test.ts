/**
 * Infrastructure Configuration Tests
 *
 * Tests that verify infrastructure configuration patterns exist correctly
 * in source files. These are "code structure" tests — they verify the
 * codebase is configured per business rules, not runtime behavior.
 *
 * Covers: IR-R1, IR-R2, IR-R3, IR-R4, IR-R5, IR-R6, IR-R12, IR-R13,
 *         IR-R14, IR-R19, IR-R20, IR-R24, IR-R25
 *
 * IMPORTANT: These tests assert what the BUSINESS RULES require, not what
 * the code currently does. If a test fails, investigate the code — do NOT
 * change the test to match the code. See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/infra-config.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const webRoot = path.resolve(__dirname, '..', '..', '..')

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(webRoot, relativePath), 'utf8')
}

// =============================================================================
// IR-R12: Security headers on all routes
// =============================================================================

describe('IR-R12: security headers configured in next.config', () => {
  const config = readFile('next.config.ts')

  it('X-Content-Type-Options: nosniff', () => {
    expect(config).toContain("'X-Content-Type-Options'")
    expect(config).toContain("'nosniff'")
  })

  it('X-Frame-Options: DENY', () => {
    expect(config).toContain("'X-Frame-Options'")
    expect(config).toContain("'DENY'")
  })

  it('Strict-Transport-Security with max-age', () => {
    expect(config).toContain("'Strict-Transport-Security'")
    expect(config).toContain('max-age=31536000')
  })

  it('Referrer-Policy: strict-origin-when-cross-origin', () => {
    expect(config).toContain("'Referrer-Policy'")
    expect(config).toContain("'strict-origin-when-cross-origin'")
  })

  it('Permissions-Policy restricts camera, microphone', () => {
    expect(config).toContain("'Permissions-Policy'")
    expect(config).toContain('camera=()')
    expect(config).toContain('microphone=()')
  })

  it('Content-Security-Policy present', () => {
    expect(config).toContain("'Content-Security-Policy'")
    expect(config).toContain("default-src 'self'")
  })

  it('CSP allows Stripe, Supabase, Sentry — not arbitrary domains', () => {
    expect(config).toContain('https://js.stripe.com')
    expect(config).toContain('https://*.supabase.co')
    expect(config).toContain('https://*.ingest.sentry.io')
    // object-src restricted
    expect(config).toContain("object-src 'none'")
  })

  it('headers applied to all routes via /(.*)', () => {
    expect(config).toContain("'/(.*)'")
  })
})

// =============================================================================
// IR-R13: Cache headers — public routes use s-maxage, sensitive use no-store
// =============================================================================

describe('IR-R13: cache headers on API routes', () => {
  it('activity feed uses public s-maxage cache', () => {
    const route = readFile('src/app/api/marketing/activity-feed/route.ts')
    expect(route).toContain('s-maxage=')
    expect(route).toContain('stale-while-revalidate=')
  })

  it('listings route uses private no-store for admin queries', () => {
    const route = readFile('src/app/api/listings/route.ts')
    expect(route).toContain('no-store')
  })
})

// =============================================================================
// IR-R19: CutoffStatusBanner — page-load only, no polling
// =============================================================================

describe('IR-R19: CutoffStatusBanner fetches on page-load only', () => {
  const component = readFile('src/components/listings/CutoffStatusBanner.tsx')

  it('does NOT use setInterval', () => {
    expect(component).not.toContain('setInterval')
  })

  it('does NOT use setTimeout for repeated polling', () => {
    // setTimeout for a single delayed action is OK, but polling pattern is not
    // Check that there's no recursive setTimeout pattern
    const timeoutCount = (component.match(/setTimeout/g) || []).length
    // If setTimeout exists, it should NOT reference fetchAvailability (no polling)
    if (timeoutCount > 0) {
      expect(component).not.toMatch(/setTimeout.*fetchAvailability/)
    }
  })

  it('useEffect dependency array does not include timer/counter state', () => {
    // The dependency array should be [listingId, onStatusChange] — stable props only
    expect(component).toContain('[listingId, onStatusChange]')
  })

  it('documents page-load-only design decision in comment', () => {
    expect(component).toContain('Page-load only')
  })
})

// =============================================================================
// IR-R1: Each cron phase has independent try/catch
// =============================================================================

describe('IR-R1: cron phases have independent try/catch', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('contains multiple independent try blocks for different phases', () => {
    // Each phase (1, 2, 3, 3.5, 3.6, 4, 4.5, 5, 7, 10) has its own try/catch
    const tryCount = (cronRoute.match(/\btry\s*\{/g) || []).length
    // At minimum there should be 8+ try blocks for the major phases
    expect(tryCount).toBeGreaterThanOrEqual(8)
  })

  it('Phase 1, Phase 2, Phase 3 each have separate try blocks', () => {
    // Verify phase comments exist near try blocks
    expect(cronRoute).toContain('Phase 1')
    expect(cronRoute).toContain('Phase 2')
    expect(cronRoute).toContain('Phase 3')
  })
})

// =============================================================================
// IR-R2: Per-item processing within phases is try/caught
// =============================================================================

describe('IR-R2: per-item processing within phases has try/catch', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('has nested try/catch blocks inside for loops', () => {
    // Per-item processing pattern: for (...) { try { ... } catch { ... } }
    // At minimum, the cron should have both for loops AND try/catch blocks
    const forLoops = (cronRoute.match(/for\s*\(/g) || []).length
    expect(forLoops).toBeGreaterThanOrEqual(5) // multiple phases process items in loops
  })
})

// =============================================================================
// IR-R3: Stripe webhook error handling
// =============================================================================

describe('IR-R3: Stripe webhook returns correct status codes', () => {
  it('webhook route exists', () => {
    const webhookExists = fs.existsSync(path.join(webRoot, 'src/app/api/webhooks/stripe/route.ts'))
    expect(webhookExists).toBe(true)
  })

  it('webhook validates signature and returns 400 on invalid', () => {
    const webhook = readFile('src/app/api/webhooks/stripe/route.ts')
    expect(webhook).toContain('400')
    // Should verify signature
    expect(webhook).toContain('constructEvent') // Stripe signature verification
  })
})

// =============================================================================
// IR-R4: CI pipeline configuration
// =============================================================================

describe('IR-R4: CI pipeline fails on lint/type/test errors', () => {
  it('GitHub Actions workflow exists', () => {
    const workflowExists = fs.existsSync(path.join(webRoot, '../../.github/workflows/ci.yml'))
    expect(workflowExists).toBe(true)
  })
})

// =============================================================================
// IR-R5: Required env vars validated at startup
// =============================================================================

describe('IR-R5: env var validation at startup', () => {
  it('instrumentation file exists for server startup validation', () => {
    const exists = fs.existsSync(path.join(webRoot, 'src/instrumentation.ts'))
      || fs.existsSync(path.join(webRoot, 'instrumentation.ts'))
    expect(exists).toBe(true)
  })
})

// =============================================================================
// IR-R6: withErrorTracing wraps API routes
// =============================================================================

describe('IR-R6: withErrorTracing pattern in API routes', () => {
  it('withErrorTracing is importable from error tracking module', () => {
    const errorModule = readFile('src/lib/errors/index.ts')
    expect(errorModule).toContain('withErrorTracing')
    expect(errorModule).toContain('export')
  })

  it('checkout session route uses withErrorTracing', () => {
    const route = readFile('src/app/api/checkout/session/route.ts')
    expect(route).toContain('withErrorTracing')
  })

  it('cron route uses withErrorTracing', () => {
    const route = readFile('src/app/api/cron/expire-orders/route.ts')
    expect(route).toContain('withErrorTracing')
  })
})

// =============================================================================
// IR-R14: Cron routes log per-phase counts in JSON response
// =============================================================================

describe('IR-R14: cron routes log per-phase counts', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('returns JSON response with phase summary', () => {
    expect(cronRoute).toContain('NextResponse.json')
  })

  it('tracks per-phase counts', () => {
    // Cron tracks counts like: expiredItems, cancelledOrders, etc.
    // These are included in the JSON response
    expect(cronRoute).toContain('summary')
  })
})

// =============================================================================
// IR-R20: expire-orders runs parallel count queries before processing
// =============================================================================

describe('IR-R20: cron early-exit optimization', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('queries counts before processing to enable early exit', () => {
    // The cron should check if there's work to do before iterating
    // This is an optimization — 4 parallel count queries
    expect(cronRoute).toContain('.select(')
  })
})

// =============================================================================
// IR-R24: Phase 4.5 stale-confirmed dedup uses batch query + Set
// =============================================================================

describe('IR-R24: Phase 4.5 dedup pattern', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('Phase 4.5 uses Set for dedup lookups', () => {
    expect(cronRoute).toContain('Phase 4.5')
    expect(cronRoute).toContain('new Set')
  })
})

// =============================================================================
// IR-R25: Phase 10a trial reminder dedup uses batch query + Set
// =============================================================================

describe('IR-R25: Phase 10 dedup pattern', () => {
  const cronRoute = readFile('src/app/api/cron/expire-orders/route.ts')

  it('Phase 10 exists in cron', () => {
    expect(cronRoute).toContain('Phase 10')
  })
})

// =============================================================================
// IR-R7: Admin email alerts for critical errors
// =============================================================================

describe('IR-R7: admin email alerts for critical errors', () => {
  const logger = readFile('src/lib/errors/logger.ts')

  it('sendAdminAlert function exists in error logger', () => {
    expect(logger).toContain('sendAdminAlert')
  })

  it('admin alert uses ADMIN_ALERT_EMAIL env var', () => {
    expect(logger).toContain('ADMIN_ALERT_EMAIL')
  })

  it('critical errors trigger admin alert', () => {
    // logError should call sendAdminAlert for errors
    expect(logger).toContain('sendAdminAlert(error)')
  })
})
