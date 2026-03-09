import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ marketId: string }>
}

// PATCH - Vendor accepts or declines a catering invitation
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/vendor/events/[marketId]/respond',
    'PATCH',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(
        `vendor:${clientIp}`,
        rateLimits.submit
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
      const body = await request.json()
      const { response_status, response_notes } = body

      if (!response_status || !['accepted', 'declined'].includes(response_status)) {
        return NextResponse.json(
          { error: 'response_status must be "accepted" or "declined"' },
          { status: 400 }
        )
      }

      // Get vendor profile for this user
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id, profile_data')
        .eq('user_id', user.id)
        .single()

      if (!vendorProfile) {
        return NextResponse.json(
          { error: 'Vendor profile not found' },
          { status: 404 }
        )
      }

      const serviceClient = createServiceClient()

      // Verify this vendor was invited to this market
      const { data: marketVendor, error: mvError } = await serviceClient
        .from('market_vendors')
        .select('id, response_status')
        .eq('market_id', marketId)
        .eq('vendor_profile_id', vendorProfile.id)
        .single()

      if (mvError || !marketVendor) {
        return NextResponse.json(
          { error: 'You have not been invited to this event' },
          { status: 404 }
        )
      }

      if (marketVendor.response_status !== 'invited') {
        return NextResponse.json(
          { error: 'You have already responded to this invitation' },
          { status: 400 }
        )
      }

      // Update response
      const { error: updateError } = await serviceClient
        .from('market_vendors')
        .update({
          response_status,
          response_notes: response_notes
            ? String(response_notes).slice(0, 500)
            : null,
        })
        .eq('id', marketVendor.id)

      if (updateError) {
        console.error('[vendor/catering/respond] Update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update response' },
          { status: 500 }
        )
      }

      // Get market + catering request for admin notification
      const { data: market } = await serviceClient
        .from('markets')
        .select('name, catering_request_id, vertical_id')
        .eq('id', marketId)
        .single()

      // Notify admin of vendor response
      if (market) {
        const profileData = vendorProfile.profile_data as Record<
          string,
          unknown
        >
        const vendorName =
          (profileData?.business_name as string) ||
          (profileData?.farm_name as string) ||
          'A vendor'

        // Find admin user(s) to notify
        const { data: admins } = await serviceClient
          .from('user_profiles')
          .select('user_id')
          .in('role', ['admin', 'platform_admin'])
          .is('deleted_at', null)
          .limit(5)

        if (admins) {
          for (const admin of admins) {
            await sendNotification(
              admin.user_id,
              'catering_vendor_responded',
              {
                companyName: vendorName,
                responseAction: response_status,
                eventDate: market.name,
              },
              { vertical: market.vertical_id }
            )
          }
        }
      }

      return NextResponse.json({
        ok: true,
        response_status,
      })
    }
  )
}
