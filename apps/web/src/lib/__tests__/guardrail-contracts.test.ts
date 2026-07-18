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
