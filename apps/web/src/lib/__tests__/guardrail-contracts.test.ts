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

// ── Rule J — dropped Supabase errors must not come back (2026-08-29) ────────
//
// `const { data } = await supabase.from(…)…` throws the error away. Six
// months-old prod defects (Rule I above) hid behind exactly that shape and
// never reached error_logs. lib/errors/observe.ts wraps the same call, keeps
// the caller's behavior (data null on failure) and logs the failure.
//
// A codemod wrapped 706 sites on 2026-08-29. What remains is (a) the 13
// critical-path money files, which change only with per-file approval, and
// (b) a small residue the codemod could not parse. This is a RATCHET: the
// count may go down, never up. Add a site → wrap it in observed().
describe('Rule J — no new dropped-error Supabase calls', () => {
  // 129 after the first sweep (77 in critical-path files + 52 residue);
  // 58 after the owner approved the nine money files ("do all of them",
  // 2026-08-29); 18 once comment lines were excluded and the signup /
  // market-box / reconcile / notification-dedup residue was hand-wrapped.
  // What is left is `await <prebuilt query variable>` shapes and a few
  // chains with trailing comments — wrap them as you touch them.
  //
  // 23 (2026-08-29, later the same day): lib/vendor-limits.ts is bundled into
  // CLIENT pages (insights, analytics, market-boxes, upgrade, VendorTierManager),
  // and `@/lib/errors` pulls in breadcrumbs.ts → `async_hooks`, which does not
  // exist in the browser — the staging push's `npm run build` failed on it.
  // Its 5 sites are deliberately unwrapped; see the client-bundle guard in
  // flow-integrity ("client-bundled libs never import @/lib/errors").
  const BASELINE = 23

  it(`unwrapped \`const { data } = await …from/rpc(…)\` sites ≤ ${BASELINE}`, () => {
    const roots = [path.join(SRC_DIR, 'app/api'), path.join(SRC_DIR, 'lib')]
    const sites: string[] = []
    for (const root of roots) {
      for (const f of walkTsFiles(root)) {
        const lines = read(f).split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          if (/^\s*(\/\/|\*|\/\*)/.test(lines[i]!)) continue // comment lines (observe.ts documents the pattern)
          if (!/^\s*const \{ data(?:: \w+)? \} = await (?!observed\()/.test(lines[i]!)) continue
          const window = lines.slice(i, i + 10).join('\n')
          if (/\.(from|rpc)\(/.test(window)) sites.push(`${path.relative(SRC_DIR, f)}:${i + 1}`)
        }
      }
    }
    expect(
      sites.length,
      `New dropped-error site(s) — wrap them in observed(query, { table }) from '@/lib/errors'. Newest offenders:\n${sites.slice(-15).join('\n')}`
    ).toBeLessThanOrEqual(BASELINE)
  })
})

describe('Rule K — every column named in a .select() exists in SCHEMA_SNAPSHOT.md', () => {
  // 2026-08-29: `user_profiles.full_name` (a column that does not exist)
  // shipped in a select. TypeScript cannot see database columns, so the
  // query would have failed on every run and — because the caller swallows
  // errors by design — no survey email would ever have gone out, silently.
  // Same class as the 08-25 six-months-silent errors (day_of_week on the
  // wrong table, a phantom status value). This rule is the general form:
  // for every `.from('<table>')` whose snapshot has a column table, every
  // plain column in the following `.select('…')` literal must exist there.
  //
  // What is deliberately skipped, so a stale snapshot never becomes noise:
  //   · tables with no "Columns by Table" entry in the snapshot (listed by
  //     the second test so the gap is visible, not silent)
  //   · embeds (`markets!market_id ( id, name )`, `listings ( id )`), `*`,
  //     template literals with interpolation, and `alias:column` (the
  //     column part is still checked)
  // If this fails on a column you KNOW exists, the snapshot is stale: run
  // supabase/REFRESH_SCHEMA.sql — never allowlist the column here.
  // Two sources, unioned: the snapshot's "Columns by Table" (rebuilt only
  // when someone runs REFRESH_SCHEMA.sql — 35 tables and ~50 newer columns
  // were missing on 2026-08-29) and the migration DDL itself (CREATE TABLE
  // bodies + ADD/RENAME COLUMN), which is authoritative and always current.
  function knownColumns(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>()
    const add = (t: string, c: string) => { if (!map.has(t)) map.set(t, new Set()); map.get(t)!.add(c) }
    const text = read(SNAPSHOT)
    const start = text.indexOf('\n## Columns by Table')
    const end = text.indexOf('\n## ', start + 1)
    let current: string | null = null
    for (const line of text.slice(start, end === -1 ? undefined : end).split('\n')) {
      const h = line.match(/^### ([a-z_]+)\s*$/)
      if (h) { current = h[1]; add(current, '__table__'); continue }
      const col = current && line.match(/^\| ([a-z_][a-z0-9_]*) \|/)
      if (col && col[1] !== 'Column') add(current!, col[1])
    }
    for (const { full } of allMigrationFiles()) {
      const sql = read(full).replace(/--.*$/gm, '')
      for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\);/gi)) {
        add(m[1], '__table__')
        for (const raw of m[2].split('\n')) {
          const cm = raw.trim().match(/^"?([a-z_][a-z0-9_]*)"?\s+[A-Za-z]/)
          if (!cm) continue
          if (['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN', 'EXCLUDE', 'LIKE'].includes(cm[1].toUpperCase())) continue
          add(m[1], cm[1])
        }
      }
      for (const m of sql.matchAll(/ALTER TABLE(?: ONLY)?\s+(?:IF EXISTS\s+)?(?:public\.)?([a-z_]+)([\s\S]*?);/gi)) {
        for (const c of m[2].matchAll(/ADD COLUMN(?: IF NOT EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?/gi)) add(m[1], c[1])
        for (const c of m[2].matchAll(/RENAME COLUMN\s+"?[a-z_0-9]+"?\s+TO\s+"?([a-z_][a-z0-9_]*)"?/gi)) add(m[1], c[1])
      }
    }
    return map
  }
  /** Top-level tokens of a select list; embeds (name followed by `(`) are flagged. */
  function selectTokens(list: string): Array<{ token: string; embed: boolean }> {
    const out: Array<{ token: string; embed: boolean }> = []
    let depth = 0
    let cur = ''
    let embed = false
    const flush = () => { const t = cur.trim(); if (t) out.push({ token: t, embed }); cur = ''; embed = false }
    for (const ch of list) {
      if (ch === '(') { if (depth === 0) embed = true; depth++; continue }
      if (ch === ')') { depth--; continue }
      if (depth > 0) continue
      if (ch === ',') { flush(); continue }
      cur += ch
    }
    flush()
    return out
  }
  function walkK(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walkK(p, out) }
      else if ((e.name.endsWith(".ts") || e.name.endsWith(".tsx")) && !e.name.includes(".test.")) out.push(p)
    }
    return out
  }
  function chunksK(text: string, table: string): string[] {
    const needle = ".from('" + table + "')"
    const out: string[] = []
    let idx = text.indexOf(needle)
    while (idx !== -1) {
      const next = text.indexOf(".from('", idx + needle.length)
      out.push(text.slice(idx, Math.min(next === -1 ? text.length : next, idx + 2500)))
      idx = text.indexOf(needle, idx + needle.length)
    }
    return out
  }
  const columns = knownColumns()

  it('the snapshot parser sees the tables this rule relies on', () => {
    expect(columns.get('user_profiles')?.has('email')).toBe(true)
    expect(columns.get('order_items')?.has('pickup_date')).toBe(true)
    expect(columns.size).toBeGreaterThan(50)
  })

  // Doc comments quote example queries (`supabase.from('x').select(…)`) — strip
  // them so only real code is judged.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('no .select() names a column that no migration or snapshot defines', () => {
    const offenders: string[] = []
    for (const file of walkK(SRC_DIR)) {
      const text = stripComments(read(file))
      for (const [table, cols] of columns) {
        for (const chunk of chunksK(text, table)) {
          const sel = chunk.match(/\.select\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")\s*[,)]/)
          if (!sel) continue
          const list = sel[1] ?? sel[2] ?? sel[3] ?? ''
          if (list.includes('${')) continue
          for (const { token, embed } of selectTokens(list)) {
            if (embed || token === '*') continue
            const name = token.includes(':') ? token.split(':').pop()!.trim() : token
            if (!/^[a-z_][a-z0-9_]*$/.test(name)) continue
            if (!cols.has(name)) offenders.push(`${path.relative(SRC_DIR, file).split(path.sep).join('/')}: ${table}.${name}`)
          }
        }
      }
    }
    // Pre-existing phantom columns found the day this rule landed (2026-08-29).
    // Each is a query that fails on every run. Fix the code and delete the line —
    // this list may only shrink.
    // All seven day-one entries were fixed 2026-08-30 (admin reports ×5,
    // location-insights ×2). This list may only shrink — never add to it to
    // get past a failure; fix the code.
    const KNOWN_PHANTOM_COLUMNS: string[] = []
    const fresh = offenders.filter((o) => !KNOWN_PHANTOM_COLUMNS.includes(o))
    expect(fresh, 'column(s) selected that no migration or snapshot defines — fix the code (a stale snapshot is NOT the cause: migration DDL is read too)').toEqual([])
    for (const k of KNOWN_PHANTOM_COLUMNS) expect(offenders, `${k} is fixed — remove it from KNOWN_PHANTOM_COLUMNS`).toContain(k)
  })

  it('every table queried in code is defined by a migration or the snapshot (nothing is silently unchecked)', () => {
    const queried = new Set<string>()
    for (const file of walkK(SRC_DIR)) {
      for (const m of stripComments(read(file)).matchAll(/\.from\('([a-z_]+)'\)/g)) queried.add(m[1])
    }
    const uncovered = [...queried].filter((t) => !columns.has(t)).sort()
    // Visible inventory. Add here ONLY after checking the table really has no
    // column table in the snapshot (REFRESH_SCHEMA.sql fixes it properly).
    expect(uncovered).toEqual(UNCOVERED_TABLES_BASELINE)
  })
})
const UNCOVERED_TABLES_BASELINE: string[] = []

