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
      const { response_status, listing_ids } = body as {
        response_status: string
        response_notes?: string
        listing_ids?: string[]
      }
      let response_notes = (body as { response_notes?: string }).response_notes

      if (!response_status || !['accepted', 'declined'].includes(response_status)) {
        return NextResponse.json(
          { error: 'response_status must be "accepted" or "declined"' },
          { status: 400 }
        )
      }

      // Accepting requires 4-7 catering menu items
      // Min 4: ensures meaningful menu variety for event attendees
      // Max 7: keeps service focused and prep manageable
      if (response_status === 'accepted') {
        if (!listing_ids || !Array.isArray(listing_ids) || listing_ids.length < 4) {
          return NextResponse.json(
            { error: 'Please select at least 4 menu items for this event (maximum 7)' },
            { status: 400 }
          )
        }
        if (listing_ids.length > 7) {
          return NextResponse.json(
            { error: 'Maximum 7 menu items per event' },
            { status: 400 }
          )
        }
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

      // Conflict detection: check for overlapping event commitments on the same date
      // Single-truck vendors are BLOCKED. Multi-truck vendors get a WARNING (in response notes).
      if (response_status === 'accepted') {
        // Get this event's date
        const { data: thisMarket } = await serviceClient
          .from('markets')
          .select('event_start_date, event_end_date')
          .eq('id', marketId)
          .single()

        if (thisMarket?.event_start_date) {
          // Find other events this vendor has accepted on the same date
          const { data: conflicts } = await serviceClient
            .from('market_vendors')
            .select('market_id, markets:market_id(name, event_start_date, event_end_date, market_type)')
            .eq('vendor_profile_id', vendorProfile.id)
            .eq('response_status', 'accepted')
            .neq('market_id', marketId)

          const dateConflicts = (conflicts || []).filter(c => {
            const m = c.markets as unknown as { event_start_date: string; event_end_date: string; market_type: string } | null
            if (!m || m.market_type !== 'event') return false
            // Check date overlap
            const thisStart = thisMarket.event_start_date
            const thisEnd = thisMarket.event_end_date || thisStart
            const otherStart = m.event_start_date
            const otherEnd = m.event_end_date || otherStart
            return thisStart <= otherEnd && thisEnd >= otherStart
          })

          if (dateConflicts.length > 0) {
            const isMultiTruck = (vendorProfile.profile_data as Record<string, unknown>)?.multiple_trucks === true
            const conflictNames = dateConflicts.map(c => {
              const m = c.markets as unknown as { name: string } | null
              return m?.name || 'another event'
            })

            if (!isMultiTruck) {
              // Single-truck vendor: BLOCK acceptance
              return NextResponse.json(
                { error: `Schedule conflict: you already have a commitment on this date (${conflictNames.join(', ')}). As a single-truck operator, please cancel the existing commitment first or enable "Multiple Trucks" in your profile settings.` },
                { status: 409 }
              )
            }
            // Multi-truck vendor: allow but add warning to response notes
            const conflictWarning = `[MULTI-TRUCK] Vendor has other commitments on this date: ${conflictNames.join(', ')}`
            if (response_notes) {
              response_notes = `${response_notes}\n${conflictWarning}`
            } else {
              response_notes = conflictWarning
            }
          }
        }
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

      // If accepted, save vendor's menu selections for this event
      if (response_status === 'accepted' && listing_ids && listing_ids.length > 0) {
        // Validate listings belong to this vendor and are catering-eligible
        const { data: validListings } = await serviceClient
          .from('listings')
          .select('id, listing_data')
          .eq('vendor_profile_id', vendorProfile.id)
          .eq('status', 'published')
          .in('id', listing_ids)

        const cateringEligible = (validListings || []).filter(l => {
          const data = l.listing_data as Record<string, unknown> | null
          return data?.event_menu_item === true
        })

        if (cateringEligible.length === 0) {
          return NextResponse.json(
            { error: 'None of the selected items are marked as catering eligible. Please update your listings first.' },
            { status: 400 }
          )
        }

        // Insert event vendor listings
        const { error: listingError } = await serviceClient
          .from('event_vendor_listings')
          .insert(
            cateringEligible.map(l => ({
              market_id: marketId,
              vendor_profile_id: vendorProfile.id,
              listing_id: l.id,
            }))
          )

        if (listingError) {
          console.error('[vendor/catering/respond] Listing insert error:', listingError)
          // Don't fail the response — acceptance is recorded, listings can be added later
        }
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

      // Self-service instant threshold check:
      // If enough vendors have accepted (or all have responded), send
      // organizer results email immediately instead of waiting for cron.
      if (response_status === 'accepted' && market?.catering_request_id) {
        try {
          const { data: cReq } = await serviceClient
            .from('catering_requests')
            .select('id, service_level, status, vendor_count, contact_name, contact_email, event_date, city, state, vertical_id, event_token, auto_invite_sent_at')
            .eq('id', market.catering_request_id)
            .single()

          if (cReq?.service_level === 'self_service' && cReq.status === 'approved' && cReq.auto_invite_sent_at) {
            // Count responses for this event
            const { data: allMv } = await serviceClient
              .from('market_vendors')
              .select('response_status')
              .eq('market_id', marketId)

            if (allMv) {
              const acceptedCount = allMv.filter(mv => mv.response_status === 'accepted').length
              const pendingCount = allMv.filter(mv => mv.response_status === 'invited').length
              const thresholdMet = acceptedCount >= (cReq.vendor_count || 2)
              const allResponded = pendingCount === 0 && acceptedCount > 0

              if (thresholdMet || allResponded) {
                // Build results email + send immediately (same logic as cron Phase 12)
                const { getAppUrl } = await import('@/lib/environment')
                const selectUrl = cReq.event_token
                  ? `${getAppUrl(cReq.vertical_id)}/events/${cReq.event_token}/select`
                  : null

                const isFM = cReq.vertical_id === 'farmers_market'
                const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
                const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
                const accentColor = isFM ? '#2d5016' : '#ff5757'

                const { Resend } = await import('resend')
                const resend = new Resend(process.env.RESEND_API_KEY)

                await resend.emails.send({
                  from: `${senderName} <updates@${senderDomain}>`,
                  to: cReq.contact_email,
                  subject: `${acceptedCount} food truck${acceptedCount > 1 ? 's are' : ' is'} interested in your event!`,
                  html: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
                      <h2 style="color:${accentColor};margin:0 0 8px">Your Event Results</h2>
                      <p style="color:#374151;margin:0 0 16px">Hi ${cReq.contact_name || 'there'},</p>
                      <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
                        Great news! <strong>${acceptedCount}</strong> food truck${acceptedCount > 1 ? 's have' : ' has'} expressed interest in your event on <strong>${cReq.event_date}</strong> in ${cReq.city}, ${cReq.state}.
                      </p>
                      ${selectUrl ? `
                      <div style="text-align:center;margin:0 0 24px">
                        <a href="${selectUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">
                          Select Your Trucks
                        </a>
                      </div>
                      <p style="color:#6b7280;font-size:13px;margin:0 0 16px">
                        Click above to review truck details, menus, and make your final selections.
                      </p>
                      ` : ''}
                      <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
                        Questions? Reply to this email.
                      </p>
                    </div>
                  `,
                })

                // Update status to 'ready' so organizer can select
                await serviceClient
                  .from('catering_requests')
                  .update({ status: 'ready' })
                  .eq('id', cReq.id)
                  .eq('status', 'approved') // Only if still approved (prevent double-send)
              }
            }
          }
        } catch (thresholdErr) {
          // Non-critical — cron is the fallback. Don't fail the vendor's response.
          console.error('[vendor-respond] Threshold check error:', thresholdErr)
        }
      }

      return NextResponse.json({
        ok: true,
        response_status,
      })
    }
  )
}
