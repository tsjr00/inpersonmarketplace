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
    const { display_name } = body

    // Validate display_name
    if (typeof display_name !== 'string') {
      return NextResponse.json({ error: 'Invalid display name' }, { status: 400 })
    }

    // Update user_profiles
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        display_name: display_name.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Profile update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
