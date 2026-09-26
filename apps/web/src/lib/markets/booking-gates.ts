import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { findScheduleConflicts, padTime, dayOfWeekName, formatTimeDisplay, type ScheduleSlot } from '@/lib/utils/schedule-overlap'

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
  code: 'ERR_MARKET_APPROVAL_REQUIRED' | 'ERR_DECLARE_DAYS_FIRST' | 'ERR_BOOTH_TIER_LOCKED' | 'ERR_SCHEDULE_CONFLICT'
  status: 400 | 403 | 409
  message: string
  /** For the page: a pending application exists (vs none). */
  pending?: boolean
  /** ERR_SCHEDULE_CONFLICT only: the pin, so the page still shows the held booth. */
  pin?: { booth_number: string | null; inventory_id: string | null }
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

  // 4. Two places at once (owner 2026-09-25, OB-031). The day picker refuses
  //    overlapping days for a vendor without the "I can staff more than one
  //    location at the same time" box (schedules route + mig 253) — but only
  //    when days are PICKED. Days picked before that rule, or while the box was
  //    ticked, were never re-checked, and booking never looked. So booking now
  //    asks the same question the day picker does.
  const conflict = await findDeclaredDayConflict(service, vendorProfileId, marketId)
  if (conflict) {
    return {
      ok: false,
      code: 'ERR_SCHEDULE_CONFLICT',
      status: 409,
      pin,
      message: `You're also scheduled at "${conflict.marketName}" on ${dayOfWeekName(conflict.dayOfWeek)}s from ${formatTimeDisplay(conflict.startTime)} - ${formatTimeDisplay(conflict.endTime)}, the same time as ${marketName}. You can't be at both. Remove that day from one market's schedule on your Markets page — or, if you can staff more than one location at the same time, tick that box on your profile.`,
    }
  }

  return { ok: true, pin, hasDeclaredDays }
}

/**
 * The first overlap between this vendor's picked days HERE and their picked
 * days at any OTHER non-event market — the same overlap rule as the day picker
 * (lib/utils/schedule-overlap). Null when the vendor has the multi-location
 * declaration (profile_data.multiple_trucks — the key both verticals' edit
 * forms write) or nothing overlaps. Events have their own date-based guard
 * (booking-event-guard), so event markets are left out here.
 */
export async function findDeclaredDayConflict(
  service: SupabaseClient,
  vendorProfileId: string,
  marketId: string,
): Promise<ScheduleSlot | null> {
  const { data: vp } = await observed(service
    .from('vendor_profiles')
    .select('profile_data')
    .eq('id', vendorProfileId)
    .maybeSingle(), { table: 'vendor_profiles' })
  if ((vp?.profile_data as Record<string, unknown> | null)?.multiple_trucks === true) return null

  const slots = await loadActiveDeclaredSlots(service, vendorProfileId)
  const here = slots.filter((s) => s.marketId === marketId)
  const elsewhere = slots.filter((s) => s.marketId !== marketId)
  for (const s of here) {
    const hit = findScheduleConflicts(s, elsewhere)[0]
    if (hit) return hit.existing
  }
  return null
}

/**
 * Every pair of this vendor's picked days that overlap at two DIFFERENT
 * non-event markets, regardless of the multi-location box — the profile page
 * shows them while the box is off (owner 2026-09-25, OB-031 option b).
 */
export async function findAllDeclaredOverlaps(
  service: SupabaseClient,
  vendorProfileId: string,
): Promise<Array<{ a: ScheduleSlot; b: ScheduleSlot }>> {
  const slots = await loadActiveDeclaredSlots(service, vendorProfileId)
  const pairs: Array<{ a: ScheduleSlot; b: ScheduleSlot }> = []
  const seen = new Set<string>()
  for (const s of slots) {
    for (const hit of findScheduleConflicts(s, slots.filter((o) => o.marketId !== s.marketId))) {
      const key = [s.marketId, hit.existing.marketId].sort().join('|') + '|' + s.dayOfWeek
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ a: s, b: hit.existing })
    }
  }
  return pairs
}

/** This vendor's ACTIVE picked days at non-event markets, with their times. */
async function loadActiveDeclaredSlots(service: SupabaseClient, vendorProfileId: string): Promise<ScheduleSlot[]> {
  const { data: rows } = await observed(service
    .from('vendor_market_schedules')
    .select('market_id, schedule_id, vendor_start_time, vendor_end_time, markets!inner ( name, market_type ), market_schedules!inner ( day_of_week, start_time, end_time, active )')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true), { table: 'vendor_market_schedules' })

  const slots: ScheduleSlot[] = []
  for (const r of rows ?? []) {
    const m = r.markets as unknown as { name: string; market_type: string } | null
    const ms = r.market_schedules as unknown as { day_of_week: number; start_time: string; end_time: string; active: boolean | null } | null
    if (!m || !ms || ms.active === false) continue
    const slot: ScheduleSlot = {
      marketId: r.market_id as string,
      marketName: m.name,
      scheduleId: r.schedule_id as string,
      dayOfWeek: ms.day_of_week,
      startTime: padTime((r.vendor_start_time as string | null) || ms.start_time),
      endTime: padTime((r.vendor_end_time as string | null) || ms.end_time),
    }
    // Events have their own date-based guard (booking-event-guard).
    if (m.market_type !== 'event') slots.push(slot)
  }
  return slots
}
