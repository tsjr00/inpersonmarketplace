/**
 * Which market days did an approval NOT give the vendor?
 *
 * Mig 262 (owner 2026-10-09): approving a farmers-market vendor auto-creates
 * an active vendor_market_schedules row for every active market day — except
 * a day the vendor cannot take because they are already scheduled at ANOTHER
 * market at an overlapping time (check_vendor_schedule_conflict, P0020). That
 * day is skipped inside the trigger, silently by design: the trigger cannot
 * report, so this helper reconstructs the answer right after the approval and
 * the route tells the manager (row message) and the vendor (approval notice).
 *
 * Reading the result: a skipped day is an ACTIVE market day for which the
 * vendor has NO vendor_market_schedules row at this market at all. A row that
 * exists with is_active = false is NOT a skip — it is the vendor's own earlier
 * choice (ON CONFLICT DO NOTHING leaves it alone), so it is not reported.
 *
 * The "where they are instead" name is the vendor's active schedule at another
 * market on the same weekday — the same lookup the trigger makes, minus the
 * time overlap. It is a description for a human, not the rule; the rule lives
 * in the trigger only.
 *
 * Food trucks never reach this: approval creates no schedule there (mig 210),
 * so the caller must not ask for food-truck markets.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { dayOfWeekName } from '@/lib/utils/schedule-overlap'

export interface SkippedDay {
  scheduleId: string
  dayOfWeek: number
  dayName: string
  /** Names of the vendor's other active markets on that weekday (may be empty). */
  elsewhere: string[]
}

/** Pure: which active market days have no row for the vendor, with where they are instead. */
export function computeSkippedDays(
  marketDays: Array<{ id: string; day_of_week: number }>,
  vendorRowsAtMarket: Array<{ schedule_id: string }>,
  vendorElsewhere: Array<{ day_of_week: number; market_name: string }>
): SkippedDay[] {
  const have = new Set(vendorRowsAtMarket.map((r) => r.schedule_id))
  return marketDays
    .filter((d) => !have.has(d.id))
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((d) => ({
      scheduleId: d.id,
      dayOfWeek: d.day_of_week,
      dayName: dayOfWeekName(d.day_of_week),
      elsewhere: [...new Set(vendorElsewhere.filter((e) => e.day_of_week === d.day_of_week).map((e) => e.market_name))],
    }))
}

export async function findSkippedDays(
  serviceClient: SupabaseClient,
  marketId: string,
  vendorProfileId: string
): Promise<SkippedDay[]> {
  const [{ data: days }, { data: rows }, { data: elsewhere }] = await Promise.all([
    observed(serviceClient
      .from('market_schedules')
      .select('id, day_of_week')
      .eq('market_id', marketId)
      .eq('active', true), { table: 'market_schedules' }),
    observed(serviceClient
      .from('vendor_market_schedules')
      .select('schedule_id')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId), { table: 'vendor_market_schedules' }),
    observed(serviceClient
      .from('vendor_market_schedules')
      .select('market_id, is_active, market_schedules!inner(day_of_week), markets!inner(name)')
      .eq('vendor_profile_id', vendorProfileId)
      .eq('is_active', true)
      .neq('market_id', marketId), { table: 'vendor_market_schedules' }),
  ])

  const elsewhereRows = (elsewhere ?? []).map((r) => {
    const ms = Array.isArray(r.market_schedules) ? r.market_schedules[0] : r.market_schedules
    const m = Array.isArray(r.markets) ? r.markets[0] : r.markets
    return {
      day_of_week: (ms as { day_of_week?: number } | null)?.day_of_week ?? -1,
      market_name: (m as { name?: string } | null)?.name ?? 'another market',
    }
  })

  return computeSkippedDays(
    (days ?? []) as Array<{ id: string; day_of_week: number }>,
    (rows ?? []) as Array<{ schedule_id: string }>,
    elsewhereRows
  )
}

/** One sentence for the manager's row and the vendor's notice. */
export function skippedDaysSentence(skipped: SkippedDay[], audience: 'manager' | 'vendor'): string {
  if (skipped.length === 0) return ''
  const parts = skipped.map((s) =>
    s.elsewhere.length > 0 ? `${s.dayName} (already at ${s.elsewhere.join(' and ')} that day)` : s.dayName
  )
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  const plural = skipped.length > 1
  return audience === 'manager'
    ? `${list} ${plural ? 'were' : 'was'} not added: the vendor is scheduled at another market at that time. They can add ${plural ? 'those days' : 'that day'} from their Markets page once they free it or declare they can staff more than one location.`
    : `${list} ${plural ? 'were' : 'was'} not added because you're scheduled at another market at that time. To attend here ${plural ? 'those days' : 'that day'} too, free the other schedule or tick "I can staff more than one location at the same time" in your profile, then add ${plural ? 'them' : 'it'} on your Markets page.`
}
