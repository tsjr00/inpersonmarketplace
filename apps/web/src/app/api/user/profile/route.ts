import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'

export async function PATCH(request: Request) {
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

    // Update user_profiles
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Profile update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If sms_consent is being toggled, update notification_preferences
    if (sms_consent !== undefined) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('notification_preferences')
        .eq('user_id', user.id)
        .single()

      const currentPrefs = (profile?.notification_preferences as Record<string, unknown>) || {}
      const updatedPrefs = {
        ...currentPrefs,
        sms_order_updates: Boolean(sms_consent),
        sms_consent_at: sms_consent ? new Date().toISOString() : null,
      }

      const { error: prefsError } = await supabase
        .from('user_profiles')
        .update({ notification_preferences: updatedPrefs })
        .eq('user_id', user.id)

      if (prefsError) {
        console.error('SMS consent update error:', prefsError)
        // Non-fatal — profile was already saved
      }
    }

    return NextResponse.json({ success: true })
  })
}
