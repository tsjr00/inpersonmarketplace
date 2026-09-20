import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'

/**
 * Booth-booking eligibility gates (owner rulings 2026-09-19 — design
 * apps/web/.claude/booth_model_design.md BR-1, BR-13, BR-4). One definition,
 * read by the one-off route, the season route and the booking page so the
 * three cannot drift.
 *
 * Order, first failure wins:
 *   1. BR-1  Manager veto, once — at a MANAGED market (markets.manager_user_id
 *            set) the vendor needs an APPROVED roster row. Pending → "your
 *            application is with the manager"; none → "apply first". Off-app
 *            markets (no manager) skip this gate — nobody could approve.
 *   2. BR-13 Declared days first — the vendor must have at least one active
 *            declaration row (vendor_market_schedules) at the market. Selling
 *            needs the declaration (mig 238/255), and the cancelled-day credit
 *            math (BR-9/10) is defined over declared days, so a paid week with
 *            no days picked must not exist.
 *   3. BR-4  Tier lock — when the vendor's pin carries a tier, the booking
 *            must use it (the manager set the size at approval; booking is the
 *            vendor's acceptance). Pin without tier → any tier.
 *
 * Pure decision + copy; no writes. Callers translate `status` to HTTP.
 */

export type BookingGateFailure = {
  ok: false
  code: 'ERR_MARKET_APPROVAL_REQUIRED' | 'ERR_DECLARE_DAYS_FIRST' | 'ERR_BOOTH_TIER_LOCKED'
  status: 400 | 403
  message: string
  /** For the page: a pending application exists (vs none). */
  pending?: boolean
}

export type BookingGatePass = {
  ok: true
  /** The vendor's pin at this market, if any (BR-5: a hold until paid). */
  pin: { booth_number: string | null; inventory_id: string | null }
  hasDeclaredDays: boolean
}

export interface BookingGateInput {
  marketId: string
  vendorProfileId: string
  market: { name?: string | null; manager_user_id?: string | null }
  /** The tier the vendor is trying to book. Omit for a page-load check. */
  inventoryId?: string
}

export async function checkBookingGates(
  service: SupabaseClient,
  input: BookingGateInput,
): Promise<BookingGateFailure | BookingGatePass> {
  const { marketId, vendorProfileId, market, inventoryId } = input
  const marketName = market.name || 'this market'

  const { data: roster } = await observed(service
    .from('market_vendors')
    .select('approved, revoked_at, booth_number, inventory_id')
    .eq('market_id', marketId)
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle(), { table: 'market_vendors' })

  // 1. BR-1 — managed markets only.
  if (market.manager_user_id && roster?.approved !== true) {
    const pending = !!roster && !roster.revoked_at
    return {
      ok: false,
      code: 'ERR_MARKET_APPROVAL_REQUIRED',
      status: 403,
      pending,
      message: pending
        ? `Your application to ${marketName} is with the manager. You can book booth weeks here once they approve you.`
        : `Apply to ${marketName} first — the manager approves vendors before booth weeks can be booked here.`,
    }
  }

  // 2. BR-13 — at least one active declaration row at this market.
  const { data: days } = await observed(service
    .from('vendor_market_schedules')
    .select('id')
    .eq('market_id', marketId)
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true)
    .limit(1), { table: 'vendor_market_schedules' })
  const hasDeclaredDays = (days ?? []).length > 0
  if (!hasDeclaredDays) {
    return {
      ok: false,
      code: 'ERR_DECLARE_DAYS_FIRST',
      status: 400,
      message: `Pick the days you attend ${marketName} before booking a booth week — buyers see you only on the days you pick.`,
    }
  }

  // 3. BR-4 — tier lock when the pin carries a tier.
  const pin = {
    booth_number: (roster?.booth_number as string | null) ?? null,
    inventory_id: (roster?.inventory_id as string | null) ?? null,
  }
  if (inventoryId && pin.inventory_id && pin.inventory_id !== inventoryId) {
    const { data: tier } = await observed(service
      .from('market_booth_inventory')
      .select('size_label')
      .eq('id', pin.inventory_id)
      .maybeSingle(), { table: 'market_booth_inventory' })
    const label = (tier?.size_label as string | undefined) || 'the size the manager set'
    return {
      ok: false,
      code: 'ERR_BOOTH_TIER_LOCKED',
      status: 400,
      message: `Your booth at ${marketName} is a ${label} — book that size. Ask the manager if you need a different one.`,
    }
  }

  return { ok: true, pin, hasDeclaredDays }
}
