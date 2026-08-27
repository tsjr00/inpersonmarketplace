import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'
import { logError, TracedError } from '@/lib/errors'
import { refundEventFeePayment } from '@/lib/stripe/event-fee-payments'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications/service'
import { recommendBackupBench } from '@/lib/events/backup-bench'
import {
  calculateWaveCount,
  checkAcceptedCapacity,
  estimateOrders,
  expectedPeakOrdersPerWave,
  median,
} from '@/lib/events/demand-model'

/**
 * GET /api/events/[token]/select
 *
 * Loads event details + interested vendors for the organizer selection page.
 * Token-based access (no auth required — organizer may not have an account yet).
 * Only works for self-service events in 'ready' status (48hr threshold passed).
 *
 * POST /api/events/[token]/select
 *
 * Organizer submits their selected vendors. Triggers:
 * 1. Update selected vendors' market_vendors status
 * 2. Notify selected vendors to connect their catering menus
 * 3. Send organizer the event page link
 */

interface RouteContext {
  params: Promise<{ token: string }>
}

// GET — Load event + interested vendors for selection page
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/select', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-select:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await context.params
    const serviceClient = createServiceClient()

    // Find the catering request by token
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, company_name, contact_name, contact_email, event_date, event_start_time, event_end_time, headcount, vendor_count, expected_meal_count, cancellation_risk_factors, city, state, vertical_id, market_id, status, service_level, payment_model, event_type, is_ticketed, competing_food_options')
      .eq('event_token', token)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.service_level !== 'self_service') {
      return NextResponse.json({ error: 'This event is managed by our team' }, { status: 403 })
    }

    // Allow selection in 'approved' or 'ready' status
    if (!['approved', 'ready'].includes(event.status)) {
      return NextResponse.json({ error: 'This event is not accepting selections at this time' }, { status: 400 })
    }

    if (!event.market_id) {
      return NextResponse.json({ error: 'Event not yet set up' }, { status: 400 })
    }

    // Get accepted vendors with profile data
    const { data: marketVendors } = await serviceClient
      .from('market_vendors')
      // T-59: `response_notes` is the message the vendor typed when accepting.
      // It has been stored since the feature shipped and rendered on no
      // organizer surface at all — only the admin events page showed it. This
      // page is where the organizer chooses between vendors, so it is where
      // the message they wrote belongs.
      // T-80: is_backup + organizer_selected_at let this page tell the
      // organizer what they already confirmed instead of rendering fresh
      // "Select" buttons on a live event.
      .select('vendor_profile_id, response_status, response_notes, is_backup, organizer_selected_at, standby_opted_in_at, event_max_orders_per_wave, vendor_profiles:vendor_profile_id(id, profile_data, profile_image_url, average_rating, rating_count, tier, pickup_lead_minutes)')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    if (!marketVendors || marketVendors.length === 0) {
      return NextResponse.json({
        event: {
          id: event.id,
          event_date: event.event_date,
          headcount: event.headcount,
          vendor_count: event.vendor_count,
          city: event.city,
          state: event.state,
          status: event.status,
        },
        vendors: [],
      })
    }

    // Get catering listings for each vendor
    const vendorIds = marketVendors.map(mv => mv.vendor_profile_id)
    const { data: listings } = await serviceClient
      .from('listings')
      .select('vendor_profile_id, title, price_cents, category, listing_data')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    // Build per-vendor listing data
    const vendorListings: Record<string, Array<{ title: string; price_cents: number }>> = {}
    const vendorCategories: Record<string, string[]> = {}
    const vendorPrices: Record<string, number[]> = {}

    if (listings) {
      for (const l of listings) {
        const vid = l.vendor_profile_id as string
        const ld = l.listing_data as Record<string, unknown> | null
        const isCatering = ld?.event_menu_item === true

        if (!vendorCategories[vid]) vendorCategories[vid] = []
        if (l.category && !vendorCategories[vid].includes(l.category as string)) {
          vendorCategories[vid].push(l.category as string)
        }

        if (!vendorPrices[vid]) vendorPrices[vid] = []
        if (l.price_cents) vendorPrices[vid].push(l.price_cents as number)

        if (isCatering) {
          if (!vendorListings[vid]) vendorListings[vid] = []
          vendorListings[vid].push({
            title: l.title as string,
            price_cents: (l.price_cents || 0) as number,
          })
        }
      }
    }

    const vendors = marketVendors.map(mv => {
      const vp = mv.vendor_profiles as unknown as {
        id: string
        profile_data: Record<string, unknown>
        profile_image_url: string | null
        average_rating: number | null
        rating_count: number
        tier: string
        pickup_lead_minutes: number
      } | null

      const pd = vp?.profile_data || {}
      const vid = mv.vendor_profile_id as string
      const prices = vendorPrices[vid] || []
      const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null

      return {
        vendor_profile_id: vid,
        // T-80: previously confirmed by the organizer. organizer_selected_at
        // is the durable marker (mig 228); the ready-and-not-backup fallback
        // covers events selected before that column existed.
        selected:
          mv.organizer_selected_at != null ||
          (event.status === 'ready' && mv.is_backup !== true),
        // Backup bench (mig 232): this non-selected vendor opted into standby.
        on_standby: mv.is_backup === true && mv.standby_opted_in_at != null,
        // T-59: what the vendor wrote when they said yes.
        response_notes: (mv.response_notes as string | null) || null,
        business_name: (pd.business_name as string) || (pd.farm_name as string) || 'Vendor',
        cuisine_categories: vendorCategories[vid] || [],
        avg_price_cents: avgPrice,
        average_rating: vp?.average_rating || null,
        rating_count: vp?.rating_count || 0,
        tier: vp?.tier || 'free',
        pickup_lead_minutes: vp?.pickup_lead_minutes || 30,
        profile_image_url: vp?.profile_image_url || null,
        catering_items: vendorListings[vid] || [],
        // The vendor's per-event capacity claim (validated ≥ 1 at acceptance) —
        // the "better data" the selection-time capacity check runs on.
        event_max_orders_per_wave: (mv.event_max_orders_per_wave as number | null) ?? null,
      }
    })

    // Shared demand model (owner 2026-08-26): one estimate of orders + peak
    // wave for the bench sizing AND the selection-time capacity check.
    const waveCount = calculateWaveCount(
      event.event_start_time as string | null,
      event.event_end_time as string | null
    )
    const demand = estimateOrders({
      headcount: (event.headcount as number | null) ?? null,
      expectedMealCount: (event.expected_meal_count as number | null) ?? null,
      paymentModel: (event.payment_model as string | null) ?? null,
      eventType: (event.event_type as string | null) ?? null,
      startTime: (event.event_start_time as string | null) ?? null,
      isTicketed: event.is_ticketed === true,
      hasCompetingFood: !!(event.competing_food_options as string | null),
    })
    const peakOrdersPerWave = expectedPeakOrdersPerWave(demand.orders, waveCount)
    // Capacity check runs on the vendors the organizer has CONFIRMED; before
    // any confirmation it runs on everyone who accepted (what they could pick).
    const confirmed = vendors.filter(v => v.selected)
    const checkedVendors = confirmed.length > 0 ? confirmed : vendors
    const claimedCapacities = checkedVendors
      .map(v => v.event_max_orders_per_wave)
      .filter((n): n is number => typeof n === 'number' && n > 0)
    const acceptedCapacityPerWave = claimedCapacities.reduce((a, b) => a + b, 0)
    const capacityCheck = checkAcceptedCapacity(peakOrdersPerWave, acceptedCapacityPerWave)

    // Backup bench phase 1 (owner model 2026-08-15): the system's recommended
    // bench size — likelihood (10% base + equal risk bumps) × the SYSTEM-
    // computed vendor requirement, not the organizer's requested count. The
    // number is shown without the math (owner: tell them the number, ask if
    // it sounds right). Funding extra bench spots is phase 3.
    const medianClaim = median(claimedCapacities)
    const bench = recommendBackupBench({
      headcount: (event.headcount as number | null) ?? null,
      expectedMealCount: (event.expected_meal_count as number | null) ?? null,
      waveCount,
      riskFactorCount: Array.isArray(event.cancellation_risk_factors)
        ? event.cancellation_risk_factors.length
        : 0,
      // Owner 2026-08-26: shared demand estimate + the accepted vendors' real
      // per-event claims (median) replace the 20% / 30-per-wave placeholders
      // whenever that data exists.
      estimatedOrders: demand.orders,
      ...(medianClaim != null ? { capacityPerWave: medianClaim } : {}),
    })

    return NextResponse.json({
      event: {
        id: event.id,
        event_date: event.event_date,
        headcount: event.headcount,
        vendor_count: event.vendor_count,
        city: event.city,
        state: event.state,
        status: event.status,
      },
      vendors,
      recommended_backups: bench.recommendedBackups,
      standby_count: vendors.filter(v => v.on_standby).length,
      // Selection-time capacity check (owner 2026-08-26 #4): the confirmed
      // vendors' claimed per-wave capacity vs the expected peak wave.
      capacity_check: {
        wave_count: waveCount,
        expected_orders: demand.orders,
        expected_peak_per_wave: peakOrdersPerWave,
        accepted_capacity_per_wave: acceptedCapacityPerWave,
        vendors_checked: checkedVendors.length,
        checked_confirmed_only: confirmed.length > 0,
        ok: capacityCheck.ok,
        shortfall_per_wave: capacityCheck.shortfallPerWave,
        coverage_pct: capacityCheck.coveragePct,
      },
    })
  })
}

