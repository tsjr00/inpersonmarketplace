import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Vendor bundle consent (mig 244) — the GLOBAL opt-out toggle.
 *
 * Locked decision: vendors are IN by default (they sell at full listed price
 * and get paid exactly as on a plain order); consent is a global per-vendor
 * setting, not per item. Opting out takes effect everywhere at once:
 * composition (validateBundleComponents), approval (re-check), and checkout
 * (expansion block) all read vendor_profiles.bundles_opt_out.
 *
 * GET ?vendor_id — { optOut }
 * PUT { vendor_id, optOut } — set it
 */

async function resolveVendor(vendorId: string | null) {
  if (!vendorId) {
    return { error: NextResponse.json({ error: 'vendor_id is required' }, { status: 400 }) }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: vendorProfile } = await observed(supabase
    .from('vendor_profiles')
    .select('id, user_id, bundles_opt_out')
    .eq('id', vendorId)
    .single(), { table: 'vendor_profiles' })
  if (!vendorProfile || vendorProfile.user_id !== user.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }
  return { vendorProfile }
}

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/bundle-consent', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`bundle-consent:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const resolved = await resolveVendor(request.nextUrl.searchParams.get('vendor_id'))
    if ('error' in resolved) return resolved.error

    return NextResponse.json({ optOut: !!resolved.vendorProfile.bundles_opt_out })
  })
}

export async function PUT(request: NextRequest) {
  return withErrorTracing('/api/vendor/bundle-consent', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`bundle-consent:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const body = await request.json().catch(() => ({})) as { vendor_id?: string; optOut?: boolean }
    const resolved = await resolveVendor(body.vendor_id ?? null)
    if ('error' in resolved) return resolved.error
    if (typeof body.optOut !== 'boolean') {
      return NextResponse.json({ error: 'optOut must be true or false' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { error: updateErr } = await serviceClient
      .from('vendor_profiles')
      .update({ bundles_opt_out: body.optOut })
      .eq('id', resolved.vendorProfile.id)
    if (updateErr) {
      return NextResponse.json({ error: 'Could not save — please retry.' }, { status: 500 })
    }

    return NextResponse.json({ optOut: body.optOut })
  })
}
