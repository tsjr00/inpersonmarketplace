import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'

export async function PATCH(request: NextRequest) {
  return withErrorTracing('/api/user/profile', 'PATCH', async () => {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { display_name, phone, sms_consent } = body

    // Build update object — only include fields that were sent
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    // Validate and set display_name if provided
    if (display_name !== undefined) {
      if (typeof display_name !== 'string') {
        return NextResponse.json({ error: 'Invalid display name' }, { status: 400 })
      }
      const trimmedName = display_name.trim()
      if (trimmedName.length < 2) {
        return NextResponse.json({ error: 'Display name must be at least 2 characters' }, { status: 400 })
      }
      if (trimmedName.length > 50) {
        return NextResponse.json({ error: 'Display name must be 50 characters or less' }, { status: 400 })
      }
      updates.display_name = trimmedName
    }

    // Validate and set phone if provided
    if (phone !== undefined) {
      if (phone === null || phone === '') {
        // Clearing phone number
        updates.phone = null
      } else {
        if (typeof phone !== 'string') {
          return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
        }
        // Strip to digits only for validation, store formatted
        const digitsOnly = phone.replace(/\D/g, '')
        if (digitsOnly.length < 10 || digitsOnly.length > 11) {
          return NextResponse.json({ error: 'Phone number must be 10-11 digits' }, { status: 400 })
        }
        updates.phone = phone.trim()
      }
    }

    // If sms_consent is being toggled, merge it into notification_preferences
    // in the SAME update (avoids race conditions with two sequential writes)
    if (sms_consent !== undefined) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      const currentPrefs = ((profile as Record<string, unknown>)?.notification_preferences as Record<string, unknown>) || {}
      updates.notification_preferences = {
        ...currentPrefs,
        sms_order_updates: Boolean(sms_consent),
        sms_consent_at: sms_consent ? new Date().toISOString() : null,
      }
    }

    // Single atomic update for all fields (phone, display_name, notification_preferences)
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Profile update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
