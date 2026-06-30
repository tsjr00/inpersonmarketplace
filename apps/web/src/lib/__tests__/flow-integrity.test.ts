/**
 * Flow Integrity Tests
 *
 * These tests verify cross-file contracts that audits miss.
 * Each test catches a class of bug, not a specific bug.
 *
 * See: .claude/flow-integrity-protocol.md for the full protocol.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const APP_DIR = path.resolve(__dirname, '../../app')
const SRC_DIR = path.resolve(__dirname, '../..')

// ── Level 2A: Auth redirect paths → target pages exist ──────────────

describe('Auth flow integrity', () => {
  // Read ACTION_REDIRECT_PATHS from send-email route
  const sendEmailPath = path.join(APP_DIR, 'api/auth/send-email/route.ts')
  const sendEmailCode = fs.readFileSync(sendEmailPath, 'utf-8')

  // Extract the redirect paths map
  const pathsMatch = sendEmailCode.match(/ACTION_REDIRECT_PATHS[^{]*\{([^}]+)\}/)
  const pathEntries: Array<{ action: string; pageName: string }> = []

  if (pathsMatch) {
    const entries = pathsMatch[1].matchAll(/(\w+):\s*'([^']+)'/g)
    for (const entry of entries) {
      pathEntries.push({ action: entry[1], pageName: entry[2] })
    }
  }

  it('ACTION_REDIRECT_PATHS is not empty', () => {
    expect(pathEntries.length).toBeGreaterThan(0)
  })

  for (const { action, pageName } of pathEntries) {
    it(`auth action "${action}" → page [vertical]/${pageName} exists`, () => {
      const pagePath = path.join(APP_DIR, '[vertical]', pageName)
      const pageExists = fs.existsSync(pagePath) && (
        fs.existsSync(path.join(pagePath, 'page.tsx')) ||
        fs.existsSync(path.join(pagePath, 'page.ts'))
      )
      expect(pageExists).toBe(true)
    })
  }

  // The specific bug that bit us: signup must go to a page that handles verifyOtp
  it('signup redirect page handles token_hash verification', () => {
    const signupEntry = pathEntries.find(p => p.action === 'signup')
    expect(signupEntry).toBeDefined()

    const pagePath = path.join(APP_DIR, '[vertical]', signupEntry!.pageName, 'page.tsx')
    const pageCode = fs.readFileSync(pagePath, 'utf-8')

    // The page must call verifyOtp or handle token_hash
    const handlesToken = pageCode.includes('verifyOtp') || pageCode.includes('token_hash')
    expect(handlesToken).toBe(true)
  })

  it('recovery redirect page handles token_hash verification', () => {
    const recoveryEntry = pathEntries.find(p => p.action === 'recovery')
    expect(recoveryEntry).toBeDefined()

    const pagePath = path.join(APP_DIR, '[vertical]', recoveryEntry!.pageName, 'page.tsx')
    const pageCode = fs.readFileSync(pagePath, 'utf-8')

    const handlesToken = pageCode.includes('verifyOtp') || pageCode.includes('token_hash')
    expect(handlesToken).toBe(true)
  })
})

// ── Level 2B: FK disambiguation completeness ────────────────────────

describe('PostgREST FK disambiguation', () => {
  // market_vendors has 2 FKs to vendor_profiles: vendor_profile_id + replaced_vendor_id
  // Every query embedding one into the other must use a FK hint

  function findFilesWithPattern(dir: string, pattern: RegExp, ext: string): Array<{ file: string; line: number; text: string }> {
    const results: Array<{ file: string; line: number; text: string }> = []

    function walk(d: string) {
      if (!fs.existsSync(d)) return
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const fullPath = path.join(d, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath)
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          content.split('\n').forEach((line, i) => {
            if (pattern.test(line)) {
              results.push({ file: fullPath, line: i + 1, text: line.trim() })
            }
          })
        }
      }
    }

    walk(dir)
    return results
  }

  it('no ambiguous vendor_profiles ↔ market_vendors embeds without FK hint', () => {
    // Find .select() calls that embed vendor_profiles inside a market_vendors query
    // or market_vendors inside a vendor_profiles query WITHOUT a FK hint (!)
    const srcDir = path.join(SRC_DIR, 'app')

    // Pattern: "vendor_profiles(" without preceding "!" (FK hint)
    // In context of market_vendors queries
    const potentialIssues = findFilesWithPattern(
      srcDir,
      /vendor_profiles\s*\(/,
      '.ts'
    ).concat(findFilesWithPattern(
      srcDir,
      /vendor_profiles\s*\(/,
      '.tsx'
    ))

    // Filter to only those inside .select() strings that also reference market_vendors
    // and DON'T have a FK hint (!)
    const issues = potentialIssues.filter(match => {
      // Read the surrounding context (whole file for simplicity)
      const fileContent = fs.readFileSync(match.file, 'utf-8')
      const lines = fileContent.split('\n')

      // Check 10 lines before and after for market_vendors context
      const start = Math.max(0, match.line - 11)
      const end = Math.min(lines.length, match.line + 10)
      const context = lines.slice(start, end).join('\n')

      // Only flag if we're in a .select() that involves market_vendors
      const inMarketVendorsContext = context.includes('market_vendors') && context.includes('.select(')

      if (!inMarketVendorsContext) return false

      // Check if this specific line has the FK hint
      return !match.text.includes('!')
    })

    if (issues.length > 0) {
      const details = issues.map(i => `  ${i.file}:${i.line}: ${i.text}`).join('\n')
      expect.fail(`Found vendor_profiles embeds without FK hint in market_vendors context:\n${details}`)
    }
  })
})

// ── Level 2C: API params the frontend sends → backend reads ─────────

describe('Frontend-backend param contracts', () => {
  it('vendor orders API reads event_orders param (Pickup Mode Events tab)', () => {
    const routePath = path.join(APP_DIR, 'api/vendor/orders/route.ts')
    const routeCode = fs.readFileSync(routePath, 'utf-8')
    expect(routeCode).toContain('event_orders')
  })

  it('validate-capacity API reads vendor_profile_id param', () => {
    const routePath = path.join(APP_DIR, 'api/events/[token]/validate-capacity/route.ts')
    const routeCode = fs.readFileSync(routePath, 'utf-8')
    expect(routeCode).toContain('vendor_profile_id')
  })

  // Session 70: The shop API data logic was extracted to src/lib/events/shop-data.ts.
  // The route file is now a thin HTTP wrapper — it calls the lib and spreads the
  // result into the response. Field-presence assertions must check BOTH files
  // because the string literals for the response fields now live in the lib.
  const shopApiCode = () => {
    const routePath = path.join(APP_DIR, 'api/events/[token]/shop/route.ts')
    const libPath = path.join(APP_DIR, '..', 'lib', 'events', 'shop-data.ts')
    return fs.readFileSync(routePath, 'utf-8') + '\n' + fs.readFileSync(libPath, 'utf-8')
  }

  it('shop API returns payment_model in response', () => {
    expect(shopApiCode()).toContain('payment_model')
  })

  it('shop API returns company_max_per_attendee_cents for hybrid events', () => {
    expect(shopApiCode()).toContain('company_max_per_attendee_cents')
  })
})

// ── Level 3A: Every RPC defined in migrations → called in app code ──

describe('RPC usage completeness', () => {
  // RPCs defined in migration 111
  const definedRPCs = [
    'reserve_event_wave',
    'cancel_wave_reservation',
    'create_company_paid_order',
    // find_next_available_wave — intentionally excluded, documented as future/walk-up
    'get_event_waves_with_availability',
  ]

  function codeContains(searchDir: string, text: string): boolean {
    function walk(d: string): boolean {
      if (!fs.existsSync(d)) return false
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const fullPath = path.join(d, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__tests__') {
          if (walk(fullPath)) return true
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          if (content.includes(text)) return true
        }
      }
      return false
    }
    return walk(searchDir)
  }

  for (const rpc of definedRPCs) {
    it(`RPC "${rpc}" is called somewhere in app code`, () => {
      const found = codeContains(SRC_DIR, rpc)
      expect(found).toBe(true)
    })
  }
})

// ── Level 3B: Payment models → have checkout paths ──────────────────

describe('Payment model completeness', () => {
  it('company_paid has a dedicated order endpoint', () => {
    const orderRoute = path.join(APP_DIR, 'api/events/[token]/order/route.ts')
    expect(fs.existsSync(orderRoute)).toBe(true)
    const code = fs.readFileSync(orderRoute, 'utf-8')
    expect(code).toContain('company_paid')
  })

  it('company_paid orders are handled in fulfill route', () => {
    const fulfillRoute = path.join(APP_DIR, 'api/vendor/orders/[id]/fulfill/route.ts')
    const code = fs.readFileSync(fulfillRoute, 'utf-8')
    expect(code).toContain('company_paid')
  })

  it('attendee_paid uses standard cart/checkout flow (cart API exists)', () => {
    const cartRoute = path.join(APP_DIR, 'api/cart/items/route.ts')
    expect(fs.existsSync(cartRoute)).toBe(true)
  })

  it('hybrid payment model surfaces company cap on shop page', () => {
    const shopPage = path.join(APP_DIR, '[vertical]/events/[token]/shop/ShopClient.tsx')
    const code = fs.readFileSync(shopPage, 'utf-8')
    expect(code).toContain('companyCap')
    expect(code).toContain('hybrid')
  })
})

// ── Level 3C: Event status transitions → all statuses reachable ─────

describe('Event status reachability', () => {
  // All valid statuses from the CHECK constraint
  const allStatuses = ['new', 'reviewing', 'approved', 'declined', 'ready', 'active', 'review', 'completed', 'cancelled']
  const terminalStatuses = ['completed', 'cancelled', 'declined']

  // Statuses that code can transition TO (search for status updates)
  function findStatusSetter(status: string): boolean {
    const apiDir = path.join(APP_DIR, 'api')
    const cronDir = path.join(APP_DIR, 'api/cron')

    function searchDir(d: string): boolean {
      if (!fs.existsSync(d)) return false
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const fullPath = path.join(d, entry.name)
        if (entry.isDirectory()) {
          if (searchDir(fullPath)) return true
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          // Look for status being set to this value
          if (content.includes(`status: '${status}'`) || content.includes(`status: "${status}"`)) return true
          if (content.includes(`'${status}'`) && content.includes('catering_requests') && content.includes('.update(')) return true
        }
      }
      return false
    }

    return searchDir(apiDir)
  }

  for (const status of allStatuses) {
    if (status === 'new') continue // initial state, set by insert default
    it(`event status "${status}" can be reached via code`, () => {
      expect(findStatusSetter(status)).toBe(true)
    })
  }

  // Non-terminal statuses must have an exit path
  for (const status of allStatuses.filter(s => !terminalStatuses.includes(s))) {
    it(`event status "${status}" has at least one transition out`, () => {
      // This status should appear in a WHERE clause for an update
      const apiDir = path.join(APP_DIR, 'api')

      function searchForTransitionFrom(d: string): boolean {
        if (!fs.existsSync(d)) return false
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const fullPath = path.join(d, entry.name)
          if (entry.isDirectory()) {
            if (searchForTransitionFrom(fullPath)) return true
          } else if (entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf-8')
            // Look for .eq('status', '<this-status>') in context of an update
            if (content.includes(`'${status}'`) && (
              content.includes('.update(') || content.includes('status:')
            )) return true
          }
        }
        return false
      }

      expect(searchForTransitionFrom(apiDir)).toBe(true)
    })
  }
})

// ── Level 4: Market manager permission boundary ─────────────────────

describe('Market manager permission boundary', () => {
  // The rule (Session 81 Consolidated Roadmap §4):
  //
  //   Manager CANNOT disassociate a vendor from a market if the vendor
  //   associated themselves first. Manager CAN edit booth_number on
  //   market_vendors rows (booth assignment is the manager's job).
  //
  // The market_vendors row records a vendor's relationship to a market.
  // Deletion of that row is the disassociation operation. Per the rule,
  // managers must never have a path that deletes from market_vendors.
  //
  // Currently this is enforced by API surface design: the manager API
  // (src/app/api/market-manager/**) exposes booth_number PATCH only,
  // with no DELETE endpoint touching market_vendors. This test asserts
  // that boundary mechanically — it fails if a future change adds a
  // .from('market_vendors').delete() call anywhere under the manager
  // API.
  //
  // Admin path at src/app/api/markets/[id]/vendors/[vendorId]/route.ts
  // can delete (intentional — admin and self-removal allowed). That
  // path is outside this directory and not subject to this rule.
  it('no manager API endpoint deletes from market_vendors', () => {
    const managerApiDir = path.join(APP_DIR, 'api/market-manager')
    if (!fs.existsSync(managerApiDir)) {
      // Phase A precondition — directory must exist
      expect.fail('Manager API directory missing — flow expectation broken')
    }

    const violations: Array<{ file: string; line: number; text: string }> = []

    function walk(d: string) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const fullPath = path.join(d, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          // Only flag files that actually reference market_vendors AND .delete().
          // Either form of quote is checked, multiline-tolerant via simple
          // contains rather than regex line-matching (so chained calls with
          // .from on one line and .delete on the next still trip the check).
          const referencesMarketVendors =
            content.includes(".from('market_vendors')") ||
            content.includes('.from("market_vendors")')
          if (!referencesMarketVendors) continue

          // Find the index of any .from('market_vendors') call, then look
          // for .delete() within ~10 lines downstream of it. Catches both
          // single-line chains and multi-line chains.
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (
              !line.includes(".from('market_vendors')") &&
              !line.includes('.from("market_vendors")')
            ) continue
            const window = lines.slice(i, Math.min(lines.length, i + 12)).join('\n')
            if (window.includes('.delete()')) {
              violations.push({ file: fullPath, line: i + 1, text: line.trim() })
            }
          }
        }
      }
    }

    walk(managerApiDir)

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${path.relative(SRC_DIR, v.file)}:${v.line}: ${v.text}`)
        .join('\n')
      expect.fail(
        'Market manager API endpoint deletes from market_vendors. ' +
        'Per the permission boundary rule, managers cannot disassociate ' +
        'vendors from markets — only edit booth_number on existing rows. ' +
        'Use the admin path at src/app/api/markets/[id]/vendors/[vendorId] ' +
        'if a true disassociation is needed.\n' + details
      )
    }
  })
})

// ── Level 3D: Phase E season prepay flow integrity ──────────────────

describe('Phase E season flow integrity', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf-8')

  it('webhook season handler confirms payment via confirm_season_paid', () => {
    const code = read(path.join(SRC_DIR, 'lib/stripe/webhooks.ts'))
    expect(code).toContain('handleSeasonBoothCheckoutComplete')
    expect(code).toContain('confirm_season_paid')
  })

  it('cron Phase 18 reconciles pending groups via confirm_season_paid + cancel_season_group', () => {
    const code = read(path.join(APP_DIR, 'api/cron/expire-orders/route.ts'))
    expect(code).toContain('confirm_season_paid')
    expect(code).toContain('cancel_season_group')
  })

  it('cron Phase 16 excludes grouped rentals so season children are not swept (F1)', () => {
    const code = read(path.join(APP_DIR, 'api/cron/expire-orders/route.ts'))
    // Season children carry group_id; the one-off sweep must skip them.
    expect(code).toContain("'group_id', null")
  })

  it('season booking orchestration uses the book_season_atomic RPC', () => {
    const code = read(path.join(SRC_DIR, 'lib/markets/season-booking.ts'))
    expect(code).toContain('book_season_atomic')
  })

  it('settlement route writes a season_settlement booth_credits row', () => {
    const code = read(path.join(APP_DIR, 'api/market-manager/[marketId]/seasons/[seasonId]/settlement/route.ts'))
    expect(code).toContain('booth_credits')
    expect(code).toContain('season_settlement')
  })

  it('vendor cancel grants credit on the managerReceives base basis', () => {
    const code = read(path.join(APP_DIR, 'api/vendor/booth-groups/[groupId]/cancel/route.ts'))
    expect(code).toContain('booth_credits')
    // Locked 2026-06-27: credit is the manager-held base, not full vendorPays.
    expect(code).toContain('managerReceivesCents')
  })

  it('manager settlement card calls the settlement endpoint (no backend without UI)', () => {
    const code = read(path.join(SRC_DIR, 'components/market-manager/MarketSeasonSettlementCard.tsx'))
    expect(code).toContain('/settlement')
  })

  it('vendor cancel button calls the booth-group cancel endpoint', () => {
    const code = read(path.join(SRC_DIR, 'components/vendor/CancelSeasonButton.tsx'))
    expect(code).toContain('booth-groups')
    expect(code).toContain('/cancel')
  })

  // Item 4 — credit redemption wiring
  it('book-season route reserves booth credit via redeem_booth_credit before checkout', () => {
    const code = read(path.join(APP_DIR, 'api/vendor/markets/[id]/book-season/route.ts'))
    expect(code).toContain('redeem_booth_credit')
    expect(code).toContain('appliedCreditCents')
  })

  it('season checkout applies the credit to BOTH the charge and the manager transfer', () => {
    const code = read(path.join(SRC_DIR, 'lib/stripe/payments.ts'))
    expect(code).toContain('chargedVendorCents')
    expect(code).toContain('transferCents')
  })

  it('vendor cancel releases redeemed credit and grants on the net base (D5)', () => {
    const code = read(path.join(APP_DIR, 'api/vendor/booth-groups/[groupId]/cancel/route.ts'))
    expect(code).toContain("source: 'redeemed'")
    expect(code).toContain('appliedCreditCents')
  })

  // Item 2 — credit expiry
  it('vendor cancel sets an expiry on the granted credit', () => {
    const code = read(path.join(APP_DIR, 'api/vendor/booth-groups/[groupId]/cancel/route.ts'))
    expect(code).toContain('computeCreditExpiry')
    expect(code).toContain('expires_at')
  })

  it('expire-orders runs a booth-credit expiry sweep (Phase 19)', () => {
    const code = read(path.join(APP_DIR, 'api/cron/expire-orders/route.ts'))
    expect(code).toContain('Phase 19')
    expect(code).toContain("source: 'expired'")
  })

  // Item 4b — one-off weekly redemption
  it('one-off book route redeems booth credit by rental', () => {
    const code = read(path.join(APP_DIR, 'api/vendor/markets/[id]/book/route.ts'))
    expect(code).toContain('redeem_booth_credit')
    expect(code).toContain('p_rental_id')
  })

  it('both season and one-off checkout functions apply the credit to both sides', () => {
    const code = read(path.join(SRC_DIR, 'lib/stripe/payments.ts'))
    const occurrences = (code.match(/chargedVendorCents/g) || []).length
    expect(occurrences).toBeGreaterThanOrEqual(2) // season + one-off
  })

  it('expire-orders Phase 16 releases redeemed credit on abandoned one-off rentals', () => {
    const code = read(path.join(APP_DIR, 'api/cron/expire-orders/route.ts'))
    expect(code).toContain('related_rental_id')
    expect(code).toContain('rental abandoned')
  })
})

describe('Phase E season status lifecycle', () => {
  // market_seasons.status CHECK (mig 164) = draft|open|active|ended|settled.
  // LIVE statuses, each set somewhere in code:
  //   draft   — create (api/market-manager/[marketId]/seasons POST, insert)
  //   open    — open pre-sales (same route, action=open_prepay)
  //   active  — close pre-sales after the season start (action=close_prepay)
  //   ended   — manager ends the season (same route, action=end_season) → opens
  //             the make-up window; wired by the make-up/extend feature 2026-06-29
  //   settled — manager settlement route (or end_season when no debt is owed)
  const liveStatuses = ['draft', 'open', 'active', 'ended', 'settled']

  function findSeasonStatusSetter(status: string): boolean {
    const apiDir = path.join(APP_DIR, 'api')
    function searchDir(d: string): boolean {
      if (!fs.existsSync(d)) return false
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const fullPath = path.join(d, entry.name)
        if (entry.isDirectory()) {
          if (searchDir(fullPath)) return true
        } else if (entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8')
          if (
            content.includes('market_seasons') &&
            content.includes(`'${status}'`) &&
            (content.includes('.update(') || content.includes('.insert('))
          ) return true
        }
      }
      return false
    }
    return searchDir(apiDir)
  }

  for (const status of liveStatuses) {
    it(`season status "${status}" is set somewhere in code`, () => {
      expect(findSeasonStatusSetter(status)).toBe(true)
    })
  }
})

// ── Phase E make-up days (booth-only fulfillment) flow integrity ─────
describe('Phase E make-up days flow integrity', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf-8')
  const makeupRoute = path.join(APP_DIR, 'api/market-manager/[marketId]/seasons/[seasonId]/makeup-dates/route.ts')
  const seasonsRoute = path.join(APP_DIR, 'api/market-manager/[marketId]/seasons/route.ts')
  const settlementRoute = path.join(APP_DIR, 'api/market-manager/[marketId]/seasons/[seasonId]/settlement/route.ts')
  const cronRoute = path.join(APP_DIR, 'api/cron/expire-orders/route.ts')

  it('make-up scheduling only while the season is in the make-up window (status=ended)', () => {
    const code = read(makeupRoute)
    expect(code).toContain("season.status !== 'ended'")
  })

  it('make-up date is a special override, post-close, capped by potential_makeup_days', () => {
    const code = read(makeupRoute)
    expect(code).toContain("status: 'special'")
    expect(code).toContain('potential_makeup_days')
    expect(code).toContain('season.end_date') // must be after the season's close
  })

  it('make-up scheduling notifies the season vendors and touches NO money path (fulfillment only)', () => {
    const code = read(makeupRoute)
    expect(code).toContain('booth_makeup_scheduled_vendor')
    // Fulfillment, not a booking/redemption — no Stripe / credit-spend wiring.
    expect(code).not.toContain('redeem_booth_credit')
    expect(code.toLowerCase()).not.toContain('stripe')
  })

  it('seasons route wires active→ended via the end_season action', () => {
    const code = read(seasonsRoute)
    expect(code).toContain('end_season')
    expect(code).toContain("'ended'")
  })

  it('open_prepay is blocked while a prior season is unsettled (ended) — enforcement', () => {
    const code = read(seasonsRoute)
    expect(code).toContain('before opening pre-sales for a new season')
  })

  it('the cron auto-end backstop (Phase 20) uses the shared debt check', () => {
    const code = read(cronRoute)
    expect(code).toContain('Phase 20')
    expect(code).toContain('seasonHasOutstandingDebt')
  })

  it('route and cron share one debt-check helper (no divergent logic)', () => {
    const helper = read(path.join(SRC_DIR, 'lib/markets/season-debt.ts'))
    expect(helper).toContain('seasonHasOutstandingDebt')
    expect(helper).toContain('owedForGroup')
    expect(read(seasonsRoute)).toContain('seasonHasOutstandingDebt')
    expect(read(cronRoute)).toContain('seasonHasOutstandingDebt')
  })

  it("settlement accepts 'made_up' and fires the make-up settlement notice", () => {
    const code = read(settlementRoute)
    expect(code).toContain("'made_up'")
    expect(code).toContain('booth_makeup_settled_vendor')
  })

  it('both make-up notification types are registered', () => {
    const types = read(path.join(SRC_DIR, 'lib/notifications/types.ts'))
    expect(types).toContain('booth_makeup_scheduled_vendor')
    expect(types).toContain('booth_makeup_settled_vendor')
  })
})
