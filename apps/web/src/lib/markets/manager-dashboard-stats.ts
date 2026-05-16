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
  /** Count of market_vendors rows at this market with approved=false.
   *  Surfaces vendors who came in via the co-branded signup link (auto-
   *  created with approved=false) and need manager review. */
  pendingApprovalCount: number
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

  // Four parallel queries:
  //  1. vendor_market_schedules with is_active=true at this market
  //  2. market_vendors approved + booth_number IS NULL at this market
  //  3. order_items at this market with pickup_date = next market day,
  //     status NOT in {fulfilled, cancelled, refunded}
  //  4. market_vendors approved=false count (pending manager review)
  // Queries 1+2 merged in JS to compute "active AND needs booth #".
  // Query 3 deduplicates by order_id (one order can have multiple items).
  // Query 4 is a HEAD count (fast; no row data needed).
  const [activeScheduleVendors, marketVendorsNoBooth, orderItemsResult, pendingApprovalResult] = await Promise.all([
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
    serviceClient
      .from('market_vendors')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .eq('approved', false),
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

  const pendingApprovalCount = pendingApprovalResult.count ?? 0

  return {
    nextMarketDate,
    nextMarketDayOrderCount,
    activeVendorsNeedingBooth,
    pendingApprovalCount,
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

/**
 * Aggregate transaction stats for a market over 7-day, 30-day, and
 * "season" windows. Phase D.1 (2026-05-16) — manager dashboard card.
 *
 * Filters: order_items.market_id = marketId, status NOT IN
 * ('cancelled', 'refunded'). Distinct orders counted by order_id.
 * Distinct vendors counted by vendor_profile_id.
 *
 * Season window:
 *   - If markets.season_start AND season_end are set, use them.
 *   - Else default to last 90 days from today.
 *
 * Money note: this shows GROSS sales (subtotal_cents sum) at the
 * market — the manager doesn't earn it (vendors do), but it's the
 * activity signal they care about. Phase C will add a separate
 * "booth rental income" card for what the manager actually collects.
 */
export interface MarketTransactionsWindow {
  order_count: number
  total_cents: number
  vendor_count: number
}

export interface MarketTransactionsAggregates {
  last_7_days: MarketTransactionsWindow
  last_30_days: MarketTransactionsWindow
  season: MarketTransactionsWindow & {
    /** "2026 season", "Apr 1 – Oct 31, 2026", or "last 90 days" — for UI. */
    range_label: string
    range_start: string  // YYYY-MM-DD
    range_end: string  // YYYY-MM-DD
  }
}

interface OrderItemRow {
  order_id: string
  vendor_profile_id: string
  subtotal_cents: number
  pickup_date: string | null
}

export async function getMarketTransactionsAggregates(
  marketId: string,
  marketTimezone: string | null,
  seasonStart: string | null,
  seasonEnd: string | null
): Promise<MarketTransactionsAggregates> {
  const tz = marketTimezone || 'America/Chicago'
  const serviceClient = createServiceClient()

  // Today in market-local time — same canonical pattern as cron.
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const today = new Date(localNow)
  today.setHours(0, 0, 0, 0)

  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(today.getDate() - 30)
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(today.getDate() - 90)

  // Compute season window
  let seasonRangeStart: Date
  let seasonRangeEnd: Date
  let seasonLabel: string
  if (seasonStart && seasonEnd) {
    seasonRangeStart = new Date(seasonStart + 'T00:00:00')
    seasonRangeEnd = new Date(seasonEnd + 'T00:00:00')
    const startMonth = seasonRangeStart.toLocaleString('en-US', { month: 'short' })
    const endMonth = seasonRangeEnd.toLocaleString('en-US', { month: 'short' })
    const startDay = seasonRangeStart.getDate()
    const endDay = seasonRangeEnd.getDate()
    const endYear = seasonRangeEnd.getFullYear()
    seasonLabel = `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`
  } else {
    seasonRangeStart = ninetyDaysAgo
    seasonRangeEnd = today
    seasonLabel = 'Last 90 days'
  }

  // Query a single chunk covering the broadest window (season). Bucket
  // in JS — one round trip, simpler logic, small data volume per market.
  const broadestStart = formatLocalDate(
    seasonRangeStart < ninetyDaysAgo ? seasonRangeStart : ninetyDaysAgo
  )
  const broadestEnd = formatLocalDate(
    seasonRangeEnd > today ? seasonRangeEnd : today
  )

  const { data: itemsRaw } = await serviceClient
    .from('order_items')
    .select('order_id, vendor_profile_id, subtotal_cents, pickup_date')
    .eq('market_id', marketId)
    .not('status', 'in', '(cancelled,refunded)')
    .gte('pickup_date', broadestStart)
    .lte('pickup_date', broadestEnd)

  const items: OrderItemRow[] = (itemsRaw ?? []).map((r) => ({
    order_id: r.order_id as string,
    vendor_profile_id: r.vendor_profile_id as string,
    subtotal_cents: (r.subtotal_cents as number) || 0,
    pickup_date: (r.pickup_date as string | null) ?? null,
  }))

  const bucket = (
    rangeStart: Date,
    rangeEnd: Date
  ): MarketTransactionsWindow => {
    const startStr = formatLocalDate(rangeStart)
    const endStr = formatLocalDate(rangeEnd)
    const inRange = items.filter(
      (i) => i.pickup_date !== null && i.pickup_date >= startStr && i.pickup_date <= endStr
    )
    const orderIds = new Set<string>()
    const vendorIds = new Set<string>()
    let total = 0
    for (const i of inRange) {
      orderIds.add(i.order_id)
      vendorIds.add(i.vendor_profile_id)
      total += i.subtotal_cents
    }
    return {
      order_count: orderIds.size,
      total_cents: total,
      vendor_count: vendorIds.size,
    }
  }

  const seasonAgg = bucket(seasonRangeStart, seasonRangeEnd)

  return {
    last_7_days: bucket(sevenDaysAgo, today),
    last_30_days: bucket(thirtyDaysAgo, today),
    season: {
      ...seasonAgg,
      range_label: seasonLabel,
      range_start: formatLocalDate(seasonRangeStart),
      range_end: formatLocalDate(seasonRangeEnd),
    },
  }
}
