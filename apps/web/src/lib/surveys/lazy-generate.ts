import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'
import { generateSurveyToken } from './token'
import { observed } from '@/lib/errors'
import {
  computeFireMomentLocal,
  nowInTimezoneAsLocalIso,
  recentLocalDates,
  formatMarketDateDisplay,
  computeExpiresAt,
  formatYMD,
  parseYMD,
} from './cron-helpers'

/**
 * COMM-4 part 2 — lazy, on-return survey surfacing.
 *
 * When a vendor opens their dashboard, ensure any survey they're DUE for (a
 * market day they attended whose fire moment has passed) exists as a
 * market_surveys row + in_app notification — so a returner sees it immediately
 * instead of waiting for the once-daily generation cron.
 *
 * NO email is sent here. The daily survey cron owns the single proactive email,
 * and because that cron skips on the 23505 duplicate-row insert this lazy row
 * causes, a returner surfaced here is automatically NOT emailed (the cron only
 * emails rows it creates itself = people who didn't come back on their own).
 *
 * Idempotent (per-row UNIQUE on market_surveys). Best-effort: any failure is
 * swallowed so it can never break the dashboard render that calls it. Mirrors
 * the vendor branch of generateForMarketDay in cron/surveys/route.ts — shared
 * fire-window + expiry helpers keep the two in sync.
 */
