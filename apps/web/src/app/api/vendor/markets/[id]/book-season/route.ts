import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, logError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'
import { computeAgreementVersionFromSnapshot } from '@/lib/markets/agreement-version'
import { calculateBoothRentalFees } from '@/lib/pricing'
import { createSeasonBoothCheckoutSession } from '@/lib/stripe/payments'
import { getSeasonBookableWeeks } from '@/lib/markets/season-weeks'
import { createSeasonBookingGroup, SeasonWeekUnavailableError } from '@/lib/markets/season-booking'

/**
 * POST /api/vendor/markets/[id]/book-season
 *
 * Phase E — season/partial booth prepay. Books a set of weeks in ONE payment.
 *
 * Body:
 *   {
 *     season_id: "<uuid>",            // a market_seasons row at this market
 *     inventory_id: "<uuid>",         // booth size tier, must belong to market
 *     agreement_accepted: true,       // hard gate
 *     week_start_dates?: ["YYYY-MM-DD"] // partial: a subset of the season's
 *                                       // bookable weeks. Omit = whole season.
 *   }
 *
 * Flow: gates -> presale window (O6) -> enumerate bookable weeks -> agreement
 * acceptance -> book_season_atomic (all-or-nothing) -> one Stripe checkout.
 * Late buyer (within the window but after season start) gets the FULL season
 * (all weeks incl. elapsed) — getSeasonBookableWeeks enumerates the whole window.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/book-season', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-book-season:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId } = await params

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))
    const seasonId = typeof body?.season_id === 'string' ? body.season_id : ''
    const inventoryId = typeof body?.inventory_id === 'string' ? body.inventory_id : ''
    const agreementAccepted = body?.agreement_accepted === true
    const partialWeeks: string[] | null = Array.isArray(body?.week_start_dates)
      ? body.week_start_dates.filter((w: unknown): w is string => typeof w === 'string')
      : null

    if (!agreementAccepted) {
      return NextResponse.json({ error: 'agreement_accepted must be true to book', field: 'agreement_accepted' }, { status: 400 })
    }
    if (!seasonId) {
      return NextResponse.json({ error: 'season_id is required', field: 'season_id' }, { status: 400 })
    }
    if (!inventoryId) {
      return NextResponse.json({ error: 'inventory_id is required', field: 'inventory_id' }, { status: 400 })
    }

    // --- Market + Stripe-readiness gate (mirrors the one-off booth route). ---
    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .select('id, vertical_id, timezone, name, stripe_account_id, stripe_charges_enabled')
      .eq('id', marketId)
      .maybeSingle()
    if (marketErr) throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    if (market.stripe_charges_enabled !== true) {
      return NextResponse.json({
        error: `${(market.name as string) || 'This market'} isn't set up for online booth rentals yet — the manager hasn't finished their payment setup.`,
      }, { status: 409 })
    }

    const { profile, error: profErr } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, market.vertical_id as string, 'id'
    )
    if (profErr || !profile) {
      return NextResponse.json({ error: profErr || "Vendor profile not found for this market's vertical" }, { status: 404 })
    }

    const serviceClient = createServiceClient()

    // --- Season + presale-window gate (O6). ---
    crumb.supabase('select', 'market_seasons')
    const { data: season, error: seasonErr } = await serviceClient
      .from('market_seasons')
      .select('id, market_id, name, start_date, end_date, prepay_open, prepay_closes_at')
      .eq('id', seasonId)
      .maybeSingle()
    if (seasonErr) throw traced.fromSupabase(seasonErr, { table: 'market_seasons', operation: 'select' })
    if (!season || season.market_id !== marketId) {
      return NextResponse.json({ error: 'Season not found for this market', field: 'season_id' }, { status: 404 })
    }
    if (season.prepay_open !== true) {
      return NextResponse.json({ error: 'Pre-season booking is not open for this season.' }, { status: 409 })
    }
    if (season.prepay_closes_at && new Date() > new Date(season.prepay_closes_at as string)) {
      return NextResponse.json({ error: 'The pre-season booking window for this season has closed.' }, { status: 409 })
    }

    // --- Inventory tier exists + belongs to this market. ---
    crumb.supabase('select', 'market_booth_inventory')
    const { data: inventory, error: invErr } = await serviceClient
      .from('market_booth_inventory')
      .select('id, market_id, size_label')
      .eq('id', inventoryId)
      .maybeSingle()
    if (invErr) throw traced.fromSupabase(invErr, { table: 'market_booth_inventory', operation: 'select' })
    if (!inventory) return NextResponse.json({ error: 'Booth size tier not found', field: 'inventory_id' }, { status: 404 })
    if (inventory.market_id !== marketId) {
      return NextResponse.json({ error: 'Booth size tier does not belong to this market', field: 'inventory_id' }, { status: 400 })
    }

    // --- Enumerate the season's bookable weeks; resolve season vs partial. ---
    const bookable = await getSeasonBookableWeeks(
      serviceClient, marketId, season.start_date as string, season.end_date as string
    )
    const bookableSet = new Set(bookable.map((w) => w.weekStartDate))

    let weekStartDates: string[]
    let kind: 'season' | 'partial'
    if (partialWeeks && partialWeeks.length > 0) {
      const invalid = partialWeeks.filter((w) => !bookableSet.has(w))
      if (invalid.length > 0) {
        return NextResponse.json({
          error: `These weeks aren't available in this season: ${invalid.join(', ')}. Pick from the season's open weeks.`,
          field: 'week_start_dates',
        }, { status: 400 })
      }
      weekStartDates = partialWeeks
      kind = 'partial'
    } else {
      weekStartDates = bookable.map((w) => w.weekStartDate)
      kind = 'season'
    }
    if (weekStartDates.length === 0) {
      return NextResponse.json({ error: 'This season has no bookable weeks.', field: 'season_id' }, { status: 400 })
    }

    // --- Agreement acceptance (mirrors the one-off route). ---
    const { snapshot } = await fetchMarketOptinForVendor(marketId)
    const agreementVersion = computeAgreementVersionFromSnapshot(snapshot)

    crumb.supabase('insert', 'vendor_market_agreement_acceptances')
    let acceptanceId: string
    const { data: insertedAcceptance, error: vmaaErr } = await serviceClient
      .from('vendor_market_agreement_acceptances')
      .insert({ vendor_profile_id: profile.id, market_id: marketId, statements_snapshot: snapshot, agreement_version: agreementVersion })
      .select('id')
      .single()
    if (vmaaErr) {
      if (vmaaErr.code === '23505') {
        const { data: existing, error: fetchErr } = await serviceClient
          .from('vendor_market_agreement_acceptances')
          .select('id')
          .eq('vendor_profile_id', profile.id)
          .eq('market_id', marketId)
          .eq('agreement_version', agreementVersion)
          .maybeSingle()
        if (fetchErr || !existing) {
          throw traced.fromSupabase(fetchErr || new Error('Could not locate prior acceptance row'), { table: 'vendor_market_agreement_acceptances', operation: 'select' })
        }
        acceptanceId = existing.id as string
      } else {
        throw traced.fromSupabase(vmaaErr, { table: 'vendor_market_agreement_acceptances', operation: 'insert' })
      }
    } else {
      acceptanceId = insertedAcceptance.id as string
    }

    // purchase_date = today in market timezone (late-buyer settlement cutoff).
    const tz = (market.timezone as string | null) || 'America/Chicago'
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    const pad = (n: number) => String(n).padStart(2, '0')
    const purchaseDate = `${localNow.getFullYear()}-${pad(localNow.getMonth() + 1)}-${pad(localNow.getDate())}`

    // --- Atomic group + child rentals (all-or-nothing via book_season_atomic). ---
    let booking
    try {
      booking = await createSeasonBookingGroup(serviceClient, {
        vendorProfileId: profile.id,
        marketId,
        inventoryId,
        acceptanceId,
        seasonId: season.id as string,
        kind,
        weekStartDates,
        purchaseDate,
      })
    } catch (err) {
      if (err instanceof SeasonWeekUnavailableError) {
        return NextResponse.json({
          error: `Week of ${err.week} is no longer available — adjust your selection and try again.`,
          field: 'week_start_dates',
        }, { status: 409 })
      }
      throw err
    }

    // --- One Stripe checkout for the whole group. ---
    let checkoutUrl: string | null = null
    try {
      const lineItems = booking.children.map((c) => ({
        weekStartDate: c.weekStartDate,
        vendorPaysCents: calculateBoothRentalFees(c.priceCents).vendorPaysCents,
      }))
      const baseUrl = request.nextUrl.origin
      const vertical = (market.vertical_id as string) || 'farmers_market'
      const successUrl = `${baseUrl}/${vertical}/vendor/bookings?session=success&group=${booking.groupId}`
      const cancelUrl = `${baseUrl}/${vertical}/vendor/bookings?session=cancel`

      const session = await createSeasonBoothCheckoutSession({
        groupId: booking.groupId,
        marketId,
        marketName: (market.name as string) || 'this market',
        managerStripeAccountId: market.stripe_account_id as string,
        weeks: lineItems,
        managerReceivesTotalCents: booking.totalManagerCents,
        successUrl,
        cancelUrl,
        vertical,
      })

      checkoutUrl = session.url

      crumb.supabase('update', 'booth_booking_groups')
      const { error: sidErr } = await serviceClient
        .from('booth_booking_groups')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', booking.groupId)
      if (sidErr) logError(traced.fromSupabase(sidErr, { table: 'booth_booking_groups', operation: 'update' }))
    } catch (stripeError) {
      // Clean up so the vendor can retry: delete the children then the group
      // (group_id is ON DELETE SET NULL, so the group must go after the children
      // to avoid orphaning them as one-offs).
      console.error('[book-season] Stripe session creation failed:', stripeError)
      await serviceClient.from('weekly_booth_rentals').delete().eq('group_id', booking.groupId).eq('status', 'pending_payment')
      await serviceClient.from('booth_booking_groups').delete().eq('id', booking.groupId).eq('status', 'pending_payment')
      return NextResponse.json({
        error: 'Could not start the payment flow. Please try again in a few minutes, or reach out to the market manager.',
      }, { status: 502 })
    }

    return NextResponse.json({
      group_id: booking.groupId,
      kind,
      week_count: booking.children.length,
      total_vendor_cents: booking.totalVendorCents,
      ...(checkoutUrl ? { checkout_url: checkoutUrl } : {}),
    })
  })
}