describe('Rule L — the snapshot structured tables cannot silently wander (owner rule 2026-08-30)', () => {
  // The Change Log stayed current because Rule G enforces it; the STRUCTURED
  // sections only update when someone runs REFRESH_SCHEMA.sql, and nothing
  // ever forced that — by 2026-08-29 they were 35 tables and ~50 columns
  // behind, and the schema gate was reading a reference that lied by omission.
  // The stamp in the snapshot header records the last real rebuild; this rule
  // fails when it falls behind. The ONLY correct fix is a real rebuild:
  // owner runs supabase/REFRESH_SCHEMA.sql on Dev, Claude regenerates the
  // structured sections and moves the stamp. Never move the stamp by itself.
  const STALENESS_ALLOWANCE = 5 // migrations without a CREATE TABLE before a refresh is due

  function migNumber(base: string): number {
    // Two naming eras: 20260105_152200_001_x.sql (date_TIME_number) from the
    // first days, and 20260814_228_x.sql (date_number) ever since. A 6-digit
    // second segment followed by another number is a timestamp — skip it.
    const ts = base.match(/^\d{8}_\d{6}_(\d+)_/)
    if (ts) return parseInt(ts[1], 10)
    const m = base.match(/^\d{8}_(\d+)/)
    return m ? parseInt(m[1], 10) : 0
  }

  it('the stamp exists and no CREATE TABLE migration is newer than it', () => {
    const snap = read(SNAPSHOT)
    const stamp = snap.match(/\*\*Structured tables rebuilt:\*\* (\d{4}-\d{2}-\d{2}) · current through migration (\d+)/)
    expect(stamp, 'SCHEMA_SNAPSHOT.md must carry the "Structured tables rebuilt: <date> · current through migration NNN" stamp').toBeTruthy()
    const stampMig = parseInt(stamp![2], 10)
    const offenders: string[] = []
    for (const { base, full } of allMigrationFiles()) {
      if (migNumber(base) <= stampMig) continue
      const sql = read(full).replace(/--.*$/gm, '')
      if (/CREATE TABLE/i.test(sql)) offenders.push(base)
    }
    expect(
      offenders,
      `Migration(s) newer than the snapshot stamp (through ${stampMig}) CREATE tables the structured sections don't list. ` +
      `Ask the owner to run supabase/REFRESH_SCHEMA.sql on Dev, rebuild the structured sections, and move the stamp.`
    ).toEqual([])
  })

  it(`at most ${STALENESS_ALLOWANCE} migrations may exist past the stamp`, () => {
    const snap = read(SNAPSHOT)
    const stamp = snap.match(/current through migration (\d+)/)
    expect(stamp).toBeTruthy()
    const stampMig = parseInt(stamp![1], 10)
    const newer = new Set<number>()
    for (const { base } of allMigrationFiles()) {
      const n = migNumber(base)
      if (n > stampMig) newer.add(n)
    }
    expect(
      newer.size,
      `${newer.size} migrations past the snapshot stamp (through ${stampMig}) — a refresh is due. ` +
      `Owner runs supabase/REFRESH_SCHEMA.sql on Dev; Claude rebuilds the structured sections and moves the stamp.`
    ).toBeLessThanOrEqual(STALENESS_ALLOWANCE)
  })
})
