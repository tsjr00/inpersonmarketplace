import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

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

      // Get vendor profile
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!vendorProfile) {
        return NextResponse.json(
          { error: 'Vendor profile not found' },
          { status: 404 }
        )
      }

      const serviceClient = createServiceClient()

      // Verify vendor is invited to this market
      const { data: marketVendor } = await serviceClient
        .from('market_vendors')
        .select('response_status, response_notes, invited_at')
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
      }

      if (market.catering_request_id) {
        const { data: cReq } = await serviceClient
          .from('catering_requests')
          .select(
            'company_name, cuisine_preferences, dietary_notes, setup_instructions, vendor_count, event_start_time, event_end_time'
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
      const hasAccepted = marketVendor.response_status === 'accepted'

      return NextResponse.json({
        event: {
          market_id: market.id,
          market_name: market.name,
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
          accepted_count: acceptedCount || 0,
        },
      })
    }
  )
}
