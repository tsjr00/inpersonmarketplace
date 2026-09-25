/**
 * Quarterly rate refresh — the job that keeps `markets.tax_rate_version`
 * honest so the checkout tax engine keeps taxing (plan step 12; owner Q4
 * ruling 2026-09-24; facts from the rate-file spike in
 * apps/web/.claude/tax_build_review_research.md).
 *
 * WHY IT EXISTS
 *   compute-cart-tax.ts refuses to tax a sale at any market whose rate stamp
 *   is not the CURRENT quarter (stale rates must fail loudly, never silently).
 *   Texas local rates change only at quarter boundaries, and the Comptroller's
 *   file for a new quarter is NOT published in advance — it has landed up to
 *   22 days AFTER the quarter began. Without this job every taxable checkout
 *   would refuse from 00:00 UTC on Jan/Apr/Jul/Oct 1st until an admin re-saved
 *   every market by hand.
 *
 * WHAT IT DOES (per market that has ADMIN-VERIFIED codes; others are skipped —
 * the intake gate is the admin's, not this job's):
 *   file describes the CURRENT quarter
 *     every code present, every rate equal  → stamp the current quarter (and clear
 *                                             any carry-forward flag: the file
 *                                             confirmed the rates)
 *     a rate differs                        → apply the file's rate(s), stamp, tell
 *                                             the admins; if the market had been
 *                                             carried forward, count the taxed items
 *                                             sold in between and say so
 *     a code is missing from the file       → clear the admin-verified stamp (the
 *                                             engine then refuses at that market —
 *                                             "re-verify" on the admin list), tell
 *                                             the admins
 *   file describes a PAST quarter (new file not out yet)      ← owner Q4 (a)
 *     rates equal the old file              → CARRY FORWARD: stamp the current
 *                                             quarter, record when, remind the
 *                                             admins once a day while it lasts
 *     rates differ from the old file        → do NOT stamp; tell the admins (the
 *                                             stored rates match no known file)
 *   file describes a FUTURE quarter (published early)
 *     hold — never apply next quarter's rates before it starts
 *
 * The decision per market is PURE (`planMarketRefresh`) and spec'd; the
 * runner does the I/O around it. Nothing here touches orders or money — it
 * edits the market's rate columns that mig 214 created and the admin card
 * already writes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { currentQuarterLabel } from './compute-cart-tax'
import { parseJurisdictions, totalRatePct, type TaxJurisdiction } from './jurisdictions'
import { parseRateFile, TX_RATE_FILE_URL, type ParsedRateFile } from './rate-file'
import { sendNotification } from '@/lib/notifications/service'
import { adminRecipientsForVertical } from '@/lib/notifications/admin-recipients'
import { logError, TracedError, observed } from '@/lib/errors'

export interface RefreshMarketInput {
  id: string
  name: string | null
  vertical_id: string | null
  tax_jurisdictions: unknown
  tax_rate_version: string | null
  tax_jurisdiction_verified_at: string | null
  tax_rates_carried_forward_at: string | null
  tax_jurisdiction_note?: string | null
}

export interface RateChange {
  code: string
  name: string
  oldRatePct: number
  newRatePct: number
}

export type MarketRefreshPlan =
  | { action: 'skip'; reason: 'no_codes' | 'not_verified' }
  | { action: 'noop'; reason: 'already_current' | 'file_is_future' }
  | { action: 'stamp'; version: string; clearCarryForward: boolean }
  | { action: 'update'; version: string; changes: RateChange[]; jurisdictions: TaxJurisdiction[]; wasCarriedForward: boolean }
  | { action: 'flag_missing'; missing: string[] }
  | { action: 'carry_forward'; version: string; fileQuarter: string; alreadyCarried: boolean }
  | { action: 'carry_forward_conflict'; fileQuarter: string; changes: RateChange[] }

/** "2026-Q3" < "2026-Q4" — labels compare correctly as strings (YYYY-Qn). */
function compareQuarters(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function planMarketRefresh(
  market: RefreshMarketInput,
  file: Pick<ParsedRateFile, 'quarter' | 'rates'>,
  now: Date = new Date()
): MarketRefreshPlan {
  const stored = parseJurisdictions(market.tax_jurisdictions)
  if (stored.length === 0) return { action: 'skip', reason: 'no_codes' }
  if (!market.tax_jurisdiction_verified_at) return { action: 'skip', reason: 'not_verified' }

  const missing = stored.filter((j) => !file.rates.has(j.code)).map((j) => j.code)
  const changes: RateChange[] = stored
    .filter((j) => file.rates.has(j.code) && file.rates.get(j.code)!.rate_pct !== j.rate_pct)
    .map((j) => ({ code: j.code, name: j.name, oldRatePct: j.rate_pct, newRatePct: file.rates.get(j.code)!.rate_pct }))

  const current = currentQuarterLabel(now)
  const cmp = compareQuarters(file.quarter, current)

  if (cmp > 0) return { action: 'noop', reason: 'file_is_future' }

  if (cmp < 0) {
    // New quarter, old file (the Comptroller has not published this quarter's
    // file yet). A market an ADMIN verified this quarter — stamped current and
    // not by a carry-forward — was checked against the Rate Locator, which
    // already shows THIS quarter's rates. The old file is the less current
    // source, so it must not second-guess that work: no conflict notice about
    // rates the admin entered correctly, and no "missing code" for a
    // jurisdiction that only starts this quarter. The current-quarter file,
    // when it lands, is the real check (the branch below).
    if (market.tax_rate_version === current && !market.tax_rates_carried_forward_at) {
      return { action: 'noop', reason: 'already_current' }
    }
    // Otherwise never re-stamp against a file that lacks a code — we cannot
    // know what the state did with it.
    if (missing.length > 0) return { action: 'flag_missing', missing }
    if (changes.length > 0) return { action: 'carry_forward_conflict', fileQuarter: file.quarter, changes }
    const alreadyCarried = !!market.tax_rates_carried_forward_at && market.tax_rate_version === current
    return { action: 'carry_forward', version: current, fileQuarter: file.quarter, alreadyCarried }
  }

  // File is for the current quarter — the authoritative case.
  if (missing.length > 0) return { action: 'flag_missing', missing }
  if (changes.length > 0) {
    const jurisdictions = stored.map((j) => ({ ...j, rate_pct: file.rates.get(j.code)!.rate_pct }))
    return { action: 'update', version: current, changes, jurisdictions, wasCarriedForward: !!market.tax_rates_carried_forward_at }
  }
  if (market.tax_rate_version === current && !market.tax_rates_carried_forward_at) {
    return { action: 'noop', reason: 'already_current' }
  }
  return { action: 'stamp', version: current, clearCarryForward: !!market.tax_rates_carried_forward_at }
}

export interface RefreshSummary {
  ranAt: string
  fileQuarter: string | null
  currentQuarter: string
  fetchOk: boolean
  fetchError?: string
  conflictsInFile: number
  markets: number
  stamped: number
  updated: number
  flaggedMissing: number
  carriedForward: number
  carryForwardConflicts: number
  skipped: number
  noops: number
  adminNotices: number
}

const CHANGE_TYPE = 'tax_rates_changed_admin' as const
const REMINDER_TYPE = 'tax_rate_file_missing_admin' as const

async function alreadySent(service: SupabaseClient, type: string, dedupRef: string, sinceIso: string): Promise<boolean> {
  const { data } = await observed(service
    .from('notifications')
    .select('id')
    .eq('type', type)
    .contains('data', { dedupRef })
    .gte('created_at', sinceIso)
    .limit(1), { table: 'notifications' })
  return !!data && data.length > 0
}

async function notifyAdmins(
  service: SupabaseClient,
  vertical: string,
  type: typeof CHANGE_TYPE | typeof REMINDER_TYPE,
  data: { marketName?: string; marketId?: string; changeSummary: string; dedupRef: string }
): Promise<number> {
  // One notice per dedupRef, ever (the refs carry market + quarter, or the
  // calendar day for the reminder): a condition the job re-detects on every
  // run must not re-notify on every run.
  if (await alreadySent(service, type, data.dedupRef, '2000-01-01T00:00:00.000Z')) return 0
  const admins = await adminRecipientsForVertical(service, vertical)
  for (const adminId of admins) {
    await sendNotification(adminId, type, { ...data, vertical }, { vertical })
  }
  return admins.length
}

/**
 * The job. `fetchText` is injectable so the route can be exercised without
 * the network (and the spec can feed the fixture).
 */
export async function runTaxRateRefresh(
  service: SupabaseClient,
  opts: { now?: Date; fetchText?: () => Promise<string> } = {}
): Promise<RefreshSummary> {
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const today = nowIso.slice(0, 10)
  const summary: RefreshSummary = {
    ranAt: nowIso, fileQuarter: null, currentQuarter: currentQuarterLabel(now), fetchOk: false,
    conflictsInFile: 0, markets: 0, stamped: 0, updated: 0, flaggedMissing: 0, carriedForward: 0,
    carryForwardConflicts: 0, skipped: 0, noops: 0, adminNotices: 0,
  }

  // ── 1. Fetch + parse ──
  let file: ParsedRateFile
  try {
    const text = opts.fetchText
      ? await opts.fetchText()
      : await (async () => {
          // Never cached: a stale copy would hide a new quarter's file and
          // keep markets on carried-forward rates. Explicit, not a framework default.
          const res = await fetch(TX_RATE_FILE_URL, {
            cache: 'no-store',
            headers: { 'user-agent': 'farmersmarketing.app tax-rate-refresh' },
          })
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
          return res.text()
        })()
    file = parseRateFile(text)
    summary.fetchOk = true
    summary.fileQuarter = file.quarter
    summary.conflictsInFile = file.conflicts.length
  } catch (err) {
    summary.fetchError = err instanceof Error ? err.message : String(err)
    await logError(new TracedError('ERR_CRON_001', `tax-rate-refresh: could not fetch/parse the Comptroller rate file: ${summary.fetchError}`, {
      route: '/api/cron/tax-rate-refresh', method: 'GET',
    }))
    return summary
  }
  if (file.conflicts.length > 0) {
    // A code with two rates (or a changed state rate) is a file we do not
    // understand — apply nothing from it, say so loudly.
    await logError(new TracedError('ERR_CRON_001', `tax-rate-refresh: rate file ${file.quarter} has ${file.conflicts.length} conflicting code(s): ${file.conflicts.map((c) => `${c.code}=${c.rates.join('/')}`).join(', ')} — no market touched`, {
      route: '/api/cron/tax-rate-refresh', method: 'GET',
    }))
    return summary
  }

  // ── 2. Markets with admin-verified codes ──
  const { data: markets, error } = await observed(service
    .from('markets')
    .select('id, name, vertical_id, tax_jurisdictions, tax_rate_version, tax_jurisdiction_verified_at, tax_rates_carried_forward_at, tax_jurisdiction_note')
    .not('tax_jurisdiction_verified_at', 'is', null), { table: 'markets' })
  if (error) throw error
  const rows = (markets || []) as unknown as RefreshMarketInput[]
  summary.markets = rows.length

  const reminderVerticals = new Set<string>()

  // The job ADDS a dated line to the card's note; the admin's own text
  // (address searched, who verified) is never overwritten.
  const withNote = (m: RefreshMarketInput, line: string) =>
    [m.tax_jurisdiction_note?.trim(), `${today} (auto): ${line}`].filter(Boolean).join('\n')
  // Every market write is checked — a silent failed update would leave the
  // summary claiming work that did not happen.
  const writeMarket = async (id: string, patch: Record<string, unknown>): Promise<boolean> => {
    const { error: writeErr } = await service.from('markets').update(patch).eq('id', id)
    if (writeErr) {
      await logError(new TracedError('ERR_CRON_001', `tax-rate-refresh: update of market ${id} failed: ${writeErr.message}`, {
        route: '/api/cron/tax-rate-refresh', method: 'GET',
      }))
      return false
    }
    return true
  }

  for (const m of rows) {
    const plan = planMarketRefresh(m, file, now)
    const vertical = m.vertical_id || 'farmers_market'
    const marketName = m.name || 'a market'
    const editUrlData = { marketName, marketId: m.id }

    switch (plan.action) {
      case 'skip': summary.skipped++; break
      case 'noop': summary.noops++; break

      case 'stamp': {
        const ok = await writeMarket(m.id, {
          tax_rate_version: plan.version,
          ...(plan.clearCarryForward
            ? { tax_rates_carried_forward_at: null, tax_jurisdiction_note: withNote(m, `${file.quarter} file published; carried-forward rates confirmed unchanged`) }
            : {}),
        })
        if (ok) summary.stamped++
        break
      }

      case 'update': {
        let inBetween = 0
        if (plan.wasCarriedForward && m.tax_rates_carried_forward_at) {
          const { count } = await service
            .from('order_items')
            .select('id', { count: 'exact', head: true })
            .eq('market_id', m.id)
            .gte('created_at', m.tax_rates_carried_forward_at)
            .gt('tax_amount_cents', 0)
          inBetween = count || 0
        }
        const ok = await writeMarket(m.id, {
          tax_jurisdictions: plan.jurisdictions,
          tax_rate_total_pct: totalRatePct(plan.jurisdictions),
          tax_rate_version: plan.version,
          tax_rates_carried_forward_at: null,
          tax_jurisdiction_note: withNote(m, `rate-refresh applied ${file.quarter} rates (${plan.changes.map((c) => `${c.name} ${c.oldRatePct}%→${c.newRatePct}%`).join('; ')})${plan.wasCarriedForward ? `; ${inBetween} taxed item(s) sold on the carried-forward rates since ${m.tax_rates_carried_forward_at?.slice(0, 10)}` : ''}`),
        })
        if (!ok) break
        summary.updated++
        // Rate-correction record (owner 2026-09-25; mig 261): sales at this
        // market in this quarter made before now at the old rate are re-stated
        // on the monthly return from this row. Recorded on EVERY applied change
        // — carried-forward or not, the rule is "old-rate lines this quarter".
        const { error: corrErr } = await service.from('tax_rate_corrections').insert({
          market_id: m.id,
          quarter: plan.version,
          applied_at: nowIso,
          changes: plan.changes.map((c) => ({ code: c.code, old_rate_pct: c.oldRatePct, new_rate_pct: c.newRatePct })),
        })
        if (corrErr) {
          await logError(new TracedError('ERR_CRON_001', `tax-rate-refresh: market ${m.id} rates were updated but the rate-correction record failed to save: ${corrErr.message} — the ${plan.version} return must be corrected by hand for sales before ${nowIso}`, {
            route: '/api/cron/tax-rate-refresh', method: 'GET',
          }))
        }
        const changeText = plan.changes.map((c) => `${c.name} ${c.oldRatePct}% → ${c.newRatePct}%`).join('; ')
        const between = plan.wasCarriedForward
          ? ` ${inBetween} taxed item${inBetween === 1 ? '' : 's'} sold at this market on the carried-forward rates since ${m.tax_rates_carried_forward_at?.slice(0, 10)}; the difference is the platform's to absorb.`
          : ''
        summary.adminNotices += await notifyAdmins(service, vertical, CHANGE_TYPE, {
          ...editUrlData,
          changeSummary: `The Comptroller's ${file.quarter} file changed ${changeText}. The new rates are applied.${between}`,
          dedupRef: `rates-changed:${m.id}:${file.quarter}`,
        })
        break
      }

      case 'flag_missing': {
        const ok = await writeMarket(m.id, {
          tax_jurisdiction_verified_at: null,
          tax_jurisdiction_note: withNote(m, `rate-refresh could not find code(s) ${plan.missing.join(', ')} in the Comptroller's ${file.quarter} file — re-verify at the Rate Locator`),
        })
        if (!ok) break
        summary.flaggedMissing++
        summary.adminNotices += await notifyAdmins(service, vertical, CHANGE_TYPE, {
          ...editUrlData,
          changeSummary: `Code${plan.missing.length === 1 ? '' : 's'} ${plan.missing.join(', ')} no longer appear${plan.missing.length === 1 ? 's' : ''} in the Comptroller's ${file.quarter} file. This market is marked "re-verify" and taxable items cannot sell there until you check its codes at the Rate Locator and save the card.`,
          dedupRef: `codes-missing:${m.id}:${file.quarter}`,
        })
        break
      }

      case 'carry_forward': {
        if (!plan.alreadyCarried) {
          const ok = await writeMarket(m.id, {
            tax_rate_version: plan.version,
            tax_rates_carried_forward_at: nowIso,
            tax_jurisdiction_note: withNote(m, `${plan.fileQuarter} rates carried forward into ${plan.version} — the Comptroller's ${plan.version} file is not published yet; re-checked daily`),
          })
          if (ok) summary.carriedForward++
        } else {
          summary.noops++
        }
        reminderVerticals.add(vertical)
        break
      }

      case 'carry_forward_conflict': {
        summary.carryForwardConflicts++
        summary.adminNotices += await notifyAdmins(service, vertical, CHANGE_TYPE, {
          ...editUrlData,
          changeSummary: `It is ${summary.currentQuarter} but the Comptroller's newest file is still ${plan.fileQuarter}, and this market's saved rates differ from it (${plan.changes.map((c) => `${c.name} saved ${c.oldRatePct}%, file ${c.newRatePct}%`).join('; ')}). Nothing was changed: please check the card against the Rate Locator.`,
          dedupRef: `carry-conflict:${m.id}:${summary.currentQuarter}`,
        })
        break
      }
    }
  }

  // ── 3. Daily reminder while carrying forward (owner Q4: "a daily reminder
  //       to admin to check progress") — once per vertical per calendar day.
  for (const vertical of reminderVerticals) {
    const dedupRef = `rate-file-missing:${vertical}:${today}`
    if (await alreadySent(service, REMINDER_TYPE, dedupRef, `${today}T00:00:00.000Z`)) continue
    summary.adminNotices += await notifyAdmins(service, vertical, REMINDER_TYPE, {
      changeSummary: `It is ${summary.currentQuarter}, but the Comptroller has not published the ${summary.currentQuarter} rate file yet (newest is ${file.quarter}). Markets are running on last quarter's rates, carried forward, and the job re-checks every day this month. Nothing to do unless this keeps up past mid-month — then check comptroller.texas.gov/taxes/file-pay/edi/sales-tax-rates.php.`,
      dedupRef,
    })
  }

  return summary
}
