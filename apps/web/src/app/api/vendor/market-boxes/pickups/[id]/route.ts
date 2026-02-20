import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'
import { FEES } from '@/lib/pricing'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/vendor/market-boxes/pickups/[id]
 * Get a single pickup with subscription details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/market-boxes/pickups/[id]', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-box-pickups-get:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: pickupId } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Get pickup with full details
    const { data: pickup, error } = await supabase
      .from('market_box_pickups')
      .select(`
        id,
        week_number,
        scheduled_date,
        status,
        ready_at,
        picked_up_at,
        missed_at,
        rescheduled_to,
        vendor_notes,
        subscription:market_box_subscriptions (
          id,
          start_date,
          status,
          weeks_completed,
          buyer:user_profiles!market_box_subscriptions_buyer_user_id_fkey (
            display_name,
            email
          ),
          offering:market_box_offerings (
            id,
            name,
            vendor_profile_id
          )
        )
      `)
      .eq('id', pickupId)
      .single()

    if (error || !pickup) {
      return NextResponse.json({ error: 'Pickup not found' }, { status: 404 })
    }

    // Verify vendor owns this offering
    const offering = (pickup.subscription as any)?.offering
    if (!offering || offering.vendor_profile_id !== vendor.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json({ pickup })
  })
}

/**
 * PATCH /api/vendor/market-boxes/pickups/[id]
 * Update pickup status (ready, picked_up, missed, reschedule)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/market-boxes/pickups/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-box-pickups-patch:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: pickupId } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Get pickup with offering info to verify ownership + confirmation state + buyer info for notifications
    const { data: pickup } = await supabase
      .from('market_box_pickups')
      .select(`
        id,
        status,
        ready_at,
        buyer_confirmed_at,
        vendor_confirmed_at,
        confirmation_window_expires_at,
        subscription:market_box_subscriptions (
          id,
          buyer_user_id,
          offering:market_box_offerings (
            id,
            name,
            price_cents,
            vertical_id,
            vendor_profile_id,
            vendor_profiles(profile_data)
          )
        )
      `)
      .eq('id', pickupId)
      .single()

    if (!pickup) {
      return NextResponse.json({ error: 'Pickup not found' }, { status: 404 })
    }

    // Verify vendor owns this offering
    const offering = (pickup.subscription as any)?.offering
    if (!offering || offering.vendor_profile_id !== vendor.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { action, vendor_notes, rescheduled_to } = body

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (vendor_notes !== undefined) {
      updates.vendor_notes = vendor_notes
    }

    switch (action) {
      case 'ready':
        // Mark as ready for pickup
        if (pickup.status !== 'scheduled') {
          return NextResponse.json({ error: 'Can only mark scheduled pickups as ready' }, { status: 400 })
        }
        updates.status = 'ready'
        updates.ready_at = new Date().toISOString()
        break

      case 'picked_up': {
        // Mutual confirmation: both vendor and buyer must confirm within 30 seconds
        if (!['scheduled', 'ready'].includes(pickup.status)) {
          return NextResponse.json({ error: 'Can only confirm scheduled or ready pickups' }, { status: 400 })
        }

        const now = new Date()
        const CONFIRMATION_WINDOW_SECONDS = 30
        const buyerAlreadyConfirmed = !!(pickup as Record<string, unknown>).buyer_confirmed_at

        if (buyerAlreadyConfirmed) {
          // Check if 30-second confirmation window is still valid
          const windowExpires = (pickup as Record<string, unknown>).confirmation_window_expires_at
            ? new Date((pickup as Record<string, unknown>).confirmation_window_expires_at as string)
            : null

          if (windowExpires && now > windowExpires) {
            // Window expired — reset buyer confirmation, they must re-confirm
            await supabase
              .from('market_box_pickups')
              .update({
                buyer_confirmed_at: null,
                confirmation_window_expires_at: null,
                updated_at: now.toISOString(),
              })
              .eq('id', pickupId)

            return NextResponse.json({
              error: 'Confirmation window expired. Please ask the buyer to confirm pickup again.',
              code: 'WINDOW_EXPIRED',
            }, { status: 400 })
          }

          // Both confirmed! Complete the pickup
          updates.status = 'picked_up'
          updates.picked_up_at = now.toISOString()
          updates.vendor_confirmed_at = now.toISOString()
          updates.confirmation_window_expires_at = null
          if (!pickup.ready_at) {
            updates.ready_at = now.toISOString()
          }
        } else {
          // Vendor confirming first — start 30s window, wait for buyer
          updates.vendor_confirmed_at = now.toISOString()
          updates.confirmation_window_expires_at = new Date(
            now.getTime() + CONFIRMATION_WINDOW_SECONDS * 1000
          ).toISOString()
          // If still scheduled, also mark as ready
          if (pickup.status === 'scheduled') {
            updates.status = 'ready'
            updates.ready_at = now.toISOString()
          }
        }
        break
      }

      case 'missed':
        // Mark as missed (buyer didn't show)
        if (!['scheduled', 'ready'].includes(pickup.status)) {
          return NextResponse.json({ error: 'Can only mark scheduled or ready pickups as missed' }, { status: 400 })
        }
        updates.status = 'missed'
        updates.missed_at = new Date().toISOString()
        break

      case 'reschedule':
        // Vendor allows reschedule after miss
        if (pickup.status !== 'missed') {
          return NextResponse.json({ error: 'Can only reschedule missed pickups' }, { status: 400 })
        }
        if (!rescheduled_to) {
          return NextResponse.json({ error: 'rescheduled_to date is required' }, { status: 400 })
        }
        updates.status = 'rescheduled'
        updates.rescheduled_to = rescheduled_to
        break

      default:
        if (!action) {
          // Just updating notes, no status change
          break
        }
        return NextResponse.json({ error: 'Invalid action. Use: ready, picked_up, missed, or reschedule' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('market_box_pickups')
      .update(updates)
      .eq('id', pickupId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send buyer notifications based on action
    const sub = pickup.subscription as any
    const buyerUserId = sub?.buyer_user_id
    const offeringName = sub?.offering?.name
    const mbVerticalId = sub?.offering?.vertical_id
    const mbVendorName = sub?.offering?.vendor_profiles?.profile_data?.business_name || 'Vendor'
    const completed = updated?.status === 'picked_up'

    // F2 FIX: Transfer payout to vendor for completed market box pickup
    if (completed) {
      const mbOffering = (pickup.subscription as any)?.offering
      const perPickupPriceCents = mbOffering?.price_cents || 0

      if (perPickupPriceCents > 0) {
        // Per-pickup vendor payout = base price minus vendor percentage fee
        // Flat fee was already deducted once at subscription checkout
        const vendorPayoutCents = perPickupPriceCents - Math.round(perPickupPriceCents * (FEES.vendorFeePercent / 100))
        const mbServiceClient = createServiceClient()

        // Check for existing payout (prevent double payout)
        const { data: existingMbPayout } = await mbServiceClient
          .from('vendor_payouts')
          .select('id')
          .eq('market_box_pickup_id', pickupId)
          .neq('status', 'failed')
          .maybeSingle()

        if (!existingMbPayout && vendor.stripe_account_id && vendor.stripe_payouts_enabled) {
          const sub = pickup.subscription as any
          try {
            const transfer = await transferToVendor({
              amount: vendorPayoutCents,
              destination: vendor.stripe_account_id,
              orderId: sub?.id || pickupId,
              orderItemId: pickupId,
            })

            await mbServiceClient.from('vendor_payouts').insert({
              market_box_pickup_id: pickupId,
              vendor_profile_id: vendor.id,
              amount_cents: vendorPayoutCents,
              stripe_transfer_id: transfer.id,
              status: 'processing',
            })
          } catch (transferErr) {
            console.error('[MARKET_BOX_PAYOUT] Transfer failed:', transferErr)
            await mbServiceClient.from('vendor_payouts').insert({
              market_box_pickup_id: pickupId,
              vendor_profile_id: vendor.id,
              amount_cents: vendorPayoutCents,
              stripe_transfer_id: null,
              status: 'failed',
            })
          }
        }
      }
    }

    if (buyerUserId) {
      if (action === 'ready') {
        await sendNotification(buyerUserId, 'order_ready', {
          orderNumber: `MB-${pickupId.slice(0, 6).toUpperCase()}`,
          vendorName: mbVendorName,
          itemTitle: offeringName,
        }, { vertical: mbVerticalId })
      } else if (action === 'picked_up' && completed) {
        await sendNotification(buyerUserId, 'order_fulfilled', {
          orderNumber: `MB-${pickupId.slice(0, 6).toUpperCase()}`,
          vendorName: mbVendorName,
          itemTitle: offeringName,
        }, { vertical: mbVerticalId })
      } else if (action === 'missed') {
        await sendNotification(buyerUserId, 'pickup_missed', {
          orderNumber: `MB-${pickupId.slice(0, 6).toUpperCase()}`,
          vendorName: mbVendorName,
          itemTitle: offeringName,
        }, { vertical: mbVerticalId })
      }
    }

    // Include confirmation state in response
    const waitingForBuyer = !completed && !!updates.vendor_confirmed_at
    const waitingForVendor = !completed && !!updated?.buyer_confirmed_at

    return NextResponse.json({
      pickup: updated,
      completed,
      waiting_for_buyer: waitingForBuyer,
      waiting_for_vendor: waitingForVendor,
      confirmation_window_expires_at: waitingForBuyer
        ? updates.confirmation_window_expires_at
        : null,
      message: completed
        ? 'Pickup confirmed by both parties!'
        : waitingForBuyer
          ? 'Waiting for buyer to confirm pickup (30 seconds).'
          : undefined,
    })
  })
}
