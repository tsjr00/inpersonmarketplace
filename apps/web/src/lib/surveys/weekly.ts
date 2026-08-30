/**
 * Weekly survey generation (owner 2026-08-29, see cadence.ts for the rule).
 *
 * ONE code path for both callers:
 *   · the daily survey cron (all people, sends the week's single email)
 *   · lazy on-return surfacing (one vendor / one buyer, no email — the cron's
 *     23505-skip means someone surfaced here is never emailed for it)
 *
 * Rows stay one-per-(person, market, market_date): a weekly batch is one row
 * per PLACE the person was at that week, stored against the last day they
 * were there, created together and announced once. The survey list pages
 * show them as "Your week" sections; the per-row forms are unchanged.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'
import { observed } from '@/lib/errors'
import { getAppUrl } from '@/lib/environment'
import { generateSurveyToken } from './token'
import { computeExpiresAt, computeFireMomentLocal, nowInTimezoneAsLocalIso } from './cron-helpers'
import { lastEndedWeek, lastDateOnDows, isEarlyBuyerCount, formatWeekDisplay, type WeekWindow } from './cadence'
import { buildWeeklySurveyEmail, sendSurveyEmail } from './email'

export interface WeeklySummary {
  marketsConsidered: number
  vendorSurveysCreated: number
  buyerSurveysCreated: number
  peopleNotified: number
  emailsAttempted: number
  emailsFailed: number
  errors: string[]
}

interface Place {
  marketId: string
  marketName: string
  marketLogoUrl: string | null
  /** vendor: survey row id · buyer: access token */
  ref: string
}

interface PersonBatch {
  kind: 'vendor' | 'buyer'
  userId: string
  vertical: string
  window: WeekWindow
  places: Place[]
  /** buyer only — first access token, used for the unsubscribe link */
  unsubToken: string | null
}

/**
 * True while the buyer has had at most EARLY_BUYER_MAX_ORDERS fulfilled
 * orders — they get the immediate per-day survey; everyone else is weekly.
 */
export async function isEarlyBuyer(service: SupabaseClient, buyerUserId: string): Promise<boolean> {
  const { data } = await observed(service
    .from('order_items')
    .select('order_id, orders!inner ( buyer_user_id )')
    .eq('orders.buyer_user_id', buyerUserId)
    .eq('status', 'fulfilled')
    .limit(200), { table: 'order_items' })
  const distinct = new Set((data ?? []).map((r) => r.order_id as string))
  return isEarlyBuyerCount(distinct.size)
}

