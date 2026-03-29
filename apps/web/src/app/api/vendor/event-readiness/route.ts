import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'
import { validateEventReadiness } from '@/lib/vendor/event-readiness-validation'

// PUT - Submit or update event readiness application
export async function PUT(request: NextRequest) {
  return withErrorTracing('/api/vendor/event-readiness', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-event-readiness:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const body = await request.json()
    const vertical = request.nextUrl.searchParams.get('vertical')
    const validation = validateEventReadiness(body, vertical || undefined)
    if (!validation.valid) {
      throw traced.validation('ERR_VALIDATION_001', validation.error!)
    }

    // Get vendor profile — H13 FIX: add vertical filter for multi-vertical safety
    crumb.supabase('select', 'vendor_profiles')
    let vpQuery = supabase
      .from('vendor_profiles')
      .select('id, user_id, vertical_id, profile_data')
      .eq('user_id', user.id)
    if (vertical) vpQuery = vpQuery.eq('vertical_id', vertical)
    const { data: vendor, error: vpError } = await vpQuery.single()

    if (vpError || !vendor) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    const { isEventEnabled } = await import('@/lib/vertical')
    if (!isEventEnabled(vendor.vertical_id)) {
      throw traced.validation('ERR_VALIDATION_001', 'Event readiness is not available for this vertical')
    }

    const existingProfileData = (vendor.profile_data as Record<string, unknown>) || {}
    const existingReadiness = (existingProfileData.event_readiness as Record<string, unknown>) || {}
    const existingStatus = existingReadiness.application_status as string | undefined

    // Determine if this is a first-time submission
    const isFirstSubmission = !existingStatus || existingStatus === 'not_applied'

    // Build the event_readiness object
    const eventReadiness = {
      ...validation.sanitized,
      application_status: isFirstSubmission ? 'pending_review' : existingStatus,
      submitted_at: isFirstSubmission ? new Date().toISOString() : (existingReadiness.submitted_at || new Date().toISOString()),
      updated_at: new Date().toISOString(),
    }

    // Merge into profile_data preserving other keys
    const updatedProfileData = {
      ...existingProfileData,
      event_readiness: eventReadiness,
    }

    // Update vendor profile
    crumb.supabase('update', 'vendor_profiles')
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({
        profile_data: updatedProfileData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendor.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_profiles', operation: 'update' })
    }

    // Notify on first submission only
    if (isFirstSubmission) {
      const vendorName = (existingProfileData.business_name as string) || (existingProfileData.farm_name as string) || 'A vendor'

      // Send confirmation to the vendor
      await sendNotification(
        user.id,
        'vendor_event_application_received',
        { vendorName },
        { vertical: vendor.vertical_id }
      )

      // Notify admin(s) to review
      const serviceClient = createServiceClient()
      const { data: admins } = await serviceClient
        .from('user_profiles')
        .select('user_id')
        .or('role.eq.admin,role.eq.platform_admin')
      if (admins && admins.length > 0) {
        await Promise.all(
          admins.map((admin) =>
            sendNotification(admin.user_id, 'vendor_event_application_submitted', {
              vendorName,
              vendorId: vendor.id,
            }, { vertical: vendor.vertical_id })
          )
        )
      }
    }

    return NextResponse.json({
      success: true,
      application_status: eventReadiness.application_status,
    })
  })
}
