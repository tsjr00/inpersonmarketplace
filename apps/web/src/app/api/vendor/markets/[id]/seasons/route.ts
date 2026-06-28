import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced } from '@/lib/errors'
import { getSeasonBookableWeeks } from '@/lib/markets/season-weeks'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

/**
 * GET /api/vendor/markets/[id]/seasons
 *
 * Phase E — vendor-facing list of OPEN pre-sale seasons at a market, plus the
 * booth size tiers, so the season picker can render options + compute totals
 * client-side (per-week price = calculateBoothRentalFees(tier.weekly_price_cents)).
 * Returns each season's bookable Sunday-weeks (week-grain). Booking + validation
 * happen in POST /book-season.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorTracing('/api/vendor/markets/[id]/seasons', 'GET', async () => {
    const { id: marketId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const service = createServiceClient()

    const { data: market } = await service
      .from('markets')
      .select('id, vertical_id, stripe_charges_enabled')
      .eq('id', marketId)
      .maybeSingle()
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    // Booth rentals are Stripe-only — no point showing seasons if the manager
    // can't take payment yet.
    if (market.stripe_charges_enabled !== true) {
      return NextResponse.json({ seasons: [], inventory: [], stripeReady: false })
    }

    const nowIso = new Date().toISOString()
    const { data: openSeasons, error: seasonErr } = await service
      .from('market_seasons')
      .select('id, name, start_date, end_date, prepay_closes_at')
      .eq('market_id', marketId)
      .eq('prepay_open', true)
      .order('start_date', { ascending: true })
    if (seasonErr) throw traced.fromSupabase(seasonErr, { table: 'market_seasons', operation: 'select' })

    // Filter out any whose window has closed (defense-in-depth alongside the
    // manager close action), then enumerate each season's bookable weeks.
    const seasons = await Promise.all(
      (openSeasons ?? [])
        .filter((s) => !s.prepay_closes_at || (s.prepay_closes_at as string) > nowIso)
        .map(async (s) => {
          const weeks = await getSeasonBookableWeeks(service, marketId, s.start_date as string, s.end_date as string)
          return {
            id: s.id,
            name: s.name,
            start_date: s.start_date,
            end_date: s.end_date,
            prepay_closes_at: s.prepay_closes_at,
            weekStartDates: weeks.map((w) => w.weekStartDate),
            weekCount: weeks.length,
          }
        })
    )

    const { data: inventory, error: invErr } = await service
      .from('market_booth_inventory')
      .select('id, size_label, dimensions, weekly_price_cents')
      .eq('market_id', marketId)
      .order('weekly_price_cents', { ascending: true })
    if (invErr) throw traced.fromSupabase(invErr, { table: 'market_booth_inventory', operation: 'select' })

    // Vendor's booth-credit balance at this market (auto-applied at checkout).
    let creditBalanceCents = 0
    const { profile } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, market.vertical_id as string, 'id'
    )
    if (profile) {
      const { data: creditRows } = await service
        .from('booth_credits')
        .select('amount_cents')
        .eq('vendor_profile_id', profile.id)
        .eq('market_id', marketId)
      creditBalanceCents = (creditRows ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0)
    }

    return NextResponse.json({ seasons, inventory: inventory ?? [], stripeReady: true, creditBalanceCents })
  })
}
