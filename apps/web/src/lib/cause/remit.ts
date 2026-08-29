import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe/config'
import { getBeneficiaryBalances } from './beneficiaries'
import { observed } from '@/lib/errors'

// Don't fire tiny transfers — batch until an org is owed at least this much.
const MIN_REMIT_CENTS = 1000 // $10

export interface CauseRemitSummary {
  connectBeneficiaries: number
  attempted: number
  paidCount: number
  paidCents: number
  failed: number
}

/**
 * Batch-remit accumulated Community Chip In funds to CONNECT beneficiaries.
 * (Check-method orgs are paid manually by an admin — not here.)
 *
 * Per beneficiary, DEDUCT-FIRST for double-pay safety:
 *   1. insert a pending cause_remittances row (amount = current balance)
 *   2. insert a 'remitted' ledger row (−balance) referencing it — this DEDUCTS
 *      the balance up front, so a re-run can never re-transfer the same funds
 *   3. stripe.transfers.create(amount, destination) keyed to the remittance id
 *      (deterministic — a retry of the SAME remittance is idempotent at Stripe)
 *   4. success → mark the remittance paid; failure → mark failed AND write a
 *      compensating '+balance' reversal so those funds are retried next run
 *
 * TRADE-OFF (documented): favors NO DOUBLE-PAY over completeness. A crash
 * between (2) and (3) leaves the balance deducted with the remittance stuck
 * 'pending' and no stripe_transfer_id — the org is under-paid until manual
 * reconciliation (query: connect remittances status='pending' with null
 * stripe_transfer_id). Low volume + trusted nonprofit payees make this
 * acceptable for v1; a single atomic claim RPC (like claim_vendor_fee_deduction,
 * mig 197) would remove the window if volume grows.
 */
export async function runCauseRemitSweep(
  service: SupabaseClient,
  nowIso: string
): Promise<CauseRemitSummary> {
  const summary: CauseRemitSummary = {
    connectBeneficiaries: 0, attempted: 0, paidCount: 0, paidCents: 0, failed: 0,
  }

  const { data: beneficiaries } = await observed(service
    .from('cause_beneficiaries')
    .select('id, name, stripe_account_id')
    .eq('active', true)
    .eq('remit_method', 'connect')
    .not('stripe_account_id', 'is', null), { table: 'cause_beneficiaries' })
  if (!beneficiaries || beneficiaries.length === 0) return summary
  summary.connectBeneficiaries = beneficiaries.length

  const balances = await getBeneficiaryBalances(service)

  for (const b of beneficiaries) {
    const balance = balances.get(b.id as string) ?? 0
    if (balance < MIN_REMIT_CENTS) continue
    summary.attempted++

    // 1. pending remittance
    const { data: rem, error: remErr } = await service
      .from('cause_remittances')
      .insert({ beneficiary_id: b.id, amount_cents: balance, method: 'connect', status: 'pending' })
      .select('id')
      .single()
    if (remErr || !rem) { summary.failed++; continue }

    // 2. deduct up front (double-pay guard) — reserves these funds
    const { error: ledgerErr } = await service.from('cause_ledger').insert({
      beneficiary_id: b.id, amount_cents: -balance, type: 'remitted',
      remittance_id: rem.id, note: 'Batched Connect remittance',
    })
    if (ledgerErr) {
      await service.from('cause_remittances')
        .update({ status: 'failed', notes: `ledger deduct failed: ${ledgerErr.message}`.slice(0, 300) })
        .eq('id', rem.id)
      summary.failed++
      continue
    }

    // 3. transfer — keyed to the remittance id (deterministic; no Date.now())
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: balance,
          currency: 'usd',
          destination: b.stripe_account_id as string,
          metadata: { cause_remittance_id: rem.id as string, beneficiary_id: b.id as string },
        },
        { idempotencyKey: `cause-remit-${rem.id}` }
      )
      await service.from('cause_remittances')
        .update({ status: 'paid', stripe_transfer_id: transfer.id, paid_at: nowIso })
        .eq('id', rem.id)
      summary.paidCount++
      summary.paidCents += balance
    } catch (transferErr) {
      // 4b. restore the balance for next run + flag the remittance
      await service.from('cause_ledger').insert({
        beneficiary_id: b.id, amount_cents: balance, type: 'reversed',
        remittance_id: rem.id, note: 'Transfer failed — balance restored',
      })
      await service.from('cause_remittances')
        .update({ status: 'failed', notes: (transferErr instanceof Error ? transferErr.message : 'transfer failed').slice(0, 300) })
        .eq('id', rem.id)
      summary.failed++
    }
  }

  return summary
}
