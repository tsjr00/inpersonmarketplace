/**
 * Phase E — booth-credit ledger balance (pure; no I/O).
 *
 * A vendor's booth-credit balance at a market is the SUM of their booth_credits
 * rows for that (vendor_profile_id, market_id): positive = granted, negative =
 * redeemed (mig 166). This is the single reader of that invariant — Item 4
 * (credit redemption) will use it to compute appliedCredit = min(balance, …).
 *
 * Pass the rows already filtered to one (vendor, market). Off-platform
 * settlement markers are 0-amount rows, so they contribute nothing.
 */

export interface BoothCreditAmount {
  amount_cents: number
}

export function boothCreditBalance(rows: BoothCreditAmount[]): number {
  return rows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)
}
