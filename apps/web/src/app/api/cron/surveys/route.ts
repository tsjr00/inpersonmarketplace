import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import {
  computeFireMomentLocal,
  nowInTimezoneAsLocalIso,
  recentLocalDates,
  formatMarketDateDisplay,
  formatYMD,
  parseYMD,
} from '@/lib/surveys/cron-helpers'
import { generateSurveyToken } from '@/lib/surveys/token'
import {
  buildVendorSurveyEmailSubject,
  buildVendorSurveyEmailHtml,
  buildBuyerSurveyEmailSubject,
  buildBuyerSurveyEmailHtml,
  sendSurveyEmail,
} from '@/lib/surveys/email'
import { getAppUrl } from '@/lib/environment'

/**
 * Post-market survey generation cron (Phase E Stage 2, mig 147).
 *
 * Schedule: hourly. The cron itself decides whether any work is due
 * for each market based on the market's local close time:
 *   - If the market closed BEFORE 18:00 local → fire surveys at 18:00 local same day
 *   - If the market closed AT 18:00+ local   → fire surveys at 08:00 local next day
 *
 * (Per Session 81 lock-in. See src/lib/surveys/cron-helpers.ts.)
 *
 * For each (market, market_date) that's past the fire window AND
 * doesn't yet have any market_surveys rows, the cron:
 *   1. Looks up the approved + scheduled-active vendors for that day
 *   2. Looks up the buyers who picked up orders at that market on that date
 *   3. INSERTs one market_surveys row per audience (UNIQUE constraints
 *      enforce one survey per (audience, market, date))
 *   4. Sends in-app + email notifications:
 *      - sendNotification() for in-app + the standard branded email
 *      - sendSurveyEmail() for a custom-HTML email with the market's
 *        logo (if uploaded via mig 140). Two emails could theoretically
 *        arrive — but in practice users who have a vendor profile or
 *        buyer record receive the custom one. The standard email is
 *        the fallback when our extension fails.
 *
 * Auth: CRON_SECRET header — matches existing cron pattern.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/surveys', 'GET', async () => {
    // CRON_SECRET auth — same pattern as expire-orders + vendor-quality
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('[CRON-SURVEYS] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const expected = `Bearer ${cronSecret}`
    if (!authHeader || authHeader.length !== expected.length) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const summary = await runSurveyCron()
    return NextResponse.json(summary)
  })
}

interface CronSummary {
  marketsConsidered: number
  marketDaysGenerated: number
  vendorSurveysCreated: number
  buyerSurveysCreated: number
  emailsAttempted: number
  emailsFailed: number
  errors: string[]
}

async function runSurveyCron(): Promise<CronSummary> {
  const summary: CronSummary = {
    marketsConsidered: 0,
    marketDaysGenerated: 0,
    vendorSurveysCreated: 0,
    buyerSurveysCreated: 0,
    emailsAttempted: 0,
    emailsFailed: 0,
    errors: [],
  }

  const serviceClient = createServiceClient()

  // Active markets only — pending markets shouldn't have attendees yet,
  // and active=false markets are out of scope.
  const { data: markets, error: marketsErr } = await serviceClient
    .from('markets')
    .select('id, name, vertical_id, timezone, logo_url, active, status')
    .eq('active', true)
    .eq('status', 'active')

  if (marketsErr) {
    summary.errors.push(`Failed to load markets: ${marketsErr.message}`)
    return summary
  }

  for (const market of markets ?? []) {
    summary.marketsConsidered++
    try {
      await processMarket(market as MarketRow, serviceClient, summary)
    } catch (err) {
      summary.errors.push(
        `Market ${(market as MarketRow).id}: ${err instanceof Error ? err.message : 'Unknown'}`
      )
    }
  }

  return summary
}

interface MarketRow {
  id: string
  name: string
  vertical_id: string
  timezone: string | null
  logo_url: string | null
}

async function processMarket(
  market: MarketRow,
  serviceClient: ReturnType<typeof createServiceClient>,
  summary: CronSummary
): Promise<void> {
  const tz = market.timezone || 'America/Chicago'
  const { today, yesterday, todayDayOfWeek, yesterdayDayOfWeek } = recentLocalDates(tz)
  const nowLocal = nowInTimezoneAsLocalIso(tz)

  // Pull schedule for both candidate days
  const { data: schedules } = await serviceClient
    .from('market_schedules')
    .select('day_of_week, end_time, active')
    .eq('market_id', market.id)
    .eq('active', true)
    .in('day_of_week', Array.from(new Set([todayDayOfWeek, yesterdayDayOfWeek])))

  const scheduleByDay = new Map<number, { end_time: string | null }>()
  for (const s of schedules ?? []) {
    scheduleByDay.set(s.day_of_week as number, {
      end_time: (s.end_time as string | null) ?? null,
    })
  }

  const candidates: Array<{ marketDate: string; dayOfWeek: number }> = []
  if (scheduleByDay.has(todayDayOfWeek)) {
    candidates.push({ marketDate: today, dayOfWeek: todayDayOfWeek })
  }
  if (scheduleByDay.has(yesterdayDayOfWeek)) {
    candidates.push({ marketDate: yesterday, dayOfWeek: yesterdayDayOfWeek })
  }

  for (const cand of candidates) {
    const schedule = scheduleByDay.get(cand.dayOfWeek)
    if (!schedule) continue
    const fire = computeFireMomentLocal(cand.marketDate, schedule.end_time)
    if (!fire) continue
    if (nowLocal < fire.fireAtLocalIso) continue

    // Dedup: any existing market_surveys for this market_date?
    const { count } = await serviceClient
      .from('market_surveys')
      .select('id', { head: true, count: 'exact' })
      .eq('market_id', market.id)
      .eq('market_date', cand.marketDate)

    if ((count ?? 0) > 0) continue // already processed

    await generateForMarketDay(market, cand.marketDate, cand.dayOfWeek, serviceClient, summary)
    summary.marketDaysGenerated++
  }
}

async function generateForMarketDay(
  market: MarketRow,
  marketDate: string,
  dayOfWeek: number,
  serviceClient: ReturnType<typeof createServiceClient>,
  summary: CronSummary
): Promise<void> {
  const expiresAt = computeExpiresAt(marketDate)
  const expiresAtDisplay = formatExpiryDisplay(expiresAt)
  const marketDateDisplay = formatMarketDateDisplay(marketDate)
  const baseUrl = getAppUrl()
  const vertical = market.vertical_id || 'farmers_market'

  // ── 1. Vendors who attended ────────────────────────────────────────
  const { data: vendorScheduleRows } = await serviceClient
    .from('vendor_market_schedules')
    .select('vendor_profile_id')
    .eq('market_id', market.id)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)

  const scheduledVendorIds = new Set(
    (vendorScheduleRows ?? []).map((r) => r.vendor_profile_id as string)
  )

  const { data: marketVendors } = await serviceClient
    .from('market_vendors')
    .select(`
      vendor_profile_id,
      vendor_profiles!market_vendors_vendor_profile_id_fkey (
        id, user_id, profile_data
      )
    `)
    .eq('market_id', market.id)
    .eq('approved', true)

  const attendedVendors = (marketVendors ?? []).filter((mv) =>
    scheduledVendorIds.has(mv.vendor_profile_id as string)
  )

  for (const mv of attendedVendors) {
    const vp = mv.vendor_profiles as unknown as
      | { id: string; user_id: string; profile_data: Record<string, unknown> | null }
      | { id: string; user_id: string; profile_data: Record<string, unknown> | null }[]
      | null
    const profile = Array.isArray(vp) ? vp[0] : vp
    if (!profile?.user_id) continue

    const profileData = profile.profile_data as { business_name?: string; farm_name?: string } | null
    const vendorName =
      (profileData?.business_name as string) ||
      (profileData?.farm_name as string) ||
      null

    const { data: inserted, error: insertErr } = await serviceClient
      .from('market_surveys')
      .insert({
        kind: 'vendor',
        vendor_profile_id: mv.vendor_profile_id,
        market_id: market.id,
        market_date: marketDate,
        expires_at: expiresAt,
        notified_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr) {
      // 23505 = duplicate via UNIQUE constraint; just skip silently
      if (insertErr.code !== '23505') {
        summary.errors.push(
          `Vendor survey insert failed for ${profile.id}: ${insertErr.message}`
        )
      }
      continue
    }
    if (!inserted) continue
    summary.vendorSurveysCreated++

    // Count any other vendor surveys this vendor has pending (across markets)
    const { count: priorCount } = await serviceClient
      .from('market_surveys')
      .select('id', { head: true, count: 'exact' })
      .eq('vendor_profile_id', mv.vendor_profile_id)
      .eq('kind', 'vendor')
      .is('submitted_at', null)
      .neq('id', inserted.id)
      .gt('expires_at', new Date().toISOString())

    const priorPendingCount = priorCount ?? 0

    // In-app + standard email via sendNotification (template registry)
    await sendNotification(
      profile.user_id,
      'survey_request_vendor',
      {
        marketName: market.name,
        surveyDate: marketDateDisplay,
        surveyId: inserted.id,
        priorPendingCount,
      },
      { vertical }
    )

    // Custom HTML email with market logo (if uploaded). Best-effort —
    // the in-app notification + standard email above is the
    // canonical delivery; this is the polish layer.
    const surveyUrl = `${baseUrl}/${vertical}/vendor/survey/${inserted.id}`
    const priorUrl =
      priorPendingCount > 0 ? `${baseUrl}/${vertical}/vendor/surveys` : null

    // Look up vendor's contact email from user_profiles
    const { data: userProfile } = await serviceClient
      .from('user_profiles')
      .select('email')
      .eq('user_id', profile.user_id)
      .maybeSingle()

    if (userProfile?.email) {
      summary.emailsAttempted++
      const result = await sendSurveyEmail({
        to: userProfile.email as string,
        subject: buildVendorSurveyEmailSubject({
          vendorName,
          marketName: market.name,
          marketLogoUrl: market.logo_url,
          marketDateDisplay,
          surveyUrl,
          priorPendingCount,
          priorPendingUrl: priorUrl,
          expiresAtDisplay,
        }),
        html: buildVendorSurveyEmailHtml({
          vendorName,
          marketName: market.name,
          marketLogoUrl: market.logo_url,
          marketDateDisplay,
          surveyUrl,
          priorPendingCount,
          priorPendingUrl: priorUrl,
          expiresAtDisplay,
        }),
      })
      if (!result.ok) summary.emailsFailed++
    }
  }

  // ── 2. Buyers who picked up at this market on this date ────────────
  const { data: orderItems } = await serviceClient
    .from('order_items')
    .select(`
      order_id,
      orders!inner ( buyer_user_id )
    `)
    .eq('market_id', market.id)
    .eq('pickup_date', marketDate)
    .in('status', ['fulfilled', 'completed'])

  const buyerUserIds = new Set<string>()
  for (const oi of orderItems ?? []) {
    const orders = oi.orders as unknown as { buyer_user_id: string } | { buyer_user_id: string }[]
    const order = Array.isArray(orders) ? orders[0] : orders
    if (order?.buyer_user_id) buyerUserIds.add(order.buyer_user_id)
  }

  for (const buyerUserId of buyerUserIds) {
    const accessToken = generateSurveyToken()

    const { data: inserted, error: insertErr } = await serviceClient
      .from('market_surveys')
      .insert({
        kind: 'buyer',
        buyer_user_id: buyerUserId,
        market_id: market.id,
        market_date: marketDate,
        access_token: accessToken,
        expires_at: expiresAt,
        notified_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr) {
      if (insertErr.code !== '23505') {
        summary.errors.push(
          `Buyer survey insert failed for ${buyerUserId}: ${insertErr.message}`
        )
      }
      continue
    }
    if (!inserted) continue
    summary.buyerSurveysCreated++

    // Count other pending buyer surveys
    const { count: priorCount } = await serviceClient
      .from('market_surveys')
      .select('id', { head: true, count: 'exact' })
      .eq('buyer_user_id', buyerUserId)
      .eq('kind', 'buyer')
      .is('submitted_at', null)
      .neq('id', inserted.id)
      .gt('expires_at', new Date().toISOString())

    const priorPendingCount = priorCount ?? 0

    // In-app via sendNotification
    await sendNotification(
      buyerUserId,
      'survey_request_buyer',
      {
        marketName: market.name,
        surveyDate: marketDateDisplay,
        accessToken,
        priorPendingCount,
      },
      { vertical }
    )

    // Check opt-out + email
    const { data: userProfile } = await serviceClient
      .from('user_profiles')
      .select('email, survey_emails_opted_out')
      .eq('user_id', buyerUserId)
      .maybeSingle()

    if (userProfile?.email && !userProfile.survey_emails_opted_out) {
      summary.emailsAttempted++
      const surveyUrl = `${baseUrl}/${vertical}/survey/${accessToken}`
      const unsubscribeUrl = `${baseUrl}/${vertical}/account/email-preferences?unsub=surveys&token=${accessToken}`
      const priorUrl =
        priorPendingCount > 0 ? `${baseUrl}/${vertical}/buyer/surveys` : null

      const result = await sendSurveyEmail({
        to: userProfile.email as string,
        subject: buildBuyerSurveyEmailSubject({
          vendorName: null,
          marketName: market.name,
          marketLogoUrl: market.logo_url,
          marketDateDisplay,
          surveyUrl,
          priorPendingCount,
          priorPendingUrl: priorUrl,
          expiresAtDisplay,
          unsubscribeUrl,
        }),
        html: buildBuyerSurveyEmailHtml({
          vendorName: null,
          marketName: market.name,
          marketLogoUrl: market.logo_url,
          marketDateDisplay,
          surveyUrl,
          priorPendingCount,
          priorPendingUrl: priorUrl,
          expiresAtDisplay,
          unsubscribeUrl,
        }),
      })
      if (!result.ok) summary.emailsFailed++
    }
  }
}

/** 30 days after market_date — ISO timestamp. */
function computeExpiresAt(marketDate: string): string {
  const d = parseYMD(marketDate)
  if (!d) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  d.setDate(d.getDate() + 30)
  return d.toISOString()
}

/** "Jun 16, 2026" style display from an ISO timestamp. */
function formatExpiryDisplay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Keep formatYMD imported so the linter doesn't complain even if
// future edits remove its only inline use site.
void formatYMD
