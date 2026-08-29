import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

/**
 * POST /api/vendor/onboarding/acknowledge-pickup-line?vertical=…
 *
 * Records that the vendor understands the model and agrees to run a SEPARATE
 * pickup line for in-app orders, marked with the branded sign (owner,
 * 2026-08-28): in-app buyers order ahead and pick a pickup time so they do NOT
 * stand in the walk-up line. If vendors make app customers queue anyway,
 * buyers order less. Stored on profile_data (no schema change), read by the
 * onboarding status route; gates "submit for approval" for new vendors and
 * shows a dashboard reminder to established ones until acknowledged.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`onboarding:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/vendor/onboarding/acknowledge-pickup-line', 'POST', async () => {
    const supabase = await createClient()
    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const vertical = request.nextUrl.searchParams.get('vertical')
    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendor, error: vpError } = await getVendorProfileForVertical<{
      id: string
      profile_data: Record<string, unknown> | null
    }>(supabase, user.id, vertical, 'id, profile_data')
    if (vpError || !vendor) {
      throw traced.notFound('ERR_VENDOR_001', vpError || 'Vendor profile not found')
    }

    const now = new Date().toISOString()
    crumb.supabase('update', 'vendor_profiles')
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({
        profile_data: { ...(vendor.profile_data ?? {}), pickup_line_acknowledged_at: now },
        updated_at: now,
      })
      .eq('id', vendor.id)
    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_profiles', operation: 'update' })
    }
    return NextResponse.json({ success: true, acknowledged_at: now })
  })
}
