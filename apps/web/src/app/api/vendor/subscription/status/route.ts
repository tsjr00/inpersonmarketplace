import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/subscription/status', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-subscription-status:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile — filter by vertical if provided
    const vertical = request.nextUrl.searchParams.get('vertical')
    let vpQuery = supabase
      .from('vendor_profiles')
      .select('id, tier, subscription_status, subscription_cycle, tier_expires_at, vertical_id')
      .eq('user_id', user.id)
    if (vertical) {
      vpQuery = vpQuery.eq('vertical_id', vertical)
    }
    const { data: vendorProfile, error: vendorError } = await vpQuery.single()

    if (vendorError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      tier: vendorProfile.tier || 'standard',
      subscriptionStatus: vendorProfile.subscription_status,
      subscriptionCycle: vendorProfile.subscription_cycle,
      expiresAt: vendorProfile.tier_expires_at,
      verticalId: vendorProfile.vertical_id || null,
    })
  })
}
