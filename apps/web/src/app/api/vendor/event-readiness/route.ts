import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
    const validation = validateEventReadiness(body)
    if (!validation.valid) {
      throw traced.validation('ERR_VALIDATION_001', validation.error!)
    }

    // Get vendor profile
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendor, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, vertical_id, profile_data, business_name')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendor) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    if (vendor.vertical_id !== 'food_trucks') {
      throw traced.validation('ERR_VALIDATION_001', 'Event readiness is currently available for food truck vendors only')
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

    // Notify admin on first submission only
    if (isFirstSubmission) {
      await sendNotification(
        user.id,
        'vendor_event_application_submitted',
        {
          vendorName: vendor.business_name || 'A vendor',
          vendorId: vendor.id,
        },
        { vertical: vendor.vertical_id }
      )
    }

    return NextResponse.json({
      success: true,
      application_status: eventReadiness.application_status,
    })
  })
}
