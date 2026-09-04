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

  it('market-copied fields are editable post-approval, and place changes trip the re-confirmation gate', () => {
    // Owner-authorized expectation change 2026-08-15 ("yes - authorized").
    // The 2026-08-08 freeze was explicitly INTERIM: its own retirement plan
    // said the fields come off the list once mig 219's trigger (which
    // propagates them into the live market and recomputes the schedule
    // weekday) is applied to all three environments — which happened
    // 2026-08-13. The current rule: only company_name stays frozen (the
    // market NAME derives from per-locale app config a trigger cannot
    // resolve), and city/state/zip joined the consequence gate as place
    // changes so live-event edits notify vendors (B1) and re-confirm
    // pre-orders (B3).
    const stripped = code(detailsRoute)
    expect(stripped).toContain('PRE_APPROVAL_ONLY_FIELDS')
    for (const f of ['city', 'state', 'zip', 'event_date', 'headcount']) {
      expect(stripped, f + ' must NOT be frozen post-approval (mig 219 trigger syncs it)')
        .not.toMatch(new RegExp('PRE_APPROVAL_ONLY_FIELDS[\\s\\S]{0,300}\'' + f + '\''))
    }
    // The gate now treats city/state/zip as place changes.
    const gate = code('lib/events/change-window.ts')
    for (const f of ['city', 'state', 'zip']) {
      expect(gate, f + ' must be a gate-covered place field')
        .toMatch(new RegExp(`'${f}'`))
    }
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

  it('company_name is the ONLY frozen field; headcount and contact_name edit freely', () => {
    // Owner-authorized expectation change 2026-08-15. Post-mig-219 rule:
    // headcount syncs to the market via the trigger, so it edits at any
    // status; company_name alone stays pre-approval-only (the market NAME is
    // built from it via per-locale config no trigger can resolve).
    // Comments stripped first: these constants carry long explanatory blocks.
    const details = code('app/api/events/[token]/details/route.ts')
    for (const f of ['headcount', 'company_name', 'contact_name']) {
      expect(details, f + ' must be editable').toMatch(new RegExp(`'${f}'`))
    }
    expect(details, 'company_name must stay pre-approval only')
      .toMatch(/PRE_APPROVAL_ONLY_FIELDS[\s\S]{0,200}'company_name'/)
    for (const f of ['headcount', 'contact_name']) {
      expect(details, f + ' must NOT be frozen after approval')
        .not.toMatch(new RegExp(`PRE_APPROVAL_ONLY_FIELDS[\\s\\S]{0,200}'${f}'`))
    }
  })

  it('admin can supply an address, and approval reads it from the same request', () => {
    // Checking only the stored row made "set the address and approve" a
    // two-call dance whose first call silently failed.
    const code = rd('app/api/admin/events/[id]/route.ts')
    expect(code).toMatch(/updates\.address/)
    expect(code).toContain('effectiveAddress')
  })

  it('the request→market/schedule sync is owned by mig 219\'s trigger, with NO second app-side writer', () => {
    // Audit 2026-08-08, the worst live break found: an organizer moving their
    // start time updated catering_requests while market_schedules — what
    // buyers order against — kept the old hours.
    //
    // The RULE is unchanged: the times the organizer sets and the times
    // buyers order against are the same times. The ENFORCEMENT moved, per the
    // stopgap's own retirement condition ("delete only once 219 is applied to
    // all three environments" — done 2026-08-13; assertion re-pointed
    // 2026-08-15, owner-authorized): trg_sync_event_request_to_market now
    // propagates the fields, and a trigger cannot be bypassed by the next
    // route somebody writes. The route must NOT keep a second writer — two
    // writers of one fact is the drift pattern behind most of this module's
    // history.
    const details = code(detailsRoute)
    expect(details, 'the route must NOT write market_schedules — the trigger owns the sync')
      .not.toMatch(/from\('market_schedules'\)/)
    const trigger = fs.readFileSync(
      path.join(SRC_DIR, '..', '..', '..', 'supabase', 'migrations', 'applied', '20260808_219_sync_event_request_to_market.sql'),
      'utf-8'
    )
    expect(trigger, 'the trigger must exist and cover the times')
      .toMatch(/trg_sync_event_request_to_market/)
    expect(trigger).toMatch(/event_start_time/)
    expect(trigger).toMatch(/event_end_time/)
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

  it('lead time is enforced from ONE shared module, on both sides', () => {
    // The client and the server both gate the event date. If either hard-codes
    // its own threshold they will drift, and the drift is invisible: the form
    // would happily accept a date the API then rejects, or worse, the reverse.
    // One module, imported twice, is the only version of this that stays true.
    const intake = code('app/api/event-requests/route.ts')
    const form = code('components/events/EventRequestForm.tsx')

    for (const [label, src] of [['intake route', intake], ['request form', form]] as const) {
      expect(src, `${label} must import the shared module`)
        .toMatch(/from '@\/lib\/events\/lead-time'/)
      expect(src, `${label} must not hard-code the floor`)
        .not.toMatch(/MIN_EVENT_LEAD_DAYS\s*=/)
    }
  })

  it('the server rejects a too-soon date and demands the rushed acknowledgment', () => {
    // The form is a courtesy, not a boundary. A date inside the hard floor has
    // to fail server-side, and a date in the rushed band has to carry proof the
    // organizer saw the warning.
    const intake = code('app/api/event-requests/route.ts')
    expect(intake, 'must classify the date').toMatch(/leadTimeStatus\(event_date\)/)
    expect(intake, "must reject 'too_soon'").toMatch(/too_soon/)
    expect(intake, "must gate 'rushed' on the acknowledgment")
      .toMatch(/rushed'[\s\S]{0,120}rushed_acknowledged/)
  })

  it('the date input cannot offer a date the server would reject', () => {
    // `min` on the picker and the server floor come from the same constant, so
    // the organizer never gets to choose something that then bounces.
    const form = code('components/events/EventRequestForm.tsx')
    expect(form).toMatch(/min=\{earliestBookableDate\(\)\}/)
  })

  it('VendorPitch never forbids the headline from wrapping', () => {
    // 2026-08-09: `whiteSpace: 'nowrap'` on the FM headline made the entire FM
    // landing page scroll sideways on a 375px phone — the headline is
    // vertical-specific copy and FM's is longer than FT's, so it could neither
    // fit nor wrap and pushed the page to 430px.
    //
    // nowrap does nothing when text fits; it only acts when text WOULD wrap,
    // which is precisely when we want wrapping. In a component whose copy
    // varies by vertical it can only ever cause this bug. Comments stripped —
    // the fix documents itself by naming the property it removed.
    expect(code('components/landing/VendorPitch.tsx'))
      .not.toMatch(/whiteSpace:\s*'nowrap'/)
  })

  it('a consequential change is gated on CONSEQUENCE, not on the clock', () => {
    // The rule: an acknowledgment is demanded when the change would actually
    // make someone re-confirm. A time-based band was specced and abandoned —
    // once the block starts at 72h a band "72h to the cutoff" has zero width,
    // and worse, it would wave through a date change three weeks out that
    // forced twenty people to re-confirm.
    const details = code(detailsRoute)
    expect(details, 'must ask whether the change actually affects attendees')
      .toMatch(/changeRequiresReconfirmation\(/)
    expect(details, 'must count the people affected before demanding anything')
      .toMatch(/order_items[\s\S]{0,400}market_id/)
    expect(details, 'must demand the acknowledgment')
      .toMatch(/change_acknowledgment_required/)
  })

  it('no pre-orders means no friction at all', () => {
    // Owner, 2026-08-09: nobody to re-confirm, so nothing to warn about and
    // nothing to block. The gate must key on the count being > 0, not merely on
    // the field having changed.
    const details = code(detailsRoute)
    expect(details).toMatch(/affectedOrders\s*>\s*0/)
  })

  it('counts DISTINCT ORDERS, not order_items', () => {
    // The copy says "people". One person ordering four things is one person,
    // and re-confirmation is per combined order — they answer once.
    const details = code(detailsRoute)
    expect(details, 'must dedupe by order_id').toMatch(/new Set\([\s\S]{0,160}order_id/)
  })

  it('the hard block is not a dead end — an admin can still change the times', () => {
    // The block refuses a late timing change and tells the organizer to contact
    // us. If nobody on our side could then make that change, the block would be
    // the address deadlock wearing a different hat: a state with no way out.
    // Admin could edit address/city/state/zip but NOT times until 2026-08-09.
    const admin = code('app/api/admin/events/[id]/route.ts')
    expect(admin, 'admin must accept a start time').toMatch(/event_start_time/)
    expect(admin, 'admin must accept an end time').toMatch(/event_end_time/)
    expect(admin, 'and actually write them').toMatch(/updates\[field\]|updates\.event_start_time/)
  })

  it('event times can be changed but never cleared, on BOTH the organizer and admin paths', () => {
    // ck_event_requires_times (mig 121): an event with a date must keep both
    // times. Whichever route drops one trips a raw constraint violation, so
    // both refuse the blank with a readable message instead.
    expect(code(detailsRoute), 'organizer path').toMatch(/ERR_EVENT_DETAIL_014/)
    expect(code('app/api/admin/events/[id]/route.ts'), 'admin path')
      .toMatch(/cannot be removed/)
  })

  it('the block is not a dead end — a change request route exists behind it', () => {
    // The refusal has to lead somewhere. A block whose only instruction is
    // "contact us", with no route to record that contact, is the address
    // deadlock with better copy.
    expect(has('app/api/events/[token]/change-request/route.ts')).toBe(true)
    expect(has('app/api/admin/events/change-requests/route.ts')).toBe(true)
    expect(has('app/api/admin/events/change-requests/[id]/route.ts')).toBe(true)
  })

  it('a change request is only accepted for a change the organizer CANNOT make', () => {
    // Otherwise the queue fills with requests for edits they could have done
    // themselves, and an admin's attention is the scarcest thing in this flow.
    const req = code('app/api/events/[token]/change-request/route.ts')
    expect(req).toMatch(/evaluateChangeWindow\(/)
    expect(req, "must bounce a request when the window is still open")
      .toMatch(/not_blocked/)
  })

  it('a decline must carry a reason', () => {
    // Owner, 2026-08-09. A silent refusal 48 hours before someone's event is
    // how a customer is lost permanently. Enforced in the route AND by the
    // ck_ecr_decline_needs_reason CHECK in mig 220 — the route exists to return
    // a sentence rather than a raw constraint violation.
    const admin = code('app/api/admin/events/change-requests/[id]/route.ts')
    expect(admin).toMatch(/review_note_required/)
    expect(admin, 'declining without a note must not reach the database')
      .toMatch(/if \(!note\)/)
  })

  it('approving requires an explicit decision about the existing pre-orders', () => {
    // Owner decided pre-orders are judged CASE BY CASE, so there is deliberately
    // no default. If a default ever appears here, the decision was reversed
    // without anyone saying so.
    const admin = code('app/api/admin/events/change-requests/[id]/route.ts')
    expect(admin).toMatch(/order_action_required/)
    // Catch a LEGAL VALUE being substituted, not any fallback at all: the route
    // legitimately coerces a missing value to '' before validating, and ''
    // fails the whitelist. `?? 'refund_all'` is the thing that would reverse
    // the owner's decision silently.
    expect(admin, 'no legal order_action may be supplied as a fallback')
      .not.toMatch(/(\|\||\?\?)\s*'(refund_all|keep_all|handled_manually)'/)
  })

  it('a self-service request is approved as asked, or declined — never edited', () => {
    // On admin-assisted events the admin is co-managing and may edit before
    // approving. On self-service they are a gatekeeper, not a co-organizer.
    const admin = code('app/api/admin/events/change-requests/[id]/route.ts')
    expect(admin).toMatch(/isSelfService/)
    expect(admin, 'an edit on a self-service request must be refused')
      .toMatch(/isSelfService[\s\S]{0,400}status: 400/)
  })

  it('approval claims the request BEFORE applying the change', () => {
    // Ordering matters. Approved-but-unapplied is visible and fixable;
    // applied-but-still-pending invites a second admin to apply it twice.
    const admin = code('app/api/admin/events/change-requests/[id]/route.ts')
    const claimAt = admin.indexOf("status: 'approved'")
    const applyAt = admin.indexOf("from('catering_requests')\n      .update(writeable)")
    expect(claimAt, 'the claim must exist').toBeGreaterThan(-1)
    expect(admin, 'the apply must exist').toMatch(/\.update\(writeable\)/)
    if (applyAt > -1) expect(claimAt).toBeLessThan(applyAt)
    expect(admin, 'the claim must be guarded against a lost race')
      .toMatch(/\.eq\('status', 'pending'\)/)
  })

  it('the admin sees the MONEY at stake, not only a count', () => {
    // Owner, 2026-08-09: a count does not tell an admin whether they are
    // deciding about $80 or $4,000, and those are different conversations. The
    // amount is also the reason a person is in this loop at all — the block
    // exists because refunds move real money.
    expect(code('app/api/events/[token]/change-request/route.ts'))
      .toMatch(/preorder_value_cents_at_request/)
    expect(code('app/api/admin/events/change-requests/route.ts'))
      .toMatch(/live_preorder_value_cents/)
  })

  it('the queue reports the CURRENT figures alongside the snapshot', () => {
    // The organizer decided on one number and the admin decides on another,
    // because orders keep arriving. A silent gap between them is how someone
    // gets quoted a figure that is no longer true.
    const q = code('app/api/admin/events/change-requests/route.ts')
    expect(q, 'must return the stored snapshot').toMatch(/preorder_count_at_request/)
    expect(q, 'and the live count').toMatch(/live_preorder_count/)
    expect(q, 'batched, not one query per row')
      .toMatch(/\.in\('market_id', marketIds\)/)
  })

  it('the block explains WHY a person is involved', () => {
    // Self-service is sold as having no human in it. Appearing at the failure
    // point without explaining ourselves reads as a bait-and-switch, so the
    // refusal names the reason: refunds move real money.
    expect(code(detailsRoute), 'the blocked copy must name the money reason')
      .toMatch(/real money moves/)
  })

  it('the admin queue is scoped by verifyAdminScope, not a hand-rolled role check', () => {
    // Several event routes hand-roll `role === 'admin'`, which is the shape
    // behind the "legitimate admin refused" bug in the backlog. Not repeated.
    for (const p of [
      'app/api/admin/events/change-requests/route.ts',
      'app/api/admin/events/change-requests/[id]/route.ts',
    ]) {
      expect(code(p), p).toMatch(/verifyAdminScope\(/)
      expect(code(p), `${p} must not hand-roll the role test`)
        .not.toMatch(/role === 'admin'/)
    }
  })

  it("the organizer's explanation is moderated before it can reach a vendor", () => {
    // It is emailed verbatim and attributed. This is the last place an
    // unfiltered organizer string should be able to pass through.
    expect(code('app/api/events/[token]/change-request/route.ts'))
      .toMatch(/content-moderation/)
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

// ── Multi-location cart rule (added 2026-08-09) ──────────────────────
//
// ONE rule, stated in two files: an EVENT may not share a cart with any other
// market; everything else combines freely. `cart/items` enforces it at add time
// (ERR_CART_010); `cart/validate` is the pre-checkout backstop.
//
// WHY THIS IS GUARDED MECHANICALLY: the two files drifted apart for three weeks
// and no test noticed. A day-eleven assumption in cart/validate (c585da5c,
// 2026-01-14) forbade two traditional markets; the multi-location checkout was
// built ten days LATER (bb865e30, 2026-01-24) on the opposite premise. The block
// sat inert behind a fail-open bug until f4b2700c (2026-07-12) closed it, then
// began firing for real at 0cdda987 (2026-07-20) when the validator learned to
// read the buyer's chosen market — silently killing multi-market checkout in
// PRODUCTION. Found 2026-08-09 only because the owner remembered testing it.
//
// The failure mode is slow and silent: every file looks correct on its own.

describe('Multi-location cart rule', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')
  const bare = (p: string) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  const validate = bare('app/api/cart/validate/route.ts')
  const addItem = bare('app/api/cart/items/route.ts')

  it('cart/validate refuses an event sharing a cart with another market', () => {
    expect(validate, 'event isolation must survive in the pre-checkout gate')
      .toMatch(/marketTypes\.has\('event'\)\s*&&\s*marketIds\.size > 1/)
  })

  it('cart/items refuses the same combination at add time', () => {
    // The earlier, harder guard. Events never enter a mixed cart at all.
    expect(addItem, 'add-time event isolation must exist').toContain('ERR_CART_010')
    expect(addItem, 'the add-time guard must key off market_type event')
      .toMatch(/\.eq\('market_type',\s*'event'\)/)
  })

  it('cart/validate does NOT block two traditional markets', () => {
    // Owner 2026-08-09: a morning market and an evening market in one city is a
    // real order. order_items carries market_id/schedule_id/pickup_date per row.
    expect(validate, 'traditional markets may span — the buyer acknowledges each location')
      .not.toMatch(/marketType === 'traditional' && marketIds\.size > 1/)
    expect(validate).not.toContain('must all be from the same market')
  })

  it('cart/validate does NOT block mixed pickup types', () => {
    // Owner 2026-08-09: a market pickup plus a vendor's private pickup is one
    // legitimate order. Only events are isolated.
    expect(validate, 'mixed pickup types are allowed')
      .not.toMatch(/marketTypes\.size > 1/)
    expect(validate).not.toContain('different pickup types')
  })

  it('the acknowledgment that replaces those blocks is still wired to the button', () => {
    // Removing the blocks is only safe because this gate exists. If someone
    // deletes the checkbox, multi-location carts would check out with no warning
    // that the buyer must collect in two places.
    const cart = bare('lib/hooks/useCart.tsx')
    const page = bare('app/[vertical]/checkout/page.tsx')
    expect(cart, 'detection must read the buyer CHOSEN market, not listing_markets[0]')
      .toMatch(/new Set\(items\.map\(item => item\.market_id\)/)
    expect(page, 'checkout stays disabled until the buyer acknowledges the locations')
      .toMatch(/hasMultiplePickupLocations && !multiLocationAcknowledged/)
  })
})

// ── Event token format (added 2026-08-10) ────────────────────────────
//
// The attendee shop page filters the token by character class before looking it
// up. That filter has to agree with the alphabet the generator actually emits.
//
// It did not, for two months. The guard was written 2026-03-31 (754f820b)
// against `Date.now().toString(36)` — lowercase alphanumeric. On 2026-06-05
// (12ee9069) the suffix became 18 base64url chars from randomBytes(15), because
// the timestamp-derived suffix was partially brute-forceable and this token is
// an organizer's ONLY credential. base64url includes UPPERCASE and '_'. Nothing
// connected the two, so every event approved after that date had a dead shop
// page, and every menu-item link 404'd. Found by owner testing, not by a test.
//
// Rather than assert the regex text (which would just re-encode today's answer),
// this EXTRACTS the live guard and runs real token shapes through it.

describe('Event token format', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  const guardSrc = rd('app/[vertical]/events/[token]/shop/page.tsx')
  const generatorSrc = rd('lib/events/event-actions.ts')

  it('the generator still emits base64url suffixes', () => {
    // If this changes, the samples below stop being representative.
    expect(generatorSrc, 'token entropy source').toMatch(/randomBytes\(15\)/)
    expect(generatorSrc, 'base64 encoding').toMatch(/toString\('base64'\)/)
  })

  it('the shop page guard accepts the tokens the generator produces', () => {
    const m = guardSrc.match(/!\/\^(\[[^\]]+\]\+)\$\/\.test\(token\)/)
    expect(m, 'could not find the token format guard in shop/page.tsx').toBeTruthy()

    const live = new RegExp(`^${m![1]}$`)

    // Real shapes: a slugged company name plus a base64url suffix. The first is
    // an actual staging token that 404'd.
    for (const sample of [
      'test-event-org-8KExJaSEEdKZwyz38g',
      'smokestack-bbq-Ab3_xY9-QzT1uVwXyZ',
      'a-B_9',
    ]) {
      expect(live.test(sample), `guard must accept "${sample}"`).toBe(true)
    }
  })

  it('the guard still REJECTS everything outside the token alphabet', () => {
    // The acceptance test above pins only one edge. Without this one, a future
    // failure could be "fixed" by widening the guard to /^.+$/ — which would
    // stay green and look like it was protecting something. Pinning both edges
    // is the difference between a guard and the appearance of one.
    //
    // The guard is a cheap filter, not authorisation (getEventShopData still
    // resolves the token). But it is the last place these shapes are cheap to
    // refuse, so refuse them.
    const m = guardSrc.match(/!\/\^(\[[^\]]+\]\+)\$\/\.test\(token\)/)
    const live = new RegExp(`^${m![1]}$`)

    for (const [sample, why] of [
      ['../../etc/passwd', 'path traversal'],
      ['..', 'parent directory'],
      ['tok en', 'whitespace'],
      ['tok\ten', 'tab'],
      ['tok%2Fen', 'percent-encoding'],
      ['tok/en', 'path separator'],
      ['tok\\en', 'backslash'],
      ["tok'en", 'single quote'],
      ['tok"en', 'double quote'],
      ['<script>', 'angle brackets'],
      ['tok\u0000en', 'null byte'],
      ['tok;en', 'semicolon'],
      ['tok&en', 'ampersand'],
      ['tok.en', 'dot'],
      ['', 'empty'],
    ] as const) {
      expect(live.test(sample), `guard must reject ${why}: "${sample}"`).toBe(false)
    }
  })

  // This function has been rewritten 19+ times across migrations. Twice now,
  // reading an older definer has nearly produced a change against the wrong
  // baseline — the live body is whichever migration NUMBER is highest, not
  // whichever file you find first, and they are not in date order on disk.
  // Shared by every test below that reasons about the live definition.
  // Returns `sql` with `-- …` comments stripped. Assert against THAT, never
  // the raw text: these migrations document the branches they add and remove
  // in prose, so a raw match can pass on a comment (false green for a presence
  // test) or fail on one (false red for an absence test — which is exactly
  // what happened writing the T-39 guard below). See backlog "TEST QUALITY —
  // absence assertions match comments as if they were code".
  const newestPickupDatesDefiner = (): { name: string; body: string; sql: string } => {
    const migDir = path.resolve(__dirname, '../../../../../supabase/migrations')
    const files: string[] = []
    for (const dir of [migDir, path.join(migDir, 'applied')]) {
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!/^\d{8}_\d{3}_.*\.sql$/.test(f)) continue
        const full = path.join(dir, f)
        if (fs.readFileSync(full, 'utf-8').includes('CREATE OR REPLACE FUNCTION get_available_pickup_dates')) {
          files.push(full)
        }
      }
    }
    expect(files.length, 'no migration defines get_available_pickup_dates').toBeGreaterThan(0)
    const num = (p: string) => parseInt(path.basename(p).split('_')[1]!, 10)
    const newest = files.sort((a, b) => num(a) - num(b))[files.length - 1]!
    const body = fs.readFileSync(newest, 'utf-8')
    return { name: path.basename(newest), body, sql: body.replace(/--[^\n]*/g, '') }
  }

  it('the NEWEST definition of get_available_pickup_dates keeps the event acceptance branch', () => {
    // Mig 223 made FT events sell on an ACCEPTED market_vendors row (T-36:
    // before it, no attendee could order at any food-truck event). A future
    // rewrite built from an older copy would silently delete that branch and
    // re-break it. This asserts the newest definer still carries it.
    const { name, sql } = newestPickupDatesDefiner()

    expect(
      sql,
      `${name} is the newest definer and must keep the event acceptance branch (mig 223 / T-36)`
    ).toMatch(/market_vendors mv[\s\S]{0,200}response_status\s*=\s*'accepted'/)
  })

  it('the NEWEST definer grants events NO vertical exemption (T-39)', () => {
    // The hole mig 225 closed: `market_type = 'event' AND vertical_id !=
    // 'food_trucks'` let ANY farmers-market listing attached to an event sell
    // whether the vendor had accepted, declined, or was never invited — a
    // VERTICAL test doing the job of a PERMISSION test. It survived because
    // each of the 19 rewrites copied the body forward verbatim, which is the
    // right thing to do for safety and exactly how a wrong branch lives for
    // months.
    //
    // Scoped to the event-permission shape on purpose: `ls.vertical_id !=
    // 'food_trucks'` appears legitimately twice in the DATE-WINDOW logic
    // (migs 199/200) and must not be caught here.
    const { name, sql } = newestPickupDatesDefiner()
    const verticalExemption = /market_type\s*=\s*'event'\s+AND\s+m\.vertical_id\s*!=\s*'food_trucks'/

    expect(
      verticalExemption.test(sql),
      `${name} reintroduces a vertical exemption for events — acceptance is the rule in BOTH verticals (mig 225 / T-39)`
    ).toBe(false)
  })

  it('the NEWEST definer excludes BENCHED vendors from selling (mig 234)', () => {
    // Owner rule 2026-08-16: "they must attend to sell." The organizer's
    // selection round leaves non-selected vendors 'accepted' with
    // is_backup=true — before mig 234 their menus stayed orderable at events
    // they were not attending (the stranded-order class). The bench exclusion
    // must sit INSIDE the event acceptance EXISTS.
    const { name, sql } = newestPickupDatesDefiner()
    expect(
      sql,
      `${name} must gate event selling on NOT-benched (COALESCE(is_backup,false)=false inside the acceptance EXISTS — mig 234)`
    ).toMatch(/response_status\s*=\s*'accepted'[\s\S]{0,120}COALESCE\(mv\.is_backup,\s*false\)\s*=\s*false/)
  })

  it('the NEWEST definer gates fee-charging events on a PAID or COVERED fee row (mig 234, Phase 4)', () => {
    // The paid gate: at an event with an Event Vendor Fee (mig 228), an
    // accepted vendor sells only with a paid or covered (mig 233 backup
    // step-in) fee payment row. Free events skip the conjunct — asserted via
    // the fee-cents bypass. Without this, paying is honor-system: a selected
    // vendor who never pays sells anyway.
    const { name, sql } = newestPickupDatesDefiner()
    expect(
      sql,
      `${name} must carry the free-event bypass (event_vendor_fee_cents > 0 inside NOT EXISTS)`
    ).toMatch(/NOT EXISTS\s*\([\s\S]{0,200}event_vendor_fee_cents\s*>\s*0/)
    expect(
      sql,
      `${name} must accept paid OR covered fee rows as satisfying the gate`
    ).toMatch(/event_vendor_fee_payments p[\s\S]{0,200}status\s+IN\s*\('paid',\s*'covered'\)/)
  })

  it('the NEWEST definer scopes the vms fallback to NON-EVENT markets (mig 235)', () => {
    // Staging-confirmed bypass 2026-08-16: the traditional-market fallback
    // `OR vms.id IS NOT NULL` fired before the event attendance gate — a
    // benched, unpaid vendor with a stray/seeded vendor_market_schedules row
    // at the event market sold straight past it. On traditional markets the
    // vms row IS attendance; on events it must grant nothing.
    const { name, sql } = newestPickupDatesDefiner()
    expect(
      sql,
      `${name} must scope the vms fallback: OR (m.market_type <> 'event' AND vms.id IS NOT NULL)`
    ).toMatch(/OR\s*\(m\.market_type\s*<>\s*'event'\s+AND\s+vms\.id\s+IS\s+NOT\s+NULL\)/)
    expect(
      /OR\s+vms\.id\s+IS\s+NOT\s+NULL/.test(sql),
      `${name} reintroduces the UNSCOPED vms fallback — the event bypass mig 235 closed`
    ).toBe(false)
  })

  it('the shop payload mirrors the attendance gate (paired surface of mig 234)', () => {
    // The SQL gate rejects at CART time; the shop payload decides what
    // attendees SEE. If they filter on different predicates, menus render
    // that error at checkout (or sellable menus vanish). Assert the mirror's
    // three components: bench exclusion, fee check scoped to paid/covered,
    // and the free-event bypass on fee cents.
    const shopData = rd('lib/events/shop-data.ts')
    expect(shopData, 'shop payload must exclude benched vendors')
      .toMatch(/is_backup\s*!==\s*true/)
    expect(shopData, 'shop payload must count only paid/covered fee rows')
      .toContain(".in('status', ['paid', 'covered'])")
    expect(shopData, 'shop payload must bypass the fee gate for free events')
      .toMatch(/feeCents\s*>\s*0/)
  })

  it('the event accept route still does NOT write vendor_market_schedules', () => {
    // The rejected alternative. Creating a vms row on acceptance would make
    // "is this vendor attending?" answerable from two places that can drift —
    // miss one on a cancellation and ordering stays open for a truck that is
    // not coming. If this ever fails, someone reintroduced that design.
    const respond = rd('app/api/vendor/events/[marketId]/respond/route.ts')
    expect(respond, 'event attendance is market_vendors.response_status, not a vms row')
      .not.toContain('vendor_market_schedules')
  })

  it('every menu item on the event page links to the shop page', () => {
    // This is WHY the guard mattered so much: the item links all funnel here,
    // so one rejected token took out ordering entirely, not just one page.
    const eventPage = rd('app/[vertical]/events/[token]/page.tsx')
    expect(eventPage, 'item links must point at the shop route')
      .toMatch(/href=\{`\/\$\{verticalId\}\/events\/\$\{token\}\/shop`\}/)
  })
})

// ── Organizer identity protection (2026-08-11) ───────────────────────
//
// Owner's rule: only a vendor who has ACCEPTED sees the organizer's name and
// street address. Invited vendors see enough to decide — date, times, headcount,
// cuisine preferences, city and state — but nothing they could use to go around
// the platform and approach the organizer directly.
//
// The rule was already implemented and documented in api/vendor/events/[marketId],
// but api/vendor/market-stats predated events and never learned it: it returned
// EVERY active event in the vertical, with name and address, to ANY vendor with
// a profile — invited or not. An event market's name is built from the
// organizer's company at approval, so the name IS the host's identity. (T-09)

describe('Organizer identity protection', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('the invitation route reveals the address only after acceptance', () => {
    // The reference implementation. If this weakens, the rule is gone.
    const route = rd('app/api/vendor/events/[marketId]/route.ts')
    expect(route).toMatch(/const hasAccepted = marketVendor\.response_status === 'accepted'/)
    expect(route, 'street address is earned by committing')
      .toMatch(/address: hasAccepted \? market\.address : null/)
  })

  it('market-stats only returns event markets the vendor has ACCEPTED', () => {
    // This route carries name + address for everything it returns, so an
    // ungated event branch leaks the host's identity to every vendor.
    const route = rd('app/api/vendor/market-stats/route.ts')
    expect(route, 'must resolve the vendor accepted set')
      .toMatch(/response_status', 'accepted'/)
    expect(route, "the event branch must be gated on that set")
      .toMatch(/market_type === 'event' && acceptedEventIds\.has\(m\.id\)/)
  })

  it('market-stats does NOT admit events on market_type alone', () => {
    // The exact shape of the bug: `|| m.market_type === 'event' ||`.
    const route = rd('app/api/vendor/market-stats/route.ts')
    const bare = /\|\|\s*m\.market_type === 'event'\s*\|\|/
    expect(bare.test(route), 'an ungated event branch is the T-09 leak').toBe(false)
  })

  // T-67 (2026-08-12): the SAME leak on a surface the T-09 fix did not cover.
  // api/vendor/markets selects '*' from markets, so everything it returns
  // carries address, headcount and the contact/manager email columns — and its
  // event list filtered on market_type, end date and radius only. Every vendor
  // could read the host and street address of private events they were never
  // invited to. Gated on invitation rather than acceptance (unlike
  // market-stats) because this section is how a vendor DISCOVERS an event:
  // public events stay browsable, private ones require a market_vendors row.

  it('the vendor markets list hides PRIVATE events the vendor was never invited to', () => {
    const route = rd('app/api/vendor/markets/route.ts')
    // Asserts the SHAPE of the rule, not an identifier. The first version of
    // this test pinned the variable name `invitedEventIds` and broke within
    // the hour when T-68 turned that Set into a Map to carry response_status —
    // a rename with the rule fully intact. A guard that fails on refactors
    // teaches people to edit the guard, which is how guards die.
    expect(route, "must read this vendor's market_vendors relationships")
      .toMatch(/from\('market_vendors'\)/)
    expect(route, 'a private event must require one of those relationships')
      .toMatch(/is_private !== true \|\| \w+\.has\(/)
  })

  it('the vendor markets event list is never filtered on type and date alone', () => {
    // The exact shape of the bug: the type/date filter feeding straight into
    // the radius filter with no privacy check in between.
    const route = rd('app/api/vendor/markets/route.ts')
    const bare = /market_type === 'event' && m\.event_end_date >= today\)\s*\.filter\(m => isWithinRadius/
    expect(bare.test(route), 'an ungated event list is the T-67 leak').toBe(false)
  })

  // T-75 (2026-08-13): the market's NAME is the organizer's identity —
  // approveEventRequest names every event market `${company_name} ${suffix}`
  // (lib/events/event-actions.ts). T-09 and T-67 masked the address and
  // filtered the list, but both API responses still carried the real name to
  // vendors who had not accepted, defeating the policy they implement. The
  // invite NOTIFICATIONS were already masked ("Private Event"); the API
  // responses were the gap. Owner decision: masked until ACCEPTED; public
  // events never masked.

  it('the invitation payload masks the market name until acceptance', () => {
    const route = rd('app/api/vendor/events/[marketId]/route.ts')
    expect(route, 'market_name must be gated on acceptance, like the address')
      .toMatch(/market_name: hasAccepted \? market\.name : maskedEventName/)
  })

  it('the vendor markets list masks private event names until acceptance', () => {
    const route = rd('app/api/vendor/markets/route.ts')
    expect(route, 'private events must resolve a masked name for non-accepted vendors')
      .toMatch(/is_private === true && \w+ !== 'accepted'/)
    expect(route, 'the masked branch must actually be used for the name')
      .toMatch(/maskedEventName/)
  })

  it('no vendor-facing event API returns a bare market.name for the event payload', () => {
    // The exact shape of the T-75 bug in the invitation route: the real name
    // returned unconditionally three lines below the comment promising
    // identity protection.
    const route = rd('app/api/vendor/events/[marketId]/route.ts')
    expect(/market_name: market\.name,/.test(route),
      'an unconditional market_name is the T-75 leak').toBe(false)
  })
})

// ── Vendor event capacity: displayed value == submitted value (2026-08-11) ──
//
// T-03: a vendor could not accept an event invitation using the default
// capacity. "Use my profile default" is PRE-CHECKED, and a pre-checked radio
// never fires onChange — so the only line that set the value never ran. The
// render fell back to the profile number for DISPLAY, so the vendor saw
// "20 per wave / 8 waves x 20 = 160" while the form state held ''. Accepting
// was refused with "please confirm your per-wave capacity", pointing at a field
// that already looked filled in. The only way through was to click "Custom" and
// retype the same number. T-04 (acceptance not persisting) was the same bug.
//
// The root cause was DUPLICATION: the wave count was computed inline in the
// JSX where the submit handler could not see it. These guard the two halves.

describe('Vendor event capacity seeding', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')
  const page = rd('app/[vertical]/vendor/events/[marketId]/page.tsx')

  it('the loader seeds capacity from the profile default', () => {
    // Without this the pre-checked radio leaves the form empty forever.
    expect(page, 'per-wave capacity must be seeded when details load')
      .toMatch(/setMaxOrdersPerWave\(perWave\)/)
    expect(page, 'total capacity must be seeded too — it had the same latent bug')
      .toMatch(/setMaxOrdersTotal\(\s*\n?\s*perWave \* calculateWaveCount/)
  })

  it('the wave count has exactly ONE definition — and it is not in this file', () => {
    // Strengthened 2026-08-11. The previous version permitted exactly ONE local
    // copy of the arithmetic, which is precisely how a duplicate survived: the
    // T-03 fix consolidated two inline copies into a local helper while the
    // canonical `calculateWaveCount` sat exported in lib/events/viability the
    // whole time. Now zero local copies are allowed and the import is required.
    expect(page, 'must use the canonical exported calculation')
      .toMatch(/import \{ calculateWaveCount \} from '@\/lib\/events\/viability'/)
    expect(page, 'no local wave arithmetic may reappear')
      .not.toMatch(/Math\.ceil\([^)]*\/\s*(30|waveDurationMin)/)
  })

  it('the response form is NOT hidden behind a reveal toggle', () => {
    // It used to sit behind a button labelled "Accept" that accepted nothing —
    // handleRespond('accepted') flipped a local flag and returned. So a vendor
    // clicked "Accept" and only THEN saw the items, the capacity and the terms
    // they were agreeing to. Owner 2026-08-11: show it all; the bottom button
    // is the single point of commitment. (T-10)
    expect(page, 'the reveal toggle must not come back').not.toContain('showMenuPicker')
    expect(page, 'declining is the only single-click response')
      .toMatch(/async function handleRespond\(status: 'declined'\)/)
  })

  it('the accept payload still sends a per-wave capacity for food trucks', () => {
    // The server hard-requires it (vendor/events/[marketId]/respond: FT branch),
    // so dropping it from the payload would re-break acceptance a different way.
    expect(page).toMatch(/event_max_orders_per_wave: isFT \? maxOrdersPerWave/)
    const respond = rd('app/api/vendor/events/[marketId]/respond/route.ts')
    expect(respond, 'server-side requirement this seeding exists to satisfy')
      .toMatch(/Please confirm your per-wave customer capacity/)
  })
})

// ── Matching integrity: readiness gate + one copy of the inputs (2026-08-13) ──
//
// T-70: the scorer read event readiness, but an EMPTY questionnaire was
// silently rewarded — missing capacity defaulted to 30/wave and missing
// runtime to 6 hours, which usually score green. Matching invited vendors the
// accept flow would then block (accepting requires capacity data). Owner
// decision: completed readiness is a HARD GATE for being matched.
//
// T-64: the admin panel's match preview hardcoded those same inputs (30/wave,
// 6hr, no experience) — a third, diverged copy of the matching rule, so admins
// saw different scores than the engine produced.

describe('Matching readiness integrity', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('the matching engine hard-gates on completed readiness', () => {
    const engine = rd('lib/events/event-actions.ts')
    expect(engine, 'a vendor without completed readiness must be skipped, not defaulted')
      .toMatch(/Event readiness questionnaire not completed/)
  })

  it('the engine no longer rewards an empty questionnaire with default capacity', () => {
    // The exact shape of the T-70 bug: `max_headcount_per_wave: (…) || 30`.
    const engine = rd('lib/events/event-actions.ts')
    expect(/max_headcount_per_wave: \(eventReadiness\?\.max_headcount_per_wave as number\) \|\| 30/.test(engine),
      'the || 30 capacity default is the T-70 bug').toBe(false)
  })

  it('the admin match preview reads real readiness, not hardcoded inputs', () => {
    // The exact shape of the T-64 bug: literal `max_headcount_per_wave: 30`.
    const page = rd('app/[vertical]/admin/events/page.tsx')
    expect(/max_headcount_per_wave: 30,/.test(page),
      'a hardcoded capacity in the admin preview is the T-64 divergence').toBe(false)
    expect(page, 'the preview must read the vendor readiness the API now sends')
      .toMatch(/v\.readiness\?\.max_headcount_per_wave/)
  })

  it('the daily cron re-matches under-filled open events (T-63)', () => {
    const cron = rd('app/api/cron/expire-orders/route.ts')
    expect(cron, 'the re-match sweep must exist — vendor-side eligibility changes have no other trigger')
      .toMatch(/autoMatchAndInvite\(/)
    expect(cron, 'the sweep must only target events still short of vendors')
      .toMatch(/accepted >= needed/)
  })
})

// ── Market visibility rule: buyer search ↔ manager explanation (2026-08-13) ──
//
// A traditional market is visible to buyers iff ≥1 vendor has BOTH a
// published, non-deleted listing linked via listing_markets AND an active
// vendor_market_schedules row — an intersection on the SAME vendor. The rule
// is implemented TWICE by design: getFullyOnboardedMarketIds (batch, buyer
// search) and getMarketVisibilityStatus (per-market, the manager dashboard's
// "why isn't my market visible" card). Their own comments call each other
// mirrors, but until this test nothing pinned them — if one changes, the
// manager is told a different rule than the one hiding their market, which is
// worse than no explanation. Registered as @paired-rule market-visibility.

describe('Market visibility rule', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')
  const CLAUSES: Array<[string, RegExp]> = [
    ['published listings only', /\.eq\('listings\.status', 'published'\)/],
    ['non-deleted listings only', /\.is\('listings\.deleted_at', null\)/],
    ['active schedule rows only', /\.eq\('is_active', true\)/],
  ]

  it('both implementations enforce all three clauses of the rule', () => {
    for (const file of ['lib/markets/visible-markets.ts', 'lib/markets/market-visibility.ts']) {
      const text = rd(file)
      for (const [name, re] of CLAUSES) {
        expect(re.test(text), `${file} must enforce: ${name}`).toBe(true)
      }
    }
  })

  it('both implementations intersect on the SAME vendor, not two independent existence checks', () => {
    // The batch version keys pairs on market|vendor; the per-market version
    // counts vendors present in BOTH sets. Losing the same-vendor requirement
    // in either would show markets where one vendor listed and a DIFFERENT
    // vendor scheduled — a market nobody can actually buy from.
    expect(rd('lib/markets/visible-markets.ts')).toMatch(/\$\{row\.market_id\}\|\$\{(row\.)?vendor_profile_id\}|market_id\}\|\$\{vpid\}/)
    expect(rd('lib/markets/market-visibility.ts')).toMatch(/scheduleVendors\.has\(vpid\)/)
  })
})

// ── Display price rule: non-vendor surfaces show fee-inclusive (2026-08-13) ──
//
// Vendors enter BASE price; every buyer/organizer-facing surface shows base +
// the buyer % fee (lib/pricing.ts calculateItemDisplayPrice). The helper is the
// single implementation — what drifts is CALL SITES that render a stored cents
// field raw. Both guards below pin sites found by the retrospective
// second-surface audit rendering base prices to non-vendors:
//   - the JSON-LD Product schema in the listing + market-box pages (the OG
//     title in the SAME files was fixed 2026-08-11; the schema block was
//     missed — Google rich results advertised the base price)
//   - the event shop's sticky cart bar, which rendered the cart summary RPC's
//     total (raw base cents by design) while every other price on the page
//     was fee-inclusive

describe('Display price integrity', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('listing page JSON-LD passes a display price, not raw price_cents', () => {
    const page = rd('app/[vertical]/listing/[listingId]/page.tsx')
    expect(/priceCents:\s*listing\.price_cents\s*\|\|/.test(page),
      'raw listing.price_cents into listingJsonLd is the base-price-to-Google bug').toBe(false)
    expect(page, 'the JSON-LD price must go through the display-price helper')
      .toMatch(/calculateDisplayPrice/)
  })

  it('market-box page JSON-LD passes a display price, not raw cents', () => {
    const page = rd('app/[vertical]/market-box/[id]/page.tsx')
    expect(/priceCents:\s*priceCents\s*\|\|/.test(page),
      'raw offering cents into marketBoxJsonLd is the base-price-to-Google bug').toBe(false)
    expect(page, 'the JSON-LD price must go through the display-price helper')
      .toMatch(/calculateDisplayPrice/)
  })

  it('event shop cart bar renders a computed display total, not the raw cart-summary total', () => {
    const shop = rd('app/[vertical]/events/[token]/shop/ShopClient.tsx')
    expect(/formatPrice\(summary\.total_cents\)/.test(shop),
      'the cart-summary RPC total is raw base cents; rendering it understates the charge').toBe(false)
    expect(shop, 'the bar total must be built from per-item display prices')
      .toMatch(/calculateItemDisplayPrice\(item\.price_cents/)
  })
})

// ── Multi-market order comms: vendor notice groups by vendor AND market ──
//
// T-05's rule: an order can span markets, so every surface describing an order
// enumerates ALL pickups. The buyer confirmation was fixed 2026-08-10 (pinned
// by order-placed-message.test.ts); the vendor's new-order notice in the SAME
// block kept first-wins market naming until the 2026-08-13 audit (M-1) — a
// vendor selling at two markets in one order was told only the first.

describe('Multi-market vendor notification', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('new_paid_order grouping keys on vendor AND market, not vendor alone', () => {
    const route = rd('app/api/checkout/success/route.ts')
    expect(route, 'the group key must include the market so no market is silently dropped')
      .toMatch(/\$\{vendorUserId\}\|\$\{market\?\.name/)
    expect(/vendorNotifications\.get\(vendorUserId\)/.test(route),
      'keying the group on vendor alone is the M-1 first-wins bug').toBe(false)
  })
})

// ── Loyalty Layer 1 (2026-08-25) — badges + customer segments ─────────────
// One classifier (lib/loyalty/segments.ts) feeds three readers: the buyer's
// badges (Favorites page), the vendor's order-card chip, and the vendor
// milestone nudge. These guards keep every reader on the shared code so the
// vendor's chip and the buyer's badge can never disagree, and keep the
// evaluator on the lazy path that is also the backfill.
describe('Loyalty Layer 1 integrity', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('the Favorites page evaluates achievements on load (lazy backfill path)', () => {
    const page = rd('app/[vertical]/favorites/page.tsx')
    expect(page, 'badges live on Favorites (owner: keep the dashboard consolidated) and evaluation on load is the backfill')
      .toMatch(/evaluateBuyerAchievements\(/)
  })

  it('the vendor orders API classifies customers with the shared classifier and ships the segment', () => {
    const route = rd('app/api/vendor/orders/route.ts')
    expect(route).toMatch(/classifyCustomer\(/)
    expect(route).toMatch(/customer_segment/)
    expect(route, 'the count must be FULFILLED orders — the same definition of a visit the badges use')
      .toMatch(/\.eq\('status', 'fulfilled'\)/)
  })

  it('the Your Customers report (A1, 2026-09-04) uses the SAME classifier and visit definition', () => {
    // The classifier doc names this report as its third reader — the report
    // must never disagree with the chip or the badges, and it must never leak
    // more than the display name (owner: names only, never email/phone).
    const route = rd('app/api/vendor/customers/route.ts')
    expect(route).toMatch(/import \{[^}]*classifyCustomer[^}]*\} from '@\/lib\/loyalty\/segments'/)
    expect(route).toMatch(/\.eq\('status', 'fulfilled'\)/)
    expect(route).toMatch(/\.select\('user_id, display_name'\)/)
    expect(/email|phone/.test(route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')),
      'the report must not select or emit email/phone').toBe(false)
  })

  it('VIP designation (A2, mig 242): the add route enforces the tier cap from vendor-limits', () => {
    // The cap lives in ONE place — TierLimits.vipCustomers (0/10/25, owner
    // Q1 2026-09-04) — and gates ADDING only: nothing anywhere deletes VIP
    // rows on a tier change (a downgrade never strips a vendor's VIPs).
    const route = rd('app/api/vendor/vip-customers/route.ts')
    expect(route).toMatch(/import \{[^}]*getTierLimits[^}]*\} from '@\/lib\/vendor-limits'/)
    expect(route).toMatch(/\.vipCustomers/)
    expect(route, 'the buyer is told — recognition IS the Phase-A feature').toMatch(/sendNotification\(\s*buyer_user_id,\s*'vip_added'/)
    const limits = rd('lib/vendor-limits.ts')
    expect(limits).toMatch(/vipCustomers: 0/)
    expect(limits).toMatch(/vipCustomers: 10/)
    expect(limits).toMatch(/vipCustomers: 25/)
  })

  it('VIP state reaches every vendor recognition surface', () => {
    // Report rows (the management surface), the orders API, and the order
    // card the vendor looks at while handing food over.
    expect(rd('app/api/vendor/customers/route.ts')).toMatch(/is_vip/)
    expect(rd('app/api/vendor/orders/route.ts')).toMatch(/customer_is_vip/)
    expect(rd('components/vendor/OrderCard.tsx')).toMatch(/customer_is_vip/)
    // Buyer side: the Favorites vendor card carries the badge.
    expect(rd('app/[vertical]/favorites/page.tsx')).toMatch(/vendor_vip_customers/)
  })

  it('B1 discount plumbing: checkout stores NET as subtotal_cents — the one invariant everything else rides on', () => {
    // The design key (mig 243): unit_price_cents keeps LIST price,
    // subtotal_cents is stored POST-discount, discount_cents + offer_id are
    // the record. Every refund path recomputes buyer-paid from
    // subtotal_cents, so net-storage makes reject/resolve/expire/cascade
    // correct with ZERO edits — this guard keeps it that way.
    const checkout = rd('app/api/checkout/session/route.ts')
    expect(checkout).toMatch(/subtotal_cents: netSubtotal/)
    expect(checkout).toMatch(/unit_price_cents: listing\.price_cents/)
    expect(checkout).toMatch(/discount_cents: itemDiscount/)
    // Punch build moved the discount math into the ONE shared engine — the
    // route delegates and never inlines percentages.
    expect(checkout).toMatch(/computeCartDiscounts\(/)
    const engine = rd('lib/loyalty/offers-checkout.ts')
    expect(engine, 'VIP-only gate — the discount reads vendor_vip_customers').toMatch(/vendor_vip_customers/)
    expect(engine, 'enabled offers only').toMatch(/\.eq\('enabled', true\)/)
    expect(engine, 'the shared math, never inline percentages').toMatch(/computeSpendThresholdDiscount\(/)
    expect(engine).toMatch(/computePunchRewardDiscount\(/)
    expect(engine).toMatch(/allocateDiscount\(/)
    // The refund paths stay discount-free BY DESIGN — a discount reference
    // appearing in one means someone broke the net-storage contract.
    for (const file of [
      'app/api/vendor/orders/[id]/reject/route.ts',
      'app/api/vendor/orders/[id]/resolve-issue/route.ts',
      'lib/markets/cancel-date-cascade.ts',
    ]) {
      expect(/discount_cents|offer_id/.test(rd(file)),
        `${file} must not reference discounts — net subtotal_cents already carries them`).toBe(false)
    }
  })

  it('punch card: one engine, one punch definition, previewed exactly as charged', () => {
    // Display-price pair: the checkout page's "VIP deal" line and the Stripe
    // charge must come from the SAME function or they drift apart — the page
    // mirrors via /api/checkout/discount-preview, which calls the engine.
    expect(rd('app/api/checkout/discount-preview/route.ts')).toMatch(/computeCartDiscounts\(/)
    expect(rd('app/[vertical]/checkout/page.tsx'), 'the page mirrors via the preview endpoint')
      .toMatch(/\/api\/checkout\/discount-preview/)
    // One punch-state definition: the reward-ready notifier and the Favorites
    // progress line derive punches from the same function checkout redeems
    // against. Two definitions = "you earned it" pings that checkout ignores.
    expect(rd('lib/loyalty/evaluate.ts')).toMatch(/import \{ punchState \} from '\.\/offers-checkout'/)
    expect(rd('app/[vertical]/favorites/page.tsx')).toMatch(/punchState\(/)
    // No stacking (owner D6): the engine picks the single best perk per vendor.
    expect(rd('lib/loyalty/offers-checkout.ts')).toMatch(/NO STACKING/)
    // Config can only be saved in-bounds — the vendor API validates through
    // the same parsers checkout trusts (defense in depth).
    const offersApi = rd('app/api/vendor/offers/route.ts')
    expect(offersApi).toMatch(/parsePunchCard\(/)
    expect(offersApi).toMatch(/parseSpendThreshold\(/)
  })

  it('the followed-vendor digest CONSOLIDATES (A3): one send per buyer, wired into the hourly cron', () => {
    // Owner rule 2026-09-04: "we don't want a user get 5 updates from 5
    // trucks." The module must have exactly ONE send call, and it fires per
    // BUYER group — a per-vendor send loop is the defect this pins against.
    const digest = rd('lib/notifications/vendor-digest.ts')
    const sendCalls = digest.match(/sendNotification\(/g) ?? []
    expect(sendCalls, 'exactly one send site — consolidation by construction').toHaveLength(1)
    expect(digest, 'audience = followers ∪ VIPs').toMatch(/vendor_favorites/)
    expect(digest).toMatch(/vendor_vip_customers/)
    expect(digest, 'content gate — zero new items, zero send').toMatch(/\.eq\('status', 'published'\)/)
    expect(digest, 'once-per-day dedup via the notifications table').toMatch(/\.eq\('type', 'followed_vendor_digest'\)/)
    // Rides the existing hourly cron — no new deployment config.
    const cron = rd('app/api/cron/surveys/route.ts')
    expect(cron).toMatch(/runFollowedVendorDigest\(/)
    const vercel = fs.readFileSync(path.resolve(SRC_DIR, '../vercel.json'), 'utf-8')
    expect(/vendor-digest/.test(vercel), 'the digest must NOT get its own cron entry').toBe(false)
  })

  it('the order card renders the segment chip from SEGMENT_LABELS (no duplicated copy)', () => {
    const card = rd('components/vendor/OrderCard.tsx')
    expect(card).toMatch(/customer_segment/)
    expect(card).toMatch(/SEGMENT_LABELS/)
  })

  it('the evaluator swallows every failure (it may run after a payout and must never delay one)', () => {
    const ev = rd('lib/loyalty/evaluate.ts')
    expect(ev).toMatch(/export async function evaluateBuyerAchievements[\s\S]*try \{[\s\S]*\} catch \{[\s\S]*return EMPTY/)
  })

  it('the fulfill route schedules evaluation through the guarded helper — never a bare after()', () => {
    // 2026-08-25: after() throws synchronously outside a request scope; a bare
    // call in the fulfill route aborted a fulfill between the status write and
    // the transfer in the money-authorization harness. The helper swallows it.
    const route = rd('app/api/vendor/orders/[id]/fulfill/route.ts')
    expect(route).toMatch(/scheduleBuyerAchievementEvaluation\(/)
    expect(/\bafter\(/.test(route), 'a bare after() in the payout route can abort a fulfill').toBe(false)
    const ev = rd('lib/loyalty/evaluate.ts')
    expect(ev).toMatch(/export function scheduleBuyerAchievementEvaluation[\s\S]*try \{\s*after\([\s\S]*\} catch \{/)
  })
})

// ── Event demand model (2026-08-26) — one estimate, four consumers ─────────
// Before this the intake suggestion, the viability scorer, wave generation
// and the backup bench each guessed demand their own way (two different
// buyer-rate tables, a "50% in one wave" placeholder, a 30/wave constant).
// These guards keep every consumer on lib/events/demand-model.ts.
describe('Event demand model integrity', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('the intake form suggests vendor_count through the shared model — no private rate table', () => {
    const form = rd('components/events/EventRequestForm.tsx')
    expect(form).toMatch(/suggestVendorCount\(/)
    expect(form).toMatch(/estimateOrders\(/)
    expect(/let buyerRate = /.test(form), 'the event-type buyer-rate switch was the old private table').toBe(false)
    expect(/estimatedOrders \* 0\.5/.test(form), '"half of all orders in one wave" was a placeholder').toBe(false)
  })

  it('the intake form runs OUR validation, not the browser\'s silent one (noValidate)', () => {
    const form = rd('components/events/EventRequestForm.tsx')
    expect(form, 'iOS Safari blocks native-invalid submits with no message — the owner\'s "button did nothing"')
      .toMatch(/<form onSubmit=\{handleSubmit\} noValidate>/)
  })

  it('the helper copy never reveals the pool size or its averages', () => {
    const form = rd('components/events/EventRequestForm.tsx')
    expect(/our \$\{vendorPoolSize\} event-approved/.test(form)).toBe(false)
    expect(/avg \$\{poolCapacityPerWave\}/.test(form)).toBe(false)
  })

  it('the viability scorer reads the shared rate table (no second BUYER_RATES literal)', () => {
    const viability = rd('lib/events/viability.ts')
    expect(viability).toMatch(/BUYER_RATES as SHARED_BUYER_RATES.*from '\.\/demand-model'/)
    expect(/company_paid: \{ low: 0\.9/.test(viability), 'a literal table here would drift from the shared one').toBe(false)
  })

  it('the intake page hands the form the pool MEDIAN capacity', () => {
    const page = rd('app/[vertical]/events/page.tsx')
    expect(page).toMatch(/median\(throughputs\)/)
    expect(/throughputs\.reduce\(\(a, b\) => a \+ b, 0\) \/ throughputs\.length/.test(page), 'mean was the old behavior').toBe(false)
  })

  it('the select route returns the selection-time capacity check and feeds the bench the shared estimate', () => {
    const route = rd('app/api/events/[token]/select/route.ts')
    expect(route).toMatch(/capacity_check: \{/)
    expect(route).toMatch(/event_max_orders_per_wave/)
    expect(route).toMatch(/estimatedOrders: demand\.orders/)
    const page = rd('app/[vertical]/events/[token]/select/page.tsx')
    expect(page).toMatch(/capacity_check/)
  })
})

// ── Event invitations are answered on the event page only (2026-08-27) ──
//
// Event matching and manager invitations write the same market_vendors row
// shape (response_status='invited', approved=false). The My Locations page's
// "Pending Market Invitations" list and its Accept button were built for the
// manager flow; for an event they bypassed menu selection, capacity caps, the
// agreement snapshot and the conflict check, marked the vendor attending (and
// sellable, mig 234) with no menu, and on FM fabricated schedule rows through
// the `approved` flip. Owner rule: one invitation, one place to answer it.
describe('Event invitations never surface as location invitations', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('the vendor markets list drops event rows from pendingInvitations', () => {
    const route = rd('app/api/vendor/markets/route.ts')
    expect(route, 'event-matching rows must not render as manager invitations')
      .toMatch(/if \(market\.market_type === 'event'\) return null/)
  })

  it('the location respond route refuses event rows', () => {
    const route = rd('app/api/vendor/markets/[id]/respond/route.ts')
    expect(route, 'the market lookup must load market_type to make the decision')
      .toMatch(/\.select\('id, name, vertical_id, manager_user_id, market_type'\)/)
    expect(route, 'event rows must be refused, not accepted with approved=true')
      .toContain("code: 'ERR_EVENT_INVITATION'")
  })
})

// ── Event ↔ location availability (R3-4, owner rule 2026-08-27) ─────────
//
// A vendor cannot do an event AND another scheduled location at the same time
// unless they have said they can cover both (profile_data.multiple_trucks).
// A non-flagged vendor who takes the event pauses the other location for the
// day (vendor_date_blackouts, mig 238) — and that pause MUST be lifted on every
// exit, or a benched/withdrawn vendor stays dark at their own park. These
// guards pin the shape: one shared check, one blackout writer, four lifts.
describe('Event ↔ location availability', () => {
  const rd = (p: string) => fs.readFileSync(path.join(SRC_DIR, p), 'utf-8')

  it('the accept route runs the SHARED availability check (no inline events-only copy)', () => {
    const respond = rd('app/api/vendor/events/[marketId]/respond/route.ts')
    expect(respond).toContain("from '@/lib/events/availability'")
    expect(respond).toMatch(/loadVendorAvailability\(serviceClient, vendorProfile\.id, marketId\)/)
    expect(/const dateConflicts = /.test(respond), 'the pre-R3-4 inline events-only check must be gone').toBe(false)
    for (const code of ['ERR_CONFLICT_CONFIRM_REQUIRED', 'ERR_CONFLICT_EVENT', 'ERR_CONFLICT_OPEN_ORDERS', 'ERR_CONFLICT_ACK_REQUIRED']) {
      expect(respond, `accept must be able to answer ${code}`).toContain(`code: '${code}'`)
    }
  })

  it('the accept route writes blackouts only AFTER the acceptance is recorded, and only for non-flagged vendors', () => {
    const respond = rd('app/api/vendor/events/[marketId]/respond/route.ts')
    const write = respond.indexOf('writeEventBlackouts(')
    const statusWrite = respond.indexOf(".update(updateData)")
    expect(write, 'blackout writer must be called').toBeGreaterThan(0)
    expect(write, 'blackouts follow the market_vendors status write').toBeGreaterThan(statusWrite)
    expect(respond).toMatch(/!availability\.multiCapable &&[\s\S]{0,80}availability\.conflicts\.length > 0/)
  })

  it('the invitation page GET runs the same check while the invitation is open', () => {
    const get = rd('app/api/vendor/events/[marketId]/route.ts')
    expect(get).toMatch(/marketVendor\.response_status === 'invited'\s*\?\s*await loadVendorAvailability/)
    expect(get).toMatch(/availability,/)
  })

  it('every event exit lifts the blackouts it caused', () => {
    // benched by the organizer · vendor withdrew · organizer cancelled · admin cancelled
    const exits: Array<[string, RegExp]> = [
      ['app/api/events/[token]/select/route.ts', /liftEventBlackouts\(serviceClient, event\.market_id, id\)/],
      ['app/api/vendor/events/[marketId]/cancel/route.ts', /liftEventBlackouts\(serviceClient, marketId, vendorProfile\.id\)/],
      ['app/api/events/[token]/cancel/route.ts', /liftEventBlackouts\(serviceClient, event\.market_id\)/],
      ['app/api/admin/events/[id]/route.ts', /liftEventBlackouts\(serviceClient, cateringReq\.market_id\)/],
    ]
    for (const [file, re] of exits) {
      expect(rd(file), `${file} must lift blackouts on exit`).toMatch(re)
    }
  })

  it('the NEWEST definer of get_available_pickup_dates honors vendor_date_blackouts for non-event markets', () => {
    const dir = path.resolve(SRC_DIR, '../../../supabase/migrations')
    const files: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.sql') && fs.readFileSync(p, 'utf-8').includes('CREATE OR REPLACE FUNCTION get_available_pickup_dates')) files.push(p)
      }
    }
    walk(dir)
    const num = (p: string) => parseInt(path.basename(p).split('_')[1]!, 10)
    const newest = files.sort((a, b) => num(a) - num(b))[files.length - 1]!
    const sql = fs.readFileSync(newest, 'utf-8').replace(/--[^\n]*/g, '')
    expect(sql, `${path.basename(newest)} must keep the blackout predicate (mig 238)`)
      .toMatch(/ls\.market_type = 'event'\s+OR NOT EXISTS \(\s+SELECT 1 FROM vendor_date_blackouts vb/)
  })

  it('event cards on My Locations carry no schedule controls (attendance is the acceptance row)', () => {
    const section = rd('components/vendor/markets/EventMarketsSection.tsx')
    expect(section).not.toContain('MarketScheduleSelector')
    expect(section).not.toContain('Set Schedule')
  })

  it('organizer selection state derives from organizer_selected_at ONLY (never from status=ready)', () => {
    // status 'ready' is set by the ACCEPTANCE threshold, before the organizer
    // picks anyone. Deriving "selected" from it made the select page open in
    // the confirmed state and made the first real confirmation notify nobody
    // (owner testing 2026-08-28).
    const route = rd('app/api/events/[token]/select/route.ts')
    expect(/status === 'ready' && (mv|r)\.is_backup !== true/.test(route), 'the ready-and-not-backup fallback must stay gone').toBe(false)
    expect(route).toMatch(/selected: mv\.organizer_selected_at != null,/)
    expect(route).toMatch(/const isFirstConfirmation = previouslySelected\.size === 0/)
  })

  it('vendor-response notifications resolve recipients through one helper (the organizer never gets the admin copy)', () => {
    // Owner finding 2026-08-28: an admin who is also the organizer landed on
    // the admin panel from "taco truck accepted" — the admin copy went to
    // every admin and the organizer copy needed organizer_user_id set.
    for (const file of ['app/api/vendor/events/[marketId]/respond/route.ts', 'app/api/vendor/events/[marketId]/cancel/route.ts']) {
      const src = rd(file)
      expect(src, `${file} must use vendorResponseRecipients`).toMatch(/vendorResponseRecipients\(serviceClient/)
      expect(/\.in\('role', \['admin', 'platform_admin'\]\)/.test(src), `${file} must not query admins on its own`).toBe(false)
      expect(src, `${file} admin copy iterates recipients.adminUserIds`).toMatch(/for \(const adminUserId of recipients\.adminUserIds\)/)
    }
    const helper = rd('lib/events/organizer-recipient.ts')
    expect(helper, 'admins minus the organizer').toMatch(/filter\(id => id && id !== organizerUserId\)/)
    const intake = rd('app/api/event-requests/route.ts')
    expect(intake, 'intake stamps organizer_user_id for a signed-in submitter with the same email').toMatch(/organizer_user_id: organizerUserId,/)
  })

  it('the separate pickup line is acknowledged before a new vendor can submit, reminded to established ones, and the signs page exists', () => {
    // Owner 2026-08-28: in-app buyers skip the walk-up line; vendors must run
    // a separate, signed pickup line or buyers order less.
    const status = rd('app/api/vendor/onboarding/status/route.ts')
    expect(status).toMatch(/pickupLineAcknowledged &&\s*\n\s*allDocsSubmitted/)
    expect(status, 'must NOT gate publishing for established vendors').not.toMatch(/canPublishListings =[\s\S]{0,200}pickupLineAcknowledged/)
    const ack = rd('app/api/vendor/onboarding/acknowledge-pickup-line/route.ts')
    expect(ack).toContain('pickup_line_acknowledged_at: now')
    const dash = rd('app/[vertical]/vendor/dashboard/page.tsx')
    expect(dash).toContain('<PickupLineAcknowledgment vertical={vertical} variant="compact" />')
    // Owner 2026-08-30: the signs entry moved from its own dashboard tile into
    // the Marketing & Promotions card (PromoteCard).
    const promote = rd('app/[vertical]/vendor/dashboard/PromoteCard.tsx')
    expect(promote).toContain('/vendor/pickup-signs')
    expect(promote).toContain('Marketing & Promotions')
    const checklist = rd('components/vendor/OnboardingChecklist.tsx')
    expect(checklist).toContain('status.pickupLineAcknowledged === false')
    expect(fs.existsSync(path.join(SRC_DIR, 'app/[vertical]/vendor/pickup-signs/page.tsx'))).toBe(true)
  })

  it('client-bundled libs never import @/lib/errors (breadcrumbs → async_hooks does not exist in the browser)', () => {
    // 2026-08-29: the staging push failed `npm run build` because the
    // observed() codemod gave lib/vendor-limits.ts an `@/lib/errors` import,
    // and that module is bundled into client pages. Any lib module that a
    // 'use client' file imports at runtime (not `import type`) must stay free
    // of the errors index; wrap its queries only if the import chain is
    // server-only, or log another way.
    const clientFiles: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p) }
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
          const head = fs.readFileSync(p, 'utf-8').slice(0, 200)
          if (/^\s*['"]use client['"]/.test(head)) clientFiles.push(p)
        }
      }
    }
    walk(path.join(SRC_DIR, 'app')); walk(path.join(SRC_DIR, 'components'))
    const offenders = new Set<string>()
    for (const f of clientFiles) {
      const src = fs.readFileSync(f, 'utf-8')
      for (const m of src.matchAll(/^import (?!type )[^'"]*from '@\/lib\/([^']+)'/gm)) {
        const spec = m[1]!
        // The index re-exports breadcrumbs (async_hooks). Client-safe
        // submodules (error-catalog, types) are fine to import directly.
        if (spec === 'errors' || spec === 'errors/index' || spec === 'errors/breadcrumbs' || spec === 'errors/logger') { offenders.add(`${path.relative(SRC_DIR, f)} imports @/lib/${spec} directly`); continue }
        const candidates = [path.join(SRC_DIR, 'lib', `${spec}.ts`), path.join(SRC_DIR, 'lib', spec, 'index.ts')]
        const target = candidates.find(c => fs.existsSync(c))
        if (!target) continue
        if (/from '@\/lib\/errors'/.test(fs.readFileSync(target, 'utf-8'))) offenders.add(`${path.relative(SRC_DIR, target)} (imported by ${path.relative(SRC_DIR, f)})`)
      }
    }
    expect([...offenders], 'these would pull async_hooks into a client bundle and break `npm run build`').toEqual([])
  })

  it('the multi-truck / multi-location flag is offered in BOTH verticals under one key', () => {
    const form = rd('app/[vertical]/vendor/edit/EditProfileForm.tsx')
    expect(form).toContain('I can staff more than one location at the same time')
    expect(form).toContain('multiple_trucks: multipleTrucks')
    expect(/\{vertical === 'food_trucks' && \(\s*<div style=\{\{\s*marginBottom: 12,/.test(form), 'the checkbox must no longer be FT-only').toBe(false)
  })
})

describe('Event invitation gate (mig 239) — the rule holds everywhere it can be broken', () => {
  const SRC = path.resolve(__dirname, '../..')
  const rd = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf-8')
  const code = (p: string) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('the organizer details editor can read back every field it is allowed to write', () => {
    // 2026-08-29: the editor's PATCH whitelist accepted has_run_before and the
    // mig 231/232 Logistics fields, but the GET never selected them — every
    // save "took" and then vanished on refresh. The whitelist is the source of
    // truth; GET must cover it, or every future field added there silently
    // disappears the same way.
    const src = code('app/api/events/[token]/details/route.ts')
    const allowed = src.match(/const ALLOWED_FIELDS = \[([\s\S]*?)\n\]/)
    expect(allowed, 'ALLOWED_FIELDS literal').toBeTruthy()
    const fields = [...allowed![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(fields.length).toBeGreaterThan(20)
    const get = src.match(/export async function GET[\s\S]*?\.select\(`([\s\S]*?)`\)/)
    expect(get, 'GET select literal').toBeTruthy()
    const selected = new Set(get![1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))
    const missing = fields.filter((f) => !selected.has(f))
    expect(missing, 'writable but never read back').toEqual([])
  })

  it('every path that can invite vendors honors the hold', () => {
    // Owner decision 2026-08-29: self-service invitations go out only when the
    // organizer clicks Send. Any caller of the engine that is not the intake
    // dry run must check invitationsHeld first — a new cron phase or admin
    // button that forgets this re-opens "trucks decide on a blank".
    const callers = [
      'app/api/admin/events/[id]/rematch/route.ts',
      'app/api/admin/events/[id]/route.ts',
      'app/api/cron/expire-orders/route.ts',
      'app/api/events/[token]/refresh-matches/route.ts',
      'app/api/events/[token]/release-invitations/route.ts',
    ]
    for (const file of callers) {
      const src = code(file)
      expect(src, `${file} calls the engine`).toMatch(/autoMatchAndInvite\(/)
      expect(src, `${file} must check invitationsHeld( before inviting`).toMatch(/invitationsHeld\(/)
    }
    const intake = code('app/api/event-requests/route.ts')
    expect(intake, 'intake only ever dry-runs the engine').toMatch(/autoMatchAndInvite\([^)]*\{ dryRun: true \}\)/)
    expect(intake, 'intake must not stamp auto_invite_sent_at (the release route does)').not.toMatch(/auto_invite_sent_at:/)
    // No caller outside this list — a new one must be added here AND honor the hold.
    const all = new Set<string>()
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p) }
        else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.') && fs.readFileSync(p, 'utf-8').includes('autoMatchAndInvite(')) all.add(path.relative(SRC, p).split(path.sep).join('/'))
      }
    }
    walk(SRC)
    expect([...all].sort()).toEqual([...callers, 'app/api/event-requests/route.ts', 'lib/events/event-actions.ts'].sort())
  })

  it('three-state gate questions come from one list the editor renders as Yes / No', () => {
    // A "Yes" checkbox cannot say No, and an unanswered checkbox saves null —
    // the gate then asks forever. The gate module owns the list; the editor
    // imports it, so the two cannot drift.
    const gate = code('lib/events/invitation-gate.ts')
    expect(gate).toMatch(/export const GATE_TRISTATE_FIELDS = \[\s*'has_run_before',\s*'background_check_required',?\s*\]/)
    const editor = code('components/events/OrganizerEventDetails.tsx')
    expect(editor).toMatch(/import \{[^}]*GATE_TRISTATE_FIELDS[^}]*\} from '@\/lib\/events\/invitation-gate'/)
    expect(editor, 'tri-state control keyed on the shared list').toMatch(/GATE_TRISTATE_FIELDS\.includes\(field/)
    // The plain "Yes" checkbox list must not carry a tri-state question.
    const checkboxList = editor.match(/if \(\[([^\]]*)\]\.includes\(field\)\) \{[\s\S]{0,400}type="checkbox"/)
    expect(checkboxList, 'the Yes-checkbox list still exists for real booleans').toBeTruthy()
    for (const f of ['has_run_before', 'background_check_required']) {
      expect(checkboxList![1], `${f} must not be in the Yes-checkbox list`).not.toContain(`'${f}'`)
    }
  })
})

describe('Admin shell nav completeness (phase 1, owner 2026-08-30)', () => {
  // The defect this phase fixed: three nav systems, none complete — several
  // admin pages were reachable only by typing the URL. The shell renders
  // lib/admin/nav.ts; this test holds that definition to the filesystem, so a
  // new admin page cannot silently fall out of navigation. A deliberate
  // drill-in belongs in NAV_EXEMPT_PAGES — a visible decision, not an accident.
  const SRC = path.resolve(__dirname, '../..')

  function pagesUnder(dir: string, urlBase: string): string[] {
    const out: string[] = []
    const walk = (d: string, url: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name), url + '/' + e.name)
        else if (e.name === 'page.tsx') out.push(url)
      }
    }
    walk(dir, urlBase)
    return out
  }

  it('every top-level admin page appears in the nav or the exempt list', async () => {
    const { VERTICAL_ADMIN_NAV, PLATFORM_ADMIN_NAV, NAV_EXEMPT_PAGES } = await import('../admin/nav')
    const navPaths = new Set<string>()
    for (const g of PLATFORM_ADMIN_NAV) for (const l of g.links) navPaths.add('/admin' + l.path)
    for (const g of VERTICAL_ADMIN_NAV) for (const l of g.links) navPaths.add('/[vertical]/admin' + l.path)
    const exempt = new Set(NAV_EXEMPT_PAGES)

    const pages = [
      ...pagesUnder(path.join(SRC, 'app/admin'), '/admin'),
      ...pagesUnder(path.join(SRC, 'app/[vertical]/admin'), '/[vertical]/admin'),
    ]
    const missing = pages.filter(p => !navPaths.has(p) && !exempt.has(p))
    expect(missing, 'admin page(s) unreachable from the shell nav — add to lib/admin/nav.ts, or to NAV_EXEMPT_PAGES with a reason').toEqual([])

    // The reverse: nav links must point at real pages.
    const pageSet = new Set(pages)
    const dead = [...navPaths].filter(p => !pageSet.has(p))
    expect(dead, 'nav link(s) with no page behind them').toEqual([])
  })

  it('both admin layouts render the shared shell (no page-level nav remains)', () => {
    const platform = fs.readFileSync(path.join(SRC, 'app/admin/layout.tsx'), 'utf-8')
    const vertical = fs.readFileSync(path.join(SRC, 'app/[vertical]/admin/layout.tsx'), 'utf-8')
    expect(platform).toContain('<AdminShell')
    expect(vertical).toContain('<AdminShell')
    // The retired per-page pill nav must not creep back.
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.tsx$/.test(e.name) && fs.readFileSync(p, 'utf-8').includes('<AdminNav')) out.push(p)
      }
      return out
    }
    expect(walk(path.join(SRC, 'app'))).toEqual([])
  })
})

// ── Vendor event stage — one classifier, no drift (owner 2026-09-03) ────
//
// The locations-page pill said "Attending" for a merely-ACCEPTED truck the
// organizer might never select, because the pill and the Vendor Event Page
// header each derived the stage independently. The ladder now lives in
// lib/events/vendor-stage.ts and both surfaces consume it. A vendor planning
// their week trusts the pill; accepted ≠ selected ≠ benched.
describe('Vendor event stage — shared classifier', () => {
  const SRC = path.resolve(__dirname, '../..')
  const rd = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf-8')

  it('every stage-displaying surface imports the shared classifier', () => {
    for (const file of [
      'app/[vertical]/vendor/events/[marketId]/page.tsx',
      'components/vendor/markets/EventMarketsSection.tsx',
      // P3 (owner 2026-09-03): the organizer's per-truck roster speaks the
      // same vocabulary as the vendor-facing surfaces.
      'app/[vertical]/event-manager/[id]/dashboard/page.tsx',
      // P2 (owner 2026-09-03): the admin invitations table's stage chips.
      'app/[vertical]/admin/events/page.tsx',
    ]) {
      expect(rd(file), `${file} must derive the stage from vendor-stage.ts`)
        .toMatch(/import \{[^}]*classifyVendorEventStage[^}]*\} from '@\/lib\/events\/vendor-stage'/)
    }
  })

  it('the pill no longer maps bare acceptance to "Attending"', () => {
    const section = rd('components/vendor/markets/EventMarketsSection.tsx')
    expect(/status === 'accepted'[^\n]*\?\s*'Attending'/.test(section),
      'the pre-2026-09-03 accepted→Attending shortcut must stay gone').toBe(false)
  })

  it('the classifier orders the ladder correctly (bench outranks selection; accepted alone is not attending)', async () => {
    const { classifyVendorEventStage } = await import('../events/vendor-stage')
    // The selection round leaves non-selected vendors 'accepted' with
    // is_backup=true AND may stamp organizer_selected_at on a later step-in —
    // bench must win while the flag is set.
    expect(classifyVendorEventStage({ response_status: 'accepted', is_backup: true, organizer_selected_at: '2026-09-01' })).toBe('bench')
    expect(classifyVendorEventStage({ response_status: 'accepted', is_backup: false, organizer_selected_at: '2026-09-01' })).toBe('selected')
    expect(classifyVendorEventStage({ response_status: 'accepted', is_backup: false, organizer_selected_at: null })).toBe('accepted_awaiting')
    expect(classifyVendorEventStage({ response_status: 'invited' })).toBe('invited')
    expect(classifyVendorEventStage({ response_status: 'declined' })).toBe('declined')
    expect(classifyVendorEventStage({ response_status: 'cancelled' })).toBe('withdrawn')
    expect(classifyVendorEventStage({ response_status: null })).toBe('none')
  })

  it('the API feeding the pill sends the selection fields', () => {
    const route = rd('app/api/vendor/markets/route.ts')
    expect(route).toMatch(/\.select\('market_id, response_status, is_backup, organizer_selected_at'\)/)
    expect(route).toMatch(/isBackup: eventResponse\?\.isBackup \?\? false/)
    expect(route).toMatch(/organizerSelectedAt: eventResponse\?\.organizerSelectedAt \?\? null/)
  })

  it('the Vendor Event Page never says "confirmed" for mere acceptance', () => {
    // "Confirmed" is reserved for the selected(+paid) stage. The accepted
    // count renders as said-yes language (owner 2026-09-03).
    const page = rd('app/[vertical]/vendor/events/[marketId]/page.tsx')
    expect(page).not.toContain('label="Vendors confirmed"')
    expect(page).toContain('label="Vendors who said yes"')
    expect(page).not.toContain('confirmed so far)')
  })
})

// ── Host menu pare-down (P1, mig 241, owner decisions 2026-09-03) ───────
//
// event_vendor_listings.host_status is the DISPLAY half; the listing_markets
// link is the SELL half (the cart validates there). A pare must act on both,
// every menu-displaying reader must exclude declined rows, and the admin
// event-restore must rebuild links from APPROVED rows only — one forgotten
// reader is a pared item that still sells or still shows.
describe('Host menu pare-down — the pair holds everywhere', () => {
  const SRC = path.resolve(__dirname, '../..')
  const rd = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf-8')

  it('every event-menu reader excludes host-declined rows', () => {
    for (const file of [
      'lib/events/shop-data.ts',                 // the attendee shop payload
      'app/[vertical]/events/[token]/page.tsx',  // the Public Event Page roster
      'lib/markets/vendors-with-listings.ts',    // the event market detail
      'app/api/admin/events/route.ts',           // the admin menu display
    ]) {
      expect(rd(file), `${file} must filter host_status='declined'`)
        .toMatch(/\.neq\('host_status', 'declined'\)/)
    }
  })

  it('the select route validates with the shared rule and applies BOTH halves of the pare', () => {
    const route = rd('app/api/events/[token]/select/route.ts')
    expect(route).toMatch(/import \{[^}]*validatePare[^}]*\} from '@\/lib\/events\/menu-pare'/)
    // first-round-only: paring refused once a selection stamp exists
    expect(route).toMatch(/if \(!isFirstConfirmation\) \{/)
    // display half + sell half, together
    expect(route).toMatch(/\.update\(\{ host_status: 'declined' \}\)/)
    expect(route).toMatch(/\.from\('listing_markets'\)\s*\.delete\(\)/)
  })

  it('admin event-restore rebuilds listing links from APPROVED rows only', () => {
    const admin = rd('app/api/admin/events/[id]/route.ts')
    const restore = admin.slice(admin.indexOf('repair what cancelling destroyed'), admin.indexOf('repair what cancelling destroyed') + 800)
    expect(restore, 'the rebuild query must exclude pared rows').toMatch(/\.neq\('host_status', 'declined'\)/)
  })

  it('the accept route writes proposals without a host_status (default approved)', () => {
    // The DB default is the contract: a new proposal is sellable until the
    // organizer says otherwise. Writing 'approved' here would be harmless;
    // writing anything else would be a policy change — pin the current shape.
    const respond = rd('app/api/vendor/events/[marketId]/respond/route.ts')
    expect(respond).not.toMatch(/host_status/)
  })
})
