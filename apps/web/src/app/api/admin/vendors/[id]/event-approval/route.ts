import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/event-approval', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
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
    const { event_approved } = body

    if (typeof event_approved !== 'boolean') {
      return NextResponse.json(
        { error: 'event_approved must be a boolean' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Verify vendor exists, is approved, and is food_trucks vertical
    const { data: vendor, error: vendorError } = await serviceClient
      .from('vendor_profiles')
      .select('id, user_id, status, vertical_id, profile_data')
      .eq('id', vendorId)
      .single()

    if (vendorError || !vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    if (vendor.status !== 'approved') {
      return NextResponse.json(
        { error: 'Vendor must be approved before enabling event approval' },
        { status: 400 }
      )
    }

    if (vendor.vertical_id !== 'food_trucks') {
      return NextResponse.json(
        { error: 'Event approval is currently available for food truck vendors only' },
        { status: 400 }
      )
    }

    // COI is a hard gate for event approval (VJ-R1: optional for publishing, required for events)
    if (event_approved) {
      const { data: verification } = await serviceClient
        .from('vendor_verifications')
        .select('coi_status')
        .eq('vendor_profile_id', vendorId)
        .single()

      if (!verification || verification.coi_status !== 'approved') {
        return NextResponse.json(
          { error: 'Vendor must have approved Certificate of Insurance (COI) before event approval' },
          { status: 400 }
        )
      }
    }

    // Sync application_status in profile_data.event_readiness
    const existingProfileData = (vendor.profile_data as Record<string, unknown>) || {}
    const existingReadiness = (existingProfileData.event_readiness as Record<string, unknown>) || {}
    const updatedReadiness = Object.keys(existingReadiness).length > 0
      ? { ...existingReadiness, application_status: event_approved ? 'approved' : 'rejected' }
      : null

    // Update event approval status
    const updateData: Record<string, unknown> = {
      event_approved,
      event_approved_at: event_approved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      ...(updatedReadiness ? {
        profile_data: { ...existingProfileData, event_readiness: updatedReadiness },
      } : {}),
    }

    const { error: updateError } = await serviceClient
      .from('vendor_profiles')
      .update(updateData)
      .eq('id', vendorId)

    if (updateError) {
      console.error('[admin/vendors/event-approval] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update event approval status' },
        { status: 500 }
      )
    }

    // Notify vendor when approved for events
    if (event_approved) {
      const profileData = vendor.profile_data as Record<string, unknown> | null
      const vendorEmail = profileData?.email as string | undefined

      await sendNotification(
        vendor.user_id,
        'vendor_event_approved',
        {},
        { vertical: vendor.vertical_id, userEmail: vendorEmail || undefined }
      )
    }

    return NextResponse.json({
      success: true,
      event_approved,
    })
  })
}
