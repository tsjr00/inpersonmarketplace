import { createServiceClient } from '@/lib/supabase/server'

/**
 * Stats surfaced on the manager dashboard above the existing onboarding
 * checklist + section cards. Intentionally narrow scope — actionable
 * numbers a manager scans on page load.
 *
 * Timezone handling: uses markets.timezone (falls back to America/Chicago).
 * Mirrors the canonical pattern from cron Phase 14/15 in
 * apps/web/src/app/api/cron/expire-orders/route.ts:2267-2269 — established
 * after Migration 054 fixed the UTC-based "evening blackout" bug. Do NOT
 * use server-local time directly (Vercel = UTC, breaks for any non-UTC
 * market in the evening hours).
 *
 * RLS: market manager tables (vendor_market_schedules, market_vendors,
 * market_schedules, order_items) — uses service client because callers
 * always pass the authenticated user's client which would be blocked by
 * the default-deny RLS on manager-scoped reads. Auth is enforced UPSTREAM
 * by isMarketManager() before this function is called.
 */
export interface ManagerDashboardStats {
  /** Next market day for this market (today or future), in market's local
   *  timezone. null if no active schedule rows exist. */
  nextMarketDate: Date | null
  /** Distinct order count whose order_items have pickup_date matching the
   *  nextMarketDate AND market_id matching this market AND status in the
   *  "still upcoming" set (pending/confirmed/ready — excludes fulfilled,
   *  cancelled, refunded). 0 if nextMarketDate is null. */
  nextMarketDayOrderCount: number
  /** Vendors at this market who are approved (market_vendors.approved=true)
   *  AND have an active schedule entry (vendor_market_schedules.is_active
   *  =true) AND lack a booth_number. The actionable subset for "needs
   *  booth #" promotion. */
  activeVendorsNeedingBooth: number
}

export async function getManagerDashboardStats(
  marketId: string,
  marketTimezone: string | null
): Promise<ManagerDashboardStats> {
  const tz = marketTimezone || 'America/Chicago'
  const serviceClient = createServiceClient()

  // Schedules first — needed to compute nextMarketDate before the order
  // query (which filters by pickup_date = next market day).
  const { data: schedules } = await serviceClient
    .from('market_schedules')
    .select('day_of_week, start_time, active')
    .eq('market_id', marketId)

  const nextMarketDate = computeNextMarketDate(schedules ?? [], tz)
  const nextMarketDateStr = nextMarketDate ? formatLocalDate(nextMarketDate) : null

  // Three parallel queries:
  //  1. vendor_market_schedules with is_active=true at this market
  //  2. market_vendors approved + booth_number IS NULL at this market
  //  3. order_items at this market with pickup_date = next market day,
  //     status NOT in {fulfilled, cancelled, refunded}
  // Queries 1+2 merged in JS to compute "active AND needs booth #".
  // Query 3 deduplicates by order_id (one order can have multiple items).
  const [activeScheduleVendors, marketVendorsNoBooth, orderItemsResult] = await Promise.all([
    serviceClient
      .from('vendor_market_schedules')
      .select('vendor_profile_id')
      .eq('market_id', marketId)
      .eq('is_active', true),
    serviceClient
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', marketId)
      .eq('approved', true)
      .is('booth_number', null),
    nextMarketDateStr
      ? serviceClient
          .from('order_items')
          .select('order_id')
          .eq('market_id', marketId)
          .eq('pickup_date', nextMarketDateStr)
          .in('status', ['pending', 'confirmed', 'ready'])
      : Promise.resolve({ data: [] as Array<{ order_id: string }>, error: null }),
  ])

  const activeScheduleSet = new Set(
    (activeScheduleVendors.data ?? []).map((v) => v.vendor_profile_id as string)
  )
  const activeVendorsNeedingBooth = (marketVendorsNoBooth.data ?? []).filter((v) =>
    activeScheduleSet.has(v.vendor_profile_id as string)
  ).length

  const distinctOrderIds = new Set(
    (orderItemsResult.data ?? []).map((row) => row.order_id as string)
  )
  const nextMarketDayOrderCount = distinctOrderIds.size

  return {
    nextMarketDate,
    nextMarketDayOrderCount,
    activeVendorsNeedingBooth,
  }
}

/**
 * Compute the next market day in the market's local timezone.
 *
 * Uses the canonical cron pattern (expire-orders/route.ts:2267-2269) to
 * derive "now" in market-local time, then walks the schedule rows to find
 * the soonest upcoming day-of-week match. If today IS a market day but
 * the start_time has already passed in local time, we push to next week
 * for that schedule (matches getNextMarketDate in markets/[id]/page.tsx
 * which is the established UX expectation).
 */
function computeNextMarketDate(
  schedules: Array<{ day_of_week: number; start_time: string | null; active: boolean | null }>,
  timezone: string
): Date | null {
  // Convert UTC server time → market-local "now" via locale-string round-trip.
  // The resulting Date carries local date/time values in server-time slots,
  // which is what we want for getDay/getDate math below.
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
  const currentDay = localNow.getDay()
  let nearestDate: Date | null = null

  for (const schedule of schedules) {
    if (schedule.active === false) continue
    const scheduleDay = schedule.day_of_week
    let daysUntil = scheduleDay - currentDay
    if (daysUntil < 0) daysUntil += 7
    if (daysUntil === 0) {
      // Today is a market day — but if the start time has passed in local
      // time, advance to next week. Mirrors markets/[id]/page.tsx:137-143.
      const [hours, minutes] = (schedule.start_time || '00:00').split(':').map(Number)
      const marketTime = new Date(localNow)
      marketTime.setHours(hours, minutes, 0, 0)
      if (localNow > marketTime) daysUntil = 7
    }

    const nextDate = new Date(localNow)
    nextDate.setDate(localNow.getDate() + daysUntil)

    if (!nearestDate || nextDate < nearestDate) {
      nearestDate = nextDate
    }
  }

  return nearestDate
}

/**
 * Format a Date as YYYY-MM-DD using its local-time fields. Mirrors the
 * cron pattern (expire-orders/route.ts:2269) for consistency. Used to
 * compare against pickup_date column (DATE type, no time component).
 */
function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
