import type { SupabaseClient } from '@supabase/supabase-js'
import { observed, logError, TracedError } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

/**
 * Booth assignment on payment (owner rulings 2026-09-19 — design
 * apps/web/.claude/booth_model_design.md BR-5 / BR-6 / BR-8).
 *
 * A pin (market_vendors.booth_number) is a SOFT HOLD. A PAID week turns the
 * booking's number into the vendor's ASSIGNMENT — written back onto their
 * standing roster row so it persists week to week without anyone doing
 * anything, and so the next booking honors it (the RPC reads the pin).
 *
 * Called by the Stripe webhook AFTER the paid flip succeeded, inside a
 * try/catch: nothing here can affect payment integrity. Idempotent — a second
 * delivery finds the pin already equal to the booking's number and does nothing.
 *
 * Cases, for the paid booking's number N and this vendor V:
 *   1. V's pin is already N                → nothing.
 *   2. Another vendor H holds a SOFT pin on N (the booking took it because the
 *      unpinned booths were gone — mig 256 fallback; owner: the pin transfers
 *      on PAYMENT): clear H's pin, set V's pin to N, tell H their booth is no
 *      longer held (booth_number_changed), and hand H's name back so the
 *      manager's paid confirmation can say the hold moved.
 *   3. H's pin on N is an ASSIGNMENT (H paid a week under N since V booked —
 *      a race the RPC excluded at booking time): move nothing; log for the
 *      manager to sort out. V keeps the week they paid for.
 *   4. Nobody else pins N (V had no pin, or a manager moved V's pending week
 *      to N before they paid): set V's pin to N. No message — V was told N on
 *      the paid confirmation, and a manager move already told them.
 *   5. V has no roster row (an off-app market, or legacy data): nothing to pin.
 *
 * Season purchases share one number across every week (mig 256), so the
 * group's first paid child stands for the whole purchase.
 */

export type PaidBoothRef = { rentalId: string } | { groupId: string }

export interface PaidBoothAssignmentResult {
  /** Business name of the vendor whose HELD number this payment took (case 2). */
  holdMovedFromName?: string
}

interface RentalRow {
  id: string
  vendor_profile_id: string
  market_id: string
  booth_number: string | null
  inventory_id: string | null
  status: string
  week_start_date: string
}

function vendorName(profileData: unknown): string {
  const pd = (profileData ?? {}) as { business_name?: string; farm_name?: string }
  return pd.business_name || pd.farm_name || 'a vendor'
}

export async function applyPaidBoothAssignment(
  service: SupabaseClient,
  ref: PaidBoothRef,
): Promise<PaidBoothAssignmentResult> {
  // The paid booking this payment covers (any child of a season — they share
  // the number).
  let q = service
    .from('weekly_booth_rentals')
    .select('id, vendor_profile_id, market_id, booth_number, inventory_id, status, week_start_date')
    .eq('status', 'paid')
    .limit(1)
  q = 'rentalId' in ref ? q.eq('id', ref.rentalId) : q.eq('group_id', ref.groupId)
  const { data: rentalRows } = await observed(q, { table: 'weekly_booth_rentals' })
  const rental = (rentalRows?.[0] as RentalRow | undefined) ?? null
  if (!rental || !rental.booth_number) return {}

  const label = rental.booth_number
  const { data: roster } = await observed(service
    .from('market_vendors')
    .select('id, booth_number, inventory_id')
    .eq('market_id', rental.market_id)
    .eq('vendor_profile_id', rental.vendor_profile_id)
    .maybeSingle(), { table: 'market_vendors' })
  if (!roster) return {}                                   // case 5
  if (roster.booth_number === label) return {}             // case 1

  // Who else holds this number?
  const { data: holder } = await observed(service
    .from('market_vendors')
    .select('id, vendor_profile_id, vendor_profiles!market_vendors_vendor_profile_id_fkey ( user_id, profile_data )')
    .eq('market_id', rental.market_id)
    .eq('booth_number', label)
    .neq('vendor_profile_id', rental.vendor_profile_id)
    .maybeSingle(), { table: 'market_vendors' })

  const { data: market } = await observed(service
    .from('markets')
    .select('name, vertical_id')
    .eq('id', rental.market_id)
    .maybeSingle(), { table: 'markets' })
  const marketName = (market?.name as string | undefined) || 'the market'
  const vertical = (market?.vertical_id as string | undefined) || 'farmers_market'

  let holdMovedFromName: string | undefined
  if (holder) {
    // Assignment = the holder has a PAID week under this number covering
    // today or later (booth_model_design.md §0).
    const weekAgo = new Date()
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6)
    const { data: holderPaid } = await observed(service
      .from('weekly_booth_rentals')
      .select('id')
      .eq('market_id', rental.market_id)
      .eq('vendor_profile_id', holder.vendor_profile_id as string)
      .eq('booth_number', label)
      .eq('status', 'paid')
      .gte('week_start_date', weekAgo.toISOString().slice(0, 10))
      .limit(1), { table: 'weekly_booth_rentals' })
    if ((holderPaid ?? []).length > 0) {
      // case 3 — never take an assigned booth; leave both pins, flag it.
      await logError(new TracedError('ERR_DB_UNKNOWN',
        `[booth-assignment] rental ${rental.id} paid under #${label} at market ${rental.market_id}, but vendor ${holder.vendor_profile_id} holds that number as an ASSIGNMENT (paid week) — pins left unchanged; manager to resolve`,
        { route: '/webhooks/stripe', method: 'POST' }))
      return {}
    }

    // case 2 — the soft pin yields. Clear the holder first so the trigger's
    // pin-vs-pin arm lets our write through.
    const { error: clearErr } = await service
      .from('market_vendors')
      .update({ booth_number: null, inventory_id: null, updated_at: new Date().toISOString() })
      .eq('id', holder.id as string)
    if (clearErr) {
      await logError(new TracedError('ERR_DB_UNKNOWN',
        `[booth-assignment] could not clear yielded pin #${label} for vendor ${holder.vendor_profile_id}: ${clearErr.message}`,
        { route: '/webhooks/stripe', method: 'POST' }))
      return {}
    }
    const vpRel = holder.vendor_profiles as unknown as { user_id: string | null; profile_data: unknown } | { user_id: string | null; profile_data: unknown }[] | null
    const vp = Array.isArray(vpRel) ? vpRel[0] : vpRel
    holdMovedFromName = vendorName(vp?.profile_data)
    if (vp?.user_id) {
      await sendNotification(vp.user_id, 'booth_number_changed', {
        marketName,
        previousBoothNumber: label,
        boothChangeReason: `It went to a vendor who paid for a week while you had no paid week and the other booths were taken.`,
      }, { vertical })
    }
  }

  // cases 2 and 4 — the paid number becomes this vendor's pin. Keep an existing
  // tier (the manager's size decision, BR-3); take the booking's tier when none.
  const { error: setErr } = await service
    .from('market_vendors')
    .update({
      booth_number: label,
      inventory_id: (roster.inventory_id as string | null) ?? rental.inventory_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roster.id as string)
  if (setErr) {
    await logError(new TracedError('ERR_DB_UNKNOWN',
      `[booth-assignment] could not write pin #${label} for vendor ${rental.vendor_profile_id} at market ${rental.market_id}: ${setErr.message}`,
      { route: '/webhooks/stripe', method: 'POST' }))
    return holdMovedFromName ? { holdMovedFromName } : {}
  }

  return holdMovedFromName ? { holdMovedFromName } : {}
}
