import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, observed, logError, traced } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'
import { computeAgreementVersionFromSnapshot } from '@/lib/markets/agreement-version'
import { getTruckPlatformClauses } from '@/lib/markets/platform-agreement-clauses'

// GET /api/markets/[id]/vendors - List vendors at market
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/markets/[id]/vendors', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`market-vendors-get:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId } = await params
    const { searchParams } = new URL(request.url)

    const approved = searchParams.get('approved')

    // Build query
    let query = supabase
      .from('market_vendors')
      .select(`
        id,
        vendor_profile_id,
        approved,
        booth_number,
        notes,
        created_at,
        vendor_profiles!market_vendors_vendor_profile_id_fkey(
          id,
          profile_data,
          status,
          vertical_id
        )
      `)
      .eq('market_id', marketId)
      .order('created_at', { ascending: false })

    if (approved !== null) {
      query = query.eq('approved', approved === 'true')
    }

    const { data: marketVendors, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data
    const vendors = marketVendors?.map((mv: {
      id: string
      vendor_profile_id: string
      approved: boolean
      booth_number: string | null
      notes: string | null
      created_at: string
      vendor_profiles: {
        id: string
        profile_data: Record<string, unknown>
        status: string
        vertical_id: string
      }[]
    }) => {
      const vp = mv.vendor_profiles?.[0]
      return {
        id: mv.id,
        vendor_profile_id: mv.vendor_profile_id,
        approved: mv.approved,
        booth_number: mv.booth_number,
        notes: mv.notes,
        created_at: mv.created_at,
        business_name: vp?.profile_data?.business_name ||
                       vp?.profile_data?.farm_name ||
                       'Unknown',
        vendor_status: vp?.status,
        vertical_id: vp?.vertical_id,
      }
    })

    return NextResponse.json({ vendors }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  })
}

