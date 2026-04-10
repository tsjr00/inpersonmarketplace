import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/subscription/status', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-subscription-status:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Multi-vertical safe vendor profile lookup via shared utility
    const vertical = request.nextUrl.searchParams.get('vertical')
    const { profile: vendorProfile, error: vendorError } = await getVendorProfileForVertical<{
      id: string
      tier: string | null
      subscription_status: string | null
      subscription_cycle: string | null
      tier_expires_at: string | null
      vertical_id: string
      trial_started_at: string | null
      trial_ends_at: string | null
      trial_grace_ends_at: string | null
    }>(supabase, user.id, vertical, 'id, tier, subscription_status, subscription_cycle, tier_expires_at, vertical_id, trial_started_at, trial_ends_at, trial_grace_ends_at')

    if (vendorError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // FT vendors default to 'free', FM vendors default to 'standard'
    const defaultTier = vendorProfile.vertical_id === 'food_trucks' ? 'free' : 'standard'

    return NextResponse.json({
      tier: vendorProfile.tier || defaultTier,
      subscriptionStatus: vendorProfile.subscription_status,
      subscriptionCycle: vendorProfile.subscription_cycle,
      expiresAt: vendorProfile.tier_expires_at,
      verticalId: vendorProfile.vertical_id || null,
      trialStartedAt: vendorProfile.trial_started_at || null,
      trialEndsAt: vendorProfile.trial_ends_at || null,
      trialGraceEndsAt: vendorProfile.trial_grace_ends_at || null,
    })
  })
}
