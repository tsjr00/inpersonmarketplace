import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST - Invite vendors to a catering event
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/admin/events/[id]/invite',
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

      const { data: userProfile } = await observed(supabase
        .from('user_profiles')
        .select('role, roles')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single(), { table: 'user_profiles' })

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

      // S4-2: scope to the event's vertical (platform admin any; vertical admin own).
      const scope = await verifyAdminScope(cateringReq.vertical_id as string)
      if (!scope?.authorized) {
        return NextResponse.json({ error: "Not authorized for this event's vertical" }, { status: 403 })
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

      // Get vendor profiles — only event-approved vendors can be invited.
      // T-79: fetch WITHOUT the event_approved filter so a rejection can name
      // the reason (the old query made non-approved selections indistinguishable
      // from unknown ids — admins got a generic "No valid vendors found").
      const { data: requestedVendors, error: vendorError } = await serviceClient
        .from('vendor_profiles')
        .select('id, user_id, profile_data, event_approved')
        .in('id', vendor_ids)

      if (vendorError || !requestedVendors || requestedVendors.length === 0) {
        return NextResponse.json(
          { error: 'No valid vendors found' },
          { status: 400 }
        )
      }

      const vendors = requestedVendors.filter((v) => v.event_approved)
      const notApprovedCount = requestedVendors.length - vendors.length

      if (vendors.length === 0) {
        return NextResponse.json(
          {
            error:
              notApprovedCount === 1
                ? 'The selected vendor is not approved for events. Approve them for events first (Admin → Vendors).'
                : `None of the ${notApprovedCount} selected vendors are approved for events. Approve them for events first (Admin → Vendors).`,
          },
          { status: 400 }
        )
      }

      // Check for existing invitations to avoid duplicates
      const { data: existingVendors } = await observed(serviceClient
        .from('market_vendors')
        .select('vendor_profile_id')
        .eq('market_id', cateringReq.market_id)
        .in(
          'vendor_profile_id',
          vendors.map((v) => v.id)
        ), { table: 'market_vendors' })

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
            // Privacy: vendor sees 'Private Event', not organizer identity
            companyName: 'Private Event',
            headcount: cateringReq.headcount,
            eventDate,
            eventAddress: `${cateringReq.city}, ${cateringReq.state}`,
            // marketId required by notification actionUrl (Session 78 P1 fix —
            // sibling callers in event-actions.ts:374, events/[token]/select:288,
            // and vendor/events/[marketId]/cancel:253 all pass this; this admin
            // manual-invite path was the missed caller. Without it, the in-app
            // notification's "View Event" link goes to /vendor/events/undefined.)
            marketId: cateringReq.market_id,
          },
          { vertical: cateringReq.vertical_id }
        )
      }

      return NextResponse.json({
        ok: true,
        invited: newVendors.length,
        skipped: vendors.length - newVendors.length,
        // T-79: a mixed selection used to drop non-approved vendors silently.
        skipped_not_approved: notApprovedCount,
      })
    }
  )
}