// POST /api/markets/[id]/vendors - Vendor applies to market
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/markets/[id]/vendors', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`market-vendors-post:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId } = await params

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { vendor_profile_id, notes, agreement_accepted, info_sharing_accepted } = body as {
      vendor_profile_id?: string
      notes?: string
      /** The vendor ticked "I agree" under the market's agreement block. */
      agreement_accepted?: boolean
      /** Opt-in: let this market's manager review the vendor's onboarding documents. */
      info_sharing_accepted?: boolean
    }

    if (!vendor_profile_id) {
      return NextResponse.json(
        { error: 'Missing required field: vendor_profile_id' },
        { status: 400 }
      )
    }

    // Owner 2026-09-18 (TR-036, option A): applying records acceptance of the
    // market's agreement, like signup and booth booking do — the block always
    // carries the platform clauses, so there is always something to accept.
    if (agreement_accepted !== true) {
      return NextResponse.json(
        { error: 'Please accept the market agreement to apply' },
        { status: 400 }
      )
    }

    // Verify the vendor profile belongs to this user
    const { data: vendorProfile, error: vendorError } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, vertical_id')
      .eq('id', vendor_profile_id)
      .is('deleted_at', null)
      .single()

    if (vendorError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // FIX 2026-09-05 (owner option A): this used to compare
    // vendor_profiles.user_id (an AUTH uid) against user_profiles.id (that
    // table's OWN generated PK — the signup trigger only sets user_id), so
    // EVERY application ever submitted 403'd here. The ownership check is
    // simply auth-uid to auth-uid.
    if (vendorProfile.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only apply with your own vendor profile' },
        { status: 403 }
      )
    }

    // Verify market exists and matches vendor vertical
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, name, vertical_id, active, manager_user_id')
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    if (!market.active) {
      return NextResponse.json(
        { error: 'Cannot apply to inactive market' },
        { status: 400 }
      )
    }

    if (market.vertical_id !== vendorProfile.vertical_id) {
      return NextResponse.json(
        { error: 'Vendor and market must be in the same vertical' },
        { status: 400 }
      )
    }

    // Check if already applied
    const { data: existing } = await observed(supabase
      .from('market_vendors')
      .select('id')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendor_profile_id)
      .single(), { table: 'market_vendors' })

    if (existing) {
      return NextResponse.json(
        { error: 'You have already applied to this market' },
        { status: 400 }
      )
    }

    // Create application
    const { data: marketVendor, error } = await supabase
      .from('market_vendors')
      .insert({
        market_id: marketId,
        vendor_profile_id,
        notes,
        approved: false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Record the agreement acceptance (+ the optional document-sharing consent)
    // in vendor_market_agreement_acceptances — the same shape the signup and
    // park-booking paths write, so the manager's "View docs" link (which looks
    // for the synthetic `_info_sharing_consent` entry in the snapshot) works for
    // vendors who joined by applying. Non-atomic with the roster insert above,
    // like the signup path: a failure here is logged, the application stands.
    try {
      const serviceClient = createServiceClient()
      const { snapshot } = await fetchMarketOptinForVendor(marketId)
      const platformClauseEntries = getTruckPlatformClauses(market.vertical_id as string).map((c) => ({
        statement_id: c.statement_id,
        category: '_platform',
        statement_text: c.text,
        placeholder_values: {},
      }))
      const finalSnapshot = [
        ...snapshot,
        ...platformClauseEntries,
        ...(info_sharing_accepted === true
          ? [{
              statement_id: '_info_sharing_consent',
              category: '_meta',
              statement_text: 'Vendor authorizes the platform to share their onboarding documentation with the market manager.',
              placeholder_values: {},
            }]
          : []),
      ]
      const { error: vmaaErr } = await serviceClient
        .from('vendor_market_agreement_acceptances')
        .insert({
          vendor_profile_id,
          market_id: marketId,
          statements_snapshot: finalSnapshot,
          agreement_version: computeAgreementVersionFromSnapshot(snapshot),
        })
      // 23505 = this vendor already accepted this exact version (e.g. re-applied
      // after a revocation) — the earlier record stands.
      if (vmaaErr && vmaaErr.code !== '23505') {
        await logError(traced.fromSupabase(vmaaErr, { table: 'vendor_market_agreement_acceptances', operation: 'insert' }))
      }
    } catch (acceptErr) {
      console.error('[markets/vendors] agreement acceptance write failed:', acceptErr instanceof Error ? acceptErr.message : 'Unknown')
    }

    // Owner option A (2026-09-05): tell the MANAGER a new application landed
    // (in-app + email) — the roster row alone waited silently for their next
    // dashboard visit. Managed markets only (unmanaged have no recipient).
    // Non-throwing: the application row is already saved.
    if (market.manager_user_id) {
      try {
        const serviceClient = createServiceClient()
        const { data: vpData } = await observed(serviceClient
          .from('vendor_profiles')
          .select('profile_data')
          .eq('id', vendor_profile_id)
          .maybeSingle(), { table: 'vendor_profiles' })
        const pd = (vpData?.profile_data ?? {}) as Record<string, unknown>
        const vendorName = (pd.business_name as string) || (pd.farm_name as string) || 'A vendor'
        let managerEmail: string | undefined
        try {
          const { data: authUser } = await serviceClient.auth.admin.getUserById(market.manager_user_id as string)
          managerEmail = authUser?.user?.email ?? undefined
        } catch { /* email channel skipped */ }
        await sendNotification(
          market.manager_user_id as string,
          'market_vendor_application',
          { vendorName, marketName: market.name as string, marketId },
          { vertical: market.vertical_id as string, ...(managerEmail ? { userEmail: managerEmail } : {}) }
        )
      } catch (notifErr) {
        console.error('[markets/vendors] application notification failed:', notifErr instanceof Error ? notifErr.message : 'Unknown')
      }
    }

    return NextResponse.json(
      { market_vendor: marketVendor, message: 'Application submitted' },
      { status: 201 }
    )
  })
}
