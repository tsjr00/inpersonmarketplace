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
    const shopPage = path.join(APP_DIR, '[vertical]/events/[token]/shop/page.tsx')
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
