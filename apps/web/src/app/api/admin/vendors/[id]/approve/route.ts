import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/approve', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()
    const { id: vendorId } = await params

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin - check platform admin role or vertical admin
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    let isAdmin = hasAdminRole(userProfile || {})

    // If not platform admin, check if they're a vertical admin for this vendor's vertical
    if (!isAdmin) {
      // First get the vendor's vertical
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('vertical_id')
        .eq('id', vendorId)
        .single()

      if (vendor) {
        const { data: verticalAdmin } = await supabase
          .from('vertical_admins')
          .select('id')
          .eq('user_id', user.id)
          .eq('vertical_id', vendor.vertical_id)
          .single()
        isAdmin = !!verticalAdmin
      }
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Use service client for the update to bypass RLS
    const serviceClient = createServiceClient()

    // Update vendor status to approved
    const { data, error } = await serviceClient
      .from('vendor_profiles')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Get vendor details for notification
    const profileData = data.profile_data as Record<string, unknown> | null
    const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Your business'
    const vendorEmail = profileData?.email as string

    // C9 FIX: Use sendNotification() for multi-channel delivery (email + push + in-app)
    await sendNotification(data.user_id, 'vendor_approved', {
      vendorName: businessName,
      vendorId: vendorId,
    }, { vertical: data.vertical_id, userEmail: vendorEmail || undefined })

    return NextResponse.json({
      success: true,
      vendor: data,
      message: 'Vendor approved successfully'
    })
  })
}
