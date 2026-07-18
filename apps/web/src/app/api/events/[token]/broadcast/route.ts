import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotificationBatch } from '@/lib/notifications'

export const maxDuration = 30

/**
 * POST /api/events/[token]/broadcast  (Tier-1 events cross-pollination)
 *
 * One-way EVENT ORGANIZER → accepted vendors and/or attendees announcement.
 * NOT a chat (no reply path) — mirrors the manager broadcast
 * (api/market-manager/[marketId]/broadcast). Reuses the same sendNotification
 * pipe (in-app + email) and the market_broadcasts audit/rate-limit table,
 * keyed to the event's market_id.
 *
 * Auth: the event's organizer (catering_requests.organizer_user_id === user.id).
 * Audience (body.audience): 'vendors' | 'attendees' | 'both' (default 'both').
 *   - vendors   = market_vendors.response_status='accepted' (event vendors use
 *                 response_status, NOT the `approved` boolean). user_id resolved
 *                 via vendor_profiles (the complete-event.ts pattern).
 *   - attendees = distinct buyers with a non-cancelled order at the event
 *                 (order_items.market_id → orders.buyer_user_id).
 * Rate limit: 2 per event per trailing 7 days, off market_broadcasts.
 */

const MAX_SUBJECT = 150
const MAX_BODY = 2000
const RATE_WINDOW_DAYS = 7
const RATE_MAX_PER_WINDOW = 2

type AudienceChoice = 'vendors' | 'attendees' | 'both'

interface VendorRow {
  vendor_profile_id: string
  vendor_profiles: { user_id: string | null } | { user_id: string | null }[] | null
}

