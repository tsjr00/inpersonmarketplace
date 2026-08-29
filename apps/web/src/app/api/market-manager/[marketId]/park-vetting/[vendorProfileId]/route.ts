import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

/**
 * PATCH /api/market-manager/[marketId]/park-vetting/[vendorProfileId]
 *
 * FT park-manager B3 — operator vetting actions on a truck at their park
 * (book-then-vet, manager discretion):
 *   - block / unblock FUTURE bookings — general-purpose (any reason)
 *   - mark docs reviewed / flagged
 * Upserts the `park_vendor_vetting` row. A newly-applied block notifies the truck.
 *
 * Body: { blocked?: boolean, block_reason?: string,
 *         review_status?: 'pending' | 'reviewed' | 'flagged' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; vendorProfileId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/park-vetting/[vendorProfileId]', 'PATCH', async () => {
    const rl = await checkRateLimit(`mm-vetting:${getClientIp(request)}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { marketId, vendorProfileId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const service = createServiceClient()

    // Truck must be at this park.
    const { data: mv } = await observed(service
      .from('market_vendors')
      .select('id')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .maybeSingle(), { table: 'market_vendors' })
    if (!mv) return NextResponse.json({ error: 'Truck is not at this park' }, { status: 404 })

    const updates: Record<string, unknown> = {}
    let didBlock = false
    if (typeof body?.blocked === 'boolean') {
      const reason = typeof body?.block_reason === 'string' ? body.block_reason.trim().slice(0, 500) : ''
      updates.blocked = body.blocked
      updates.block_reason = body.blocked ? (reason || null) : null
      updates.blocked_at = body.blocked ? new Date().toISOString() : null
      didBlock = body.blocked === true
    }
    if (body?.review_status === 'pending' || body?.review_status === 'reviewed' || body?.review_status === 'flagged') {
      updates.review_status = body.review_status
      updates.docs_reviewed_at = body.review_status === 'reviewed' ? new Date().toISOString() : null
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    crumb.supabase('insert', 'park_vendor_vetting')
    const { data: row, error } = await service
      .from('park_vendor_vetting')
      .upsert(
        { market_id: marketId, vendor_profile_id: vendorProfileId, ...updates },
        { onConflict: 'market_id,vendor_profile_id' }
      )
      .select('id, blocked, review_status, block_reason, docs_reviewed_at')
      .single()
    if (error) throw traced.fromSupabase(error, { table: 'park_vendor_vetting', operation: 'insert' })

    // Notify the truck when newly blocked (sendNotification never throws).
    if (didBlock) {
      const { data: market } = await observed(service.from('markets').select('name, vertical_id').eq('id', marketId).maybeSingle(), { table: 'markets' })
      const { data: vp } = await observed(service.from('vendor_profiles').select('user_id').eq('id', vendorProfileId).maybeSingle(), { table: 'vendor_profiles' })
      const reason = typeof body?.block_reason === 'string' ? body.block_reason.trim() : ''
      if (vp?.user_id) {
        await sendNotification(
          vp.user_id as string,
          'park_vendor_blocked',
          { marketName: (market?.name as string) || 'the park', marketId, ...(reason ? { reason } : {}) },
          { vertical: (market?.vertical_id as string) || 'food_trucks' }
        )
      }
    }

    return NextResponse.json({ row })
  })
}
