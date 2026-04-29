import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import {
  requiresDocuments,
  FOOD_TRUCK_PERMIT_REQUIREMENTS,
} from '@/lib/onboarding/category-requirements'
import type { Category } from '@/lib/constants'

/**
 * POST /api/vendor/listings/[id]/publish
 *
 * Server-side enforcement of `canPublishListings` gate before flipping a
 * listing's status from 'draft' to 'published'. Replaces the client-side
 * direct Supabase call from PublishButton (P1-7 fix) which had no gate.
 *
 * Gate criteria match `canPublishListings` in
 * `/api/vendor/onboarding/status/route.ts:220-224`:
 *   - vendor_verifications.status === 'approved'
 *   - For FT: all required permits in FOOD_TRUCK_PERMIT_REQUIREMENTS approved
 *   - For FM: all requested_categories that require docs are approved
 *   - vendor_profiles.stripe_payouts_enabled
 *   - onboarding_completed_at OR vendor_partner agreement accepted
 *
 * TODO: Extract this gate logic into a shared helper used by both this route
 * and the onboarding/status endpoint, to avoid drift between the two.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/listings/[id]/publish', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`listing-publish:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()

    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const { id: listingId } = await params

    // Fetch listing first — need vertical_id for multi-vertical vendor lookup
    crumb.supabase('select', 'listings')
    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('id, vendor_profile_id, vertical_id, status')
      .eq('id', listingId)
      .is('deleted_at', null)
      .single()

    if (listingErr || !listing) {
      throw traced.notFound('ERR_LISTING_001', 'Listing not found', { listingId })
    }

    if (listing.status === 'published') {
      return NextResponse.json({ success: true, alreadyPublished: true })
    }

    // Multi-vertical-safe vendor profile lookup
    const { profile: vendorProfile } = await getVendorProfileForVertical<{
      id: string
      vertical_id: string
      stripe_payouts_enabled: boolean | null
    }>(supabase, user.id, listing.vertical_id, 'id, vertical_id, stripe_payouts_enabled')

    if (!vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    if (listing.vendor_profile_id !== vendorProfile.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized for this listing')
    }

    // Gate check: load verification + partner agreement
    crumb.supabase('select', 'vendor_verifications')
    const { data: verification } = await supabase
      .from('vendor_verifications')
      .select('status, requested_categories, category_verifications, onboarding_completed_at')
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (!verification) {
      throw traced.validation('ERR_LISTING_GATE',
        'Your vendor account has no verification record yet. Complete onboarding before publishing.')
    }

    if (verification.status !== 'approved') {
      throw traced.validation('ERR_LISTING_GATE',
        'Your vendor account is not approved yet. Listings cannot be published until approval.')
    }

    if (!vendorProfile.stripe_payouts_enabled) {
      throw traced.validation('ERR_LISTING_GATE',
        'Connect Stripe and enable payouts before publishing listings.')
    }

    // Partner agreement (or grandfathered)
    const isGrandfathered = !!verification.onboarding_completed_at
    if (!isGrandfathered) {
      const { data: partnerAcceptance } = await supabase
        .from('user_agreement_acceptances')
        .select('id')
        .eq('user_id', user.id)
        .eq('agreement_type', 'vendor_partner')
        .limit(1)
        .maybeSingle()

      if (!partnerAcceptance) {
        throw traced.validation('ERR_LISTING_GATE',
          'Accept the partner agreement before publishing listings.')
      }
    }

    // Category authorization (allAuthorized): mirrors lines 195-210 of
    // /api/vendor/onboarding/status/route.ts.
    const isFoodTruck = vendorProfile.vertical_id === 'food_trucks'
    const categoryVerifications = (verification.category_verifications || {}) as Record<string, {
      status: string
    }>

    let allAuthorized: boolean
    if (isFoodTruck) {
      allAuthorized = FOOD_TRUCK_PERMIT_REQUIREMENTS
        .filter((p) => p.required)
        .every((p) => {
          const cv = categoryVerifications[p.docType]
          return cv && cv.status === 'approved'
        })
    } else {
      const requestedCategories = (verification.requested_categories || []) as string[]
      allAuthorized = requestedCategories.every((cat) => {
        if (!requiresDocuments(cat as Category)) return true
        const cv = categoryVerifications[cat]
        return cv && cv.status === 'approved'
      })
    }

    if (!allAuthorized) {
      throw traced.validation('ERR_LISTING_GATE',
        isFoodTruck
          ? 'One or more required permits have not been approved yet.'
          : 'Documentation for one or more of your product categories has not been approved yet.')
    }

    // All gates passed — flip listing to published
    crumb.supabase('update', 'listings')
    const { error: updateErr } = await supabase
      .from('listings')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', listingId)
      .eq('vendor_profile_id', vendorProfile.id)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'listings', operation: 'update' })
    }

    return NextResponse.json({ success: true })
  })
}