export async function ensurePendingVendorSurveys(
  service: SupabaseClient,
  vendorProfileId: string,
  vertical: string,
): Promise<void> {
  try {
    // The vendor's active market-day schedules → (market, schedule). day_of_week
    // and end_time live on market_schedules (schedule_id), NOT on the vendor link
    // row — selecting day_of_week here failed with 42703 on every vendor
    // dashboard load from 2026-07-17 until the prod API log surfaced it
    // 2026-08-25 (the catch below hid it: no vendor was ever lazily surveyed).
    const { data: scheds } = await observed(service
      .from('vendor_market_schedules')
      .select('market_id, schedule_id')
      .eq('vendor_profile_id', vendorProfileId)
      .eq('is_active', true), { table: 'vendor_market_schedules' })
    if (!scheds || scheds.length === 0) return

    const scheduleIds = [...new Set(scheds.map((s) => s.schedule_id as string))]
    const { data: scheduleRows } = await observed(service
      .from('market_schedules')
      .select('id, day_of_week, end_time')
      .in('id', scheduleIds)
      .eq('active', true), { table: 'market_schedules' })
    const scheduleById = new Map(
      (scheduleRows ?? []).map((r) => [r.id as string, { dow: r.day_of_week as number, endTime: (r.end_time as string | null) ?? null }])
    )

    const marketIds = [...new Set(scheds.map((s) => s.market_id as string))]

    // Attendance requires BOTH an active schedule (above) AND an approved
    // market_vendors row (matches the cron). Load the eligible active markets.
    const [{ data: markets }, { data: approvedRows }, { data: vp }] = await Promise.all([
      service.from('markets').select('id, name, timezone').in('id', marketIds).eq('active', true).eq('status', 'active'),
      service.from('market_vendors').select('market_id').eq('vendor_profile_id', vendorProfileId).eq('approved', true).in('market_id', marketIds),
      service.from('vendor_profiles').select('user_id').eq('id', vendorProfileId).maybeSingle(),
    ])
    const recipientUserId = vp?.user_id as string | undefined
    if (!recipientUserId) return
    const marketById = new Map((markets ?? []).map((m) => [m.id as string, m]))
    const approvedMarkets = new Set((approvedRows ?? []).map((r) => r.market_id as string))

    for (const s of scheds) {
      const marketId = s.market_id as string
      const sched = scheduleById.get(s.schedule_id as string)
      if (!sched) continue // inactive or deleted schedule
      const dow = sched.dow
      const market = marketById.get(marketId)
      if (!market || !approvedMarkets.has(marketId)) continue

      const tz = (market.timezone as string | null) || 'America/Chicago'
      const { today, yesterday, todayDayOfWeek, yesterdayDayOfWeek } = recentLocalDates(tz)
      const nowLocal = nowInTimezoneAsLocalIso(tz)

      const candidateDates: string[] = []
      if (dow === todayDayOfWeek) candidateDates.push(today)
      if (dow === yesterdayDayOfWeek) candidateDates.push(yesterday)
      if (candidateDates.length === 0) continue

      // end_time drives the fire moment (18:00 same day / 08:00 next day) —
      // already loaded with the schedule above.
      const endTime = sched.endTime

      for (const marketDate of candidateDates) {
        const fire = computeFireMomentLocal(marketDate, endTime)
        if (!fire || nowLocal < fire.fireAtLocalIso) continue

        const { data: inserted, error: insErr } = await service
          .from('market_surveys')
          .insert({
            kind: 'vendor',
            vendor_profile_id: vendorProfileId,
            market_id: marketId,
            market_date: marketDate,
            expires_at: computeExpiresAt(marketDate),
            notified_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        // 23505 = the cron or a prior lazy pass already created it → nothing to do.
        if (insErr || !inserted) continue

        // in_app ONLY (survey_request_vendor is urgency 'info' = in_app-only).
        await sendNotification(
          recipientUserId,
          'survey_request_vendor',
          {
            marketName: market.name as string,
            surveyDate: formatMarketDateDisplay(marketDate),
            surveyId: inserted.id as string,
            marketId,
          },
          { vertical },
        )
      }
    }
  } catch {
    // Best-effort — never break the caller (a dashboard render).
  }
}

/**
 * COMM-4 part 2 — buyer counterpart of ensurePendingVendorSurveys. When a buyer
 * lands on their surveys list, ensure a survey exists for any recent pickup
 * (fulfilled/completed order at a market on a date whose fire moment has passed)
 * + the in_app bell — no email. The daily cron's 23505-skip means a buyer
 * surfaced here isn't emailed. Mirrors the buyer branch of generateForMarketDay.
 * Idempotent; best-effort (never breaks the page render).
 */
export async function ensurePendingBuyerSurveys(
  service: SupabaseClient,
  buyerUserId: string,
  vertical: string,
): Promise<void> {
  try {
    // Recent fulfilled/completed pickups → (market, pickup_date). Bounded to the
    // last few days: surveys only fire for today/yesterday market days, +cushion
    // for timezone + the 18:00/08:00-next-day fire window.
    const cutoff = formatYMD(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
    const { data: items } = await observed(service
      .from('order_items')
      .select('market_id, pickup_date, orders!inner ( buyer_user_id )')
      .eq('orders.buyer_user_id', buyerUserId)
      // order_item_status has no 'completed' — a phantom value makes PostgREST
      // reject the WHOLE query (22P02), not just skip it. Found 2026-08-25.
      .eq('status', 'fulfilled')
      .gte('pickup_date', cutoff), { table: 'order_items' })
    if (!items || items.length === 0) return

    const pairs = new Map<string, { marketId: string; date: string }>()
    for (const it of items) {
      const marketId = it.market_id as string | null
      const date = it.pickup_date as string | null
      if (marketId && date) pairs.set(`${marketId}|${date}`, { marketId, date })
    }
    if (pairs.size === 0) return

    const marketIds = [...new Set([...pairs.values()].map((p) => p.marketId))]
    const { data: markets } = await observed(service
      .from('markets')
      .select('id, name, timezone')
      .in('id', marketIds)
      .eq('active', true)
      .eq('status', 'active'), { table: 'markets' })
    const marketById = new Map((markets ?? []).map((m) => [m.id as string, m]))

    for (const { marketId, date } of pairs.values()) {
      const market = marketById.get(marketId)
      if (!market) continue
      const tz = (market.timezone as string | null) || 'America/Chicago'
      const nowLocal = nowInTimezoneAsLocalIso(tz)
      const dow = parseYMD(date)?.getDay()
      if (dow === undefined) continue

      const { data: sc } = await observed(service
        .from('market_schedules')
        .select('end_time')
        .eq('market_id', marketId)
        .eq('day_of_week', dow)
        .eq('active', true)
        .limit(1)
        .maybeSingle(), { table: 'market_schedules' })
      const fire = computeFireMomentLocal(date, (sc?.end_time as string | null) ?? null)
      if (!fire || nowLocal < fire.fireAtLocalIso) continue

      const accessToken = generateSurveyToken()
      const { data: inserted, error: insErr } = await service
        .from('market_surveys')
        .insert({
          kind: 'buyer',
          buyer_user_id: buyerUserId,
          market_id: marketId,
          market_date: date,
          access_token: accessToken,
          expires_at: computeExpiresAt(date),
          notified_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insErr || !inserted) continue

      await sendNotification(
        buyerUserId,
        'survey_request_buyer',
        {
          marketName: market.name as string,
          surveyDate: formatMarketDateDisplay(date),
          accessToken,
        },
        { vertical },
      )
    }
  } catch {
    // Best-effort — never break the caller (the buyer surveys page render).
  }
}
