import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'
import { generateSurveyToken } from './token'
import { generateWeeklySurveys, isEarlyBuyer } from './weekly'
import { observed } from '@/lib/errors'
import {
  computeFireMomentLocal,
  nowInTimezoneAsLocalIso,
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
  void vertical
  try {
    // Survey cadence (owner 2026-08-29): vendors are surveyed ONCE A WEEK,
    // one row per place they were at that week (lib/surveys/weekly.ts). This
    // on-return path creates the rows + the in-app bell, never the email.
    await generateWeeklySurveys(service, { vendorProfileId, sendEmail: false })
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
    // Survey cadence (owner 2026-08-29): per-day surveys only for a buyer's
    // first two purchases; afterwards the weekly digest (no email here).
    if (!(await isEarlyBuyer(service, buyerUserId))) {
      await generateWeeklySurveys(service, { buyerUserId, sendEmail: false })
      return
    }
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
