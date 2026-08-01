/**
 * Community Chip In — data access + pure money helpers (mig 213).
 *
 * The chip-in is collected at checkout like a tip (lands in the platform
 * balance), ledgered here, and BATCH-remitted 100% to a beneficiary org.
 * Read helpers here are used by the event checkout + admin surfaces; the
 * ledger writes are invoked by the payment webhook and the remittance cron.
 *
 * Tolerant of a pre-migration environment: every read swallows a
 * missing-table/column error and returns an empty/neutral result, so surfaces
 * render before mig 213 is applied (mirrors the mig 205/206 companion pattern).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CauseBeneficiary {
  id: string
  name: string
  remit_method: 'connect' | 'check'
  stripe_account_id: string | null
  active: boolean
}

export interface EventChipInConfig {
  enabled: boolean
  beneficiary: CauseBeneficiary | null
}

/** Active beneficiaries for admin pickers. Empty array if the table is absent. */
export async function getActiveBeneficiaries(
  service: SupabaseClient
): Promise<CauseBeneficiary[]> {
  const { data, error } = await service
    .from('cause_beneficiaries')
    .select('id, name, remit_method, stripe_account_id, active')
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) return [] // pre-migration or transient — caller treats as none
  return (data ?? []) as CauseBeneficiary[]
}

/**
 * The event-scoped Chip In config for an event market row. Returns
 * { enabled:false, beneficiary:null } when off, unset, or pre-migration.
 */
export async function getEventChipInConfig(
  service: SupabaseClient,
  marketId: string
): Promise<EventChipInConfig> {
  const { data: market, error } = await service
    .from('markets')
    .select('chipin_enabled, chipin_beneficiary_id')
    .eq('id', marketId)
    .maybeSingle()
  if (error || !market?.chipin_enabled || !market.chipin_beneficiary_id) {
    return { enabled: false, beneficiary: null }
  }
  const { data: ben } = await service
    .from('cause_beneficiaries')
    .select('id, name, remit_method, stripe_account_id, active')
    .eq('id', market.chipin_beneficiary_id as string)
    .eq('active', true)
    .maybeSingle()
  return ben
    ? { enabled: true, beneficiary: ben as CauseBeneficiary }
    : { enabled: false, beneficiary: null }
}

/**
 * The active Round-Up campaign (Feature B) covering a (vertical, market) at
 * `now`, or null. A campaign with NULL vertical_id covers all verticals; a
 * NULL/empty market_ids covers all markets in that vertical.
 */
export async function getActiveRoundUpCampaign(
  service: SupabaseClient,
  verticalId: string,
  marketId: string,
  nowIso: string
): Promise<{ id: string; beneficiary: CauseBeneficiary } | null> {
  const { data, error } = await service
    .from('cause_campaigns')
    .select('id, beneficiary_id, vertical_id, market_ids, round_up_enabled, active, starts_at, ends_at')
    .eq('active', true)
    .eq('round_up_enabled', true)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
  if (error || !data || data.length === 0) return null

  const match = data.find((c) => {
    const verticalOk = c.vertical_id == null || c.vertical_id === verticalId
    const marketsArr = (c.market_ids as string[] | null) ?? []
    const marketOk = marketsArr.length === 0 || marketsArr.includes(marketId)
    return verticalOk && marketOk
  })
  if (!match) return null

  const { data: ben } = await service
    .from('cause_beneficiaries')
    .select('id, name, remit_method, stripe_account_id, active')
    .eq('id', match.beneficiary_id as string)
    .eq('active', true)
    .maybeSingle()
  return ben ? { id: match.id as string, beneficiary: ben as CauseBeneficiary } : null
}

/**
 * Round-up amount in cents: what it takes to reach the next whole dollar.
 * Pure. A total already on a dollar boundary rounds up a full $1.00 (opt-in,
 * so the buyer always contributes something meaningful when they tap it).
 */
export function roundUpCents(orderTotalCents: number): number {
  const remainder = orderTotalCents % 100
  return remainder === 0 ? 100 : 100 - remainder
}

/**
 * Split an org's collected balance into batch remittances. Pure helper for the
 * remittance cron: only orgs at/above `minCents` are paid this run (avoids
 * $0.55 transfers). Returns the payable set; the caller performs the transfers
 * and writes the ledger 'remitted' rows.
 */
export function selectRemittableBalances(
  balances: Array<{ beneficiaryId: string; balanceCents: number }>,
  minCents: number
): Array<{ beneficiaryId: string; amountCents: number }> {
  return balances
    .filter((b) => b.balanceCents >= minCents && b.balanceCents > 0)
    .map((b) => ({ beneficiaryId: b.beneficiaryId, amountCents: b.balanceCents }))
}

/**
 * Outstanding (un-remitted) balance per beneficiary = SUM(amount_cents) over
 * the ledger. Aggregated in JS for launch-scale volume — mirrors the pre-mig-198
 * booth-credit approach; move to a SQL aggregate RPC if the ledger grows large.
 * Returns a map beneficiaryId → cents. Empty on a pre-migration env.
 */
export async function getBeneficiaryBalances(
  service: SupabaseClient
): Promise<Map<string, number>> {
  const balances = new Map<string, number>()
  const { data, error } = await service
    .from('cause_ledger')
    .select('beneficiary_id, amount_cents')
  if (error || !data) return balances
  for (const row of data) {
    const id = row.beneficiary_id as string
    balances.set(id, (balances.get(id) ?? 0) + (row.amount_cents as number))
  }
  return balances
}

/**
 * Record a MANUAL (check) remittance to a beneficiary: writes a paid
 * cause_remittances row + a matching negative 'remitted' ledger row, so the
 * org's outstanding balance drops by amountCents. Admin bookkeeping only — no
 * money moves here (the admin mailed the check). The Connect/auto path (which
 * DOES move money via stripe.transfers.create) lives in the remittance cron.
 */
export async function recordManualCheckRemittance(
  service: SupabaseClient,
  beneficiaryId: string,
  amountCents: number,
  nowIso: string,
  notes?: string
): Promise<{ ok: true; remittanceId: string } | { ok: false; error: string }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'amount must be a positive integer' }
  }
  const { data: rem, error: remErr } = await service
    .from('cause_remittances')
    .insert({
      beneficiary_id: beneficiaryId,
      amount_cents: amountCents,
      method: 'check',
      status: 'paid',
      paid_at: nowIso,
      notes: notes ?? null,
    })
    .select('id')
    .single()
  if (remErr || !rem) return { ok: false, error: remErr?.message ?? 'insert failed' }

  const { error: ledgerErr } = await service.from('cause_ledger').insert({
    beneficiary_id: beneficiaryId,
    amount_cents: -amountCents,
    type: 'remitted',
    remittance_id: rem.id,
    note: 'Manual check remittance',
  })
  if (ledgerErr) return { ok: false, error: ledgerErr.message }

  return { ok: true, remittanceId: rem.id as string }
}
