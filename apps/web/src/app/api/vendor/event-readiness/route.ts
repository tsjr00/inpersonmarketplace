import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'

interface EventReadinessData {
  vehicle_type: 'food_truck' | 'food_trailer'
  vehicle_length_feet: number
  requires_generator: boolean
  generator_type?: 'quiet_inverter' | 'standard'
  generator_fuel?: 'propane' | 'gasoline' | 'diesel'
  max_runtime_hours: number
  strong_odors: boolean
  odor_description?: string
  food_perishability: 'immediate' | 'within_15_min' | 'can_sit_30_plus'
  packaging: string
  utensils_required: boolean
  seating_recommended: boolean
  max_headcount_per_wave: number
  has_event_experience: boolean
  event_experience_description?: string
  additional_notes?: string
}

const VALID_VEHICLE_TYPES = ['food_truck', 'food_trailer']
const VALID_GENERATOR_TYPES = ['quiet_inverter', 'standard']
const VALID_GENERATOR_FUELS = ['propane', 'gasoline', 'diesel']
const VALID_PERISHABILITY = ['immediate', 'within_15_min', 'can_sit_30_plus']

function validateEventReadiness(data: Record<string, unknown>): { valid: boolean; error?: string; sanitized?: EventReadinessData } {
  // Vehicle & Setup
  if (!data.vehicle_type || !VALID_VEHICLE_TYPES.includes(data.vehicle_type as string)) {
    return { valid: false, error: 'Vehicle type is required (food_truck or food_trailer)' }
  }
  if (typeof data.vehicle_length_feet !== 'number' || data.vehicle_length_feet < 5 || data.vehicle_length_feet > 80) {
    return { valid: false, error: 'Vehicle length must be a number between 5 and 80 feet' }
  }
  if (typeof data.requires_generator !== 'boolean') {
    return { valid: false, error: 'Requires generator must be yes or no' }
  }
  if (data.requires_generator) {
    if (!data.generator_type || !VALID_GENERATOR_TYPES.includes(data.generator_type as string)) {
      return { valid: false, error: 'Generator type is required when generator is needed' }
    }
    if (!data.generator_fuel || !VALID_GENERATOR_FUELS.includes(data.generator_fuel as string)) {
      return { valid: false, error: 'Generator fuel type is required when generator is needed' }
    }
  }
  if (typeof data.max_runtime_hours !== 'number' || data.max_runtime_hours < 1 || data.max_runtime_hours > 24) {
    return { valid: false, error: 'Max runtime must be a number between 1 and 24 hours' }
  }

  // Food Service Characteristics
  if (typeof data.strong_odors !== 'boolean') {
    return { valid: false, error: 'Strong odors must be yes or no' }
  }
  if (data.strong_odors && (!data.odor_description || (data.odor_description as string).trim() === '')) {
    return { valid: false, error: 'Please describe the cooking odors when strong odors is selected' }
  }
  if (!data.food_perishability || !VALID_PERISHABILITY.includes(data.food_perishability as string)) {
    return { valid: false, error: 'Food perishability selection is required' }
  }
  if (!data.packaging || (data.packaging as string).trim() === '') {
    return { valid: false, error: 'Packaging description is required' }
  }
  if (typeof data.utensils_required !== 'boolean') {
    return { valid: false, error: 'Utensils required must be yes or no' }
  }
  if (typeof data.seating_recommended !== 'boolean') {
    return { valid: false, error: 'Seating recommended must be yes or no' }
  }

  // Capacity & Experience
  if (typeof data.max_headcount_per_wave !== 'number' || data.max_headcount_per_wave < 5 || data.max_headcount_per_wave > 500) {
    return { valid: false, error: 'Max headcount per wave must be a number between 5 and 500' }
  }
  if (typeof data.has_event_experience !== 'boolean') {
    return { valid: false, error: 'Event experience must be yes or no' }
  }
  if (data.has_event_experience && (!data.event_experience_description || (data.event_experience_description as string).trim() === '')) {
    return { valid: false, error: 'Please describe your event experience' }
  }

  const sanitized: EventReadinessData = {
    vehicle_type: data.vehicle_type as EventReadinessData['vehicle_type'],
    vehicle_length_feet: Math.round(data.vehicle_length_feet as number),
    requires_generator: data.requires_generator as boolean,
    max_runtime_hours: Math.round(data.max_runtime_hours as number),
    strong_odors: data.strong_odors as boolean,
    food_perishability: data.food_perishability as EventReadinessData['food_perishability'],
    packaging: (data.packaging as string).trim(),
    utensils_required: data.utensils_required as boolean,
    seating_recommended: data.seating_recommended as boolean,
    max_headcount_per_wave: Math.round(data.max_headcount_per_wave as number),
    has_event_experience: data.has_event_experience as boolean,
  }

  // Conditional fields
  if (data.requires_generator) {
    sanitized.generator_type = data.generator_type as EventReadinessData['generator_type']
    sanitized.generator_fuel = data.generator_fuel as EventReadinessData['generator_fuel']
  }
  if (data.strong_odors && data.odor_description) {
    sanitized.odor_description = (data.odor_description as string).trim()
  }
  if (data.has_event_experience && data.event_experience_description) {
    sanitized.event_experience_description = (data.event_experience_description as string).trim()
  }
  if (data.additional_notes && (data.additional_notes as string).trim() !== '') {
    sanitized.additional_notes = (data.additional_notes as string).trim()
  }

  return { valid: true, sanitized }
}

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
