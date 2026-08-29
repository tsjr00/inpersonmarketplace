import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'
import { parseTimeToMinutes, nowInTimezoneAsLocalIso } from '@/lib/surveys/cron-helpers'
import { observed } from '@/lib/errors'

/**
 * FT park-manager P4b-2 — day-of check-in reminders.
 *
 * Runs inside the HOURLY surveys cron (an intraday cadence expire-orders'
 * daily sweep can't provide). For each FT paid park with an operating day
 * today, at three points in the day — open / midday / pre-close — it nudges
 * trucks that hold a PAID spot that day but haven't checked in yet. These
 * reminders guard against false no-show strikes (a no-show only finalizes
 * after the day ends, by which point all three windows have passed) and double
 * as the state location-log nudge.
 *
 * Idempotency (decision (a), no migration): before sending, we dedup against
 * the `notifications` table by (user, marketId, marketDate, window) — cheap and
 * indexed (idx_notifications_user_created). A duplicate nudge is low-harm, so
 * the tiny overlapping-cron race is acceptable (unlike surveys/strikes).
 */

export const PARK_CHECKIN_PRECLOSE_OFFSET_MIN = 60 // "pre-close" = 1h before end
export type CheckinReminderWindow = 'open' | 'midday' | 'close'

/**
 * Which reminder window (if any) the current market-local hour falls in, given
 * the day's operating minutes. Pure — unit-testable. Windows are matched by
 * HOUR (the cron is hourly). If two windows collapse into the same hour (short
 * operating day), the earlier one wins — the truck simply gets fewer nudges.
 */
export function checkinReminderWindow(
  startMinutes: number | null,
  endMinutes: number | null,
  currentHour: number,
): CheckinReminderWindow | null {
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null
  const openHour = Math.floor(startMinutes / 60)
  const midHour = Math.floor(((startMinutes + endMinutes) / 2) / 60)
  const closeHour = Math.floor(Math.max(startMinutes, endMinutes - PARK_CHECKIN_PRECLOSE_OFFSET_MIN) / 60)
  if (currentHour === openHour) return 'open'
  if (currentHour === midHour) return 'midday'
  if (currentHour === closeHour) return 'close'
  return null
}

export interface CheckinReminderSummary {
  parksConsidered: number
  remindersSent: number
  errors: string[]
}

export async function runParkCheckinReminders(
  serviceClient: SupabaseClient,
  now: Date = new Date(),
): Promise<CheckinReminderSummary> {
  const summary: CheckinReminderSummary = { parksConsidered: 0, remindersSent: 0, errors: [] }

  const { data: parks, error: parksErr } = await serviceClient
    .from('markets')
    .select('id, name, vertical_id, timezone')
    .eq('vertical_id', 'food_trucks')
    .eq('park_mode', 'paid')
    .eq('active', true)
    .eq('status', 'active')
  if (parksErr) {
    summary.errors.push(`load parks: ${parksErr.message}`)
    return summary
  }

  const dedupSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  for (const park of parks ?? []) {
    summary.parksConsidered++
    try {
      await remindOnePark(serviceClient, park as ParkRow, dedupSince, summary)
    } catch (err) {
      summary.errors.push(`park ${(park as ParkRow).id}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }
  return summary
}

interface ParkRow {
  id: string
  name: string
  vertical_id: string
  timezone: string | null
}

async function remindOnePark(
  serviceClient: SupabaseClient,
  park: ParkRow,
  dedupSince: string,
  summary: CheckinReminderSummary,
): Promise<void> {
  const tz = park.timezone || 'America/Chicago'
  const localIso = nowInTimezoneAsLocalIso(tz) // YYYY-MM-DDTHH:MM:SS
  const today = localIso.slice(0, 10)
  const currentHour = parseInt(localIso.slice(11, 13), 10)
  const todayDow = new Date(new Date().toLocaleString('en-US', { timeZone: tz })).getDay()

  // Operating day + hours.
  const { data: schedules } = await observed(serviceClient
    .from('market_schedules')
    .select('start_time, end_time')
    .eq('market_id', park.id)
    .eq('day_of_week', todayDow)
    .eq('active', true)
    .limit(1), { table: 'market_schedules' })
  if (!schedules || schedules.length === 0) return // not a market day

  const window = checkinReminderWindow(
    parseTimeToMinutes(schedules[0].start_time as string | null),
    parseTimeToMinutes(schedules[0].end_time as string | null),
    currentHour,
  )
  if (!window) return // not a reminder hour

  // Paid bookings today.
  const { data: bookings } = await observed(serviceClient
    .from('park_spot_bookings')
    .select('vendor_profile_id, park_spots:spot_id ( label ), vendor_profiles:vendor_profile_id ( user_id )')
    .eq('market_id', park.id)
    .eq('booking_date', today)
    .eq('status', 'paid'), { table: 'park_spot_bookings' })
  if (!bookings || bookings.length === 0) return

  // Who already checked in today → skip.
  const { data: checkins } = await observed(serviceClient
    .from('market_day_checkins')
    .select('vendor_profile_id')
    .eq('market_id', park.id)
    .eq('market_date', today), { table: 'market_day_checkins' })
  const checkedIn = new Set((checkins ?? []).map((c) => c.vendor_profile_id as string))

  // Candidates = paid, not-checked-in, with a resolvable user.
  const candidates = (bookings ?? [])
    .filter((b) => !checkedIn.has(b.vendor_profile_id as string))
    .map((b) => ({
      vendorProfileId: b.vendor_profile_id as string,
      spotLabel: (b.park_spots as unknown as { label: string } | null)?.label ?? null,
      userId: (b.vendor_profiles as unknown as { user_id: string } | null)?.user_id ?? null,
    }))
    .filter((c): c is { vendorProfileId: string; spotLabel: string | null; userId: string } => !!c.userId)
  if (candidates.length === 0) return

  // Dedup (a): drop anyone already reminded for THIS market+date+window.
  const alreadySent = new Set<string>()
  const { data: priorNotifs } = await observed(serviceClient
    .from('notifications')
    .select('user_id, data')
    .in('user_id', candidates.map((c) => c.userId))
    .eq('type', 'park_checkin_reminder')
    .gte('created_at', dedupSince), { table: 'notifications' })
  for (const n of priorNotifs ?? []) {
    const d = (n.data ?? {}) as { marketId?: string; marketDate?: string; window?: string }
    if (d.marketId === park.id && d.marketDate === today && d.window === window) {
      alreadySent.add(n.user_id as string)
    }
  }

  for (const c of candidates) {
    if (alreadySent.has(c.userId)) continue
    await sendNotification(
      c.userId,
      'park_checkin_reminder',
      {
        marketName: park.name,
        marketId: park.id,
        marketDate: today,
        window,
        ...(c.spotLabel ? { spotLabel: c.spotLabel } : {}),
      },
      { vertical: park.vertical_id || 'food_trucks' },
    )
    summary.remindersSent++
  }
}
