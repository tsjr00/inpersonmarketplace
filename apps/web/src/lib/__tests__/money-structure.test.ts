/**
 * Money-Structure Tests (review residue, 2026-07-13)
 *
 * Structural pattern rules distilled from the pre-re-release review
 * (FINDINGS_LEDGER.md). Each rule encodes a defect CLASS that was found
 * two or more times across independent modules — these tests catch the
 * NEXT instance the day it is written, not months later in review.
 *
 *   Rule A — guarded status flips (VOR-2, CRN-9, MBX-3, MBX-7, PRK-8)
 *   Rule B — expire the Stripe session before releasing a payment-holding
 *            row (CHK-1, CRN-2, PRK-1/2 — three independent sites)
 *   Rule C — no console.error in money files (CRN-7, MBX-4, PRK-11, CHK-17)
 *   Rule D — sourceTransaction on every vendor transfer (Session-74
 *            incident, CRN-1, CRN-8)
 *   Rule E — every NEW error code used must be cataloged (CHK-20, PRK-12)
 *
 * ALLOWLISTS are the escape hatch, and adding an entry is a deliberate,
 * reviewed act — every entry carries a reason (or an open ledger finding
 * ID). Entries that stop matching real code FAIL the suite so the lists
 * cannot rot. Do NOT weaken a rule to make a new violation pass; either
 * fix the code or add a reasoned allowlist entry.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC_DIR = path.resolve(__dirname, '../..')

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      walkTsFiles(p, out)
    } else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) {
      out.push(p)
    }
  }
  return out
}

const ALL_FILES = walkTsFiles(SRC_DIR)
const rel = (f: string) => path.relative(SRC_DIR, f).replace(/\\/g, '/')
const read = (f: string) => fs.readFileSync(f, 'utf8')

/** The supabase query chain starting at a `.from('<table>')` occurrence. */
function chunkAt(code: string, idx: number): string {
  const lines = code.slice(idx, idx + 1200).split('\n')
  const out = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (
      t.startsWith('.') || t.startsWith('//') || t.startsWith('}') ||
      /^[a-z_]+\s*:/.test(t) || t === ''
    ) out.push(lines[i])
    else break
  }
  return out.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════
// Rule A — guarded status flips on money tables
// A `.update({ status: ... })` on these tables must carry a status
// precondition (.eq/.in/.neq('status') or .is('cancelled_at')) in the same
// chain. vendor_payouts updates keyed to a specific row (.eq('id'|
// 'stripe_transfer_id') / .in('id')) are exempt — the broad-key updates
// were the MBX-3/MBX-7 corruption bugs.
// ═══════════════════════════════════════════════════════════════════════

const FLIP_TABLES = ['orders', 'order_items', 'park_spot_bookings', 'vendor_payouts', 'park_standing_reservations']

interface FlipAllow { file: string; table: string; status: string; count: number; reason: string }

