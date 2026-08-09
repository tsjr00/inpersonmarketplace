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

describe('Phase 3a — booth assignment honors manager pins (mig 186)', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf-8')

  // Migration may sit in migrations/ (pre-prod) or applied/ (post prod push).
  const boothMig = [
    '../../../supabase/migrations/20260711_186_booth_assign_honor_manager.sql',
    '../../../supabase/migrations/applied/20260711_186_booth_assign_honor_manager.sql',
  ]
    .map((rel) => path.resolve(SRC_DIR, rel))
    .find((p) => fs.existsSync(p))
    ?? path.resolve(SRC_DIR, '../../../supabase/migrations/20260711_186_booth_assign_honor_manager.sql')

  it('the booth RPC excludes manager-pinned booths, honors a pin, and raises BOOTH_TAKEN', () => {
    const sql = read(boothMig)
    // Layer 3: auto-assign exclusion set must include market_vendors pins.
    expect(sql).toMatch(/SELECT booth_number FROM market_vendors/)
    // Layer 2: honor the manager's pin.
    expect(sql).toContain('v_manager_booth')
    // Fail-loud contract when a pinned booth is taken that week.
    expect(sql).toContain('BOOTH_TAKEN')
  })

  it('book route maps BOOTH_TAKEN to a clear vendor error (RPC ↔ route contract)', () => {
    const code = read(path.join(APP_DIR, 'api/vendor/markets/[id]/book/route.ts'))
    expect(code).toContain('BOOTH_TAKEN')
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

// ── FT park-manager (P2b money path + P4 recurring/strikes + P4b-2 + P5) ─────
describe('FT park-manager flow integrity', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf-8')
  const bookRoute = path.join(APP_DIR, 'api/vendor/markets/[id]/book-park-spot/route.ts')
  const payRoute = path.join(APP_DIR, 'api/vendor/park-occurrences/[bookingId]/pay/route.ts')
  const payments = path.join(SRC_DIR, 'lib/stripe/payments.ts')
  const webhooks = path.join(SRC_DIR, 'lib/stripe/webhooks.ts')
  const standing = path.join(SRC_DIR, 'lib/markets/park-standing.ts')
  const reminders = path.join(SRC_DIR, 'lib/markets/park-checkin-reminders.ts')
  const cron = path.join(APP_DIR, 'api/cron/expire-orders/route.ts')
  const surveysCron = path.join(APP_DIR, 'api/cron/surveys/route.ts')
  const mgrStanding = path.join(APP_DIR, 'api/market-manager/[marketId]/standing-reservations/route.ts')
  const attendance = path.join(APP_DIR, 'api/market-manager/[marketId]/attendance/route.ts')
  const attendanceCard = path.join(SRC_DIR, 'components/market-manager/MarketAttendanceCard.tsx')
  const catalogRoute = path.join(APP_DIR, 'api/market-manager/[marketId]/optin/catalog/route.ts')
  const selectionsRoute = path.join(APP_DIR, 'api/market-manager/[marketId]/optin/selections/route.ts')
  // Resolve from migrations/ (pre-prod) OR applied/ (moved after the prod push).
  const optinMig = [
    '../../../supabase/migrations/20260702_175_ft_optin_vertical_tag.sql',
    '../../../supabase/migrations/applied/20260702_175_ft_optin_vertical_tag.sql',
  ].map((p) => path.resolve(SRC_DIR, p)).find(fs.existsSync)
    ?? path.resolve(SRC_DIR, '../../../supabase/migrations/20260702_175_ft_optin_vertical_tag.sql')

  // ── P2b money path ──
  it('booking route books atomically then charges via the park_spot checkout', () => {
    const code = read(bookRoute)
    expect(code).toContain('book_park_spot_atomic')
    expect(code).toContain('createParkSpotCheckoutSession')
  })

  it('park_spot checkout is a destination charge with a deterministic idempotency key', () => {
    const code = read(payments)
    expect(code).toContain('createParkSpotCheckoutSession')
    expect(code).toContain('park-spot-') // idempotencyKey = `park-spot-${groupId}` (not Date.now())
    expect(code).toContain('transfer_data')
    expect(code).toContain("type: 'park_spot'")
  })

  it('webhook flips park_spot bookings by booking_group_id', () => {
    const code = read(webhooks)
    expect(code).toContain('handleParkSpotCheckoutComplete')
    expect(code).toContain("type === 'park_spot'")
    expect(code).toContain('booking_group_id')
  })

  it('paid park_spot booking notifies the truck and the operator (non-throwing)', () => {
    const code = read(webhooks)
    expect(code).toContain('park_spot_paid_vendor')
    expect(code).toContain('park_spot_paid_manager')
    const types = read(path.join(SRC_DIR, 'lib/notifications/types.ts'))
    expect(types).toContain('park_spot_paid_vendor')
    expect(types).toContain('park_spot_paid_manager')
  })

  it('pay-occurrence route derives a deterministic group from the booking id (concurrency-safe)', () => {
    const code = read(payRoute)
    expect(code).toContain('createParkSpotCheckoutSession')
    expect(code).toContain('|| bookingId') // same idempotency key under concurrent pays → one charge
  })

  it('P6: park-spot checkout applies the per-market operator_keep_pct rebate via pricing.ts', () => {
    expect(read(bookRoute)).toContain('operator_keep_pct')
    expect(read(payRoute)).toContain('operator_keep_pct')
    // pricing.ts is the single source that consumes the keep rate.
    expect(read(path.join(SRC_DIR, 'lib/pricing.ts'))).toContain('operatorKeepPct')
  })

  // ── P4 recurring + strike engine ──
  it('strike engine counts BOTH missed-prepay (expired) and no-show (paid + no check-in)', () => {
    const code = read(standing)
    expect(code).toContain("'expired'")
    expect(code).toContain("'paid'")
    expect(code).toContain('market_day_checkins') // no-show = paid occurrence with no check-in row
    expect(code).toContain('isNoShowStrike')
  })

  it('strike counts are shared by the manager display AND the cron auto-suspend (one source)', () => {
    expect(read(standing)).toContain('getStrikeCountsForReservations')
    expect(read(mgrStanding)).toContain('getStrikeCountsForReservations')
  })

  it('daily sweep (Phase 21) generates occurrences, releases past-cutoff, auto-suspends', () => {
    expect(read(cron)).toContain('runStandingOccurrenceSweep')
    const code = read(standing)
    expect(code).toContain("status: 'expired'") // release past-cutoff pending
    expect(code).toContain("status: 'suspended'") // auto-suspend at the limit
  })

  it('manager reinstate stamps strikes_reset_at so the next sweep does not re-suspend', () => {
    expect(read(mgrStanding)).toContain('strikes_reset_at')
  })

  // ── P4b-2 reminders + manager-present override ──
  it('check-in reminders run in the hourly surveys cron and dedup via notifications', () => {
    expect(read(surveysCron)).toContain('runParkCheckinReminders')
    const code = read(reminders)
    expect(code).toContain('checkinReminderWindow')
    expect(code).toContain('park_checkin_reminder')
    expect(code).toContain("from('notifications')") // idempotency dedup
  })

  it('park_checkin_reminder notification type is registered', () => {
    expect(read(path.join(SRC_DIR, 'lib/notifications/types.ts'))).toContain('park_checkin_reminder')
  })

  it('manager "mark present" writes a manager_confirmed check-in (cancels the no-show)', () => {
    const code = read(attendance)
    expect(code).toContain('manager_confirmed')
    expect(code).toContain('market_day_checkins')
    expect(read(attendanceCard)).toContain('Mark present')
  })

  // ── P5 vertical-scoped agreement statements ──
  it('opt-in catalog + selections routes filter by market vertical (no FM/FT cross-pollination)', () => {
    expect(read(catalogRoute)).toContain('vertical_id.is.null')
    expect(read(selectionsRoute)).toContain('vertical_id.is.null')
  })

  it('mig 175 seeds FT-tagged agreement statements', () => {
    const sql = read(optinMig)
    expect(sql).toContain('vertical_id')
    expect(sql).toContain("'food_trucks'")
    expect(sql).toContain('ft-propane-inspection')
  })
})

// ── Organizer event funnel integrity (added 2026-08-08) ─────────────
//
// An event organizer's route to their own event crosses seven files plus a
// value frozen in Supabase user_metadata. Every file is correct alone; the
// bugs live in the joins. Two of these shipped; one was caught pre-merge.
//
//   · `event_token` is minted at APPROVAL, so anything keyed by it is
//     unreachable for the events that most need attention. That produced a
//     deadlock: an event with no street address could not be approved, edited
//     or cancelled by anyone.
//   · The "My Events" band was the landing target of the whole signup funnel.
//     Removing it without a redirect would dead-end a brand-new organizer on
//     the page immediately after they confirm their email.
//   · `organizer_user_id` is null until something claims the event by email.
//     That claim lived only on the shopper dashboard, so pointing the funnel
//     elsewhere made a new organizer's FIRST visit find zero events.
//
// These assert the RULE — "an organizer can always reach and fix their own
// event" — not today's implementation. If one fails, fix the code.

describe('Organizer event funnel integrity', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')
  const has = (p: string) => fs.existsSync(path.join(SRC_DIR, p))
  // Strip comments before asserting a pattern is ABSENT. These files document
  // the bug they fixed by quoting the broken code, so a naive match on the
  // whole file fails on the explanation rather than on real code.
  const code = (p: string) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  const loginPage = 'app/[vertical]/login/page.tsx'
  const signupPage = 'app/[vertical]/signup/page.tsx'
  const shopperDash = 'app/[vertical]/dashboard/page.tsx'
  const picker = 'app/[vertical]/event-manager/page.tsx'
  const eventDash = 'app/[vertical]/event-manager/[id]/dashboard/page.tsx'
  const detailsRoute = 'app/api/events/[token]/details/route.ts'
  const navDest = 'lib/dashboard/nav-destinations.ts'

  // ── The funnel lands somewhere that works ──

  it('the event-manager picker and dashboard both exist', () => {
    expect(has(picker)).toBe(true)
    expect(has(eventDash)).toBe(true)
  })

  it('login and signup send ?ref=event organizers to /event-manager', () => {
    // NOT to the shopper dashboard — the organizer band that lived there is
    // gone, so sending them there strands them.
    for (const p of [loginPage, signupPage]) {
      expect(rd(p), p + ' must branch on ref=event').toContain('isEventRef')
      expect(rd(p), p + ' must route organizers to /event-manager').toMatch(/event-manager/)
    }
  })

  it('/dashboard?section=events still redirects to the event manager', () => {
    // LOAD-BEARING, NOT DEAD CODE. signup persists its redirect URL into
    // user_metadata.signup_redirect_to and confirm-email replays it days
    // later, so accounts created before 2026-08-08 keep arriving on this URL.
    // Deleting this redirect breaks a link that exists only in Supabase.
    const code = rd(shopperDash)
    expect(code).toMatch(/section\s*===\s*'events'/)
    expect(code).toMatch(/redirect\([^)]*event-manager/)
  })

  it('the shopper dashboard no longer renders the organizer My Events band', () => {
    const src = code(shopperDash)
    expect(src).not.toContain('hasOrganizerEvents')
    expect(src).not.toContain('id="events-section"')
  })

  // ── A new organizer's FIRST visit works ──

  it('the picker claims organizer_user_id BEFORE querying by it', () => {
    // Event requests are submitted anonymously, so organizer_user_id is null
    // until claimed by contact_email match. The picker is a funnel landing
    // target, so it must do the claim itself or the first visit finds nothing.
    const code = rd(picker)
    const claimAt = code.indexOf('organizer_user_id: user.id')
    const readAt = code.indexOf(".eq('organizer_user_id', user.id)")
    expect(claimAt, 'picker must claim events by contact_email').toBeGreaterThan(-1)
    expect(readAt, 'picker must read events by organizer_user_id').toBeGreaterThan(-1)
    expect(claimAt, 'the claim must run BEFORE the read').toBeLessThan(readAt)
  })

  // ── A pending (tokenless) event is never hidden from its organizer ──

  it('no organizer surface filters events on event_token', () => {
    for (const p of [picker, navDest]) {
      expect(code(p), p + ' must not filter on event_token')
        .not.toMatch(/not\(\s*'event_token'/)
    }
  })

  it('the event manager dashboard is keyed on id, not event_token', () => {
    expect(has('app/[vertical]/event-manager/[token]/dashboard/page.tsx')).toBe(false)
    expect(rd(eventDash)).toMatch(/\.eq\('id',\s*id\)/)
  })

  it('organizer detail routes accept an id as well as a token', () => {
    // Auth in these routes is the organizer's session, never the token — which
    // is what makes accepting an id safe.
    expect(has('lib/events/event-ref.ts')).toBe(true)
    for (const p of [
      detailsRoute,
      'app/api/events/[token]/cancel/route.ts',
      'app/api/events/[token]/refresh-matches/route.ts',
    ]) {
      expect(rd(p), p + ' must resolve id-or-token').toContain('eventRefColumn')
    }
  })

  it('cancel is addressed by eventRef, not by the token alone', () => {
    // The old code rendered the Cancel button AND its confirm dialog, then
    // bailed on !eventToken with no message — a dead button on exactly the
    // events that needed cancelling.
    expect(rd('components/events/OrganizerEventActions.tsx'))
      .toMatch(/\/api\/events\/\$\{eventRef\}\/cancel/)
  })

  // ── The organizer can fix what approval demands ──

  it('address is editable by the organizer while the event is unapproved', () => {
    const code = rd(detailsRoute)
    expect(code).toMatch(/'address'/)
    expect(code, "status 'new' must stay editable").toMatch(/EDITABLE_STATUSES[\s\S]{0,120}'new'/)
  })

  it('address is required at intake on BOTH the client and the server', () => {
    // A field required downstream but optional upstream, with no editor in
    // between, is the shape that created the deadlock.
    expect(rd('app/api/event-requests/route.ts')).toMatch(/!address\s*\|\|/)
    expect(rd('components/events/EventRequestForm.tsx')).toMatch(/!form\.address\.trim\(\)/)
  })

  it('fields that approval copies into markets are pre-approval only', () => {
    // approveEventRequest copies address/city/state/zip/event_date into the
    // markets row and derives the schedule weekday from the date. Editing them
    // afterwards changes nothing vendors or shoppers see — a silent desync.
    const code = rd(detailsRoute)
    expect(code).toContain('PRE_APPROVAL_ONLY_FIELDS')
    for (const f of ['city', 'state', 'zip', 'event_date']) {
      expect(code, f + ' must be guarded').toMatch(
        new RegExp('PRE_APPROVAL_ONLY_FIELDS[\\s\\S]{0,300}\'' + f + '\'')
      )
    }
    expect(code, 'the guard must key on an existing market').toMatch(/event\.market_id/)
  })

  it('a typo\'d organizer email is repairable BY AN ADMIN', () => {
    // Audit 2026-08-08. contact_email is one of the two ways a route decides
    // you are the organizer (organizer_user_id, else contact_email == user
    // email). It was required at intake and writable by NOBODY, so a typo sent
    // the signup link to the wrong address, guaranteed the account claim would
    // never match, and could not be corrected by anyone — the organizer least
    // of all, since they cannot authenticate. Admin is the only possible fix.
    const admin = rd('app/api/admin/events/[id]/route.ts')
    expect(admin).toMatch(/contact_email/)
    expect(admin, 'admin must be able to write it').toMatch(/updates\.contact_email/)
  })

  it('the organizer can only change their email once their ACCOUNT is linked', () => {
    // Otherwise the fix recreates the bug: while contact_email IS the key, a
    // typo locks them out again. Once organizer_user_id is set, access is
    // anchored to the account and the email is just a notification address.
    const details = rd('app/api/events/[token]/details/route.ts')
    expect(details).toContain('ACCOUNT_LINKED_ONLY_FIELDS')
    expect(details, 'the guard must key on the account link')
      .toMatch(/!event\.organizer_user_id/)
  })

  it('correcting the email does NOT auto-send to the new address', () => {
    // Owner, 2026-08-08: "the admin route should tell me it changed and let me
    // trigger the email." A correction is exactly when you want to look before
    // mailing a stranger, so the send is a separate deliberate action.
    const admin = code('app/api/admin/events/[id]/route.ts')
    expect(admin, 'the send must be gated on an explicit request flag')
      .toMatch(/if \(resend_organizer_link\)/)
    expect(admin, 'and the route must report whether it actually sent')
      .toMatch(/linkEmailSent/)
  })

  it('un-cancelling is refused once anything irreversible happened', () => {
    // Audit 2026-08-08. Cancelling issues Stripe refunds, emails buyers and
    // vendors, and DELETES the listing_markets links. Status had no transition
    // rules, so an admin could flip a cancelled event back to approved and get
    // a healthy-looking event with no products and refunded buyers who were
    // told it was off. Reporting success while broken is worse than refusing.
    const admin = code('app/api/admin/events/[id]/route.ts')
    expect(admin).toMatch(/leavingCancelled/)
    expect(admin, 'must check buyers were refunded').toMatch(/cancelled_by/)
    expect(admin, 'must check vendors were notified').toMatch(/response_status/)
  })

  it('a clean un-cancel repairs what cancelling destroyed', () => {
    // The realistic admin misclick, minutes after approval, with no orders and
    // no accepted vendors. Nothing irreversible happened, so allow it — but
    // rebuild the deleted listing links (event_vendor_listings survives a
    // cancel and is the source) and reactivate the market. Allowing it WITHOUT
    // the repair is the silent-breakage case this whole guard exists for.
    const admin = code('app/api/admin/events/[id]/route.ts')
    expect(admin).toMatch(/event_vendor_listings/)
    expect(admin).toMatch(/listing_markets/)
    expect(admin, 'the market must come back on').toMatch(/active: true/)
  })

  it('headcount and company_name are editable, and guarded like the market-copied fields', () => {
    // Both were required at intake and writable by nobody. Both are COPIED into
    // the market at approval (headcount -> markets.headcount, company_name ->
    // the market's name), so they carry the same pre-approval guard.
    // Comments stripped first: these constants carry long explanatory blocks,
    // and a raw window would either miss the entry or match the prose.
    const details = code('app/api/events/[token]/details/route.ts')
    for (const f of ['headcount', 'company_name']) {
      expect(details, f + ' must be editable').toMatch(new RegExp(`'${f}'`))
      expect(details, f + ' must be pre-approval only')
        .toMatch(new RegExp(`PRE_APPROVAL_ONLY_FIELDS[\\s\\S]{0,200}'${f}'`))
    }
    // contact_name is NOT copied into the market — it appears only in emails —
    // so it is deliberately editable at any status. If it ever gets added to
    // the guarded list, that is a mistake.
    expect(details).toMatch(/'contact_name'/)
    expect(details, 'contact_name must NOT be frozen after approval')
      .not.toMatch(/PRE_APPROVAL_ONLY_FIELDS[\s\S]{0,200}'contact_name'/)
  })

  it('admin can supply an address, and approval reads it from the same request', () => {
    // Checking only the stored row made "set the address and approve" a
    // two-call dance whose first call silently failed.
    const code = rd('app/api/admin/events/[id]/route.ts')
    expect(code).toMatch(/updates\.address/)
    expect(code).toContain('effectiveAddress')
  })

  it('changing the event times also updates the schedule buyers order against', () => {
    // Audit 2026-08-08, the worst live break found. Approval COPIES the times
    // into market_schedules (event-actions.ts) and that INSERT was the ONLY
    // write to the table anywhere in the events path. The schedule is what
    // supplies the cart's schedule_id (shop-data.ts), so an organizer moving
    // their start time left buyers collecting food during hours the event was
    // not running.
    //
    // The RULE: the times the organizer sets and the times buyers order
    // against are the same times. It does not matter whether that is enforced
    // here or by a DB trigger later — if this fails because the sync moved to
    // a trigger, re-point the assertion; if it fails because the sync was
    // deleted, fix the code.
    const details = code(detailsRoute)
    expect(details, 'the route must write market_schedules').toMatch(/market_schedules/)
    expect(details, 'and scope the write to this event\'s market')
      .toMatch(/market_schedules[\s\S]{0,400}event\.market_id/)
    expect(details, 'a failed sync must NOT be swallowed — that is the desync')
      .toMatch(/scheduleError/)
  })

  it('event times can be changed but never cleared once a market exists', () => {
    // market_schedules.start_time/.end_time are NOT NULL. A cleared time would
    // either violate that or silently leave the schedule on the old hours,
    // which is the same desync from the other direction.
    const details = code(detailsRoute)
    expect(details).toMatch(/event_start_time[\s\S]{0,200}event_end_time/)
    expect(details, 'the clear must be rejected while a market exists')
      .toMatch(/ERR_EVENT_DETAIL_014/)
  })

  it('the times are NOT frozen post-approval — self-service approves at submit', () => {
    // The rejected alternative. Freezing them would have been one line, but
    // self-service auto-approves the moment the form is submitted, so a market
    // exists immediately: the organizer's times would be locked from the click,
    // with no admin able to correct them either. That is the address deadlock
    // wearing a different hat. Keep them editable and keep the sync honest.
    const details = code(detailsRoute)
    // Read the freeze list's ARRAY LITERAL, not a character window after its
    // name. A window overruns into MATCHING_AFFECTING_FIELDS, which legitimately
    // contains both time fields — and would fail this test against correct code.
    const freezeList = details.match(/PRE_APPROVAL_ONLY_FIELDS\s*=\s*\[([^\]]*)\]/)?.[1]
    expect(freezeList, 'PRE_APPROVAL_ONLY_FIELDS must be a readable array literal')
      .toBeTruthy()
    for (const f of ['event_start_time', 'event_end_time']) {
      expect(details, f + ' must stay editable').toMatch(new RegExp(`'${f}'`))
      expect(freezeList, f + ' must NOT be added to the freeze list')
        .not.toContain(f)
    }
  })

  it('the intake success number is the SCORED match count, not the vendor roster', () => {
    // Until 2026-08-08 the confirmation screen displayed a count of every
    // event_approved vendor in the vertical as "N qualified <vendors> found in
    // your area" — no criteria, no location predicate. The real scored count
    // from autoMatchAndInvite was computed moments later and thrown away. This
    // is the top of the self-service funnel; a number we cannot defend there is
    // the first thing a new organizer learns about us.
    const intake = code('app/api/event-requests/route.ts')
    expect(intake, 'the response must carry the invite result')
      .toMatch(/matchedCount = inviteResult\.matched/)
    expect(intake, 'and must NOT count the roster for display')
      .not.toMatch(/match_count[\s\S]{0,200}event_approved/)

    // null (matching never ran) and 0 (ran, found nobody) must stay distinct —
    // collapsing them renders "we didn't look" as "we found nobody".
    const form = code('components/events/EventRequestForm.tsx')
    expect(form, 'the client must not coerce null to 0')
      .not.toMatch(/setMatchCount\(successData\.match_count \|\| 0\)/)
  })

  // ── Regressions that shipped once ──

  it('event_ratings is never embedded through a user_profiles FK', () => {
    // event_ratings.user_id references auth.users, NOT user_profiles (mig 116).
    // The embed hint named a constraint that cannot join those tables, so the
    // admin page 500'd on every load and looked like an empty state.
    expect(code('app/api/admin/event-ratings/route.ts')).not.toMatch(/user_profiles!event_ratings/)
  })

  it('the refresh-matches banner only appears once the event has a market', () => {
    // refresh-matches rejects anything unapproved, so offering the button on a
    // pending event is a prompt that can only fail.
    expect(rd('components/events/OrganizerEventDetails.tsx'))
      .toMatch(/matchingChanged\s*&&\s*details\?\.market_id/)
  })
})

// ── Dashboard empty-state convention (added 2026-08-08) ─────────────
//
// Owner's rule: a section with nothing in it COLLAPSES to a header plus one
// line. It never disappears. A card that vanishes on a quiet week is a feature
// the user never discovers — which costs adoption, upgrades and retention.
// Full write-up: docs/Codebase_Map/22_Components_UI.md.
//
// Vanishing is a one-line change (`return null`) that looks like a tidy-up, so
// this guards the convention rather than trusting people to remember it.

describe('Dashboard empty-state convention', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')
  const bare = (p: string) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('DashboardCard supports collapsed-empty with all three flavours', () => {
    // The flavours are not interchangeable — 'waiting' copy on an
    // 'unavailable' section promises data that is never coming.
    const code = rd('components/dashboard/DashboardCard.tsx')
    expect(code).toContain('EmptyKind')
    for (const kind of ['setup', 'waiting', 'unavailable']) {
      expect(code, `EmptyKind must offer '${kind}'`).toMatch(new RegExp(`'${kind}'`))
    }
    expect(code, 'an empty card must not carry a signalling state')
      .toMatch(/DASHBOARD_STATES\[empty \? 'neutral' : state\]/)
  })

  it('sections with nothing to show collapse instead of vanishing', () => {
    // These four used to `return null` on an empty result.
    for (const f of [
      'components/market-manager/ManagerEarningsCard.tsx',
      'components/market-manager/MarketTransactionsCard.tsx',
      'components/market-manager/WeeklyBookingsCard.tsx',
      'components/market-manager/BoothOccupancyGrid.tsx',
    ]) {
      expect(bare(f), f + ' must collapse, not return null').not.toContain('return null')
      expect(rd(f), f + ' must pass an empty flavour').toMatch(/kind:\s*'(setup|waiting|unavailable)'/)
    }
  })

  it('every early return in an exception component is a DOCUMENTED one', () => {
    // Each of these hides for a specific, approved reason. The counts are
    // asserted so an UNDOCUMENTED early return — the tidy-up that quietly
    // reintroduces vanishing — fails even though each individual match passes.
    //
    //  · ManagerActionSummary defers to OnboardingChecklist during setup;
    //    rendering both is the competing-prompt problem it exists to avoid.
    //  · RateOrderCard hides while LOADING, and hides when there is nothing to
    //    rate (owner, 2026-08-08 — see the PROMPT vs SECTION rule below).
    const summary = bare('components/market-manager/ManagerActionSummary.tsx')
    expect((summary.match(/return null/g) || []).length).toBe(1)
    expect(summary).toMatch(/setupIncomplete\)\s*return null/)

    const rate = bare('components/buyer/RateOrderCard.tsx')
    expect((rate.match(/return null/g) || []).length).toBe(2)
    expect(rate).toMatch(/loading\)\s*return null/)
    expect(rate).toMatch(/orders\.length === 0\)\s*return null/)
  })

  it('a PROMPT does not appear with nothing to ask for', () => {
    // The refinement to the collapse rule, owner 2026-08-08: "I don't like
    // having rate your recent order visible if there are no orders to rate."
    //
    //   A SECTION shows capability     → collapse, so the user learns it exists.
    //   A PROMPT asks the user to act  → do not render with nothing to ask.
    //
    // Because it self-hides, this tile can stay `attention` unconditionally —
    // the loudest state on the dashboard never fires over an empty ask, which
    // is what keeps the per-audience intensity system meaningful (states.ts).
    const rate = bare('components/buyer/RateOrderCard.tsx')
    expect(rate).toMatch(/orders\.length === 0\)\s*return null/)
    expect(rate).toMatch(/state="attention"/)
    expect(rate, 'no empty-state copy should remain').not.toMatch(/nothingToRate/)
  })

  it('the shopper dashboard uses ONE grid system, not two', () => {
    // Owner found the inconsistency on staging 2026-08-08: on a wide laptop the
    // tiles above the vendor line sat 3 across while the vendor section was
    // 2x2, and narrowing the window inverted it.
    //
    // .shopper-grid keys off the VIEWPORT via media queries; an inline
    // `auto-fit` measures the CONTAINER, which is ~212px narrower at >=1024
    // because the nav rail occupies it. Two systems on one page cannot agree.
    // Scoped to CARD grids (the 250px track). Small auto-fit grids used for
    // content INSIDE a card — e.g. the two-up benefits list in the premium
    // upsell — are a different thing and are fine: they lay out text within a
    // container, not cards across a page.
    const page = bare('app/[vertical]/dashboard/page.tsx')
    expect(page, 'card grids must use .shopper-grid, not an inline auto-fit')
      .not.toMatch(/gridTemplateColumns:\s*'repeat\(auto-fit,\s*minmax\(250px/)
  })
})
