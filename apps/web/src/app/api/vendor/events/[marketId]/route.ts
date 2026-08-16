import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { maskedEventName } from '@/lib/events/event-name'
import { calculateBoothRentalFees } from '@/lib/pricing'

interface RouteContext {
  params: Promise<{ marketId: string }>
}

// GET - Vendor views catering event details for a market they're invited to
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/vendor/events/[marketId]',
    'GET',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(
        `vendor:${clientIp}`,
        rateLimits.admin
      )
      if (!rateLimitResult.success) {
        return rateLimitResponse(rateLimitResult)
      }

      const supabase = await createClient()

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { marketId } = await context.params
      const serviceClient = createServiceClient()

      // Look up the market's vertical to scope the vendor profile query
      const { data: marketInfo } = await serviceClient
        .from('markets')
        .select('vertical_id')
        .eq('id', marketId)
        .single()

      if (!marketInfo) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      // Get vendor profile for this user IN this vertical
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id, profile_data')
        .eq('user_id', user.id)
        .eq('vertical_id', marketInfo.vertical_id)
        .single()

      if (!vendorProfile) {
        return NextResponse.json(
          { error: 'Vendor profile not found for this vertical' },
          { status: 404 }
        )
      }

      // Verify vendor is invited to this market
      const { data: marketVendor } = await serviceClient
        .from('market_vendors')
        .select('response_status, response_notes, invited_at, event_max_orders_total, event_max_orders_per_wave, organizer_selected_at, is_backup, standby_opted_in_at')
        .eq('market_id', marketId)
        .eq('vendor_profile_id', vendorProfile.id)
        .single()

      if (!marketVendor) {
        return NextResponse.json(
          { error: 'You have not been invited to this event' },
          { status: 404 }
        )
      }

      // Fetch market + catering request details
      const { data: market } = await serviceClient
        .from('markets')
        .select(
          'id, name, address, city, state, zip, headcount, catering_request_id, event_start_date, event_end_date'
        )
        .eq('id', marketId)
        .single()

      if (!market) {
        return NextResponse.json(
          { error: 'Event not found' },
          { status: 404 }
        )
      }

      // Fetch catering request for additional details
      let cateringDetails = {
        company_name: '',
        cuisine_preferences: null as string | null,
        dietary_notes: null as string | null,
        setup_instructions: null as string | null,
        vendor_count: 2,
        event_start_time: null as string | null,
        event_end_time: null as string | null,
        event_type: null as string | null,
        payment_model: null as string | null,
        is_ticketed: false,
        children_present: false,
        is_themed: false,
        theme_description: null as string | null,
        has_competing_vendors: false,
        vendor_stay_policy: null as string | null,
        event_vendor_fee_cents: null as number | null,
        background_check_required: null as boolean | null,
        background_check_details: null as string | null,
      }

      if (market.catering_request_id) {
        const { data: cReq } = await serviceClient
          .from('catering_requests')
          .select(
            'company_name, cuisine_preferences, dietary_notes, setup_instructions, vendor_count, event_start_time, event_end_time, event_type, payment_model, is_ticketed, children_present, is_themed, theme_description, has_competing_vendors, vendor_stay_policy, event_vendor_fee_cents, background_check_required, background_check_details'
          )
          .eq('id', market.catering_request_id)
          .single()

        if (cReq) {
          cateringDetails = {
            company_name: cReq.company_name as string,
            cuisine_preferences: cReq.cuisine_preferences as string | null,
            dietary_notes: cReq.dietary_notes as string | null,
            setup_instructions: cReq.setup_instructions as string | null,
            vendor_count: (cReq.vendor_count as number) || 2,
            event_start_time: cReq.event_start_time as string | null,
            event_end_time: cReq.event_end_time as string | null,
            event_type: cReq.event_type as string | null,
            payment_model: cReq.payment_model as string | null,
            is_ticketed: !!(cReq.is_ticketed),
            children_present: !!(cReq.children_present),
            is_themed: !!(cReq.is_themed),
            theme_description: cReq.theme_description as string | null,
            has_competing_vendors: !!(cReq.has_competing_vendors),
            vendor_stay_policy: (cReq.vendor_stay_policy as string) || null,
            event_vendor_fee_cents: (cReq.event_vendor_fee_cents as number | null) || null,
            background_check_required: (cReq.background_check_required as boolean | null) ?? null,
            background_check_details: (cReq.background_check_details as string | null) || null,
          }
        }
      }

      // Count accepted vendors
      const { count: acceptedCount } = await serviceClient
        .from('market_vendors')
        .select('id', { count: 'exact', head: true })
        .eq('market_id', marketId)
        .eq('response_status', 'accepted')

      // Organizer identity protection: vendors never see company_name or contact info.
      // Full address is only revealed after the vendor has accepted the invitation.
      // Before acceptance, vendors see only city + state (enough to decide if location works).
      // @paired-rule organizer-identity — every vendor-facing surface must
      // mask identity (name, address) until acceptance. See lib/paired-rules.ts.
      const hasAccepted = marketVendor.response_status === 'accepted'

      // Event Vendor Fee (V1 2026-08-14): disclosed in the invitation BEFORE
      // acceptance (decision 2) — the fee is part of what the vendor agrees
      // to, so it is deliberately NOT behind the hasAccepted mask. What the
      // vendor actually pays is fee + buyer-side markup (decision 6).
      const feeCents = cateringDetails.event_vendor_fee_cents
      // Phase 3 (2026-08-16): 'covered' = a promoted backup whose spot the
      // defector's forfeited fee pays for — shows as settled, never as a bill.
      let feePaymentStatus: 'paid' | 'covered' | 'unpaid' | null = null
      if (feeCents && feeCents > 0) {
        const { data: feeRow } = await serviceClient
          .from('event_vendor_fee_payments')
          .select('status')
          .eq('market_id', marketId)
          .eq('vendor_profile_id', vendorProfile.id)
          .in('status', ['paid', 'covered'])
          .maybeSingle()
        feePaymentStatus = feeRow ? (feeRow.status as 'paid' | 'covered') : 'unpaid'
      }
      const feeAmounts = feeCents && feeCents > 0 ? calculateBoothRentalFees(feeCents) : null

      return NextResponse.json({
        event: {
          market_id: market.id,
          // T-75: the market's real name IS the organizer's company (built as
          // `${company_name} ${suffix}` at approval), so returning it here
          // defeated the identity protection this very block documents. Masked
          // until acceptance, same rule as the address below.
          market_name: hasAccepted ? market.name : maskedEventName(market.city, market.event_start_date),
          event_date: market.event_start_date,
          event_end_date: market.event_end_date,
          event_start_time: cateringDetails.event_start_time,
          event_end_time: cateringDetails.event_end_time,
          headcount: market.headcount || 0,
          // Full address only after acceptance — before that, city/state only
          address: hasAccepted ? market.address : null,
          city: market.city,
          state: market.state,
          zip: hasAccepted ? market.zip : null,
          // company_name intentionally omitted — vendors should not know the client identity
          // to prevent direct solicitation outside the platform
          cuisine_preferences: cateringDetails.cuisine_preferences,
          dietary_notes: cateringDetails.dietary_notes,
          // Setup instructions only after acceptance (contains venue-specific details)
          setup_instructions: hasAccepted ? cateringDetails.setup_instructions : null,
          vendor_count: cateringDetails.vendor_count,
          response_status: marketVendor.response_status,
          response_notes: marketVendor.response_notes,
          // Backup bench (mig 232): non-selected accepted vendor may opt into
          // standby — commit to being ASKED, never to going.
          is_backup: marketVendor.is_backup === true,
          standby_opted_in: marketVendor.standby_opted_in_at != null,
          accepted_count: acceptedCount || 0,
          event_type: cateringDetails.event_type,
          payment_model: cateringDetails.payment_model,
          is_ticketed: cateringDetails.is_ticketed,
          children_present: cateringDetails.children_present,
          is_themed: cateringDetails.is_themed,
          theme_description: cateringDetails.theme_description,
          has_competing_vendors: cateringDetails.has_competing_vendors,
          vendor_stay_policy: cateringDetails.vendor_stay_policy,
          // Mig 231 (owner 2026-08-15): background-check requirement + the
          // organizer's process/cost description — decision-relevant, so shown
          // PRE-acceptance (like the fee, deliberately not behind hasAccepted;
          // it names no organizer identity).
          background_check_required: cateringDetails.background_check_required,
          background_check_details: cateringDetails.background_check_details,
          // Event Vendor Fee (V1): shown pre-acceptance by design (decision 2)
          vendor_fee_cents: feeCents,
          vendor_fee_pays_cents: feeAmounts ? feeAmounts.vendorPaysCents : null,
          vendor_fee_status: feePaymentStatus,
          organizer_selected_at: marketVendor.organizer_selected_at || null,
          // Capacity data for acceptance UI
          event_max_orders_total: marketVendor.event_max_orders_total || null,
          event_max_orders_per_wave: marketVendor.event_max_orders_per_wave || null,
          profile_max_headcount_per_wave: ((vendorProfile.profile_data as Record<string, unknown>)?.event_readiness as Record<string, unknown>)?.max_headcount_per_wave as number || null,
        },
      })
    }
  )
}
