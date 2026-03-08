import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST - Invite vendors to a catering event
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/admin/catering/[id]/invite',
    'POST',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(
        `admin:${clientIp}`,
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

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role, roles')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      if (!hasAdminRole(userProfile || {})) {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        )
      }

      const { id } = await context.params
      const body = await request.json()
      const { vendor_ids } = body

      if (
        !vendor_ids ||
        !Array.isArray(vendor_ids) ||
        vendor_ids.length === 0
      ) {
        return NextResponse.json(
          { error: 'vendor_ids array is required' },
          { status: 400 }
        )
      }

      const serviceClient = createServiceClient()

      // Fetch catering request + linked market
      const { data: cateringReq, error: fetchError } = await serviceClient
        .from('catering_requests')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !cateringReq) {
        return NextResponse.json(
          { error: 'Catering request not found' },
          { status: 404 }
        )
      }

      if (!cateringReq.market_id) {
        return NextResponse.json(
          {
            error:
              'Request must be approved (event market created) before inviting vendors',
          },
          { status: 400 }
        )
      }

      // Get vendor profiles with user_ids for notifications
      const { data: vendors, error: vendorError } = await serviceClient
        .from('vendor_profiles')
        .select('id, user_id, profile_data')
        .in('id', vendor_ids)

      if (vendorError || !vendors || vendors.length === 0) {
        return NextResponse.json(
          { error: 'No valid vendors found' },
          { status: 400 }
        )
      }

      // Check for existing invitations to avoid duplicates
      const { data: existingVendors } = await serviceClient
        .from('market_vendors')
        .select('vendor_profile_id')
        .eq('market_id', cateringReq.market_id)
        .in(
          'vendor_profile_id',
          vendors.map((v) => v.id)
        )

      const existingIds = new Set(
        (existingVendors || []).map((ev) => ev.vendor_profile_id)
      )
      const newVendors = vendors.filter((v) => !existingIds.has(v.id))

      if (newVendors.length === 0) {
        return NextResponse.json(
          { error: 'All selected vendors are already invited' },
          { status: 400 }
        )
      }

      // Create market_vendors rows with response_status = 'invited'
      const { error: insertError } = await serviceClient
        .from('market_vendors')
        .insert(
          newVendors.map((v) => ({
            market_id: cateringReq.market_id,
            vendor_profile_id: v.id,
            response_status: 'invited',
            invited_at: new Date().toISOString(),
          }))
        )

      if (insertError) {
        console.error(
          '[admin/catering/invite] Insert error:',
          insertError
        )
        return NextResponse.json(
          { error: 'Failed to create vendor invitations' },
          { status: 500 }
        )
      }

      // Send notifications to each vendor
      const eventDate = new Date(
        cateringReq.event_date + 'T00:00:00'
      ).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })

      for (const vendor of newVendors) {
        await sendNotification(
          vendor.user_id,
          'catering_vendor_invited',
          {
            companyName: cateringReq.company_name,
            headcount: cateringReq.headcount,
            eventDate,
            eventAddress: `${cateringReq.address}, ${cateringReq.city}, ${cateringReq.state}`,
          },
          { vertical: cateringReq.vertical_id }
        )
      }

      return NextResponse.json({
        ok: true,
        invited: newVendors.length,
        skipped: vendors.length - newVendors.length,
      })
    }
  )
}
