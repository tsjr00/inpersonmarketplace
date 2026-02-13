import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

// Default notification preferences
const DEFAULT_PREFERENCES = {
  email_order_updates: true,
  email_marketing: false,
  sms_order_updates: false,
  sms_marketing: false,
  push_enabled: false,
}

export async function GET() {
  return withErrorTracing('/api/user/notifications', 'GET', async () => {
    try {
      const supabase = await createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Get user profile (use * to avoid schema cache dependency on new columns)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      // Return stored preferences or defaults
      const preferences = (profile as Record<string, unknown>)?.notification_preferences || DEFAULT_PREFERENCES

      return NextResponse.json({ preferences })
    } catch (error) {
      console.error('Error fetching notification preferences:', error)
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
    }
  })
}

export async function PUT(request: NextRequest) {
  return withErrorTracing('/api/user/notifications', 'PUT', async () => {
    try {
      const supabase = await createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const preferences = await request.json()

      // Validate preferences structure
      const validPreferences = {
        email_order_updates: Boolean(preferences.email_order_updates),
        email_marketing: Boolean(preferences.email_marketing),
        sms_order_updates: Boolean(preferences.sms_order_updates),
        sms_marketing: Boolean(preferences.sms_marketing),
        push_enabled: Boolean(preferences.push_enabled),
      }

      // Update user profile with notification preferences
      const { error } = await supabase
        .from('user_profiles')
        .update({ notification_preferences: validPreferences })
        .eq('user_id', user.id)

      if (error) {
        console.error('Error updating notification preferences:', error)
        return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
      }

      return NextResponse.json({ success: true, preferences: validPreferences })
    } catch (error) {
      console.error('Error updating notification preferences:', error)
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }
  })
}
