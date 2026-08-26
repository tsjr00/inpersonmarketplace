/**
 * Guardrail-Contract Tests (guardrail audit, 2026-07-18)
 *
 * Cross-SESSION protection: each rule here encodes a way one session could
 * silently undo another session's verified work — the class of damage the
 * 2026-07 pre-relaunch review spent seven days fixing. Money-structure's
 * allowlist discipline applies: never weaken a rule to make new code pass;
 * fix the code or add a reasoned entry with the user's awareness.
 *
 *   Rule F — SQL function contract markers: critical RPCs evolve by
 *            CREATE OR REPLACE (whole-body swaps). A session recreating a
 *            function from an older body drops newer invariants with NO
 *            failing test — e.g. rebuilding get_available_pickup_dates from
 *            mig 162's body would silently drop T5's paid-park intersection
 *            (mig 199) + the barred exclusion (mig 200) and buyers could
 *            again order dates trucks never booked. The NEWEST migration
 *            defining each listed function must contain its markers.
 *   Rule G — migration bookkeeping: every current-era migration file must
 *            have a SCHEMA_SNAPSHOT.md changelog row, or the next session's
 *            Schema Mechanical Gate runs on stale data.
 *   Rule H — retired-pattern regression guards: functions whose production
 *            call sites were deliberately removed must stay uncalled
 *            (resurrecting them re-opens fixed money bugs).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC_DIR = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(SRC_DIR, '../../..')
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations')
const APPLIED_DIR = path.join(MIGRATIONS_DIR, 'applied')
const SNAPSHOT = path.join(REPO_ROOT, 'supabase/SCHEMA_SNAPSHOT.md')

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8')
}

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

/** All migration files (root + applied/), basename-sorted ascending —
 *  YYYYMMDD_NNN prefixes make lexicographic order chronological. */
function allMigrationFiles(): Array<{ base: string; full: string }> {
  const files: Array<{ base: string; full: string }> = []
  for (const dir of [MIGRATIONS_DIR, APPLIED_DIR]) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      // Dated migrations only — ROLLBACK_*.sql helper scripts also contain
      // (older) function bodies and must never count as "the newest definition".
      if (name.endsWith('.sql') && /^\d{8}_/.test(name)) files.push({ base: name, full: path.join(dir, name) })
    }
  }
  return files.sort((a, b) => a.base.localeCompare(b.base))
}

// ═══════════════════════════════════════════════════════════════════════
// Rule F — SQL function contract markers
// ═══════════════════════════════════════════════════════════════════════

