import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { parsePunchCard, parseSpendThreshold, PUNCH_CARD_BOUNDS, SPEND_THRESHOLD_BOUNDS } from '@/lib/loyalty/offers'
import { getTierLimits } from '@/lib/vendor-limits'

/**
 * VIP perk menu config (Phase B, mig 243 — owner D-menu 2026-09-04).
 *
 * GET  ?vendor_id&vertical            — both offers (config + enabled), + bounds
 * PUT  { vendor_id, vertical, kind, enabled, config } — upsert one perk
 *
 * Bounds are enforced HERE from lib/loyalty/offers.ts constants — an
 * out-of-bounds config can never be saved, and checkout's parsers ignore any
 * invalid row anyway (defense in depth). Vendor-funded only; VIP-only
 * eligibility lives at checkout, not here.
 */

async function resolveVendor(vendorId: string | null, vertical: string | null) {
  if (!vendorId || !vertical) {
    return { error: NextResponse.json({ error: 'vendor_id and vertical are required' }, { status: 400 }) }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: vendorProfile } = await observed(supabase
    .from('vendor_profiles')
    .select('id, user_id, tier, vertical_id')
    .eq('id', vendorId)
    .single(), { table: 'vendor_profiles' })
  if (!vendorProfile || vendorProfile.user_id !== user.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }
  return { vendorProfile }
}

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/offers', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-offers:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const searchParams = request.nextUrl.searchParams
    const resolved = await resolveVendor(searchParams.get('vendor_id'), searchParams.get('vertical'))
    if ('error' in resolved) return resolved.error

    const serviceClient = createServiceClient()
    const { data: offers } = await observed(serviceClient
      .from('vendor_offers')
      .select('id, kind, enabled, config')
      .eq('vendor_profile_id', resolved.vendorProfile.id), { table: 'vendor_offers' })

    return NextResponse.json({
      offers: offers ?? [],
      bounds: { punch: PUNCH_CARD_BOUNDS, threshold: SPEND_THRESHOLD_BOUNDS },
    })
  })
}

export async function PUT(request: NextRequest) {
  return withErrorTracing('/api/vendor/offers', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-offers:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const body = await request.json().catch(() => ({}))
    const { vendor_id, vertical, kind, enabled, config } = body as {
      vendor_id?: string; vertical?: string; kind?: string; enabled?: boolean; config?: Record<string, unknown>
    }
    const resolved = await resolveVendor(vendor_id ?? null, vertical ?? null)
    if ('error' in resolved) return resolved.error

    // Review fix F2 (2026-09-04): perks are a VIP feature — the same tier
    // that gates VIP slots gates SAVING perk config. The UI already hides the
    // card at limit 0; this closes the direct-API path (a downgraded vendor's
    // retained VIPs would otherwise still collect newly-enabled discounts).
    const vipLimit = getTierLimits(resolved.vendorProfile.tier || 'free', resolved.vendorProfile.vertical_id as string).vipCustomers
    if (vipLimit <= 0) {
      return NextResponse.json(
        { error: 'VIP perks are a Pro and Boss feature — upgrade to offer them.', code: 'ERR_VIP_TIER' },
        { status: 403 }
      )
    }

    if (kind !== 'punch_card' && kind !== 'spend_threshold') {
      return NextResponse.json({ error: 'Unknown perk kind' }, { status: 400 })
    }
    const cfg = config ?? {}
    // A perk can only be SAVED with a valid, in-bounds config — enabled or not.
    const parsed = kind === 'punch_card' ? parsePunchCard(cfg) : parseSpendThreshold(cfg)
    if (!parsed) {
      return NextResponse.json(
        { error: 'That configuration is outside the allowed ranges.', code: 'ERR_OFFER_BOUNDS' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()
    const { error: upsertError } = await serviceClient
      .from('vendor_offers')
      .upsert(
        {
          vendor_profile_id: resolved.vendorProfile.id,
          vertical_id: resolved.vendorProfile.vertical_id,
          kind,
          enabled: enabled === true,
          config: cfg,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'vendor_profile_id,kind' }
      )
    if (upsertError) {
      return NextResponse.json({ error: 'Could not save the perk' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  })
}
