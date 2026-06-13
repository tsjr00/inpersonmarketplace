import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

export const maxDuration = 30

/**
 * POST /api/market-manager/[marketId]/broadcast (Session 92 Phase B-broadcast)
 *
 * One-way manager → vendor announcement. NOT a chat — there is no reply
 * path. Recipients = approved vendors at the market + vendors with a paid
 * booth rental for the current/upcoming weeks (mirrors the schedule-change
 * fan-out). Each send is recorded in market_broadcasts (audit + rate-limit
 * source). Rate limit: 2 per market per trailing 7 days, enforced off the
 * market_broadcasts table (plus a per-IP guard).
 *
 * Auth: assigned manager of the market (dual-key via isMarketManager).
 */

const MAX_SUBJECT = 150
const MAX_BODY = 2000
const RATE_WINDOW_DAYS = 7
const RATE_MAX_PER_WINDOW = 2

interface VendorRow {
  vendor_profile_id: string
  vendor_profiles: { user_id: string | null } | { user_id: string | null }[] | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/broadcast', 'POST', async () => {
    const { marketId } = await params

    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`mm-broadcast:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const subjectRaw = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const messageRaw = typeof body?.body === 'string' ? body.body.trim() : ''

    if (!messageRaw) {
      throw traced.validation('ERR_VALIDATION_001', 'Message body is required')
    }
    if (messageRaw.length > MAX_BODY) {
      throw traced.validation('ERR_VALIDATION_002', `Message must be ${MAX_BODY} characters or fewer`)
    }
    if (subjectRaw.length > MAX_SUBJECT) {
      throw traced.validation('ERR_VALIDATION_003', `Subject must be ${MAX_SUBJECT} characters or fewer`)
    }

    // Content moderation on free text (same helper as intake/event-requests).
    const { checkFields } = await import('@/lib/content-moderation')
    const modCheck = checkFields({
      ...(subjectRaw ? { subject: subjectRaw } : {}),
      body: messageRaw,
    })
    if (!modCheck.passed) {
      return NextResponse.json({ error: modCheck.reason }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Rate limit off the audit table: count this market's broadcasts in the
    // trailing window. Authoritative (survives serverless instance churn,
    // unlike the in-memory IP limiter above).
    const windowStart = new Date(Date.now() - RATE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    crumb.supabase('select', 'market_broadcasts')
    const { count: recentCount } = await serviceClient
      .from('market_broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .gte('created_at', windowStart)

    if ((recentCount ?? 0) >= RATE_MAX_PER_WINDOW) {
      return NextResponse.json(
        { error: `You can send up to ${RATE_MAX_PER_WINDOW} announcements per ${RATE_WINDOW_DAYS} days. Try again later.` },
        { status: 429 }
      )
    }

    // Market context for the notification.
    crumb.supabase('select', 'markets')
    const { data: marketInfo } = await serviceClient
      .from('markets')
      .select('name, vertical_id')
      .eq('id', marketId)
      .maybeSingle()
    const marketName = (marketInfo?.name as string | undefined) || 'your market'
    const vertical = (marketInfo?.vertical_id as string | undefined) || 'farmers_market'

    // Recipients: approved vendors + paid renters for current/upcoming weeks.
    // Same fan-out as the schedule-change notification.
    crumb.supabase('select', 'market_vendors')
    const { data: approvedVendors } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id, vendor_profiles!inner ( user_id )')
      .eq('market_id', marketId)
      .eq('approved', true)

    const recipientUserIds = new Set<string>()
    for (const v of (approvedVendors ?? []) as VendorRow[]) {
      const vp = Array.isArray(v.vendor_profiles) ? v.vendor_profiles[0] : v.vendor_profiles
      if (vp?.user_id) recipientUserIds.add(vp.user_id)
    }

    const dayIdx = new Date().getDay()
    const thisWeekStart = new Date()
    thisWeekStart.setDate(thisWeekStart.getDate() - dayIdx)
    const thisWeekStartStr = thisWeekStart.toISOString().slice(0, 10)

    crumb.supabase('select', 'weekly_booth_rentals')
    const { data: paidRenters } = await serviceClient
      .from('weekly_booth_rentals')
      .select('vendor_profile_id, vendor_profiles!inner ( user_id )')
      .eq('market_id', marketId)
      .eq('status', 'paid')
      .gte('week_start_date', thisWeekStartStr)

    for (const r of (paidRenters ?? []) as VendorRow[]) {
      const vp = Array.isArray(r.vendor_profiles) ? r.vendor_profiles[0] : r.vendor_profiles
      if (vp?.user_id) recipientUserIds.add(vp.user_id)
    }

    // Record the broadcast first (audit + rate-limit source). If the insert
    // fails we stop before notifying — the row is the source of truth.
    crumb.supabase('insert', 'market_broadcasts')
    const { error: insertErr } = await serviceClient
      .from('market_broadcasts')
      .insert({
        market_id: marketId,
        sender_user_id: user.id,
        subject: subjectRaw || null,
        body: messageRaw,
        recipient_count: recipientUserIds.size,
      })
    if (insertErr) {
      throw traced.fromSupabase(insertErr, { table: 'market_broadcasts', operation: 'insert' })
    }

    // Fan out notifications. sendNotification never throws by contract;
    // email channel needs the vendor's auth email.
    await Promise.all(
      Array.from(recipientUserIds).map(async (userId) => {
        let vendorEmail: string | null = null
        try {
          const { data: authUser } = await serviceClient.auth.admin.getUserById(userId)
          vendorEmail = authUser?.user?.email ?? null
        } catch {
          // in-app channel still fires
        }
        await sendNotification(
          userId,
          'market_broadcast',
          {
            marketName,
            marketId,
            ...(subjectRaw ? { broadcastSubject: subjectRaw } : {}),
            broadcastBody: messageRaw,
          },
          { vertical, ...(vendorEmail ? { userEmail: vendorEmail } : {}) }
        )
      })
    )

    return NextResponse.json({ success: true, recipient_count: recipientUserIds.size })
  })
}
