import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

/**
 * Backup-bench standby opt-in (phase 2 — owner model 2026-08-15, mig 232).
 *
 * POST   → join the standby bench for this event.
 * DELETE → leave it.
 *
 * Only a non-selected accepted vendor (is_backup = true) can stand by — the
 * bench is their opt-in AFTER non-selection (owner spec 2026-08-08/15). The
 * commitment is to being ASKED, never to going: activation may be declined
 * freely, so joining/leaving carries no consequence and needs no ceremony.
 * NO money moves here or anywhere in phases 1-2 — activation packages are
 * phase 3.
 */

interface RouteContext {
  params: Promise<{ marketId: string }>
}

async function loadStandbyContext(request: NextRequest, marketId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const serviceClient = createServiceClient()
  crumb.supabase('select', 'markets')
  const { data: market } = await serviceClient
    .from('markets')
    .select('id, vertical_id, market_type')
    .eq('id', marketId)
    .maybeSingle()

  if (!market || market.market_type !== 'event') {
    return { error: NextResponse.json({ error: 'Event not found' }, { status: 404 }) }
  }

  const { profile: vendorProfile } = await getVendorProfileForVertical(
    serviceClient,
    user.id,
    market.vertical_id as string
  )
  if (!vendorProfile) {
    return { error: NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 }) }
  }

  crumb.supabase('select', 'market_vendors')
  const { data: mv } = await serviceClient
    .from('market_vendors')
    .select('vendor_profile_id, response_status, is_backup, standby_opted_in_at')
    .eq('market_id', marketId)
    .eq('vendor_profile_id', vendorProfile.id)
    .maybeSingle()

  if (!mv || mv.response_status !== 'accepted' || mv.is_backup !== true) {
    return {
      error: NextResponse.json(
        { error: 'Standby is only available to accepted vendors who were not selected for this event.' },
        { status: 409 }
      ),
    }
  }

  return { serviceClient, vendorProfileId: vendorProfile.id as string, mv }
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/events/[marketId]/standby', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-standby:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { marketId } = await context.params
    const ctx = await loadStandbyContext(request, marketId)
    if ('error' in ctx) return ctx.error

    crumb.supabase('update', 'market_vendors')
    const { error } = await ctx.serviceClient
      .from('market_vendors')
      .update({ standby_opted_in_at: new Date().toISOString() })
      .eq('market_id', marketId)
      .eq('vendor_profile_id', ctx.vendorProfileId)

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_vendors', operation: 'update' })
    }
    return NextResponse.json({ ok: true, standby: true })
  })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/events/[marketId]/standby', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-standby:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { marketId } = await context.params
    const ctx = await loadStandbyContext(request, marketId)
    if ('error' in ctx) return ctx.error

    crumb.supabase('update', 'market_vendors')
    const { error } = await ctx.serviceClient
      .from('market_vendors')
      .update({ standby_opted_in_at: null })
      .eq('market_id', marketId)
      .eq('vendor_profile_id', ctx.vendorProfileId)

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_vendors', operation: 'update' })
    }
    return NextResponse.json({ ok: true, standby: false })
  })
}
