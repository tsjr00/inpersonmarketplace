import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope, isPlatformAdminCheck } from '@/lib/auth/admin'
import { sendNotification } from '@/lib/notifications/service'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/admin/bundles/send-intro — the ONE-TIME bundles_intro launch
 * announcement (mig 244, owner Q7: email approved for this send).
 *
 * Tells every active vendor about the default-in / global-opt-out consent
 * model. Idempotent at the user level: a vendor who already received a
 * bundles_intro notification is skipped, so re-running (or running again
 * after new vendors join) only reaches people who haven't heard.
 *
 * Body: { vertical?: string } — limit to one vertical, else all.
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/bundles/send-intro', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userProfile } = await observed(supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single(), { table: 'user_profiles' })
    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { vertical } = await request.json().catch(() => ({})) as { vertical?: string }

    // Scope: a vertical admin can intro their own vertical's vendors; the
    // no-vertical (platform-wide) send is platform-admin only.
    if (vertical) {
      const scope = await verifyAdminScope(vertical)
      if (!scope?.authorized) {
        return NextResponse.json({ error: 'Not authorized for this vertical' }, { status: 403 })
      }
    } else if (!(await isPlatformAdminCheck())) {
      return NextResponse.json({ error: 'Platform admin required for an all-verticals send' }, { status: 403 })
    }

    const serviceClient = createServiceClient()
    let vendorQuery = serviceClient
      .from('vendor_profiles')
      .select('id, user_id, vertical_id')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .not('user_id', 'is', null)
    if (vertical) vendorQuery = vendorQuery.eq('vertical_id', vertical)
    const { data: vendors } = await observed(vendorQuery, { table: 'vendor_profiles' })
    if (!vendors || vendors.length === 0) {
      return NextResponse.json({ considered: 0, sent: 0, skipped: 0 })
    }

    // Already-introduced users (one intro per person, ever — no time window).
    const { data: prior } = await observed(serviceClient
      .from('notifications')
      .select('user_id')
      .eq('type', 'bundles_intro'), { table: 'notifications' })
    const alreadySent = new Set((prior ?? []).map(n => n.user_id as string))

    let sent = 0
    const errors: string[] = []
    const seenUsers = new Set<string>()
    for (const v of vendors) {
      const uid = v.user_id as string
      if (alreadySent.has(uid) || seenUsers.has(uid)) continue
      seenUsers.add(uid)
      try {
        await sendNotification(uid, 'bundles_intro', {}, v.vertical_id ? { vertical: v.vertical_id as string } : {})
        sent++
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Unknown send error')
      }
    }

    return NextResponse.json({
      considered: vendors.length,
      sent,
      skipped: vendors.length - sent,
      ...(errors.length ? { errors } : {}),
    })
  })
}