describe('Guardrail Rule F: newest defining migration retains each critical RPC contract', () => {
  // function → markers its CURRENT definition must contain, each tied to the
  // finding/migration that made it load-bearing. Adding a marker when a new
  // invariant ships is part of that fix's definition of done.
  const FUNCTION_CONTRACTS: Array<{ fn: string; markers: Array<{ text: string; why: string }> }> = [
    {
      fn: 'get_available_pickup_dates',
      markers: [
        { text: 'vendor_market_schedules', why: 'mig 131 — active vendor schedule required for traditional markets' },
        { text: 'market_date_overrides', why: 'mig 162 — manager-cancelled dates excluded' },
        { text: 'park_spot_bookings', why: 'mig 199 / T5 — paid FT parks sell ONLY on PAID booking dates' },
        { text: 'manager_barred_at', why: 'mig 200 / PRK-14 — barred bookings stop selling' },
      ],
    },
    {
      fn: 'claim_vendor_fee_deduction',
      markers: [
        { text: 'FOR UPDATE', why: 'mig 197 / VOR-8 — per-vendor balance lock kills the double-deduct race' },
        { text: 'order_item_id', why: 'mig 197 — replay-safe per order item (idempotent retries)' },
      ],
    },
    {
      fn: 'redeem_booth_credit',
      markers: [
        { text: 'pg_advisory_xact_lock', why: 'mig 168 — concurrent redemptions cannot double-spend a balance' },
        { text: 'related_rental_id', why: 'mig 169 — weekly-rental redemption audit ref' },
        { text: 'related_park_booking_id', why: 'mig 201 / PRK-16 — park-booking redemption audit ref' },
      ],
    },
    {
      fn: 'get_booth_credit_expiry_state',
      markers: [
        { text: "'redeemed'", why: 'mig 198 / CRN-16 — grant-row filter must exclude redemptions' },
        { text: "'expired'", why: 'mig 198 — grant-row filter must exclude prior expiry zero-outs' },
      ],
    },
    {
      fn: 'check_pickup_slot_capacity',
      markers: [
        { text: "INTERVAL '10 minutes'", why: 'mig 216 — an unpaid checkout holds its slot for 10 min only; orders are inserted BEFORE payment and the cleanup cron runs once a DAY, so counting every pending row blocked a truck’s whole lunch service over checkouts nobody completed' },
        { text: 'cancelled_at IS NULL', why: 'mig 216 — cancelled items must not consume capacity, or a slot stays full forever after a refund' },
        { text: 'pg_advisory_xact_lock', why: 'mig 216 — narrows (does NOT eliminate) the concurrent-checkout race on one slot' },
      ],
    },
    {
      fn: 'validate_pickup_slot_time',
      markers: [
        { text: 'SELECT EXISTS', why: 'mig 216 — a market may run two active windows on one weekday (lunch + dinner) with no unique constraint preventing it; the earlier LIMIT-1 lookup rejected every dinner order, and this guard fails CLOSED so the buyer was told a served time was unavailable' },
        { text: 'AT TIME ZONE', why: 'mig 216 — Vercel runs UTC; a naive now() is wrong by hours' },
      ],
    },
  ]

  const migrations = allMigrationFiles()

  for (const contract of FUNCTION_CONTRACTS) {
    it(`${contract.fn}: newest definition carries every contract marker`, () => {
      const definePattern = new RegExp(`CREATE (OR REPLACE )?FUNCTION (public\\.)?${contract.fn}\\s*\\(`)
      const defining = migrations.filter((m) => definePattern.test(read(m.full)))
      expect(defining.length, `No migration defines ${contract.fn} — renamed? Update FUNCTION_CONTRACTS.`).toBeGreaterThan(0)

      const newest = defining[defining.length - 1]
      const body = read(newest.full)
      for (const marker of contract.markers) {
        expect(
          body.includes(marker.text),
          `${newest.base} is the NEWEST definition of ${contract.fn} but is missing "${marker.text}" (${marker.why}). ` +
          `A CREATE OR REPLACE from an older body silently drops newer invariants — re-apply the missing logic ` +
          `(see the migration named in the marker) or, if the invariant was deliberately retired by the user, ` +
          `remove the marker WITH that decision recorded in decisions.md.`
        ).toBe(true)
      }
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════
// Rule F2 — display surfaces mirror the enforcement they preview
// ═══════════════════════════════════════════════════════════════════════

describe('Guardrail Rule F2: slot-availability mirrors check_pickup_slot_capacity', () => {
  // The buyer's slot picker greys out "full" times by re-implementing the RPC's
  // filters in TypeScript. When the two drift, the UI lies in one of two ways:
  // it offers a slot checkout will refuse (dead end at payment), or it hides a
  // slot checkout would accept (silent lost revenue). The abandoned-checkout
  // window is the filter most likely to be dropped, because it looks like an
  // arbitrary 10 minutes unless you know orders are inserted before payment and
  // the cleanup cron runs only once a day.
  const ROUTE = path.join(SRC_DIR, 'app/api/buyer/slot-availability/route.ts')

  it('applies the same abandoned-checkout window as the RPC, via the shared helper', () => {
    const src = read(ROUTE)

    expect(
      src.includes('isStripeCheckoutExpired'),
      'slot-availability must reuse isStripeCheckoutExpired (lib/cron/order-timing.ts) rather than ' +
      'hard-coding a duration — one definition is shared by cron Phase 2, check_pickup_slot_capacity ' +
      'and this route, so the window cannot be changed in one place and silently re-open the bug where ' +
      'an abandoned checkout greyed out a slot for ~24 hours.'
    ).toBe(true)

    expect(
      /created_at/.test(src),
      'slot-availability must select orders.created_at — without it the abandoned-checkout window ' +
      'cannot be evaluated and every pending order would hold its slot again.'
    ).toBe(true)

    for (const dead of ['cancelled', 'refunded']) {
      expect(
        src.includes(`'${dead}'`),
        `slot-availability must ignore ${dead} orders, matching check_pickup_slot_capacity — ` +
        `otherwise a slot reads "full" forever after a refund.`
      ).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Rule G — migration bookkeeping (changelog row per current-era migration)
// ═══════════════════════════════════════════════════════════════════════

describe('Guardrail Rule G: every current-era migration has a snapshot changelog row', () => {
  // Migrations numbered below this are the pre-changelog-convention legacy
  // set (applied on all envs long ago) — grandfathered, never enforce.
  const ERA_START = 184

  it('each supabase/migrations/*.sql (root) with number >= 184 appears in SCHEMA_SNAPSHOT.md', () => {
    const snapshot = read(SNAPSHOT)
    const missing: string[] = []
    for (const name of fs.readdirSync(MIGRATIONS_DIR)) {
      if (!name.endsWith('.sql')) continue
      const m = name.match(/^\d{8}_(\d{3})_/)
      if (!m || parseInt(m[1], 10) < ERA_START) continue
      const stem = name.replace(/\.sql$/, '')
      if (!snapshot.includes(stem)) missing.push(name)
    }
    expect(
      missing,
      `Migration file(s) with NO SCHEMA_SNAPSHOT.md changelog row — the next session's Schema Mechanical ` +
      `Gate will run on stale data. Add the changelog entry (verification-discipline.md Rule 3):\n${missing.join('\n')}`
    ).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Rule H — retired patterns stay retired
// ═══════════════════════════════════════════════════════════════════════

describe('Guardrail Rule H: deliberately-retired call patterns are not resurrected', () => {
  // fn → the only file allowed to contain a CALL (its own definition), plus
  // the fix that retired the production callers.
  const RETIRED: Array<{ call: string; definitionFile: string; why: string }> = [
    {
      call: 'calculateAutoDeductAmount(',
      definitionFile: 'lib/payments/vendor-fees.ts',
      why: 'VOR-8 (mig 197): payout routes use claimVendorFeeDeduction (atomic claim-first). ' +
        'Calling calculateAutoDeductAmount from a route resurrects the read-compute-deduct double-deduct race.',
    },
    {
      call: 'restoreOrderInventory(',
      definitionFile: 'lib/inventory.ts',
      why: 'CHK-7/CRN-5: order-cancel paths use cancelOrderItemsAndRestoreGuarded (cancel-first claim). ' +
        'restoreOrderInventory restores BEFORE cancelling — the double-restore/phantom-stock bug class.',
    },
  ]

  const files = walkTsFiles(SRC_DIR)

  for (const r of RETIRED) {
    it(`${r.call.slice(0, -1)} is only referenced by its own definition`, () => {
      const offenders = files
        .filter((f) => !f.replace(/\\/g, '/').endsWith(r.definitionFile))
        .filter((f) => read(f).includes(r.call))
        .map((f) => path.relative(SRC_DIR, f))
      expect(offenders, `Retired pattern called again — ${r.why}\nOffender(s):\n${offenders.join('\n')}`).toEqual([])
    })
  }
})

// ── Rule I — code names only columns/enum values that exist (2026-08-25) ────
// The owner found SIX months-old defects in the prod Supabase API log on
// 2026-08-25, none of which reached error_logs because every caller read
// `data` and dropped `error`: a `market_vendors.status` filter (column never
// existed — public vendor cards showed no markets since 2026-01-23), a
// `vendor_market_schedules.day_of_week` select in two places (the column lives
// on market_schedules — no vendor was ever surveyed), `'completed'` used as an
// order_item_status in FOUR places (PostgREST rejects the whole query on a
// phantom enum value — no buyer was ever surveyed, event settlement read $0,
// top-products 500'd since February), and mig 049 UPDATE-ing three columns
// that don't exist on vendor_activity_scan_log (the daily scan rolled back
// every day since 2026-02-22 — zero flags ever). Five sessions introduced the
// same class of bug; this rule is what stops the sixth.
describe('Guardrail Rule I: filters and function bodies name only real columns / enum values', () => {
  const ORDER_ITEM_STATUSES = ['pending', 'confirmed', 'ready', 'fulfilled', 'cancelled', 'refunded']
  const SCAN_LOG_COLUMNS = [
    'id', 'vertical_id', 'vendors_scanned', 'new_flags_created', 'flags_auto_resolved',
    'flags_by_reason', 'started_at', 'completed_at', 'duration_ms', 'status', 'error_message',
  ]
  const rel = (p: string) => path.relative(SRC_DIR, p).split(path.sep).join('/')

  /** walkTsFiles skips .tsx; the vendors-page bug lived in a .tsx server component. */
  function walkAll(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue
        walkAll(p, out)
      } else if ((e.name.endsWith('.ts') || e.name.endsWith('.tsx')) && !e.name.includes('.test.')) {
        out.push(p)
      }
    }
    return out
  }

  /** Text from a `.from('<table>')` call up to the next `.from('` (or 2500 chars). */
  function chunksAfter(text: string, table: string): string[] {
    const needle = `.from('${table}')`
    const out: string[] = []
    let idx = text.indexOf(needle)
    while (idx !== -1) {
      const next = text.indexOf(".from('", idx + needle.length)
      out.push(text.slice(idx, Math.min(next === -1 ? text.length : next, idx + 2500)))
      idx = text.indexOf(needle, idx + needle.length)
    }
    return out
  }

  it("every order_items status filter uses only real order_item_status values (no 'completed')", () => {
    const offenders: string[] = []
    for (const file of walkAll(SRC_DIR)) {
      const text = read(file)
      for (const chunk of chunksAfter(text, 'order_items')) {
        // `.not('status', 'in', …)` / `.not('status', 'eq', …)` carry the operator as a
        // string argument — skip it so it isn't mistaken for a status value.
        for (const m of chunk.matchAll(/\.(?:eq|neq|in|not)\('status',\s*(?:'(?:in|eq|neq|is)',\s*)?([^)]*)\)/g)) {
          const values = [...m[1].matchAll(/'([a-z_]+)'|"([a-z_]+)"/g)].map((v) => v[1] ?? v[2])
          for (const v of values) {
            if (!ORDER_ITEM_STATUSES.includes(v)) offenders.push(`${rel(file)}: '${v}' is not an order_item_status`)
          }
        }
      }
    }
    expect(offenders, 'a phantom enum value makes PostgREST reject the WHOLE query (22P02), not skip the value').toEqual([])
  })

  it('nothing reads day_of_week off vendor_market_schedules (it lives on market_schedules via schedule_id)', () => {
    const offenders: string[] = []
    for (const file of walkAll(SRC_DIR)) {
      for (const chunk of chunksAfter(read(file), 'vendor_market_schedules')) {
        // A filter on the column, or the column at depth 0 of the select list
        // (inside `markets!inner( … day_of_week … )` it is markets' legacy column, fine).
        if (/\.(?:eq|neq|in|order)\('day_of_week'/.test(chunk)) { offenders.push(rel(file)); continue }
        const sel = chunk.match(/\.select\(\s*[`'"]([\s\S]*?)[`'"]\s*[,)]/)
        if (sel) {
          let depth = 0
          let topLevel = ''
          for (const ch of sel[1]) {
            if (ch === '(') depth++
            else if (ch === ')') depth--
            else if (depth === 0) topLevel += ch
          }
          if (/\bday_of_week\b/.test(topLevel)) offenders.push(rel(file))
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('no code filters market_vendors on a `status` column (it has `approved` + `response_status`)', () => {
    const offenders: string[] = []
    for (const file of walkAll(SRC_DIR)) {
      for (const chunk of chunksAfter(read(file), 'market_vendors')) {
        if (/\.(?:eq|neq|in|not)\('status'/.test(chunk)) offenders.push(rel(file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('the newest migration defining scan_vendor_activity SETs only real vendor_activity_scan_log columns', () => {
    const candidates: Array<{ base: string; full: string }> = []
    for (const dir of [MIGRATIONS_DIR, APPLIED_DIR]) {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.sql')) continue
        const full = path.join(dir, name)
        if (/FUNCTION\s+(public\.)?scan_vendor_activity/.test(read(full))) candidates.push({ base: name, full })
      }
    }
    expect(candidates.length, 'scan_vendor_activity must be defined by some migration').toBeGreaterThan(0)
    const newest = candidates.sort((a, b) => (a.base < b.base ? -1 : 1))[candidates.length - 1]
    const body = read(newest.full)
    const bad: string[] = []
    for (const block of body.matchAll(/UPDATE\s+(?:public\.)?vendor_activity_scan_log\s+SET([\s\S]*?)WHERE/g)) {
      for (const line of block[1].split('\n')) {
        const m = line.match(/^\s*([a-z_]+)\s*=/)
        if (m && !SCAN_LOG_COLUMNS.includes(m[1])) bad.push(m[1])
      }
    }
    expect(bad, `${newest.base}: plpgsql does not validate column names at CREATE time — mig 049 shipped with new_flags/auto_resolved/summary and the daily scan rolled back for six months`).toEqual([])
  })
})
