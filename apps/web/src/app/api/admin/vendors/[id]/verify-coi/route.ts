import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'

/**
 * POST /api/admin/vendors/[id]/verify-coi
 *
 * Admin approves or rejects Certificate of Insurance (Gate 3).
 * Body: { action: 'approve' | 'reject', notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/verify-coi', 'POST', async () => {
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
      .select('id, role, roles')
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

    const { action } = await request.json()
    if (!action || !['approve', 'reject'].includes(action)) {
      throw traced.validation('ERR_VALIDATION_001', 'action must be "approve" or "reject"')
    }

    const serviceClient = createServiceClient()

    const updates: Record<string, unknown> = {
      coi_status: action === 'approve' ? 'approved' : 'rejected',
      updated_at: new Date().toISOString(),
    }

    if (action === 'approve') {
      updates.coi_verified_at = new Date().toISOString()
      updates.coi_verified_by = userProfile!.id
    }

    crumb.supabase('update', 'vendor_verifications')
    const { error: updateError } = await serviceClient
      .from('vendor_verifications')
      .update(updates)
      .eq('vendor_profile_id', vendorId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_verifications', operation: 'update' })
    }

    // Check if all 3 gates are now satisfied → mark onboarding complete
    if (action === 'approve') {
      const { data: verification } = await serviceClient
        .from('vendor_verifications')
        .select('status, category_verifications, coi_status, onboarding_completed_at')
        .eq('vendor_profile_id', vendorId)
        .single()

      if (verification && !verification.onboarding_completed_at) {
        const catVer = (verification.category_verifications || {}) as Record<string, { status: string }>
        const allCatsApproved = Object.values(catVer).every(
          (cv) => cv.status === 'approved' || cv.status === 'not_required'
        )
        if (verification.status === 'approved' && allCatsApproved && verification.coi_status === 'approved') {
          await serviceClient
            .from('vendor_verifications')
            .update({ onboarding_completed_at: new Date().toISOString() })
            .eq('vendor_profile_id', vendorId)
        }
      }
    }

    // Notify vendor
    const { data: vendor } = await serviceClient
      .from('vendor_profiles')
      .select('user_id, vertical_id')
      .eq('id', vendorId)
      .single()

    if (vendor?.user_id) {
      await sendNotification(
        vendor.user_id,
        action === 'approve' ? 'vendor_approved' : 'vendor_rejected',
        {},
        { vertical: vendor.vertical_id }
      )
    }

    return NextResponse.json({ success: true, status: action === 'approve' ? 'approved' : 'rejected' })
  })
}
