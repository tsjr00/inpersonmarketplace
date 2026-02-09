import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

export async function GET() {
  return withErrorTracing('/api/buyer/subscription/status', 'GET', async () => {
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, buyer_tier, subscription_status, subscription_cycle, tier_expires_at')
      .eq('user_id', user.id)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      tier: userProfile.buyer_tier || 'standard',
      subscriptionStatus: userProfile.subscription_status,
      subscriptionCycle: userProfile.subscription_cycle,
      expiresAt: userProfile.tier_expires_at,
    })
  })
}