const FLIP_ALLOWLIST: FlipAllow[] = [
  // ── orders → 'paid' (CHK-1 remainder — OPEN; remove these two when the
  //    3-way paid-flip guard ships in webhooks + checkout/success) ──
  // 2026-07-18 CHK-1 CLOSED: both paid-flips (webhooks handleCheckoutComplete
  // + checkout/success) now carry the .eq('status','pending') guard with the
  // 3-way branch (pending→flip / paid→backfill / cancelled→auto-refund) —
  // entries removed per the rot-check instruction.
  // ── orders → 'cancelled' after an all-items-cancelled check (the flip is
  //    post-condition-checked; a paid order whose items all expired/refunded
  //    is correctly closed) ──
  { file: 'app/api/buyer/orders/[id]/cancel/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'all-items-cancelled pattern (remaining-items checked first)' },
  { file: 'app/api/vendor/orders/[id]/reject/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'all-items-cancelled pattern' },
  { file: 'app/api/vendor/orders/[id]/resolve-issue/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'all-items-cancelled pattern' },
  { file: 'app/api/vendor/orders/[id]/cancel-nonpayment/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'external-payment non-payment cancel (vendor-attested)' },
  // 2026-07-18 CRN-5 batch: Phase 3's flip gained the .eq('status','pending')
  // guard (Phase 2 already had it) — count 2→1 per the rot-check instruction.
  { file: 'app/api/cron/expire-orders/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'Phase 1 all-items-cancelled (items individually guarded)' },
  // 2026-07-18 CHK-7 batch: checkout/session cleanup + failed-decrement unwind
  // orders flips are now BOTH guarded (.eq status pending) — allowlist entry
  // removed per Rule A rot-check instruction (shrink direction).
  // ── orders authoritative cancels/flips ──
  { file: 'app/api/admin/events/[id]/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'admin event cancel — authoritative' },
  { file: 'app/api/events/[token]/cancel/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'organizer event cancel — authoritative' },
  { file: 'app/api/vendor/events/[marketId]/cancel/route.ts', table: 'orders', status: 'cancelled', count: 1, reason: 'EVT-5 vendor commitment-cancel — all-vendor-items-cancelled pattern (live-items checked first; .not terminal-status filter)' },
  // cancel-date-cascade orders flip: entry REMOVED 2026-07-16 — MGR-3 guarded it
  // (.in pending/paid + VOR-19 session-expire), so it's now ENFORCED, not allowlisted.
  { file: 'app/api/vendor/orders/[id]/confirm-external-payment/route.ts', table: 'orders', status: 'paid', count: 1, reason: 'external-payment flow (EXTERNAL_PAYMENTS_ENABLED=false, dormant); vendor attests payment received' },
  { file: 'lib/stripe/webhooks.ts', table: 'orders', status: 'refunded', count: 1, reason: 'charge.refunded — Stripe is authoritative' },
  // ── order_items post-refund bookkeeping (the row was cancelled by this
  //    same path moments earlier; Stripe refund succeeded in between) ──
  { file: 'app/api/buyer/orders/[id]/cancel/route.ts', table: 'order_items', status: 'refunded', count: 1, reason: 'post-refund bookkeeping on a row this path just cancelled' },
  { file: 'app/api/vendor/orders/[id]/reject/route.ts', table: 'order_items', status: 'refunded', count: 1, reason: 'post-refund bookkeeping on a row this path just cancelled' },
  { file: 'app/api/vendor/orders/[id]/resolve-issue/route.ts', table: 'order_items', status: 'refunded', count: 1, reason: 'post-refund bookkeeping on a row this path just cancelled' },
  { file: 'lib/markets/cancel-date-cascade.ts', table: 'order_items', status: 'refunded', count: 1, reason: 'manager cascade — rows selected by explicit id list' },
  // ── order_items fetch-checked flips (status verified on fetch; TOCTOU
  //    accepted because the flip itself moves no money — payout paths have
  //    their own gates) ──
  { file: 'app/api/vendor/orders/[id]/confirm/route.ts', table: 'order_items', status: 'confirmed', count: 1, reason: 'fetch-checked pending→confirmed; non-money flip' },
  { file: 'app/api/vendor/orders/[id]/ready/route.ts', table: 'order_items', status: 'ready', count: 1, reason: 'fetch-checked (F4) pending/confirmed→ready; non-money flip' },
  { file: 'app/api/vendor/orders/[id]/confirm-handoff/route.ts', table: 'order_items', status: 'fulfilled', count: 1, reason: 'VOR-7 OPEN — dormant route (not UI-reachable); 410-stub or port pending' },
]

describe('Money structure — Rule A: guarded status flips', () => {
  const violations: Array<{ file: string; table: string; status: string }> = []

  for (const f of ALL_FILES) {
    const code = read(f)
    for (const table of FLIP_TABLES) {
      const needle = `.from('${table}')`
      let idx = 0
      while ((idx = code.indexOf(needle, idx)) !== -1) {
        const chunk = chunkAt(code, idx)
        idx += needle.length
        if (!/\.update\(\s*\{[\s\S]*?\bstatus\s*:/.test(chunk)) continue
        const statusGuarded =
          /\.eq\('status'/.test(chunk) || /\.in\('status'/.test(chunk) ||
          /\.neq\('status'/.test(chunk) || /\.is\('cancelled_at'/.test(chunk)
        // vendor_payouts row-keyed updates are exempt (see rule header)
        const rowKeyed = table === 'vendor_payouts' &&
          (/\.eq\('id'/.test(chunk) || /\.eq\('stripe_transfer_id'/.test(chunk) || /\.in\('id'/.test(chunk))
        if (statusGuarded || rowKeyed) continue
        const statusMatch = chunk.match(/\bstatus\s*:\s*'([a-z_]+)'/)
        violations.push({ file: rel(f), table, status: statusMatch?.[1] ?? '?' })
      }
    }
  }

  it('every unguarded status flip is a reasoned allowlist entry', () => {
    const remaining = [...violations]
    const unmatched: string[] = []
    for (const v of remaining) {
      const entry = FLIP_ALLOWLIST.find(a => a.file === v.file && a.table === v.table && a.status === v.status)
      if (!entry) unmatched.push(`${v.file} [${v.table}] status:'${v.status}'`)
    }
    expect(unmatched, `Unguarded status flip(s) on money tables — add a status precondition (.eq/.in('status') or .is('cancelled_at')) or a reasoned allowlist entry:\n${unmatched.join('\n')}`).toEqual([])
  })

  it('allowlist entries all match real code (no rot)', () => {
    for (const a of FLIP_ALLOWLIST) {
      const hits = violations.filter(v => v.file === a.file && v.table === a.table && v.status === a.status).length
      expect(hits, `Stale/miscounted allowlist entry (expected ${a.count}, found ${hits}): ${a.file} [${a.table}] '${a.status}' — ${a.reason}`).toBe(a.count)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Rule B — expire the Stripe session before releasing a payment-holding row
// Found at three independent sites (CHK-1 checkout cleanup, CRN-2 cron
// Phase 2, PRK-1/2 park sweep). Files that cancel/expire rows holding a
// live checkout session must call sessions.expire first.
// ═══════════════════════════════════════════════════════════════════════

describe('Money structure — Rule B: session-expire before release', () => {
  const ENFORCED = [
    'app/api/checkout/session/route.ts',           // CHK-1 root fix + CHK-18
    'app/api/cron/expire-orders/route.ts',         // CRN-2
    'lib/markets/park-standing.ts',                // PRK-1/PRK-2
    'app/api/buyer/orders/[id]/cancel/route.ts',   // VOR-19 (fixed 2026-07-14)
    'app/api/vendor/orders/[id]/reject/route.ts',  // VOR-19 (fixed 2026-07-14)
    'app/api/events/[token]/cancel/route.ts',      // EVT-4 (fixed 2026-07-14)
    'app/api/admin/events/[id]/route.ts',          // EVT-4 (fixed 2026-07-14)
  ]
  // (2026-07-18 guardrail audit, C2: the KNOWN_GAPS inverted-tripwire list
  // emptied as the review cycle fixed every tracked gap — the scaffolding is
  // retired. Rule B is now plain enforcement: any NEW file that cancels
  // payment-holding rows gets added to ENFORCED when the pattern is built.)

  for (const f of ENFORCED) {
    it(`${f} expires the Stripe session before releasing`, () => {
      const code = read(path.join(SRC_DIR, f))
      expect(code.includes('sessions.expire'), `${f} cancels/expires payment-holding rows but no longer calls sessions.expire — the stale-tab-pays-a-dead-resource bug (CHK-1/CRN-2/PRK-1 family)`).toBe(true)
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════
// Rule C — no console.error in money files (feed error_logs instead)
// ZERO files must stay at zero. RATCHET files carry legacy sites (phase-
// level cron catches etc.) — the count may only go DOWN.
// ═══════════════════════════════════════════════════════════════════════

describe('Money structure — Rule C: money files feed error_logs, not the console', () => {
  const countErrors = (f: string) => (read(path.join(SRC_DIR, f)).match(/console\.error/g) ?? []).length

  const ZERO = [
    'lib/pricing.ts',
    'lib/stripe/payments.ts',
    'lib/stripe/market-box-payout.ts',
    'lib/markets/park-standing.ts',
    'lib/payments/vendor-fees.ts',
    'app/api/checkout/session/route.ts',
    'app/api/vendor/park-occurrences/[bookingId]/pay/route.ts',
    'app/api/vendor/markets/[id]/book-park-spot/route.ts',
  ]
  // Legacy console.error sites (non-money catches: status checks, notify
  // wrappers, phase-level cron catches). Ratchet: reduce, never grow.
  const RATCHET: Array<[string, number]> = [
    ['lib/stripe/webhooks.ts', 2],
    ['app/api/checkout/success/route.ts', 1],
    ['app/api/vendor/orders/[id]/fulfill/route.ts', 3],
    ['app/api/vendor/orders/[id]/reject/route.ts', 3],
    ['app/api/vendor/orders/[id]/resolve-issue/route.ts', 1],
    ['app/api/buyer/orders/[id]/confirm/route.ts', 2],
    ['app/api/cron/expire-orders/route.ts', 65],
  ]

  for (const f of ZERO) {
    it(`${f} has zero console.error`, () => {
      expect(countErrors(f), `${f} gained a console.error — use logError(new TracedError(...)) so the failure reaches error_logs (standing directive; CRN-7/MBX-4/PRK-11 class)`).toBe(0)
    })
  }
  for (const [f, max] of RATCHET) {
    it(`${f} console.error count ≤ ${max} (ratchet)`, () => {
      const n = countErrors(f)
      expect(n, `${f} console.error count grew (${n} > ${max}) — new failures must logError. If you REDUCED the count, lower the ratchet to ${n}.`).toBeLessThanOrEqual(max)
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════
// Rule D — sourceTransaction on every vendor transfer
// A transfer without source_transaction draws on the platform's own Stripe
// balance (Session-74 incident; CRN-1/CRN-8). Every call site must pass it;
// bare sites are tracked open findings.
// ═══════════════════════════════════════════════════════════════════════

describe('Money structure — Rule D: transfers carry sourceTransaction', () => {
  const BARE_ALLOWLIST: Array<{ file: string; count: number; findingId: string }> = [
    // VOR-17 (buyer-cancel) + VOR-18 (buyer-confirm) fixed 2026-07-14 — entries removed.
    { file: 'app/api/vendor/orders/[id]/confirm-handoff/route.ts', count: 1, findingId: 'VOR-7 (dormant route)' },
  ]

  const bare: Record<string, number> = {}
  for (const f of ALL_FILES) {
    const r = rel(f)
    if (r === 'lib/stripe/payments.ts') continue // function definitions live here
    const code = read(f)
    for (const fn of ['transferToVendor(', 'transferMarketBoxPayout(']) {
      let idx = 0
      while ((idx = code.indexOf(fn, idx)) !== -1) {
        const callWindow = code.slice(idx, idx + 400)
        if (!callWindow.includes('sourceTransaction')) bare[r] = (bare[r] ?? 0) + 1
        idx += fn.length
      }
    }
  }

  it('every bare transfer site is a tracked finding', () => {
    const unexplained = Object.entries(bare)
      .filter(([file, n]) => (BARE_ALLOWLIST.find(a => a.file === file)?.count ?? 0) !== n)
      .map(([file, n]) => `${file} (${n} bare site(s))`)
    expect(unexplained, `Vendor transfer(s) without sourceTransaction — pass the charge id (see fulfill's paid-gate pattern) or file a ledger finding + allowlist entry:\n${unexplained.join('\n')}`).toEqual([])
  })

  it('bare-transfer allowlist entries all match real code (no rot)', () => {
    for (const a of BARE_ALLOWLIST) {
      expect(bare[a.file] ?? 0, `Stale allowlist entry (${a.findingId}) — ${a.file}: expected ${a.count} bare site(s). If you added sourceTransaction, remove the entry and close the finding.`).toBe(a.count)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Rule E — every NEW error code must be cataloged (ratchet)
// logError works either way, but the error-log review needs the catalog's
// recovery guidance (CHK-20/PRK-12 class). Legacy uncataloged codes are
// baselined; new codes must ship with a catalog entry.
// ═══════════════════════════════════════════════════════════════════════

describe('Money structure — Rule E: new error codes are cataloged', () => {
  // Baseline as of 2026-07-13 — shrink this list by cataloging, never grow it.
  const KNOWN_UNCATALOGED = new Set([
    'ERR_AUTH_020', 'ERR_CANCELDATE_001', 'ERR_CANCELDATE_002', 'ERR_CANCELDATE_003',
    'ERR_CART_006', 'ERR_CART_007', 'ERR_CART_008', 'ERR_CART_009', 'ERR_CART_010',
    'ERR_CHECKIN_001', 'ERR_CHECKIN_002', 'ERR_CHECKOUT_010', 'ERR_CHECKOUT_011',
    'ERR_CHECKOUT_020', 'ERR_CONCURRENCY_001', 'ERR_CUSTOM_001', 'ERR_FEE_001',
    'ERR_INVENTORY_001', 'ERR_KB_001', 'ERR_KB_002', 'ERR_KB_003', 'ERR_LISTING_001',
    'ERR_MARKET_001', 'ERR_MARKET_002', 'ERR_MARKET_003', 'ERR_MBOX_008', 'ERR_MBOX_009',
    'ERR_MBOX_010', 'ERR_MBOX_011', 'ERR_MBOX_020', 'ERR_MBOX_021', 'ERR_MBOX_022',
    'ERR_NOTIF_001', 'ERR_PAYMENT_001', 'ERR_PAYMENT_002', 'ERR_PAYMENT_003',
    'ERR_PAYMENT_004', 'ERR_PAYMENT_005', 'ERR_QC_001', 'ERR_QC_002', 'ERR_QC_003',
    'ERR_QC_004', 'ERR_QC_005', 'ERR_RECONCILE_001', 'ERR_REFUND_001', 'ERR_STRIPE_001',
    'ERR_UNKNOWN_001', 'ERR_VALIDATE_002', 'ERR_VALIDATE_003', 'ERR_VALIDATION_001',
    'ERR_VALIDATION_002', 'ERR_VALIDATION_003', 'ERR_VALIDATION_004', 'ERR_VALIDATION_005',
    'ERR_VALIDATION_006', 'ERR_VALIDATION_007', 'ERR_VALIDATION_008', 'ERR_VALIDATION_009',
    'ERR_VENDOR_001', 'ERR_WEBHOOK_001', 'ERR_WEBHOOK_002', 'ERR_WEBHOOK_003',
    'ERR_WEBHOOK_004', 'ERR_WEBHOOK_005', 'ERR_WEBHOOK_007', 'ERR_WEBHOOK_008',
    'ERR_WEBHOOK_009', 'ERR_WEBHOOK_010',
  ])

  const catalogDir = path.join(SRC_DIR, 'lib/errors/catalog')
  const catalogCode = fs.readdirSync(catalogDir)
    .filter(n => n.endsWith('.ts'))
    .map(n => read(path.join(catalogDir, n)))
    .join('\n')
  const cataloged = new Set([...catalogCode.matchAll(/code:\s*'(ERR_[A-Z]+_\d+)'/g)].map(m => m[1]))

  const used = new Set<string>()
  for (const f of ALL_FILES) {
    for (const m of read(f).matchAll(/'(ERR_[A-Z]+_\d+)'/g)) used.add(m[1])
  }

  it('no NEW uncataloged error codes', () => {
    const newUncataloged = [...used].filter(c => !cataloged.has(c) && !KNOWN_UNCATALOGED.has(c)).sort()
    expect(newUncataloged, `New error code(s) without a catalog entry — add one to src/lib/errors/catalog/ (with recovery guidance) instead of growing the legacy baseline:\n${newUncataloged.join('\n')}`).toEqual([])
  })

  it('baseline entries that got cataloged are removed (no rot)', () => {
    const nowCataloged = [...KNOWN_UNCATALOGED].filter(c => cataloged.has(c)).sort()
    expect(nowCataloged, `These codes are now cataloged — remove them from KNOWN_UNCATALOGED:\n${nowCataloged.join('\n')}`).toEqual([])
  })
})
