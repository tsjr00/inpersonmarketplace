import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { TRIAL_SYSTEM_ENABLED } from '@/lib/vendor-limits'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendors/[id]/approve', 'POST', async () => {
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

    // Check vendor's current state (need vertical_id and trial_started_at for trial logic)
    const { data: existingVendor } = await serviceClient
      .from('vendor_profiles')
      .select('vertical_id, trial_started_at')
      .eq('id', vendorId)
      .maybeSingle()

    // Build update payload
    const updateData: Record<string, unknown> = {
      status: 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Auto-grant trial for new vendors — unified tier system uses 'free' for all verticals
    // Guarded by TRIAL_SYSTEM_ENABLED flag (vendor-limits.ts) — set to false to disable
    const isTrialEligible = TRIAL_SYSTEM_ENABLED && !existingVendor?.trial_started_at
    if (isTrialEligible) {
      const now = new Date()
      const trialEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const graceEnd = new Date(trialEnd.getTime() + 14 * 24 * 60 * 60 * 1000)
      const trialTier = 'free'
      updateData.tier = trialTier
      updateData.subscription_status = 'trialing'
      updateData.trial_started_at = now.toISOString()
      updateData.trial_ends_at = trialEnd.toISOString()
      updateData.trial_grace_ends_at = graceEnd.toISOString()
      updateData.tier_started_at = now.toISOString()
    }

    // Update vendor status to approved (+ trial fields for FT)
    const { data, error } = await serviceClient
      .from('vendor_profiles')
      .update(updateData)
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
    if (isTrialEligible) {
      const trialTierLabel = 'Free'
      await sendNotification(data.user_id, 'vendor_approved_trial', {
        vendorName: businessName,
        vendorId: vendorId,
        trialTier: trialTierLabel,
        trialDays: 90,
      }, { vertical: data.vertical_id, userEmail: vendorEmail || undefined })
    } else {
      await sendNotification(data.user_id, 'vendor_approved', {
        vendorName: businessName,
        vendorId: vendorId,
      }, { vertical: data.vertical_id, userEmail: vendorEmail || undefined })
    }

    return NextResponse.json({
      success: true,
      vendor: data,
      message: 'Vendor approved successfully'
    })
  })
}