export async function generateWeeklySurveys(
  service: SupabaseClient,
  opts: { vendorProfileId?: string; buyerUserId?: string; sendEmail: boolean }
): Promise<WeeklySummary> {
  const summary: WeeklySummary = {
    marketsConsidered: 0, vendorSurveysCreated: 0, buyerSurveysCreated: 0,
    peopleNotified: 0, emailsAttempted: 0, emailsFailed: 0, errors: [],
  }
  const onlyVendor = opts.vendorProfileId ?? null
  const onlyBuyer = opts.buyerUserId ?? null
  const doVendors = !onlyBuyer
  const doBuyers = !onlyVendor

  // Active markets. For a single person, narrow to the markets they touch so
  // a dashboard render never scans the whole platform.
  let marketIds: string[] | null = null
  if (onlyVendor) {
    const { data } = await observed(service
      .from('vendor_market_schedules')
      .select('market_id')
      .eq('vendor_profile_id', onlyVendor)
      .eq('is_active', true), { table: 'vendor_market_schedules' })
    marketIds = [...new Set((data ?? []).map((r) => r.market_id as string))]
    if (marketIds.length === 0) return summary
  }
  let marketsQuery = service
    .from('markets')
    .select('id, name, vertical_id, timezone, logo_url')
    .eq('active', true)
    .eq('status', 'active')
  if (marketIds) marketsQuery = marketsQuery.in('id', marketIds)
  const { data: markets } = await observed(marketsQuery, { table: 'markets' })
  if (!markets || markets.length === 0) return summary

  const batches = new Map<string, PersonBatch>()
  const batchFor = (kind: 'vendor' | 'buyer', userId: string, vertical: string, window: WeekWindow): PersonBatch => {
    const key = `${kind}|${userId}|${vertical}`
    let b = batches.get(key)
    if (!b) {
      b = { kind, userId, vertical, window, places: [], unsubToken: null }
      batches.set(key, b)
    }
    return b
  }

  for (const market of markets) {
    summary.marketsConsidered++
    const marketId = market.id as string
    const marketName = (market.name as string) || 'the market'
    const marketLogoUrl = (market.logo_url as string | null) ?? null
    const vertical = (market.vertical_id as string) || 'farmers_market'
    const tz = (market.timezone as string | null) || 'America/Chicago'
    const nowLocal = nowInTimezoneAsLocalIso(tz)
    const window = lastEndedWeek(nowLocal)
    if (!window) continue

    try {
      // Active schedule days at this market (dow → end_time).
      const { data: schedules } = await observed(service
        .from('market_schedules')
        .select('id, day_of_week, end_time')
        .eq('market_id', marketId)
        .eq('active', true), { table: 'market_schedules' })
      const schedById = new Map((schedules ?? []).map((s) => [s.id as string, { dow: s.day_of_week as number, endTime: (s.end_time as string | null) ?? null }]))

      // ── Vendors ──────────────────────────────────────────────────────
      if (doVendors && schedById.size > 0) {
        let vmsQuery = service
          .from('vendor_market_schedules')
          .select('vendor_profile_id, schedule_id')
          .eq('market_id', marketId)
          .eq('is_active', true)
        if (onlyVendor) vmsQuery = vmsQuery.eq('vendor_profile_id', onlyVendor)
        const { data: vms } = await observed(vmsQuery, { table: 'vendor_market_schedules' })
        const dowsByVendor = new Map<string, Set<number>>()
        const endTimeByDow = new Map<number, string | null>()
        for (const row of vms ?? []) {
          const s = schedById.get(row.schedule_id as string)
          if (!s) continue
          const vid = row.vendor_profile_id as string
          if (!dowsByVendor.has(vid)) dowsByVendor.set(vid, new Set())
          dowsByVendor.get(vid)!.add(s.dow)
          endTimeByDow.set(s.dow, s.endTime)
        }
        if (dowsByVendor.size > 0) {
          const vendorIds = [...dowsByVendor.keys()]
          const [{ data: approved }, { data: profiles }, { data: existing }] = await Promise.all([
            observed(service.from('market_vendors').select('vendor_profile_id').eq('market_id', marketId).eq('approved', true).in('vendor_profile_id', vendorIds), { table: 'market_vendors' }),
            observed(service.from('vendor_profiles').select('id, user_id').in('id', vendorIds), { table: 'vendor_profiles' }),
            observed(service.from('market_surveys').select('vendor_profile_id').eq('kind', 'vendor').eq('market_id', marketId).in('vendor_profile_id', vendorIds).gte('market_date', window.weekStart).lte('market_date', window.weekEnd), { table: 'market_surveys' }),
          ])
          const approvedSet = new Set((approved ?? []).map((r) => r.vendor_profile_id as string))
          const userByVendor = new Map((profiles ?? []).map((p) => [p.id as string, p.user_id as string | null]))
          const alreadyThisWeek = new Set((existing ?? []).map((r) => r.vendor_profile_id as string))
          for (const [vid, dows] of dowsByVendor) {
            if (!approvedSet.has(vid) || alreadyThisWeek.has(vid)) continue
            const userId = userByVendor.get(vid)
            if (!userId) continue
            const lastDate = lastDateOnDows(window, dows)
            if (!lastDate) continue
            // Respect the per-day fire rule for the last day too (a Sunday
            // market closing after 18:00 fires Monday 08:00).
            const lastDow = new Date(lastDate + 'T00:00:00').getDay()
            const fire = computeFireMomentLocal(lastDate, endTimeByDow.get(lastDow) ?? null)
            if (fire && nowLocal < fire.fireAtLocalIso) continue
            const { data: inserted, error: insErr } = await service
              .from('market_surveys')
              .insert({
                kind: 'vendor',
                vendor_profile_id: vid,
                market_id: marketId,
                market_date: lastDate,
                expires_at: computeExpiresAt(lastDate),
                notified_at: new Date().toISOString(),
              })
              .select('id')
              .single()
            if (insErr) {
              if (insErr.code !== '23505') summary.errors.push(`Vendor weekly insert failed (${vid} @ ${marketId}): ${insErr.message}`)
              continue
            }
            if (!inserted) continue
            summary.vendorSurveysCreated++
            batchFor('vendor', userId, vertical, window).places.push({ marketId, marketName, marketLogoUrl, ref: inserted.id as string })
          }
        }
      }

      // ── Buyers ───────────────────────────────────────────────────────
      if (doBuyers) {
        let itemsQuery = service
          .from('order_items')
          .select('pickup_date, orders!inner ( buyer_user_id )')
          .eq('market_id', marketId)
          .eq('status', 'fulfilled')
          .gte('pickup_date', window.weekStart)
          .lte('pickup_date', window.weekEnd)
        if (onlyBuyer) itemsQuery = itemsQuery.eq('orders.buyer_user_id', onlyBuyer)
        const { data: items } = await observed(itemsQuery, { table: 'order_items' })
        const lastPickupByBuyer = new Map<string, string>()
        for (const it of items ?? []) {
          const o = it.orders as unknown as { buyer_user_id: string } | { buyer_user_id: string }[] | null
          const buyer = (Array.isArray(o) ? o[0] : o)?.buyer_user_id
          const date = it.pickup_date as string | null
          if (!buyer || !date) continue
          const prev = lastPickupByBuyer.get(buyer)
          if (!prev || date > prev) lastPickupByBuyer.set(buyer, date)
        }
        if (lastPickupByBuyer.size > 0) {
          const buyerIds = [...lastPickupByBuyer.keys()]
          const { data: existing } = await observed(service
            .from('market_surveys')
            .select('buyer_user_id')
            .eq('kind', 'buyer')
            .eq('market_id', marketId)
            .in('buyer_user_id', buyerIds)
            .gte('market_date', window.weekStart)
            .lte('market_date', window.weekEnd), { table: 'market_surveys' })
          const alreadyThisWeek = new Set((existing ?? []).map((r) => r.buyer_user_id as string))
          for (const [buyerId, lastDate] of lastPickupByBuyer) {
            // A per-day survey already exists for this place this week (the
            // buyer's 1st/2nd purchase path) → don't ask twice.
            if (alreadyThisWeek.has(buyerId)) continue
            if (await isEarlyBuyer(service, buyerId)) continue
            const accessToken = generateSurveyToken()
            const { data: inserted, error: insErr } = await service
              .from('market_surveys')
              .insert({
                kind: 'buyer',
                buyer_user_id: buyerId,
                market_id: marketId,
                market_date: lastDate,
                access_token: accessToken,
                expires_at: computeExpiresAt(lastDate),
                notified_at: new Date().toISOString(),
              })
              .select('id')
              .single()
            if (insErr) {
              if (insErr.code !== '23505') summary.errors.push(`Buyer weekly insert failed (${buyerId} @ ${marketId}): ${insErr.message}`)
              continue
            }
            if (!inserted) continue
            summary.buyerSurveysCreated++
            const b = batchFor('buyer', buyerId, vertical, window)
            b.places.push({ marketId, marketName, marketLogoUrl, ref: accessToken })
            if (!b.unsubToken) b.unsubToken = accessToken
          }
        }
      }
    } catch (err) {
      summary.errors.push(`Market ${marketId}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  // ── One announcement per person per week ─────────────────────────────
  for (const b of batches.values()) {
    if (b.places.length === 0) continue
    summary.peopleNotified++
    const placeNames = b.places.map((p) => p.marketName)
    const weekDisplay = formatWeekDisplay(b.window)
    const baseUrl = getAppUrl()
    const listUrl = b.kind === 'vendor' ? `${baseUrl}/${b.vertical}/vendor/surveys` : `${baseUrl}/${b.vertical}/buyer/surveys`
    try {
      await sendNotification(
        b.userId,
        b.kind === 'vendor' ? 'survey_weekly_vendor' : 'survey_weekly_buyer',
        { placeCount: b.places.length, placeNames: placeNames.join(', '), weekDisplay, vertical: b.vertical },
        { vertical: b.vertical }
      )
    } catch (err) {
      summary.errors.push(`Notify ${b.userId}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
    if (!opts.sendEmail) continue
    const { data: userProfile } = await observed(service
      .from('user_profiles')
      .select('email, survey_emails_opted_out, display_name')
      .eq('user_id', b.userId)
      .maybeSingle(), { table: 'user_profiles' })
    if (!userProfile?.email) continue
    if (b.kind === 'buyer' && userProfile.survey_emails_opted_out) continue
    summary.emailsAttempted++
    const expiresAtDisplay = new Date(computeExpiresAt(b.window.weekEnd)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const email = buildWeeklySurveyEmail({
      vertical: b.vertical,
      kind: b.kind,
      recipientName: (userProfile.display_name as string | null) ?? null,
      weekDisplay,
      places: b.places.map((p) => ({
        marketName: p.marketName,
        surveyUrl: b.kind === 'vendor' ? `${baseUrl}/${b.vertical}/vendor/survey/${p.ref}` : `${baseUrl}/${b.vertical}/survey/${p.ref}`,
      })),
      listUrl,
      expiresAtDisplay,
      unsubscribeUrl: b.kind === 'buyer' && b.unsubToken
        ? `${baseUrl}/${b.vertical}/account/email-preferences?unsub=surveys&token=${b.unsubToken}`
        : null,
    })
    const result = await sendSurveyEmail({ to: userProfile.email as string, subject: email.subject, html: email.html })
    if (!result.ok) summary.emailsFailed++
  }

  return summary
}
