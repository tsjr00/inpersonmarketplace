import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
import { logPublicActivityEvent } from '@/lib/marketing/activity-events'

/**
 * POST /api/admin/vendors/[id]/verify
 *
 * Admin approves or rejects vendor business verification (Gate 1).
 * Body: { action: 'approve' | 'reject', notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/verify', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: vendorId } = await params

    crumb.auth('Checking admin auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Verify admin role
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    let isAdmin = hasAdminRole(userProfile || {})
    if (!isAdmin) {
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('vertical_id')
        .eq('id', vendorId)
        .single()
      if (vendor) {
        const { data: va } = await supabase
          .from('vertical_admins')
          .select('id')
          .eq('user_id', user.id)
          .eq('vertical_id', vendor.vertical_id)
          .single()
        isAdmin = !!va
      }
    }
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { action, notes } = await request.json()
    if (!action || !['approve', 'reject'].includes(action)) {
      throw traced.validation('ERR_VALIDATION_001', 'action must be "approve" or "reject"')
    }

    const serviceClient = createServiceClient()
    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    crumb.supabase('update', 'vendor_verifications')
    const { error: updateError } = await serviceClient
      .from('vendor_verifications')
      .update({
        status: newStatus,
        notes: notes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('vendor_profile_id', vendorId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_verifications', operation: 'update' })
    }

    // The sync_verification_status() trigger handles updating vendor_profiles.status

    // Notify vendor
    const { data: vendor } = await serviceClient
      .from('vendor_profiles')
      .select('user_id, profile_data, vertical_id')
      .eq('id', vendorId)
      .single()

    if (vendor?.user_id) {
      const profileData = vendor.profile_data as Record<string, unknown> | null
      const businessName = (profileData?.business_name as string) || 'Your business'

      await sendNotification(
        vendor.user_id,
        action === 'approve' ? 'vendor_approved' : 'vendor_rejected',
        { vendorName: businessName },
        { vertical: vendor.vertical_id }
      )

      // Log public activity event for social proof on vendor approval
      if (action === 'approve' && vendor.vertical_id) {
        await logPublicActivityEvent({
          vertical_id: vendor.vertical_id,
          event_type: 'new_vendor',
          vendor_display_name: businessName,
        })
      }
    }

    return NextResponse.json({ success: true, status: newStatus })
  })
}
