import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { VENDOR_FEE_FLOOR, FEES } from '@/lib/pricing'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/fee-override', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()
    const { id: vendorId } = await params

    // Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin role
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { vendor_fee_override_percent } = body

    // Validate: must be null (clear) or a number between floor and max
    if (vendor_fee_override_percent !== null) {
      const rate = Number(vendor_fee_override_percent)
      if (isNaN(rate) || rate < VENDOR_FEE_FLOOR || rate > FEES.vendorFeePercent) {
        return NextResponse.json(
          { error: `Fee rate must be between ${VENDOR_FEE_FLOOR}% and ${FEES.vendorFeePercent}%, or null to clear` },
          { status: 400 }
        )
      }
    }

    const serviceClient = createServiceClient()

    // Verify vendor exists (vertical_id needed for S5-2 scoping below)
    const { data: vendor, error: vendorError } = await serviceClient
      .from('vendor_profiles')
      .select('id, status, vertical_id')
      .eq('id', vendorId)
      .single()

    if (vendorError || !vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // S5-2: scope the override to the admin's vertical. The bare hasAdminRole gate
    // above authorizes serviceClient use; this enforces WHICH vendors an admin may
    // touch — a platform admin passes for any vendor, a vertical admin only for a
    // vendor in a vertical they manage.
    const scope = await verifyAdminScope(vendor.vertical_id)
    if (!scope?.authorized) {
      return NextResponse.json({ error: "Not authorized for this vendor's vertical" }, { status: 403 })
    }

    // Build update
    const updateData: Record<string, unknown> = {
      vendor_fee_override_percent: vendor_fee_override_percent !== null
        ? Number(vendor_fee_override_percent)
        : null,
      fee_discount_approved_by: vendor_fee_override_percent !== null ? user.id : null,
      fee_discount_approved_at: vendor_fee_override_percent !== null ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await serviceClient
      .from('vendor_profiles')
      .update(updateData)
      .eq('id', vendorId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update fee override' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      vendor_fee_override_percent: updateData.vendor_fee_override_percent,
    })
  })
}
