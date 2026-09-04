import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getTierLimits } from '@/lib/vendor-limits'
import { sendNotification } from '@/lib/notifications/service'

/**
 * VIP designation (A2, mig 242 — vip_loyalty_buildout_plan.md, owner
 * decisions 2026-09-04).
 *
 * POST   { vendor_id, vertical, buyer_user_id }  — add a VIP (slot-capped)
 * DELETE ?vendor_id=&vertical=&buyer_user_id=    — remove a VIP
 *
 * The cap (TierLimits.vipCustomers: free 0 / pro 10 / boss 25) gates ADDING
 * only — a tier downgrade never removes existing VIPs. Recognition is the
 * Phase-A feature: the buyer gets the vip_added notification; Phase B perks
 * key off these same rows. Managed from the Your Customers report rows.
 */

async function resolveVendor(request: NextRequest, vendorId: string | null, vertical: string | null) {
  if (!vendorId || !vertical) {
    return { error: NextResponse.json({ error: 'vendor_id and vertical are required' }, { status: 400 }) }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: vendorProfile } = await observed(supabase
    .from('vendor_profiles')
    .select('id, user_id, tier, vertical_id, profile_data')
    .eq('id', vendorId)
    .single(), { table: 'vendor_profiles' })
  if (!vendorProfile || vendorProfile.user_id !== user.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }
  return { vendorProfile, vertical }
}

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/vip-customers', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-vip:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const body = await request.json().catch(() => ({}))
    const { vendor_id, vertical, buyer_user_id } = body as Record<string, string | undefined>
    const resolved = await resolveVendor(request, vendor_id ?? null, vertical ?? null)
    if ('error' in resolved) return resolved.error
    const { vendorProfile } = resolved
    if (!buyer_user_id) {
      return NextResponse.json({ error: 'buyer_user_id is required' }, { status: 400 })
    }

    const limit = getTierLimits(vendorProfile.tier || 'free', vertical!).vipCustomers
    if (limit <= 0) {
      return NextResponse.json(
        { error: 'VIP customers are a Pro and Boss feature — upgrade to start tagging your best customers.', code: 'ERR_VIP_TIER' },
        { status: 403 }
      )
    }

    const serviceClient = createServiceClient()
    const { count } = await serviceClient
      .from('vendor_vip_customers')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id)
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: `All ${limit} VIP slots are used — remove a VIP to add another, or upgrade for more slots.`, code: 'ERR_VIP_FULL' },
        { status: 409 }
      )
    }

    const { error: insertError } = await serviceClient
      .from('vendor_vip_customers')
      .insert({ vendor_profile_id: vendorProfile.id, buyer_user_id })
    if (insertError) {
      // 23505 = already a VIP — idempotent success, no re-notification.
      if (insertError.code === '23505') {
        return NextResponse.json({ ok: true, already: true })
      }
      return NextResponse.json({ error: 'Could not add VIP' }, { status: 500 })
    }

    // Recognition IS the feature — tell the buyer (free channels; never throws).
    const pd = vendorProfile.profile_data as Record<string, unknown> | null
    const vendorName = (pd?.business_name as string) || (pd?.farm_name as string) || undefined
    await sendNotification(
      buyer_user_id,
      'vip_added',
      {
        dedupRef: `vip:${vendorProfile.id}:${buyer_user_id}`,
        ...(vendorName ? { vendorName } : {}),
      },
      { vertical: vertical! }
    )

    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(request: NextRequest) {
  return withErrorTracing('/api/vendor/vip-customers', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-vip:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const searchParams = request.nextUrl.searchParams
    const resolved = await resolveVendor(request, searchParams.get('vendor_id'), searchParams.get('vertical'))
    if ('error' in resolved) return resolved.error
    const { vendorProfile } = resolved
    const buyerUserId = searchParams.get('buyer_user_id')
    if (!buyerUserId) {
      return NextResponse.json({ error: 'buyer_user_id is required' }, { status: 400 })
    }

    // No removal notification (March plan: "optional, vendor choice" — v1
    // stays quiet; being un-VIP'd is not a moment to ping someone about).
    const serviceClient = createServiceClient()
    await serviceClient
      .from('vendor_vip_customers')
      .delete()
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('buyer_user_id', buyerUserId)

    return NextResponse.json({ ok: true })
  })
}
