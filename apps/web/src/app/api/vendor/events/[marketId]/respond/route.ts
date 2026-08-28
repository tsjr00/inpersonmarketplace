import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing, logError, TracedError } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'
import { computeAgreementVersionFromSnapshot } from '@/lib/markets/agreement-version'
import { loadVendorAvailability, describeConflict, type VendorAvailability } from '@/lib/events/availability'
import { writeEventBlackouts } from '@/lib/events/blackouts'

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
      const {
        response_status, listing_ids, event_max_orders_total, event_max_orders_per_wave, agreement_accepted,
        skip_conflicts_acknowledged, multi_truck_confirmed,
      } = body as {
        response_status: string
        response_notes?: string
        listing_ids?: string[]
        event_max_orders_total?: number
        event_max_orders_per_wave?: number
        agreement_accepted?: boolean
        /** R3-4: non-flagged vendor acknowledges skipping the conflicting location(s) */
        skip_conflicts_acknowledged?: boolean
        /** R3-4: flagged (multi-truck / multi-location) vendor confirms covering both */
        multi_truck_confirmed?: boolean
      }
      let response_notes = (body as { response_notes?: string }).response_notes

      if (!response_status || !['accepted', 'declined'].includes(response_status)) {
        return NextResponse.json(
          { error: 'response_status must be "accepted" or "declined"' },
          { status: 400 }
        )
      }

      // Look up the market's vertical to scope the vendor profile query
      const serviceClient = createServiceClient()
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
        .select('id, profile_data, vertical_id')
        .eq('user_id', user.id)
        .eq('vertical_id', marketInfo.vertical_id)
        .single()

      if (!vendorProfile) {
        return NextResponse.json(
          { error: 'Vendor profile not found for this vertical' },
          { status: 404 }
        )
      }

      // Accepting requires menu item selection
      // FT: 4-7 items (focused catering menu, manageable prep)
      // FM: 1+ items (variety is the value, different prep process)
      if (response_status === 'accepted') {
        if (!listing_ids || !Array.isArray(listing_ids) || listing_ids.length < 1) {
          return NextResponse.json(
            { error: 'Please select at least one item for this event' },
            { status: 400 }
          )
        }
        const isFT = vendorProfile.vertical_id === 'food_trucks'
        if (isFT && listing_ids.length < 4) {
          return NextResponse.json(
            { error: 'Please select at least 4 menu items for this event (maximum 7)' },
            { status: 400 }
          )
        }
        if (isFT && listing_ids.length > 7) {
          return NextResponse.json(
            { error: 'Maximum 7 menu items per event' },
            { status: 400 }
          )
        }
      }

      // Event capacity cap — required on acceptance
      if (response_status === 'accepted') {
        if (!event_max_orders_total || typeof event_max_orders_total !== 'number' || event_max_orders_total < 1) {
          return NextResponse.json(
            { error: 'Please enter your maximum order capacity for this event' },
            { status: 400 }
          )
        }
        if (event_max_orders_total > 5000) {
          return NextResponse.json(
            { error: 'Maximum order capacity cannot exceed 5000' },
            { status: 400 }
          )
        }
        const isFT = vendorProfile.vertical_id === 'food_trucks'
        if (isFT) {
          if (!event_max_orders_per_wave || typeof event_max_orders_per_wave !== 'number' || event_max_orders_per_wave < 1) {
            return NextResponse.json(
              { error: 'Please confirm your per-wave customer capacity for this event' },
              { status: 400 }
            )
          }
          if (event_max_orders_per_wave > 500) {
            return NextResponse.json(
              { error: 'Per-wave capacity cannot exceed 500' },
              { status: 400 }
            )
          }
        }
      }

      // Event agreement is a hard gate on acceptance (see the acceptance write
      // below). The vendor must explicitly agree to the organizer's statements.
      if (response_status === 'accepted' && agreement_accepted !== true) {
        return NextResponse.json(
          { error: 'You must accept the event agreement to participate' },
          { status: 400 }
        )
      }

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

      // R3-4 availability check (owner rule 2026-08-27, decisions.md "Event ↔
      // location conflicts"): the vendor cannot do this event AND another
      // scheduled location at the same time unless they have said they can
      // cover both (profile_data.multiple_trucks — FT trucks, FM "can staff
      // more than one location"). Same check the Vendor Event Page ran at
      // invitation render; it runs again here because days pass in between.
      //   flagged     → must confirm they will cover both; the organizer is told
      //   not flagged → open orders at the conflict: refused (fulfill/cancel
      //                 first, or set the profile flag); another accepted event:
      //                 refused (as before); otherwise must acknowledge skipping
      //                 the location → whole-day blackout there (mig 238) after
      //                 the acceptance is recorded, so no pre-order can land.
      let availability: VendorAvailability | null = null
      if (response_status === 'accepted') {
        availability = await loadVendorAvailability(serviceClient, vendorProfile.id, marketId)
        if (availability && availability.conflicts.length > 0) {
          const list = availability.conflicts.map(describeConflict)
          const isFT = vendorProfile.vertical_id === 'food_trucks'
          const flagLabel = isFT ? 'Multiple trucks' : 'I can staff more than one location at the same time'
          const conflictPayload = {
            conflicts: availability.conflicts,
            multi_capable: availability.multiCapable,
          }
          if (availability.multiCapable) {
            if (multi_truck_confirmed !== true) {
              return NextResponse.json(
                {
                  error: `You have another commitment during this event (${list.join('; ')}). Confirm you can cover both to accept.`,
                  code: 'ERR_CONFLICT_CONFIRM_REQUIRED',
                  ...conflictPayload,
                },
                { status: 409 }
              )
            }
            // Organizer is told (owner 2026-08-27): the note rides along in the
            // "vendor responded" notification below.
            const conflictWarning = `[MULTI-TRUCK] Vendor confirmed covering other commitments on this date: ${list.join('; ')}`
            response_notes = response_notes ? `${response_notes}\n${conflictWarning}` : conflictWarning
          } else {
            if (availability.blockedByEvent) {
              return NextResponse.json(
                {
                  error: `You already have another event during this one (${list.join('; ')}). Withdraw from it first, or turn on "${flagLabel}" in your profile if you can cover both.`,
                  code: 'ERR_CONFLICT_EVENT',
                  ...conflictPayload,
                },
                { status: 409 }
              )
            }
            if (availability.blockedByOrders) {
              return NextResponse.json(
                {
                  error: `Customers already have orders with you during this event (${list.join('; ')}). Fulfill or cancel those first — or, if you can cover both, turn on "${flagLabel}" in your profile.`,
                  code: 'ERR_CONFLICT_OPEN_ORDERS',
                  ...conflictPayload,
                },
                { status: 409 }
              )
            }
            if (skip_conflicts_acknowledged !== true) {
              return NextResponse.json(
                {
                  error: `You're scheduled elsewhere during this event (${list.join('; ')}). Our records show you operate one ${isFT ? 'truck' : 'location'} at a time, so accepting means you won't sell there that day and pre-orders there will be paused. Acknowledge to continue, or turn on "${flagLabel}" in your profile if you can cover both.`,
                  code: 'ERR_CONFLICT_ACK_REQUIRED',
                  ...conflictPayload,
                },
                { status: 409 }
              )
            }
          }
        }
      }

      // Option C: record the agreement acceptance BEFORE marking the vendor
      // accepted, so a confirmed vendor ALWAYS has a provable record of what
      // they agreed to — the two states never diverge. Hard-fail here (nothing
      // gets marked accepted) if the snapshot can't be written. A 23505 means
      // the vendor already accepted this exact version, which is success.
      // Empty snapshot (organizer selected no statements) → version 'v0:empty',
      // still recorded as an explicit acceptance.
      if (response_status === 'accepted') {
        const { snapshot } = await fetchMarketOptinForVendor(marketId)
        const agreementVersion = computeAgreementVersionFromSnapshot(snapshot)
        const { error: vmaaErr } = await serviceClient
          .from('vendor_market_agreement_acceptances')
          .insert({
            vendor_profile_id: vendorProfile.id,
            market_id: marketId,
            statements_snapshot: snapshot,
            agreement_version: agreementVersion,
          })
        if (vmaaErr && vmaaErr.code !== '23505') {
          console.error('[vendor/events/respond] agreement acceptance insert failed:', vmaaErr.message)
          return NextResponse.json(
            { error: 'Could not record your agreement acceptance. Please try again.' },
            { status: 500 }
          )
        }
      }

      // @paired-rule event-sells-on-acceptance — this response_status write is
      // the ONLY record of event attendance. Never mirror it into a
      // schedule/vms row; the SQL side (newest definer of
      // get_available_pickup_dates) sells on THIS row. See lib/paired-rules.ts.
      // Update response (include capacity caps for event acceptance)
      const updateData: Record<string, unknown> = {
        response_status,
        response_notes: response_notes
          ? String(response_notes).slice(0, 500)
          : null,
      }
      if (response_status === 'accepted' && event_max_orders_total) {
        updateData.event_max_orders_total = event_max_orders_total
        if (event_max_orders_per_wave) {
          updateData.event_max_orders_per_wave = event_max_orders_per_wave
        }
      }

      const { error: updateError } = await serviceClient
        .from('market_vendors')
        .update(updateData)
        .eq('id', marketVendor.id)

      if (updateError) {
        console.error('[vendor/catering/respond] Update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to update response' },
          { status: 500 }
        )
      }

      // R3-4: the acceptance is recorded — now pause the location(s) the vendor
      // chose to skip (whole day, mig 238) and tell a park operator whose paid
      // spot will sit empty. Notify only — the booking stays paid; releasing
      // it without credit is a separate (backlogged) path. A failed write is
      // logged, never fatal: the vendor's answer stands either way.
      if (
        response_status === 'accepted' &&
        availability &&
        !availability.multiCapable &&
        availability.conflicts.length > 0
      ) {
        const { written, error: blackoutErr } = await writeEventBlackouts(
          serviceClient,
          vendorProfile.id,
          marketId,
          availability.conflicts,
          'Chose an event over this location for the day'
        )
        if (blackoutErr) {
          await logError(new TracedError('ERR_DB_UNKNOWN', `[vendor/events/respond] blackout write failed for vendor ${vendorProfile.id} @ event ${marketId}: ${blackoutErr}`, {
            route: '/api/vendor/events/[marketId]/respond', method: 'PATCH',
          }))
        }
        const skippedPaidParks = availability.conflicts.filter(c => c.kind === 'park_booking')
        if (written > 0 && skippedPaidParks.length > 0) {
          const pd = vendorProfile.profile_data as Record<string, unknown> | null
          const truckName = (pd?.business_name as string) || (pd?.farm_name as string) || 'A food truck'
          const { data: parks } = await serviceClient
            .from('markets')
            .select('id, name, manager_user_id')
            .in('id', [...new Set(skippedPaidParks.map(c => c.marketId))])
          for (const park of parks ?? []) {
            if (!park.manager_user_id) continue
            for (const c of skippedPaidParks.filter(x => x.marketId === park.id)) {
              await sendNotification(
                park.manager_user_id as string,
                'park_spot_skipped_for_event',
                {
                  vendorName: truckName,
                  marketName: park.name as string,
                  marketId: park.id as string,
                  marketDate: c.date,
                },
                { vertical: marketInfo.vertical_id as string }
              )
            }
          }
        }
      }

      // Phase 3 (2026-08-16): a promoted backup whose spot was COVERED by a
      // defector's forfeited fee, declining the invitation, releases the
      // covered row — the forfeited pot becomes claimable by the next backup
      // (the cancel route's pot search skips pots referenced by LIVE covered
      // rows only).
      if (response_status === 'declined') {
        await serviceClient
          .from('event_vendor_fee_payments')
          .update({ status: 'released' })
          .eq('market_id', marketId)
          .eq('vendor_profile_id', vendorProfile.id)
          .eq('status', 'covered')
      }

      // EVT-9 FIX: an accept (or a decline after a prior accept) changes the
      // event's total vendor capacity — if waves were already generated,
      // recalc so capacity tracks the real vendor set (mig 191: excludes
      // backups + reopens/closes waves). RAISE (missing vendor cap) is
      // logged and non-fatal.
      const { data: respondWaves } = await serviceClient
        .from('event_waves')
        .select('id')
        .eq('market_id', marketId)
        .limit(1)
      if (respondWaves && respondWaves.length > 0) {
        const { error: recalcErr } = await serviceClient.rpc('recalculate_wave_capacity', {
          p_market_id: marketId,
        })
        if (recalcErr) {
          console.error(`[vendor/catering/respond] recalculate_wave_capacity failed for market ${marketId}:`, recalcErr.message)
        }
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

        // Also insert into listing_markets so the cart/checkout system can find these
        // listings at the event market (cart validates via listing_markets, not event_vendor_listings)
        for (const l of cateringEligible) {
          await serviceClient
            .from('listing_markets')
            .upsert(
              { listing_id: l.id, market_id: marketId },
              { onConflict: 'listing_id,market_id' }
            )
        }
      }

      // Get market + catering request for admin notification
      const { data: market } = await serviceClient
        .from('markets')
        .select('name, catering_request_id, vertical_id, event_start_date')
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
                // T-08: these were `companyName` / `eventDate`, but the
                // template reads `vendorName` / `marketName` — so every one of
                // these rendered "undefined accepted the event invitation for
                // undefined". Nothing was missing; the keys did not match.
                vendorName,
                responseAction: response_status,
                marketName: market.name,
              },
              { vertical: market.vertical_id }
            )
          }
        }

        // T-59: the ORGANIZER gets one too. Until now only admins were told
        // in-app, and the organizer waited on the results email. Owner:
        // "notifications are free and we want to use the free resource."
        //
        // Uses its own type, not catering_vendor_responded — that one is
        // audience:'admin' and links to /admin/events.
        //
        // ⚠ organizer_user_id is null until a logged-in user with the matching
        // email loads /event-manager, so an organizer who has not finished
        // signing up gets nothing here. That is why the email is not being
        // replaced.
        if (market.catering_request_id) {
          const { data: cReq } = await serviceClient
            .from('catering_requests')
            .select('id, organizer_user_id, vertical_id')
            .eq('id', market.catering_request_id)
            .single()

          if (cReq?.organizer_user_id) {
            await sendNotification(
              cReq.organizer_user_id,
              'event_vendor_responded_organizer',
              {
                vendorName,
                responseAction: response_status,
                marketName: market.name,
                // The message the vendor typed for them — stored since the
                // feature shipped and shown nowhere. Spread conditionally:
                // exactOptionalPropertyTypes forbids passing an explicit
                // `undefined` for an optional field.
                ...(response_notes?.trim() ? { responseNotes: response_notes.trim() } : {}),
                eventId: cReq.id as string,
              },
              { vertical: cReq.vertical_id || market.vertical_id }
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
                // Atomic gate: only the first concurrent request to update status sends the email
                const { data: statusUpdated } = await serviceClient
                  .from('catering_requests')
                  .update({ status: 'ready' })
                  .eq('id', cReq.id)
                  .eq('status', 'approved') // Only succeeds once — prevents duplicate emails
                  .select('id')

                // Only send email if THIS request was the one that changed the status
                if (statusUpdated && statusUpdated.length > 0) {
                  const { getAppUrl } = await import('@/lib/environment')
                  const selectUrl = cReq.event_token
                    ? `${getAppUrl(cReq.vertical_id)}/${cReq.vertical_id}/events/${cReq.event_token}/select`
                    : null

                  const isFM = cReq.vertical_id === 'farmers_market'
                  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
                  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
                  const accentColor = isFM ? '#2d5016' : '#ff5757'
                  const vendorNoun = isFM ? 'vendor' : 'food truck'
                  const vendorNounPlural = isFM ? 'vendors' : 'food trucks'

                  const { Resend } = await import('resend')
                  const resend = new Resend(process.env.RESEND_API_KEY)

                  await resend.emails.send({
                    from: `${senderName} <updates@${senderDomain}>`,
                    to: cReq.contact_email,
                    subject: `${acceptedCount} ${acceptedCount > 1 ? vendorNounPlural + ' are' : vendorNoun + ' is'} interested in your event!`,
                    html: `
                      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
                        <h2 style="color:${accentColor};margin:0 0 8px">Your Event Results</h2>
                        <p style="color:#374151;margin:0 0 16px">Hi ${cReq.contact_name || 'there'},</p>
                        <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
                          Great news! <strong>${acceptedCount}</strong> ${acceptedCount > 1 ? vendorNounPlural + ' have' : vendorNoun + ' has'} expressed interest in your event on <strong>${cReq.event_date}</strong> in ${cReq.city}, ${cReq.state}.
                        </p>
                        ${selectUrl ? `
                        <div style="text-align:center;margin:0 0 24px">
                          <a href="${selectUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">
                            Select Your ${isFM ? 'Vendors' : 'Trucks'}
                          </a>
                        </div>
                        <p style="color:#6b7280;font-size:13px;margin:0 0 16px">
                          Click above to review ${vendorNoun} details, menus, and make your final selections.
                        </p>
                        ` : ''}
                        <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
                          Questions? Reply to this email.
                        </p>
                      </div>
                    `,
                  })
                }
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
