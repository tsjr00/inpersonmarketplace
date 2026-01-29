import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('id, tier, subscription_status, subscription_cycle, tier_expires_at')
    .eq('user_id', user.id)
    .single()

  if (vendorError || !vendorProfile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
  }

  return NextResponse.json({
    tier: vendorProfile.tier || 'standard',
    subscriptionStatus: vendorProfile.subscription_status,
    subscriptionCycle: vendorProfile.subscription_cycle,
    expiresAt: vendorProfile.tier_expires_at,
  })
}
