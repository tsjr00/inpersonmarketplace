import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing, logError, TracedError, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
import { changeRequiresReconfirmation } from '@/lib/events/change-window'
import { describeChanges } from '@/lib/events/change-requests'
import { requestEventReconfirmation } from '@/lib/events/reconfirmation'
import { refundAllEventFeePayments } from '@/lib/events/event-fee-refunds'
import { liftEventBlackouts } from '@/lib/events/blackouts'
import { stripe } from '@/lib/stripe/config'
import { createRefund } from '@/lib/stripe/payments'
import { approveEventRequest, autoMatchAndInvite } from '@/lib/events/event-actions'
import { invitationsHeld } from '@/lib/events/invitation-gate'
import { runEventCompletionEffects, sendOrganizerStatusEmail } from '@/lib/events/complete-event'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/admin/events/[id]
 *
 * Update catering request status. On approval, auto-creates event market + token.
 *
 * Event Lifecycle Statuses:
 *   new        — Request received, not yet reviewed by admin
 *   reviewing  — Admin is evaluating viability (scoring, logistics, budget check)
 *   approved   — Passes viability check; market + token created; ready to invite vendors
 *   declined   — Request doesn't meet platform criteria (unrealistic budget, scope, etc.)
 *   cancelled  — Organizer or admin cancelled before or during event
 *   ready      — Enough vendors confirmed; event page shareable with organizer
 *   active     — Event day (orders being fulfilled)
 *   review     — Post-event; feedback collection window (~7 days)
 *   completed  — Settled; all vendor payouts processed
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]', 'PATCH', async () => {
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
    const {
      status, admin_notes, address, city, state, zip, event_date, contact_email, resend_organizer_link,
      // Added 2026-08-09 alongside the organizer's hard block. The block refuses
      // a late timing change and tells the organizer to contact us — so somebody
      // here has to be able to make it. Admin previously could NOT edit times at
      // all, which would have made the block a dead end with no way out: the
      // same shape as the address deadlock.
      //
      // Safe to write now: mig 219's trigger propagates times into
      // market_schedules, so an admin edit reaches buyers instead of desyncing.
      event_start_time, event_end_time, event_end_date,
    } = body

    const validStatuses = [
      'new',       // Request received, not yet reviewed
      'reviewing', // Admin evaluating viability
      'approved',  // Passes viability check, market+token created, ready to invite vendors
      'declined',  // Doesn't meet criteria
      'cancelled', // Organizer or admin cancelled
      'ready',     // Enough vendors confirmed, event page shareable
      'active',    // Event day
      'review',    // Post-event, feedback collection
      'completed', // Settled, payouts done
    ]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Fetch current request
    const { data: cateringReq, error: fetchError } = await serviceClient
      .from('catering_requests')
      .select('*')
      .eq('id', id)
      .single()

    // ── B5 (owner decision 2026-08-15, option a): cancelling is one-way ──
    // Cancel's side effects run one direction only: it deactivates the market,
    // cancels order items, and refunds buyers (and, with Event Vendor Fees,
    // paid fee rows get refunded too). Nothing un-refunds anyone — so an
    // un-cancelled event would LOOK repaired while its buyers had been told it
    // was off. The block below ("Un-cancelling") enforces exactly that: it
    // refuses whenever a buyer was refunded or a vendor was notified, with the
    // reason, and only lets the pure misclick case through (nothing sent,
    // nothing refunded) — repairing the links and re-activating the market.
    //
    // 2026-08-29 (Restore-event, ST-19): an unconditional block used to sit
    // here ABOVE that logic, so the misclick repair could never run and the
    // admin UI had no door to it. Removed; the guarded check is the rule.

    if (fetchError || !cateringReq) {
      return NextResponse.json(
        { error: 'Catering request not found' },
        { status: 404 }
      )
    }

    // S4-2: scope to the event's vertical — platform admin any; vertical admin
    // only their own vertical's events (they handle their events, not platform).
    const scope = await verifyAdminScope(cateringReq.vertical_id as string)
    if (!scope?.authorized) {
      return NextResponse.json({ error: "Not authorized for this event's vertical" }, { status: 403 })
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    if (status) updates.status = status
    if (admin_notes !== undefined) updates.admin_notes = admin_notes

    // Admin may supply the street address (added 2026-08-08). Approval below
    // refuses without one, and previously NOTHING on the admin side could set
    // it — the admin could talk to the organizer on the phone and still have no
    // way to record what they were told. Accepting it here means an admin can
    // unstick an event in one PATCH, address and approval together.
    if (address !== undefined) {
      const trimmed = typeof address === 'string' ? address.trim() : ''
      if (!trimmed) {
        return NextResponse.json(
          { error: 'Address cannot be set to blank' },
          { status: 400 }
        )
      }
      updates.address = trimmed.slice(0, 500)
    }

    // ── Timing, admin-writable (2026-08-09) ──
    //
    // `ck_event_requires_times` (mig 121) means an event with a date must keep
    // BOTH times, so they can be changed but never cleared — the same rule the
    // organizer's route enforces. Rejecting the blank here keeps an admin from
    // tripping a raw constraint violation.
    for (const [field, value] of [
      ['event_start_time', event_start_time],
      ['event_end_time', event_end_time],
    ] as const) {
      if (value === undefined) continue
      const v = String(value ?? '').trim()
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) {
        return NextResponse.json(
          { error: `${field.replace(/_/g, ' ')} must be a time like 14:30, and cannot be removed` },
          { status: 400 }
        )
      }
      updates[field] = v.length === 5 ? `${v}:00` : v
    }

    // Cross-field check against whatever the row will actually hold afterwards,
    // not just against what this request happens to carry.
    {
      const finalStart = (updates.event_start_time as string | undefined) ?? (cateringReq.event_start_time as string | null)
      const finalEnd = (updates.event_end_time as string | undefined) ?? (cateringReq.event_end_time as string | null)
      if (finalStart && finalEnd && String(finalEnd) <= String(finalStart)) {
        return NextResponse.json(
          { error: 'Event end time must be after the start time' },
          { status: 400 }
        )
      }
    }

    if (event_end_date !== undefined) {
      const v = String(event_end_date ?? '').trim()
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return NextResponse.json({ error: 'Event end date must be YYYY-MM-DD' }, { status: 400 })
      }
      updates.event_end_date = v || null
    }

    // ── Un-cancelling: allowed ONLY when nothing irreversible happened ──
    //
    // Audit 2026-08-08. Status has no transition rules (the check above only
    // validates the NAME), so an admin could set a cancelled event straight
    // back to 'approved' — and the console would show a normal approved event.
    // But cancelling does five things and only ONE of them is undoable:
    //
    //   status -> cancelled          ← undoable
    //   markets.active -> false      ← undoable
    //   listing_markets rows DELETED ← recoverable, but nothing did it
    //   Stripe refunds issued        ← NOT undoable, money moved
    //   buyers + vendors emailed     ← NOT undoable, they were told
    //
    // So the event came back looking healthy with no products attached and its
    // buyers already refunded and told it was off. Reporting success while
    // broken is worse than refusing, because nobody goes looking.
    //
    // Two cancels exist though. One followed real orders — unrecoverable, full
    // stop. The other is an admin misclicking minutes after approval, where
    // nothing irreversible occurred and the only damage is the deleted links.
    // Allow that one, and actually repair it.
    const leavingCancelled =
      !!status &&
      ['cancelled', 'declined'].includes(cateringReq.status as string) &&
      !['cancelled', 'declined'].includes(status)

    if (leavingCancelled && cateringReq.market_id) {
      const [vendorRes, cancelledItemRes] = await Promise.all([
        // Accepted vendors were emailed that the event is off.
        serviceClient
          .from('market_vendors')
          .select('id')
          .eq('market_id', cateringReq.market_id)
          .eq('response_status', 'accepted')
          .limit(1),
        // Items the cancel cascade killed — these buyers were refunded and told.
        serviceClient
          .from('order_items')
          .select('id')
          .eq('market_id', cateringReq.market_id)
          .eq('status', 'cancelled')
          .eq('cancelled_by', 'system')
          .limit(1),
      ])

      const vendorsNotified = (vendorRes.data || []).length > 0
      const buyersRefunded = (cancelledItemRes.data || []).length > 0

      if (vendorsNotified || buyersRefunded) {
        const reasons = [
          buyersRefunded ? 'buyers were refunded and told the event was cancelled' : null,
          vendorsNotified ? 'confirmed vendors were notified it was cancelled' : null,
        ].filter(Boolean).join(', and ')
        return NextResponse.json(
          {
            error: `This event cannot be un-cancelled — ${reasons}. Refunds and those emails cannot be taken back, so reviving it would show a live event to people who were told it was off. Create a new event instead.`,
          },
          { status: 400 }
        )
      }

      // Nothing irreversible: repair what cancelling destroyed. The
      // event_vendor_listings rows survive a cancel (only listing_markets is
      // deleted), so they are the source for rebuilding the links.
      const { data: evLinks } = await observed(serviceClient
        .from('event_vendor_listings')
        .select('listing_id')
        .eq('market_id', cateringReq.market_id), { table: 'event_vendor_listings' })

      if (evLinks && evLinks.length > 0) {
        await serviceClient
          .from('listing_markets')
          .upsert(
            evLinks.map(l => ({ listing_id: l.listing_id as string, market_id: cateringReq.market_id as string })),
            { onConflict: 'listing_id,market_id', ignoreDuplicates: true }
          )
      }

      await serviceClient
        .from('markets')
        .update({ active: true })
        .eq('id', cateringReq.market_id)
    }

    // ── contact_email: the repair path for a locked-out organizer ──
    //
    // Audit 2026-08-08 found this was required at intake and writable by NOBODY
    // afterwards — and it is one of the two ways a route decides you are the
    // organizer (`organizer_user_id`, else `contact_email === user.email`). A
    // typo therefore sent the signup link to the wrong address, guaranteed the
    // account claim would never match, and could not be corrected. Silent, too:
    // a wrong address just produces an organizer who never appears.
    //
    // Admin-writable at any time BECAUSE that is the whole point — by
    // definition nobody can authenticate as an organizer whose email is wrong,
    // so the organizer cannot self-serve out of it. Vertical admins for this
    // event's vertical and platform admins both qualify; the verifyAdminScope
    // check above already draws that line.
    let contactEmailChanged = false
    if (contact_email !== undefined) {
      const em = String(contact_email ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
      }
      if (em !== String(cateringReq.contact_email ?? '').toLowerCase()) {
        updates.contact_email = em.slice(0, 320)
        contactEmailChanged = true
      }
    }

    // City / state / zip / date — the fields approval COPIES into the markets
    // row, with event_date also deciding the market's schedule weekday
    // (event-actions.ts:126-159). Editable here only while no market exists.
    // After that, writing them would change the request but not the market the
    // vendors and shoppers actually see — a silent desync, worse than refusing.
    // Correcting an approved event needs the market updated too; that is a
    // separate build, logged in backlog.md.
    const locationEdits: Record<string, unknown> = {}
    if (city !== undefined) {
      const c = String(city ?? '').trim()
      if (!c) return NextResponse.json({ error: 'City cannot be blank' }, { status: 400 })
      locationEdits.city = c.slice(0, 100)
    }
    if (state !== undefined) {
      const s = String(state ?? '').trim().toUpperCase()
      if (s.length !== 2) return NextResponse.json({ error: 'State must be a 2-letter code' }, { status: 400 })
      locationEdits.state = s
    }
    if (zip !== undefined) {
      const z = String(zip ?? '').trim()
      if (!/^\d{5}(-\d{4})?$/.test(z)) return NextResponse.json({ error: 'Zip must be 5 digits, or 5+4' }, { status: 400 })
      locationEdits.zip = z
    }
    if (event_date !== undefined) {
      const d = String(event_date ?? '')
      const parsed = new Date(d + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (isNaN(parsed.getTime()) || parsed < today) {
        return NextResponse.json({ error: 'Event date must be today or in the future' }, { status: 400 })
      }
      locationEdits.event_date = d
    }
    if (Object.keys(locationEdits).length > 0) {
      // Mig-219 follow-up (2026-08-15): the post-approval refusal that lived
      // here is retired — trg_sync_event_request_to_market (all three envs
      // since 2026-08-13) propagates these fields into the live market and
      // recomputes the schedule weekday on a date change. Consequences on a
      // live event are handled below: accepted vendors are notified (B1) and
      // pre-orders go through re-confirmation (B3).
      Object.assign(updates, locationEdits)
    }

    // On APPROVE: create event market + schedule via shared function
    if (status === 'approved' && cateringReq.status !== 'approved') {
      // Address required for approval. The market created downstream uses it for
      // vendor logistics, so this gate stays — but it now honors an address
      // supplied in THIS request. Checking only the stored row would have made
      // "set the address and approve" a two-call dance that silently failed on
      // the first call.
      const effectiveAddress = (updates.address as string | undefined)
        ?? (cateringReq.address as string | null)
      if (!effectiveAddress || !String(effectiveAddress).trim()) {
        return NextResponse.json(
          { error: 'Cannot approve event without a street address. Add one in the Street address field, or ask the organizer to add it from their event dashboard.' },
          { status: 400 }
        )
      }

      // Pass the effective values, not the stale row — otherwise approving in
      // the same call that fixes the location would build the market from the
      // old data. `locationEdits` is empty unless this PATCH supplied them.
      const approval = await approveEventRequest(serviceClient, {
        ...cateringReq,
        ...locationEdits,
        address: effectiveAddress,
      })

      if (!approval.success) {
        return NextResponse.json(
          { error: approval.error || 'Failed to create event market' },
          { status: 500 }
        )
      }

      updates.event_token = approval.event_token
      updates.market_id = approval.market_id
      if (approval.access_code) {
        updates.access_code = approval.access_code
      }
    }

    // Resending the organizer link is an ACTION, not a field change — it is
    // valid on its own, with nothing else in the request.
    if (Object.keys(updates).length === 0 && !resend_organizer_link) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      )
    }

    if (Object.keys(updates).length === 0 && resend_organizer_link) {
      const sent = await sendOrganizerLinkEmail(
        cateringReq.contact_name as string | null,
        cateringReq.contact_email as string,
        cateringReq.company_name as string | null,
        cateringReq.vertical_id as string
      )
      return NextResponse.json({ request: cateringReq, linkEmailSent: sent })
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('catering_requests')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      console.error('[admin/catering] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update catering request' },
        { status: 500 }
      )
    }

    // ── B1 (owner-approved 2026-08-15): tell ACCEPTED vendors about the change ──
    // Same rule as the organizer details route: on a LIVE event (market existed
    // BEFORE this PATCH — the approval transition correctly skips this, since
    // cateringReq.market_id was null then), an admin edit of the day, place, or
    // start time >30min notifies every accepted vendor. Email + in-app via the
    // standard-urgency event_changed_vendor template.
    if (cateringReq.market_id && changeRequiresReconfirmation(cateringReq, updates)) {
      const { data: acceptedVendors } = await observed(serviceClient
        .from('market_vendors')
        .select('vendor_profile_id, vendor_profiles:vendor_profile_id(user_id)')
        .eq('market_id', cateringReq.market_id)
        .eq('response_status', 'accepted'), { table: 'market_vendors' })

      const changeSummary = describeChanges({
        ...('event_date' in updates ? { event_date: updates.event_date } : {}),
        ...('address' in updates ? { address: updates.address } : {}),
        ...('city' in updates ? { city: updates.city } : {}),
        ...('state' in updates ? { state: updates.state } : {}),
        ...('zip' in updates ? { zip: updates.zip } : {}),
        ...('event_start_time' in updates ? { event_start_time: updates.event_start_time } : {}),
        ...('event_end_time' in updates ? { event_end_time: updates.event_end_time } : {}),
      })

      for (const mv of acceptedVendors || []) {
        const vp = mv.vendor_profiles as unknown as { user_id: string | null } | null
        if (vp?.user_id) {
          await sendNotification(vp.user_id, 'event_changed_vendor', {
            changeSummary,
            eventDate: (updates.event_date as string) || (cateringReq.event_date as string) || '',
            marketId: cateringReq.market_id,
          }, { vertical: cateringReq.vertical_id as string })
        }
      }

      // B3 (mig 230): stamp every live order awaiting re-confirmation + send
      // the buyers their one-click confirm link — admin edits move the event
      // just as much as organizer edits do.
      await requestEventReconfirmation(serviceClient, {
        marketId: cateringReq.market_id as string,
        changeSummary,
        eventDate: (updates.event_date as string) || (cateringReq.event_date as string) || '',
        vertical: cateringReq.vertical_id as string,
      })
    }

    // On APPROVED: auto-invite vendors for full-service events + notify organizer
    if (status === 'approved' && cateringReq.status !== 'approved' && updated.market_id) {
      // T3-1: Auto-invite vendors on approval. Self-service events are HELD
      // (mig 239 invitation gate): the organizer sends invitations from their
      // dashboard once the required details are in — including a self-service
      // request that had no address at intake and was approved here later.
      if (!invitationsHeld(updated)) {
        autoMatchAndInvite(serviceClient, updated, updated.market_id as string).catch(err =>
          console.error('[admin/events] Auto-invite failed:', err)
        )
      }

      // T3-3: Notify organizer that we're working on their event
      if (updated.contact_email) {
        sendOrganizerStatusEmail(
          updated.contact_name,
          updated.contact_email,
          updated.company_name,
          updated.event_date,
          updated.vertical_id,
          'approved',
          "We're matching vendors to your event. You'll hear from us as soon as they're confirmed."
        ).catch(err => console.error('[admin/events] Approved email error:', err))
      }

      // If organizer has an account, also send in-app notification
      if (updated.organizer_user_id) {
        sendNotification(updated.organizer_user_id, 'event_confirmed', {
          companyName: updated.company_name,
          eventDate: updated.event_date,
        }, { vertical: updated.vertical_id }).catch(() => {})
      }
    }

    // On READY: auto-generate waves if not already generated + notify organizer
    if (status === 'ready' && updated.market_id) {
      // T2-3: Auto-generate waves for wave-ordering events
      if (updated.payment_model === 'company_paid' || updated.wave_ordering_enabled) {
        const { data: existingWaves } = await observed(serviceClient
          .from('event_waves')
          .select('id')
          .eq('market_id', updated.market_id)
          .limit(1), { table: 'event_waves' })

        if (!existingWaves || existingWaves.length === 0) {
          const { generateEventWaves } = await import('@/lib/events/wave-generation')
          generateEventWaves(serviceClient, {
            marketId: updated.market_id as string,
            eventStartTime: updated.event_start_time || '11:00:00',
            eventEndTime: updated.event_end_time || '14:00:00',
          }).catch(err => console.error('[admin/events] Auto wave generation failed:', err))
        }
      }
    }

    if (status === 'ready' && updated.event_token && updated.contact_email && !updated.selection_email_sent_at) {
      const { getAppUrl } = await import('@/lib/environment')
      const eventPageUrl = `${getAppUrl(updated.vertical_id)}/${updated.vertical_id}/events/${updated.event_token}`
      // Count confirmed vendors
      const { count: vendorCount } = await serviceClient
        .from('market_vendors')
        .select('id', { count: 'exact', head: true })
        .eq('market_id', updated.market_id)
        .eq('response_status', 'accepted')

      // Send via email to organizer (not an app user — use direct email)
      sendEventConfirmedEmail(
        updated.contact_name,
        updated.contact_email,
        updated.company_name,
        updated.event_date,
        vendorCount || 0,
        eventPageUrl,
        updated.vertical_id
      ).catch(err => console.error('[admin/catering] Event confirmed email error:', err))
    }

    // On CANCELLED or DECLINED: clean up listing_markets + notify buyers + cancel orders
    if ((status === 'cancelled' || status === 'declined') && cateringReq.market_id) {
      // Event Vendor Fees Phase 5 (2026-08-16): the event is dead — every
      // paying vendor gets their fee back (full refund with transfer
      // reversal); pending/covered rows released; forfeits keep the
      // organizer's waiver lever. Same helper as the organizer cancel route.
      await refundAllEventFeePayments(
        serviceClient,
        cateringReq.market_id,
        cateringReq.vertical_id,
        '/api/admin/events/[id]'
      )

      // R3-4: event dead → every vendor who paused another location for it
      // gets that day back (mig 238 blackouts lifted; organizer-route parity).
      const { error: liftErr } = await liftEventBlackouts(serviceClient, cateringReq.market_id)
      if (liftErr) console.error('[admin/events cancel] blackout lift failed:', liftErr)

      const { data: eventListings } = await observed(serviceClient
        .from('event_vendor_listings')
        .select('listing_id')
        .eq('market_id', cateringReq.market_id), { table: 'event_vendor_listings' })
      if (eventListings && eventListings.length > 0) {
        const listingIds = eventListings.map(el => el.listing_id as string)
        await serviceClient
          .from('listing_markets')
          .delete()
          .eq('market_id', cateringReq.market_id)
          .in('listing_id', listingIds)
      }

      // Notify buyers who have orders at this event and cancel their orders.
      // Resolve order IDs via order_items.market_id (orders.market_id does not
      // exist; the link from event/market to orders is per-item). Earlier
      // attempts queried .from('orders').eq('market_id', ...) which silently
      // returned null, causing the entire cancel flow to no-op.
      const { data: orderItemRows } = await observed(serviceClient
        .from('order_items')
        .select('order_id, status')
        .eq('market_id', cateringReq.market_id), { table: 'order_items' })

      const orderIds = [...new Set((orderItemRows || []).map(r => r.order_id as string))]

      const { data: buyerOrders } = orderIds.length > 0
        ? await serviceClient
            .from('orders')
            .select('buyer_user_id, order_number, id, status, stripe_checkout_session_id, payment_method')
            .in('id', orderIds)
            .not('status', 'in', '("cancelled","refunded","completed")')
        : { data: [] }

      if (buyerOrders && buyerOrders.length > 0) {
        const uniqueBuyerIds = [...new Set(buyerOrders.map(o => o.buyer_user_id as string))]
        const buyerNotifications = uniqueBuyerIds.map(buyerId => {
          const buyerOrder = buyerOrders.find(o => o.buyer_user_id === buyerId)
          return sendNotification(buyerId, 'order_cancelled_by_vendor', {
            vendorName: cateringReq.company_name,
            companyName: cateringReq.company_name,
            eventDate: cateringReq.event_date,
            reason: status === 'cancelled'
              ? 'This event has been cancelled. If you paid via card, a refund will be processed.'
              : 'This event has been declined. If you paid via card, a refund will be processed.',
            orderNumber: buyerOrder?.order_number as string,
            orderId: buyerOrder?.id as string,
          }, { vertical: cateringReq.vertical_id }).catch(err =>
            console.error(`[admin/events] Buyer cancel notification failed for ${buyerId}:`, err)
          )
        })
        await Promise.all(buyerNotifications)

        // EVT-4 FIX (mirrors the organizer cancel route): the buyer notice above
        // promises a refund. Per order: pending+session → sessions.expire first
        // (skip the order if expire throws — possibly race-paid, webhook will
        // finalize); Stripe-paid → refund the REMAINING refundable balance;
        // fulfilled-item orders skip auto-refund and log for manual review.
        // Items are then cancelled (guarded) so cron Phases 4/7 can't pay
        // vendors for no-shows at a cancelled event.
        const fulfilledOrderIds = new Set(
          (orderItemRows || []).filter(r => r.status === 'fulfilled').map(r => r.order_id as string)
        )
        const { data: eventPayments } = await observed(serviceClient
          .from('payments')
          .select('order_id, stripe_payment_intent_id')
          .in('order_id', buyerOrders.map(o => o.id as string))
          .eq('status', 'succeeded'), { table: 'payments' })
        const paymentByOrder = new Map(
          (eventPayments || []).map(p => [p.order_id as string, p.stripe_payment_intent_id as string | null])
        )

        const cancellableOrderIds: string[] = []
        for (const order of buyerOrders) {
          if (order.status === 'pending' && order.stripe_checkout_session_id) {
            try {
              await stripe.checkout.sessions.expire(order.stripe_checkout_session_id as string)
            } catch (expireErr) {
              await logError(new TracedError('ERR_CHECKOUT_005', `[admin/events cancel] Session expire failed for order ${order.id} (session ${order.stripe_checkout_session_id}): ${expireErr instanceof Error ? expireErr.message : String(expireErr)}`, {
                route: '/api/admin/events/[id]', method: 'PATCH',
              }))
              continue // possibly race-paid — leave this order for the webhook
            }
          }
          cancellableOrderIds.push(order.id as string)

          const paymentIntentId = paymentByOrder.get(order.id as string)
          if (paymentIntentId) {
            if (fulfilledOrderIds.has(order.id as string)) {
              await logError(new TracedError('ERR_REFUND_001', `[admin/events cancel] Order ${order.id} has fulfilled items — auto-refund skipped, needs manual review`, {
                route: '/api/admin/events/[id]', method: 'PATCH', orderId: order.id,
              }))
            } else {
              try {
                await createRefund(paymentIntentId, `${order.id}-event-cancel`)
              } catch (refundErr) {
                await logError(new TracedError('ERR_REFUND_001', `[admin/events cancel] Refund failed for order ${order.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
                  route: '/api/admin/events/[id]', method: 'PATCH', orderId: order.id,
                }))
              }
            }
          }
        }

        if (cancellableOrderIds.length > 0) {
          await serviceClient
            .from('order_items')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancelled_by: 'system',
              cancellation_reason: status === 'declined' ? 'Event declined' : 'Event cancelled',
            })
            .in('order_id', cancellableOrderIds)
            .is('cancelled_at', null)
            .in('status', ['pending', 'confirmed', 'ready'])

          // Mark buyer orders as cancelled (preserve completed/refunded/already-cancelled)
          await serviceClient
            .from('orders')
            .update({ status: 'cancelled' })
            .in('id', cancellableOrderIds)
            .not('status', 'in', '("cancelled","refunded","completed")')

          // Free wave slots for all cancelled event orders (organizer-route parity)
          for (const cancelledOrderId of cancellableOrderIds) {
            const { error: waveErr } = await serviceClient.rpc('free_wave_on_order_cancel', {
              p_order_id: cancelledOrderId,
            })
            if (waveErr) console.error(`[admin/events cancel] free_wave error for order ${cancelledOrderId}:`, waveErr.message)
          }
        }
      }

      // EVT-10 FIX: notify accepted vendors — previously NO path informed
      // vendors of an admin cancel/decline (the organizer route notifies, this
      // one didn't). user_id resolved via the join; sendNotification's first
      // arg is a USER id, not a vendor_profile id.
      const { data: cancelVendors } = await observed(serviceClient
        .from('market_vendors')
        .select('vendor_profile_id, vendor_profiles!inner(user_id)')
        .eq('market_id', cateringReq.market_id)
        .eq('response_status', 'accepted'), { table: 'market_vendors' })

      if (cancelVendors && cancelVendors.length > 0) {
        await Promise.all(cancelVendors.flatMap(v => {
          const vp = v.vendor_profiles as unknown as { user_id?: string } | { user_id?: string }[] | null
          const vendorUserId = (Array.isArray(vp) ? vp[0]?.user_id : vp?.user_id) as string | undefined
          if (!vendorUserId) return []
          return [sendNotification(vendorUserId, 'event_cancelled_vendor', {
            companyName: cateringReq.company_name,
            eventDate: cateringReq.event_date,
          }, { vertical: cateringReq.vertical_id }).catch(err =>
            console.error(`[admin/events] Vendor cancel notification failed for ${v.vendor_profile_id}:`, err)
          )]
        }))
      }

      // T3-2: Notify organizer on decline (and on admin-initiated cancel)
      if (updated.contact_email) {
        const reason = status === 'declined'
          ? (updated.admin_notes || "We weren't able to accommodate your event at this time. Please reach out if you'd like to discuss alternatives.")
          : 'Your event has been cancelled.'
        sendOrganizerStatusEmail(
          updated.contact_name,
          updated.contact_email,
          updated.company_name,
          updated.event_date,
          updated.vertical_id,
          status,
          reason
        ).catch(err => console.error(`[admin/events] ${status} email error:`, err))
      }
    }

    // On COMPLETED: fire the shared completion effects (feedback, settlement,
    // unfulfilled vendor + vertical-admin notices, organizer email, cleanup).
    // Same path the auto-complete cron uses (expire-orders Phase 15.5).
    // EVT-14 FIX: prior-status guard (mirrors the approve guard at :114) — a
    // re-PATCH carrying status:'completed' (e.g. saving admin_notes) was
    // re-firing the effects, duplicating notifications to every buyer+vendor.
    if (status === 'completed' && cateringReq.status !== 'completed' && cateringReq.market_id) {
      await runEventCompletionEffects(serviceClient, {
        market_id: cateringReq.market_id as string,
        vertical_id: cateringReq.vertical_id as string,
        company_name: (updated.company_name as string | null) ?? null,
        contact_name: (updated.contact_name as string | null) ?? null,
        contact_email: (updated.contact_email as string | null) ?? null,
        event_date: (updated.event_date as string | null) ?? null,
      })
    }

    // ⚠ Correcting the address does NOT reach the organizer — they still never
    // got their signup link. But the send is NOT automatic: the owner asked to
    // be told it changed and to trigger the email deliberately (2026-08-08),
    // rather than have a correction silently mail a stranger.
    let linkEmailSent = false
    if (resend_organizer_link) {
      linkEmailSent = await sendOrganizerLinkEmail(
        updated.contact_name as string | null,
        updated.contact_email as string,
        updated.company_name as string | null,
        updated.vertical_id as string
      )
    }

    return NextResponse.json({ request: updated, contactEmailChanged, linkEmailSent })
  })
}

/**
 * Sends the organizer their event link, addressed to whatever contact_email is
 * NOW. Used after an admin corrects a typo'd address — deliberately not the
 * original "we received your request" confirmation, because this is a
 * correction and should read like one.
 *
 * Returns whether it actually went out, so the admin UI can say so rather than
 * claiming success when RESEND_API_KEY is unset.
 */
async function sendOrganizerLinkEmail(
  contactName: string | null,
  contactEmail: string,
  companyName: string | null,
  verticalId: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !contactEmail) return false

  const isFM = verticalId === 'farmers_market'
  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
  const accentColor = isFM ? '#2d5016' : '#ff5757'

  try {
    const { getAppUrl } = await import('@/lib/environment')
    const signupUrl = `${getAppUrl(verticalId)}/${verticalId}/signup?ref=event&email=${encodeURIComponent(contactEmail)}`
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: `${senderName} <updates@${senderDomain}>`,
      to: contactEmail,
      subject: `Your event dashboard link${companyName ? ` — ${companyName}` : ''}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${accentColor};margin:0 0 8px">Here's your event link</h2>
          <p style="color:#374151;margin:0 0 16px;font-size:16px">Hi ${contactName || 'there'},</p>
          <p style="color:#4b5563;line-height:1.6;margin:0 0 16px">
            We've updated the contact email on your${companyName ? ` <strong>${companyName}</strong>` : ''} event request, so you may not have received our earlier messages.
          </p>
          <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
            Set up your account with the button below and you'll be able to manage the event, add any missing details, and track vendors.
          </p>
          <div style="text-align:center;margin:0 0 24px">
            <a href="${signupUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">
              Open my event dashboard
            </a>
          </div>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:0 0 20px">
            <p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all">${signupUrl}</p>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
            Didn't request an event? Reply to this email and let us know.
          </p>
        </div>
      `,
    })
    return true
  } catch (err) {
    console.error('[admin/events] Organizer link email failed:', err)
    return false
  }
}

async function sendEventConfirmedEmail(
  contactName: string,
  contactEmail: string,
  companyName: string,
  eventDate: string,
  vendorCount: number,
  eventPageUrl: string,
  verticalId: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const isFM = verticalId === 'farmers_market'
  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
  const accentColor = isFM ? '#2d5016' : '#ff5757'
  const vendorLabel = isFM ? 'vendor' : 'food truck'

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: `${senderName} <updates@${senderDomain}>`,
      to: contactEmail,
      subject: `Your event is confirmed — ${vendorCount} ${vendorLabel}${vendorCount > 1 ? 's' : ''} ready!`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${accentColor};margin:0 0 8px">Your event is confirmed!</h2>
          <p style="color:#374151;margin:0 0 16px;font-size:16px">Hi ${contactName},</p>
          <p style="color:#4b5563;line-height:1.6;margin:0 0 16px">
            Great news &mdash; <strong>${vendorCount} ${vendorLabel}${vendorCount > 1 ? 's are' : ' is'}</strong> confirmed for your
            ${companyName} event on <strong>${eventDate}</strong>.
          </p>
          <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
            Share the link below with your team so they can browse menus and pre-order:
          </p>
          <div style="text-align:center;margin:0 0 24px">
            <a href="${eventPageUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">
              View Event Page
            </a>
          </div>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:0 0 20px">
            <p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all">${eventPageUrl}</p>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
            Questions? Reply to this email and our team will help.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[admin/catering] Failed to send event confirmed email:', err)
  }
}

