import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

/**
 * POST /api/vendor/onboarding/acknowledge-prohibited-items
 *
 * Record that the vendor has acknowledged the prohibited items policy.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`onboarding:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/vendor/onboarding/acknowledge-prohibited-items', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Multi-vertical safe vendor profile lookup via shared utility
    const vertical = request.nextUrl.searchParams.get('vertical')
    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendor, error: vpError } = await getVendorProfileForVertical(
      supabase,
      user.id,
      vertical
    )

    if (vpError || !vendor) {
      throw traced.notFound('ERR_VENDOR_001', vpError || 'Vendor profile not found')
    }

    crumb.supabase('update', 'vendor_verifications')
    const { error: updateError } = await supabase
      .from('vendor_verifications')
      .update({
        prohibited_items_acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('vendor_profile_id', vendor.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_verifications', operation: 'update' })
    }

    return NextResponse.json({ success: true })
  })
}
