import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'
import {
  computeFireMomentLocal,
  nowInTimezoneAsLocalIso,
  recentLocalDates,
  formatMarketDateDisplay,
  computeExpiresAt,
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
    // The vendor's active market-day schedules → (market, day_of_week).
    const { data: scheds } = await service
      .from('vendor_market_schedules')
      .select('market_id, day_of_week')
      .eq('vendor_profile_id', vendorProfileId)
      .eq('is_active', true)
    if (!scheds || scheds.length === 0) return

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
      const dow = s.day_of_week as number
      const market = marketById.get(marketId)
      if (!market || !approvedMarkets.has(marketId)) continue

      const tz = (market.timezone as string | null) || 'America/Chicago'
      const { today, yesterday, todayDayOfWeek, yesterdayDayOfWeek } = recentLocalDates(tz)
      const nowLocal = nowInTimezoneAsLocalIso(tz)

      const candidateDates: string[] = []
      if (dow === todayDayOfWeek) candidateDates.push(today)
      if (dow === yesterdayDayOfWeek) candidateDates.push(yesterday)
      if (candidateDates.length === 0) continue

      // end_time drives the fire moment (18:00 same day / 08:00 next day).
      const { data: sc } = await service
        .from('market_schedules')
        .select('end_time')
        .eq('market_id', marketId)
        .eq('day_of_week', dow)
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      const endTime = (sc?.end_time as string | null) ?? null

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