// POST — Organizer submits truck selections
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/select', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-select-submit:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await context.params
    const serviceClient = createServiceClient()

    const body = await request.json()
    const {
      selected_vendor_ids,
      share_contact,
      organizer_contact_name,
      organizer_contact_phone,
      organizer_contact_email,
    } = body

    if (!Array.isArray(selected_vendor_ids) || selected_vendor_ids.length === 0) {
      return NextResponse.json({ error: 'Please select at least one vendor' }, { status: 400 })
    }

    const uniqueVendorIds = [...new Set(selected_vendor_ids as string[])]

    // Find the event
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, company_name, contact_name, contact_email, event_date, headcount, vendor_count, city, state, vertical_id, market_id, event_token, status, service_level, vendor_preferences')
      .eq('event_token', token)
      .single()

    if (!event || event.service_level !== 'self_service') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (!['approved', 'ready'].includes(event.status)) {
      return NextResponse.json({ error: 'Selections are no longer being accepted' }, { status: 400 })
    }

    if (!event.market_id) {
      return NextResponse.json({ error: 'Event not set up' }, { status: 400 })
    }

    if (uniqueVendorIds.length > event.vendor_count) {
      return NextResponse.json({ error: `Maximum ${event.vendor_count} vendors allowed` }, { status: 400 })
    }

    // Verify all selected vendors are actually accepted for this event
    const { data: validVendors } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')
      .in('vendor_profile_id', uniqueVendorIds)

    if (!validVendors || validVendors.length !== uniqueVendorIds.length) {
      return NextResponse.json({ error: 'One or more selected vendors are not available' }, { status: 400 })
    }

    // T-80: capture who was ALREADY confirmed before mutating anything.
    // Re-submitting used to re-notify every vendor and re-send the organizer
    // kit — the status guard below permits 'ready', so it never blocked this.
    // Same derivation as GET: organizer_selected_at (mig 228) or, for events
    // selected before that column existed, ready-and-not-backup.
    const { data: priorRows } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id, is_backup, organizer_selected_at')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    const previouslySelected = new Set(
      (priorRows || [])
        .filter(r => r.organizer_selected_at != null || (event.status === 'ready' && r.is_backup !== true))
        .map(r => r.vendor_profile_id as string)
    )
    const isFirstConfirmation = event.status === 'approved'
    const newlySelectedIds = uniqueVendorIds.filter(id => !previouslySelected.has(id))

    // Event Vendor Fees (mig 228): stamp WHEN the organizer selected each
    // vendor — starts the 12h protected pay window (decision 4). Only stamped
    // once: re-submitting selections must not extend a vendor's protection.
    await serviceClient
      .from('market_vendors')
      .update({ organizer_selected_at: new Date().toISOString() })
      .eq('market_id', event.market_id)
      .in('vendor_profile_id', uniqueVendorIds)
      .is('organizer_selected_at', null)

    // Mark non-selected accepted vendors as 'not_selected' (they stay as backups)
    const { data: allAccepted } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    if (allAccepted) {
      const notSelectedIds = allAccepted
        .map(mv => mv.vendor_profile_id as string)
        .filter(id => !uniqueVendorIds.includes(id))

      if (notSelectedIds.length > 0) {
        // Keep as accepted but mark as backup (they can still be escalated)
        await serviceClient
          .from('market_vendors')
          .update({ is_backup: true })
          .eq('market_id', event.market_id)
          .in('vendor_profile_id', notSelectedIds)

        // Refund-matrix completion (2026-08-16): DESELECTING a vendor who
        // already settled their fee refunds them automatically — the organizer
        // took the spot back, so keeping the money was indefensible (the old
        // copy said "not automatically refunded; contact us"). Per demoted
        // vendor: paid → full refund WITH transfer reversal; covered →
        // released (no money ever moved; the forfeited pot becomes claimable
        // by the next backup); pending → released.
        const { data: demotedFeeRows } = await serviceClient
          .from('event_vendor_fee_payments')
          .select('id, vendor_profile_id, vendor_pays_cents, status, stripe_payment_intent_id, vendor_profiles:vendor_profile_id(user_id)')
          .eq('market_id', event.market_id)
          .in('vendor_profile_id', notSelectedIds)
          .in('status', ['pending_payment', 'paid', 'covered'])

        const demotedReleasable = (demotedFeeRows || []).filter(r => r.status !== 'paid')
        if (demotedReleasable.length > 0) {
          await serviceClient
            .from('event_vendor_fee_payments')
            .update({ status: 'released' })
            .in('id', demotedReleasable.map(r => r.id as string))
            .in('status', ['pending_payment', 'covered'])
        }

        for (const feeRow of (demotedFeeRows || []).filter(r => r.status === 'paid')) {
          try {
            if (!feeRow.stripe_payment_intent_id) throw new Error('paid row has no payment intent id')
            await refundEventFeePayment({
              paymentIntentId: feeRow.stripe_payment_intent_id as string,
              paymentId: feeRow.id as string,
              reason: 'organizer_deselected',
            })
            await serviceClient
              .from('event_vendor_fee_payments')
              .update({
                status: 'refunded',
                refunded_at: new Date().toISOString(),
                refund_reason: 'organizer_deselected',
              })
              .eq('id', feeRow.id)
              .eq('status', 'paid')
            const demotedUserId = (feeRow.vendor_profiles as unknown as { user_id?: string } | null)?.user_id
            if (demotedUserId) {
              const { data: feeMarketRow } = await serviceClient
                .from('markets')
                .select('name')
                .eq('id', event.market_id)
                .maybeSingle()
              await sendNotification(demotedUserId, 'event_fee_refunded_vendor', {
                marketName: (feeMarketRow?.name as string) || 'the event',
                marketId: event.market_id,
                amountCents: feeRow.vendor_pays_cents as number,
                feeRefundReason: 'deselected',
                dedupRef: `${feeRow.id}-deselected`,
              }, { vertical: event.vertical_id })
            }
          } catch (refundErr) {
            await logError(new TracedError('ERR_REFUND_001', `[events/select] Deselection refund failed for payment ${feeRow.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
              route: '/api/events/[token]/select', method: 'POST',
              amountCents: feeRow.vendor_pays_cents as number,
            }))
          }
        }

        // Backup bench phase 2 (mig 232): offer the standby bench to vendors
        // who JUST became non-selected — not on every re-submit. Opt-in only;
        // the offer promises being asked, never going.
        const previouslyBackup = new Set(
          (priorRows || []).filter(r => r.is_backup === true).map(r => r.vendor_profile_id as string)
        )
        const newlyBackup = notSelectedIds.filter(id => !previouslyBackup.has(id))
        if (newlyBackup.length > 0) {
          const [{ data: benchVendors }, { data: marketRow }] = await Promise.all([
            serviceClient
              .from('vendor_profiles')
              .select('id, user_id')
              .in('id', newlyBackup),
            serviceClient
              .from('markets')
              .select('name')
              .eq('id', event.market_id)
              .maybeSingle(),
          ])
          for (const bv of benchVendors || []) {
            if (bv.user_id) {
              await sendNotification(bv.user_id as string, 'event_standby_offer', {
                marketName: (marketRow?.name as string) || '',
                eventDate: event.event_date as string,
                marketId: event.market_id,
                dedupRef: `${event.market_id}-${bv.id}-standby-offer`,
              }, { vertical: event.vertical_id })
            }
          }
        }
      }

      // T-80: clear the flag on selected vendors — a backup promoted by a
      // selection change used to keep is_backup=true forever, wrongly
      // excluding them from wave capacity (mig 191 counts non-backups only).
      await serviceClient
        .from('market_vendors')
        .update({ is_backup: false })
        .eq('market_id', event.market_id)
        .in('vendor_profile_id', uniqueVendorIds)

      // EVT-9 FIX: backups no longer count toward wave capacity (mig 191) —
      // if waves were already generated, resize them to the selected set.
      // Runs on every submit that finds waves (T-80: promotions matter too,
      // not just demotions); the RPC is idempotent.
      const { data: selectWaves } = await serviceClient
        .from('event_waves')
        .select('id')
        .eq('market_id', event.market_id)
        .limit(1)
      if (selectWaves && selectWaves.length > 0) {
        const { error: recalcErr } = await serviceClient.rpc('recalculate_wave_capacity', {
          p_market_id: event.market_id,
        })
        if (recalcErr) {
          console.error(`[events/select] recalculate_wave_capacity failed for market ${event.market_id}:`, recalcErr.message)
        }
      }
    }

    // Update event status + store organizer contact preferences
    const updateData: Record<string, unknown> = { status: 'ready' }
    if (share_contact) {
      // Store organizer contact info in vendor_preferences JSONB for vendor access
      updateData.vendor_preferences = {
        ...(typeof event.vendor_preferences === 'object' && event.vendor_preferences ? event.vendor_preferences : {}),
        organizer_contact: {
          shared: true,
          name: organizer_contact_name || null,
          phone: organizer_contact_phone || null,
          email: organizer_contact_email || null,
        },
      }
    }
    // Atomic update — prevents double-submit from concurrent tabs
    const { data: updatedEvent } = await serviceClient
      .from('catering_requests')
      .update(updateData)
      .eq('id', event.id)
      .in('status', ['approved', 'ready'])
      .select('id')

    if (!updatedEvent || updatedEvent.length === 0) {
      return NextResponse.json({ error: 'Selections have already been submitted' }, { status: 409 })
    }

    // Notify selected vendors — prompt them to connect catering listings.
    // T-80: only vendors NEWLY selected this submit — an unchanged re-submit
    // used to send every selected vendor a duplicate confirmation.
    for (const vendorId of newlySelectedIds) {
      const { data: vp } = await serviceClient
        .from('vendor_profiles')
        .select('user_id')
        .eq('id', vendorId)
        .single()

      if (vp?.user_id) {
        await sendNotification(vp.user_id as string, 'catering_vendor_invited', {
          companyName: 'Event Confirmed',
          headcount: event.headcount,
          eventDate: event.event_date,
          eventAddress: `${event.city}, ${event.state}`,
          vertical: event.vertical_id,
          marketId: event.market_id,
        }, { vertical: event.vertical_id })
      }
    }

    // Send organizer the event page link
    const { getAppUrl } = await import('@/lib/environment')
    const eventPageUrl = `${getAppUrl(event.vertical_id)}/${event.vertical_id}/events/${event.event_token}`

    // T-80: everything from here to the stamp is first-confirmation only —
    // the organizer already has the link and marketing kit; a selection
    // change must not re-send the whole email (and needs no QR/cuisine prep).
    if (isFirstConfirmation) {

    // Generate QR code for event page URL
    let qrCodeDataUrl = ''
    try {
      const QRCode = await import('qrcode')
      qrCodeDataUrl = await QRCode.toDataURL(eventPageUrl, { width: 200, margin: 1 })
    } catch (qrErr) {
      console.error('[event-select] QR code generation failed:', qrErr)
    }

    // Get accepted vendor cuisine types for marketing copy
    const acceptedVendorData = validVendors || []
    // Build cuisine list from vendor categories (we already have this data)
    const cuisineTypes = new Set<string>()
    for (const vId of uniqueVendorIds) {
      // Quick lookup from the vendors we already fetched in GET
      const { data: vListings } = await serviceClient
        .from('listings')
        .select('category')
        .eq('vendor_profile_id', vId)
        .eq('status', 'published')
        .is('deleted_at', null)
        .limit(20)

      if (vListings) {
        for (const l of vListings) {
          if (l.category) cuisineTypes.add(l.category as string)
        }
      }
    }
    const cuisineList = Array.from(cuisineTypes).slice(0, 5).join(', ') || 'a variety of food options'

    // Send confirmation email with QR code + marketing kit
    try {
      const isFM = event.vertical_id === 'farmers_market'
      const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
      const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
      const accentColor = isFM ? '#2d5016' : '#ff5757'
      const vendorLabel = isFM ? 'vendor' : 'food truck'

      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: `${senderName} <updates@${senderDomain}>`,
        to: event.contact_email,
        subject: `Your event is confirmed — ${uniqueVendorIds.length} ${vendorLabel}${uniqueVendorIds.length > 1 ? 's' : ''} ready!`,
        html: `

          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:${accentColor};margin:0 0 8px">Your Event Is Confirmed!</h2>
            <p style="color:#374151;margin:0 0 16px">Hi ${event.contact_name || 'there'},</p>
            <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
              Your ${uniqueVendorIds.length} selected ${vendorLabel}${uniqueVendorIds.length > 1 ? 's are' : ' is'} confirmed for
              <strong>${event.event_date}</strong>. They&rsquo;re connecting their menus to your event page now.
            </p>

            <!-- Event Page Link + QR Code -->
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center">
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#374151">Share this with your guests:</p>
              ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" alt="QR Code" style="width:160px;height:160px;margin:0 auto 12px;display:block" />` : ''}
              <a href="${eventPageUrl}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:0 0 8px">
                View Event Page
              </a>
              <p style="margin:8px 0 0;font-size:12px;color:#6b7280;word-break:break-all">${eventPageUrl}</p>
            </div>

            <!-- Marketing Kit -->
            <h3 style="color:${accentColor};margin:0 0 12px;font-size:16px">Your Event Marketing Kit</h3>
            <p style="color:#6b7280;font-size:13px;margin:0 0 16px">Copy and use the text below to promote your event. The more people who pre-order, the faster the service and the better the experience for everyone.</p>

            <!-- Email Template -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px">
              <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin:0 0 8px">EMAIL TO STAFF / ATTENDEES</div>
              <div style="font-size:13px;color:#374151;line-height:1.6">
                <p style="margin:0 0 8px"><strong>Subject:</strong> Food at our upcoming event — pre-order now!</p>
                <p style="margin:0 0 8px">We&rsquo;ve arranged ${vendorLabel}s for our event on ${event.event_date} featuring ${cuisineList}.</p>
                <p style="margin:0 0 8px"><strong>Pre-order your meal ahead of time and skip the line!</strong> Browse menus, pick what you want, and it&rsquo;ll be ready when you arrive. More time enjoying the event, less time waiting.</p>
                <p style="margin:0">Order here: ${eventPageUrl}</p>
              </div>
            </div>

            <!-- Social Media Blurb -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px">
              <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin:0 0 8px">SOCIAL MEDIA POST</div>
              <div style="font-size:13px;color:#374151;line-height:1.6">
                <p style="margin:0">${isFM ? 'Fresh food vendors' : 'Food trucks'} at our event on ${event.event_date}! Pre-order your meal and skip the line &rarr; ${eventPageUrl}</p>
              </div>
            </div>

            <!-- Signage Text -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px">
              <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin:0 0 8px">DAY-OF SIGNAGE (near ${vendorLabel} area)</div>
              <div style="font-size:13px;color:#374151;line-height:1.6">
                <p style="margin:0 0 4px;font-size:16px;font-weight:700">Skip the line!</p>
                <p style="margin:0">Scan the QR code or visit the link to pre-order your meal. Faster service, more time to enjoy the event.</p>
              </div>
            </div>

            <!-- Tips -->
            <h3 style="color:${accentColor};margin:0 0 8px;font-size:14px">Tips for Maximum Pre-Orders</h3>
            <ul style="color:#4b5563;line-height:1.8;padding-left:20px;margin:0 0 20px;font-size:13px">
              <li>Share the link 3-5 days before the event for best results</li>
              <li>Include the QR code on any printed materials or digital signage</li>
              <li>Highlight the benefit: &ldquo;Pre-order and skip the line!&rdquo;</li>
              <li>For ticketed events: include the link in ticket confirmation emails</li>
              <li>Post a reminder the day before: &ldquo;Last chance to pre-order!&rdquo;</li>
            </ul>

            <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
              Questions? Reply to this email.
            </p>
          </div>
        `,
      })

      // Stamp timestamp to prevent duplicate email from admin ready-status transition
      await serviceClient
        .from('catering_requests')
        .update({ selection_email_sent_at: new Date().toISOString() })
        .eq('id', event.id)
    } catch (emailErr) {
      console.error('[event-select] Failed to send confirmation email:', emailErr)
    }

    } // end isFirstConfirmation (T-80)

    return NextResponse.json({
      ok: true,
      message: 'Vendors confirmed! Event page link sent to your email.',
      event_page_url: eventPageUrl,
    })
  })
}