async function resolveOrganizerEvent(token: string) {
  const serviceClient = createServiceClient()
  crumb.supabase('select', 'catering_requests')
  const { data: evt } = await serviceClient
    .from('catering_requests')
    .select('id, organizer_user_id, market_id, company_name, vertical_id')
    .eq('event_token', token)
    .maybeSingle()
  return { serviceClient, evt }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/broadcast', 'POST', async () => {
    const { token } = await params

    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`event-broadcast:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { serviceClient, evt } = await resolveOrganizerEvent(token)
    if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (evt.organizer_user_id !== user.id) {
      return NextResponse.json({ error: 'Not the organizer of this event' }, { status: 403 })
    }
    const marketId = evt.market_id as string | null
    if (!marketId) {
      return NextResponse.json({ error: 'This event is not active yet.' }, { status: 409 })
    }

    const body = await request.json().catch(() => ({}))
    const subjectRaw = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const messageRaw = typeof body?.body === 'string' ? body.body.trim() : ''
    const audience: AudienceChoice =
      body?.audience === 'vendors' || body?.audience === 'attendees' ? body.audience : 'both'

    if (!messageRaw) throw traced.validation('ERR_VALIDATION_001', 'Message body is required')
    if (messageRaw.length > MAX_BODY) {
      throw traced.validation('ERR_VALIDATION_002', `Message must be ${MAX_BODY} characters or fewer`)
    }
    if (subjectRaw.length > MAX_SUBJECT) {
      throw traced.validation('ERR_VALIDATION_003', `Subject must be ${MAX_SUBJECT} characters or fewer`)
    }

    const { checkFields } = await import('@/lib/content-moderation')
    const modCheck = checkFields({
      ...(subjectRaw ? { subject: subjectRaw } : {}),
      body: messageRaw,
    })
    if (!modCheck.passed) {
      return NextResponse.json({ error: modCheck.reason }, { status: 400 })
    }

    // Rate limit off the audit table (this event's market_id).
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

    const eventName = (evt.company_name as string | undefined) || 'your event'
    const vertical = (evt.vertical_id as string | undefined) || 'farmers_market'

    // ── Resolve recipients ─────────────────────────────────────────────
    const vendorUserIds = new Set<string>()
    const buyerUserIds = new Set<string>()

    if (audience === 'vendors' || audience === 'both') {
      crumb.supabase('select', 'market_vendors')
      const { data: acceptedVendors, error: vErr } = await serviceClient
        .from('market_vendors')
        .select('vendor_profile_id, vendor_profiles!market_vendors_vendor_profile_id_fkey ( user_id )')
        .eq('market_id', marketId)
        .eq('response_status', 'accepted')
      if (vErr) console.error('[event-broadcast] accepted-vendors query failed:', vErr.message)
      for (const v of (acceptedVendors ?? []) as VendorRow[]) {
        const vp = Array.isArray(v.vendor_profiles) ? v.vendor_profiles[0] : v.vendor_profiles
        if (vp?.user_id) vendorUserIds.add(vp.user_id)
      }
    }

    if (audience === 'attendees' || audience === 'both') {
      crumb.supabase('select', 'order_items')
      const { data: itemRows } = await serviceClient
        .from('order_items')
        .select('order_id')
        .eq('market_id', marketId)
      const orderIds = Array.from(new Set((itemRows ?? []).map((r) => r.order_id as string)))
      if (orderIds.length > 0) {
        crumb.supabase('select', 'orders')
        const { data: orderRows } = await serviceClient
          .from('orders')
          .select('buyer_user_id')
          .in('id', orderIds)
          .not('status', 'in', '("cancelled","refunded")')
        for (const o of orderRows ?? []) {
          const uid = o.buyer_user_id as string | null
          if (uid) buyerUserIds.add(uid)
        }
      }
    }

    const totalRecipients = vendorUserIds.size + buyerUserIds.size

    // Record the broadcast (audit + rate-limit source) before notifying.
    crumb.supabase('insert', 'market_broadcasts')
    const { error: insertErr } = await serviceClient
      .from('market_broadcasts')
      .insert({
        market_id: marketId,
        sender_user_id: user.id,
        subject: subjectRaw || null,
        body: messageRaw,
        recipient_count: totalRecipients,
      })
    if (insertErr) {
      throw traced.fromSupabase(insertErr, { table: 'market_broadcasts', operation: 'insert' })
    }

    // EVT-16 / NOT-2: two bulk-prefetch batches (one per audience type) instead
    // of a per-recipient auth.admin.getUserById + send loop. Email resolves from
    // user_profiles inside the batch (same source every other notification uses),
    // one query per batch rather than N auth API calls.
    const broadcastPayload = {
      marketName: eventName,
      marketId,
      ...(subjectRaw ? { broadcastSubject: subjectRaw } : {}),
      broadcastBody: messageRaw,
    }
    await Promise.all([
      sendNotificationBatch(Array.from(vendorUserIds), 'event_organizer_broadcast_vendor', broadcastPayload, { vertical }),
      sendNotificationBatch(Array.from(buyerUserIds), 'event_organizer_broadcast_buyer', broadcastPayload, { vertical }),
    ])

    return NextResponse.json({
      success: true,
      recipient_count: totalRecipients,
      vendor_count: vendorUserIds.size,
      attendee_count: buyerUserIds.size,
    })
  })
}

/**
 * GET /api/events/[token]/broadcast — recent announcements (≤10) + window
 * usage, for the organizer's composer history. Organizer-auth gated.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/broadcast', 'GET', async () => {
    const { token } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { serviceClient, evt } = await resolveOrganizerEvent(token)
    if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (evt.organizer_user_id !== user.id) {
      return NextResponse.json({ error: 'Not the organizer of this event' }, { status: 403 })
    }
    const marketId = evt.market_id as string | null
    if (!marketId) {
      return NextResponse.json({ broadcasts: [], sentThisWindow: 0, maxPerWindow: RATE_MAX_PER_WINDOW, windowDays: RATE_WINDOW_DAYS })
    }

    crumb.supabase('select', 'market_broadcasts')
    const { data: rows, error } = await serviceClient
      .from('market_broadcasts')
      .select('id, subject, body, recipient_count, created_at')
      .eq('market_id', marketId)
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) {
      throw traced.fromSupabase(error, { table: 'market_broadcasts', operation: 'select' })
    }

    const windowStart = new Date(Date.now() - RATE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const sentThisWindow = (rows ?? []).filter((r) => (r.created_at as string) >= windowStart).length

    return NextResponse.json({
      broadcasts: rows ?? [],
      sentThisWindow,
      maxPerWindow: RATE_MAX_PER_WINDOW,
      windowDays: RATE_WINDOW_DAYS,
    })
  })
}
