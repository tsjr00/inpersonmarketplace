import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyOrderExpired, sendNotification } from '@/lib/notifications'
import { createRefund, transferToVendor, transferMarketBoxPayout } from '@/lib/stripe/payments'
import { restoreInventory, restoreOrderInventory } from '@/lib/inventory'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { FEES, proratedFlatFeeSimple } from '@/lib/pricing'
import { getTierLimits } from '@/lib/vendor-limits'
import { recordExternalPaymentFee } from '@/lib/payments/vendor-fees'
import { isCleanupDay, calculateRetentionCutoffs } from '@/lib/cron/retention'
import { REMINDER_DELAY_MS, DEFAULT_REMINDER_DELAY_MS, isOrderOldEnoughForReminder, getAutoConfirmCutoffDate, areAllItemsPastPickupWindow, formatPaymentMethodLabel } from '@/lib/cron/external-payment'
import { calculateNoShowPayout, shouldTriggerNoShow } from '@/lib/cron/no-show'
import { STRIPE_CHECKOUT_EXPIRY_MS, PAYOUT_RETRY_MAX_DAYS, STALE_CONFIRMATION_WINDOW_MS, isStripeCheckoutExpired, isConfirmationWindowStale } from '@/lib/cron/order-timing'

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time even when lengths differ
    const buf = Buffer.from(a)
    timingSafeEqual(buf, buf)
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Daily order & payment cleanup cron.
 *
 * Phase 1: Expire order items vendors didn't confirm in time
 * Phase 2: Cancel Stripe orders where buyer never completed payment (10min window)
 * Phase 3: Cancel external payment orders past their pickup date
 * Phase 3.5: Vendor reminder for unconfirmed external orders (2+ hours old)
 * Phase 3.6: Auto-confirm digital external orders (24h after pickup date)
 * Phase 4: Notify buyers about missed pickups
 * Phase 4.5: Stale confirmed orders (vendor confirmed but never marked ready)
 * Phase 4.7: Auto-miss past-due market box pickups (2+ days overdue)
 * Phase 5: Retry failed vendor payouts (Stripe transfers)
 * Phase 6: Error report digest — email admin a summary of pending reports
 * Phase 7: Auto-fulfill stale confirmation windows (buyer confirmed, vendor didn't)
 * Phase 8: Expire vendor/buyer tier subscriptions past tier_expires_at
 * Phase 9: Data retention — delete old error_logs (90d), read notifications (60d), activity_events (30d)
 * Phase 10: Vendor trial lifecycle — reminders, trial expiry, grace period auto-unpublish
 *
 * Called by Vercel Cron daily at 12pm UTC / ~6am CT (configured in vercel.json)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/expire-orders', 'GET', async () => {
    // Skip cron on non-production Vercel environments (staging/preview waste DB resources)
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
      return NextResponse.json({ skipped: true, reason: 'Non-production environment' })
    }

    // Verify cron secret (Vercel sets this automatically for cron jobs)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // In production, verify the cron secret using timing-safe comparison
    if (!cronSecret) {
      console.error('CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const expectedAuth = `Bearer ${cronSecret}`
    if (!authHeader || !safeCompare(authHeader, expectedAuth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role for admin operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials for cron job')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let totalProcessed = 0
    let totalErrors = 0

    // ── Quick-check: skip all phases if no work exists ──────────
    // 4 lightweight count queries (head: true = no data transfer)
    const [activeItems, pendingOrders, failedPayouts, trialVendors] = await Promise.all([
      supabase.from('order_items').select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'confirmed', 'ready']),
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('vendor_payouts').select('*', { count: 'exact', head: true })
        .in('status', ['failed', 'pending_stripe_setup']),
      supabase.from('vendor_profiles').select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'trialing'),
    ])

    const workCount = (activeItems.count ?? 0) + (pendingOrders.count ?? 0)
      + (failedPayouts.count ?? 0) + (trialVendors.count ?? 0)

    if (workCount === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'No active orders, payouts, or trials to process',
        processed: 0,
        errors: 0,
      })
    }

    // ============================================================
    // PHASE 1: Expire order items past their expires_at time
    // (Vendor didn't confirm in time)
    // ============================================================
    try {
      const { data: expiredItems, error: fetchError } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          listing_id,
          quantity,
          subtotal_cents,
          status,
          listing:listings (
            title
          ),
          order:orders (
            id,
            order_number,
            buyer_user_id,
            vertical_id,
            stripe_checkout_session_id,
            buyer:user_profiles!orders_buyer_user_id_fkey (
              display_name,
              email
            )
          ),
          vendor:vendor_profiles (
            id,
            profile_data
          )
        `)
        .lte('expires_at', new Date().toISOString())
        .eq('status', 'pending')
        .is('cancelled_at', null)
        .limit(100) // Process in batches

      if (fetchError) {
        console.error('Error fetching expired items:', fetchError.message)
      } else if (expiredItems && expiredItems.length > 0) {
        for (const item of expiredItems) {
          try {
            // H20 FIX: Calculate buyer's actual paid amount (not just subtotal)
            const { count: totalItemsInOrder } = await supabase
              .from('order_items')
              .select('id', { count: 'exact', head: true })
              .eq('order_id', item.order_id)

            const buyerPercentFee = Math.round(item.subtotal_cents * (FEES.buyerFeePercent / 100))
            const itemFlatFee = totalItemsInOrder ? proratedFlatFeeSimple(FEES.buyerFlatFeeCents, totalItemsInOrder) : 0
            const buyerPaidForItem = item.subtotal_cents + buyerPercentFee + itemFlatFee

            // H3 FIX: Conditional UPDATE — only succeeds if cancelled_at IS NULL.
            // Prevents race with manual buyer/vendor cancel happening concurrently.
            const { data: expiredRows, error: updateError } = await supabase
              .from('order_items')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: 'system',
                cancellation_reason: 'Order expired - vendor did not confirm in time',
                refund_amount_cents: buyerPaidForItem
              })
              .eq('id', item.id)
              .is('cancelled_at', null)
              .select('id')

            if (updateError) {
              console.error('Error expiring order item:', updateError.message)
              totalErrors++
              continue
            }

            // Item already cancelled by concurrent request — skip refund/restore
            if (!expiredRows || expiredRows.length === 0) {
              console.log(`[Phase 1] Item ${item.id} already cancelled by concurrent request, skipping`)
              continue
            }

            // Restore inventory for expired item
            if (item.listing_id) {
              await restoreInventory(supabase, item.listing_id, item.quantity || 1)
            }

            // Check if all items in the order are now cancelled
            const { data: remainingItems } = await supabase
              .from('order_items')
              .select('id, status')
              .eq('order_id', item.order_id)
              .is('cancelled_at', null)

            if (!remainingItems || remainingItems.length === 0) {
              // All items cancelled, update order status
              await supabase
                .from('orders')
                .update({ status: 'cancelled' })
                .eq('id', item.order_id)
            }

            // Process Stripe refund
            const order = item.order as any
            if (order?.stripe_checkout_session_id) {
              const { data: payment } = await supabase
                .from('payments')
                .select('stripe_payment_intent_id, status')
                .eq('order_id', item.order_id)
                .eq('status', 'succeeded')
                .single()

              if (payment?.stripe_payment_intent_id) {
                try {
                  await createRefund(payment.stripe_payment_intent_id, buyerPaidForItem)
                } catch (refundError) {
                  console.error('[REFUND_FAILED] Stripe refund failed for expired item:', {
                    orderItemId: item.id,
                    amountCents: buyerPaidForItem,
                    error: refundError instanceof Error ? refundError.message : refundError
                  })
                  // Continue processing — refund needs manual admin attention
                }
              }
            }

            // Send notification to buyer
            const listing = item.listing as any
            const vendor = item.vendor as any
            const vendorData = vendor?.profile_data as Record<string, unknown> | null

            if (order?.buyer_user_id) {
              await notifyOrderExpired(
                order.buyer_user_id,
                {
                  orderNumber: order.order_number || item.order_id.slice(0, 8),
                  itemTitle: listing?.title || 'Item',
                  vendorName: (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor',
                  amountCents: buyerPaidForItem
                },
                { userEmail: order.buyer?.email, vertical: order.vertical_id }
              )
            }

            totalProcessed++
          } catch (itemError) {
            console.error('Error processing expired item:', itemError instanceof Error ? itemError.message : 'Unknown error')
            totalErrors++
          }
        }
      }
    } catch (phase1Error) {
      console.error('Phase 1 error:', phase1Error instanceof Error ? phase1Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 2: Cancel expired pending Stripe orders (10min window)
    // Orders where buyer initiated checkout but never completed payment
    // ============================================================
    try {
      const tenMinutesAgo = new Date(Date.now() - STRIPE_CHECKOUT_EXPIRY_MS).toISOString()

      const { data: staleStripeOrders, error: staleError } = await supabase
        .from('orders')
        .select('id, order_number, buyer_user_id')
        .eq('status', 'pending')
        .not('stripe_checkout_session_id', 'is', null)
        .lte('created_at', tenMinutesAgo)
        .limit(100)

      if (staleError) {
        console.error('Error fetching stale Stripe orders:', staleError.message)
      } else if (staleStripeOrders && staleStripeOrders.length > 0) {
        for (const order of staleStripeOrders) {
          try {
            // Restore inventory for all items in this order
            await restoreOrderInventory(supabase, order.id)

            // Cancel all order items
            await supabase
              .from('order_items')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: 'system',
                cancellation_reason: 'Payment not completed within 10 minutes'
              })
              .eq('order_id', order.id)
              .is('cancelled_at', null)

            // Cancel the order
            await supabase
              .from('orders')
              .update({ status: 'cancelled' })
              .eq('id', order.id)

            totalProcessed++
          } catch (orderError) {
            console.error('Error cancelling stale Stripe order:', orderError instanceof Error ? orderError.message : 'Unknown error')
            totalErrors++
          }
        }
      }
    } catch (phase2Error) {
      console.error('Phase 2 error:', phase2Error instanceof Error ? phase2Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 3: Cancel external payment orders past pickup time
    // Orders with payment_method in (venmo, cashapp, paypal, cash)
    // that are still pending after their pickup date has passed
    // ============================================================
    try {
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

      // Find external payment orders where all order_items have pickup_date < today
      // and order is still pending (vendor never confirmed payment)
      const { data: staleExternalOrders, error: externalError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          buyer_user_id,
          payment_method,
          order_items (
            id,
            pickup_date,
            cancelled_at
          )
        `)
        .eq('status', 'pending')
        .in('payment_method', ['venmo', 'cashapp', 'paypal', 'cash'])
        .limit(100)

      if (externalError) {
        console.error('Error fetching stale external orders:', externalError.message)
      } else if (staleExternalOrders && staleExternalOrders.length > 0) {
        for (const order of staleExternalOrders) {
          try {
            const items = order.order_items as Array<{
              id: string
              pickup_date: string | null
              cancelled_at: string | null
            }>

            // Check if all active items have a pickup_date that has passed
            const activeItems = items.filter(i => !i.cancelled_at)
            if (activeItems.length === 0) continue

            const allPastPickup = activeItems.every(item => {
              if (!item.pickup_date) return false // No pickup date — don't auto-cancel
              return item.pickup_date < today
            })

            if (!allPastPickup) continue

            // Restore inventory for all items in this order
            await restoreOrderInventory(supabase, order.id)

            // Cancel all order items
            await supabase
              .from('order_items')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: 'system',
                cancellation_reason: 'External payment order expired - pickup date passed without payment confirmation'
              })
              .eq('order_id', order.id)
              .is('cancelled_at', null)

            // Cancel the order
            await supabase
              .from('orders')
              .update({ status: 'cancelled' })
              .eq('id', order.id)

            totalProcessed++
          } catch (orderError) {
            console.error('Error cancelling stale external order:', orderError instanceof Error ? orderError.message : 'Unknown error')
            totalErrors++
          }
        }
      }
    } catch (phase3Error) {
      console.error('Phase 3 error:', phase3Error instanceof Error ? phase3Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 3.5: Vendor reminder for unconfirmed external orders
    // Per-vertical timing: FT = 15min after order, FM = 12hr after order.
    // Does NOT auto-confirm — just sends a reminder notification.
    // ============================================================
    // Constants imported from @/lib/cron/external-payment

    let externalReminders = 0
    try {
      // Use the shortest delay (FT=15min) to fetch all candidates, then filter per-vertical
      const shortestDelay = Math.min(...Object.values(REMINDER_DELAY_MS))
      const earliestCutoff = new Date(Date.now() - shortestDelay).toISOString()

      const { data: unreminderOrders, error: reminderError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          payment_method,
          total_cents,
          buyer_user_id,
          vertical_id,
          created_at,
          order_items (
            id,
            vendor_profile_id,
            vendor_profiles (
              id,
              user_id,
              profile_data
            )
          )
        `)
        .eq('status', 'pending')
        .in('payment_method', ['venmo', 'cashapp', 'paypal'])
        .is('external_payment_confirmed_at', null)
        .lte('created_at', earliestCutoff)
        .limit(50)

      if (reminderError) {
        console.error('[Phase 3.5] Error fetching unconfirmed external orders:', reminderError.message)
      } else if (unreminderOrders && unreminderOrders.length > 0) {
        // Group by vendor to send one reminder per vendor
        const vendorOrders = new Map<string, { userId: string; orderCount: number; vertical: string }>()
        const now = Date.now()

        for (const order of unreminderOrders) {
          // Per-vertical: check if this order is old enough for its vertical's reminder delay
          const vertical = order.vertical_id || 'farmers_market'
          if (!isOrderOldEnoughForReminder(order.created_at, vertical, now)) continue

          const items = order.order_items as unknown as Array<{
            id: string
            vendor_profile_id: string
            vendor_profiles: { id: string; user_id: string; profile_data?: unknown }
          }>
          for (const item of items) {
            const vp = item.vendor_profiles
            if (vp?.user_id && !vendorOrders.has(vp.user_id)) {
              vendorOrders.set(vp.user_id, {
                userId: vp.user_id,
                orderCount: 0,
                vertical,
              })
            }
            const entry = vendorOrders.get(vp?.user_id || '')
            if (entry) entry.orderCount++
          }
        }

        for (const [, vendor] of vendorOrders) {
          await sendNotification(vendor.userId, 'external_payment_reminder', {
            pendingOrderCount: vendor.orderCount,
          }, { vertical: vendor.vertical })
          externalReminders++
        }

        if (externalReminders > 0) {
          console.log(`[Phase 3.5] Sent ${externalReminders} vendor reminders for unconfirmed external orders`)
        }
      }
    } catch (phase35Error) {
      console.error('Phase 3.5 error:', phase35Error instanceof Error ? phase35Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 3.6: Auto-confirm digital external orders 24h after pickup
    // Digital orders (Venmo/CashApp/PayPal) where vendor never
    // confirmed payment and pickup_date + 24 hours has passed.
    // Auto-confirm payment, record fees, notify vendor.
    // Cash orders are NOT auto-confirmed (no way to verify exchange).
    // ============================================================
    let externalAutoConfirmed = 0
    try {
      const yesterdayDate = getAutoConfirmCutoffDate()

      const { data: staleDigitalOrders, error: digitalError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          payment_method,
          subtotal_cents,
          total_cents,
          buyer_user_id,
          vertical_id,
          order_items (
            id,
            pickup_date,
            cancelled_at,
            vendor_profile_id,
            subtotal_cents,
            vendor_profiles (
              id,
              user_id,
              profile_data
            )
          )
        `)
        .eq('status', 'pending')
        .in('payment_method', ['venmo', 'cashapp', 'paypal'])
        .is('external_payment_confirmed_at', null)
        .limit(50)

      if (digitalError) {
        console.error('[Phase 3.6] Error fetching stale digital orders:', digitalError.message)
      } else if (staleDigitalOrders && staleDigitalOrders.length > 0) {
        for (const order of staleDigitalOrders) {
          try {
            const items = order.order_items as unknown as Array<{
              id: string
              pickup_date: string | null
              cancelled_at: string | null
              vendor_profile_id: string
              subtotal_cents: number
              vendor_profiles: { id: string; user_id: string; profile_data?: unknown }
            }>

            if (!areAllItemsPastPickupWindow(items, yesterdayDate)) continue

            const activeItems = items.filter(i => !i.cancelled_at)

            const now = new Date().toISOString()

            // Record platform fees
            for (const item of activeItems) {
              await recordExternalPaymentFee(
                supabase,
                item.vendor_profile_id,
                order.id,
                item.subtotal_cents
              )
            }

            // Auto-confirm: update order status to paid
            await supabase
              .from('orders')
              .update({
                status: 'paid',
                external_payment_confirmed_at: now,
                external_payment_confirmed_by: 'system',
                updated_at: now,
              })
              .eq('id', order.id)

            // Update order items to confirmed
            await supabase
              .from('order_items')
              .update({
                status: 'confirmed',
                updated_at: now,
              })
              .eq('order_id', order.id)
              .is('cancelled_at', null)

            // Notify vendor
            const firstVendor = activeItems[0]?.vendor_profiles
            if (firstVendor?.user_id) {
              const methodLabel = formatPaymentMethodLabel(order.payment_method)
              await sendNotification(firstVendor.user_id, 'external_payment_auto_confirmed', {
                orderNumber: order.order_number,
                paymentMethod: methodLabel,
              }, { vertical: order.vertical_id || 'farmers_market' })
            }

            externalAutoConfirmed++
            totalProcessed++
          } catch (orderError) {
            console.error('[Phase 3.6] Error auto-confirming external order:', orderError instanceof Error ? orderError.message : 'Unknown error')
            totalErrors++
          }
        }

        if (externalAutoConfirmed > 0) {
          console.log(`[Phase 3.6] Auto-confirmed ${externalAutoConfirmed} digital external orders`)
        }
      }
    } catch (phase36Error) {
      console.error('Phase 3.6 error:', phase36Error instanceof Error ? phase36Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 4: Handle missed pickups (buyer no-show)
    // Order items with status 'ready' where pickup_date has passed.
    // Vendor did their part — pay vendor, notify buyer to contact vendor.
    // ============================================================
    try {
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

      const { data: missedItems, error: missedError } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          pickup_date,
          preferred_pickup_time,
          vendor_payout_cents,
          vendor_profile_id,
          listing:listings (
            title
          ),
          order:orders (
            id,
            order_number,
            buyer_user_id,
            vertical_id,
            tip_amount,
            tip_on_platform_fee_cents,
            stripe_checkout_session_id,
            order_items (id)
          ),
          vendor:vendor_profiles (
            id,
            user_id,
            profile_data,
            stripe_account_id,
            stripe_payouts_enabled
          )
        `)
        .eq('status', 'ready')
        .is('cancelled_at', null)
        .lte('pickup_date', today)
        .limit(100)

      if (missedError) {
        console.error('Error fetching missed pickup items:', missedError.message)
      } else if (missedItems && missedItems.length > 0) {
        for (const item of missedItems) {
          try {
            const order = item.order as any
            const listing = item.listing as any
            const vendor = item.vendor as any

            // H7 FIX: Use shouldTriggerNoShow() for vertical-aware timing
            // FT: 1 hour after preferred_pickup_time. FM: date-based (pickup_date < today).
            if (!shouldTriggerNoShow(
              item.pickup_date,
              (item as any).preferred_pickup_time || null,
              order?.vertical_id || 'farmers_market',
            )) {
              continue // Not yet time to trigger no-show for this item
            }

            const vendorData = vendor?.profile_data as Record<string, unknown> | null
            const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'

            // Mark as fulfilled — vendor did their part, buyer didn't show
            await supabase
              .from('order_items')
              .update({ status: 'fulfilled' })
              .eq('id', item.id)

            // H19 FIX: Pay vendor for no-show items (vendor prepared the order)
            const actualPayoutCents = calculateNoShowPayout({
              vendorPayoutCents: item.vendor_payout_cents || 0,
              tipAmount: order?.tip_amount || 0,
              tipOnPlatformFeeCents: order?.tip_on_platform_fee_cents || 0,
              totalItemsInOrder: order?.order_items?.length || 1,
            })

            if (actualPayoutCents > 0 && order?.stripe_checkout_session_id) {
              // Check for existing payout (prevent double payout)
              const { data: existingPayout } = await supabase
                .from('vendor_payouts')
                .select('id')
                .eq('order_item_id', item.id)
                .neq('status', 'failed')
                .maybeSingle()

              if (!existingPayout) {
                // H-10 FIX: Insert payout record FIRST (atomic pattern).
                // Guarantees a record exists even if the transfer call or subsequent DB update fails.
                const initialStatus = vendor?.stripe_account_id && vendor?.stripe_payouts_enabled
                  ? 'pending' : 'pending_stripe_setup'

                const { data: payoutRecord } = await supabase.from('vendor_payouts').insert({
                  order_item_id: item.id,
                  vendor_profile_id: item.vendor_profile_id,
                  amount_cents: actualPayoutCents,
                  stripe_transfer_id: null,
                  status: initialStatus,
                }).select('id').single()

                // If vendor has Stripe, attempt transfer
                if (payoutRecord && initialStatus === 'pending') {
                  try {
                    const transfer = await transferToVendor({
                      amount: actualPayoutCents,
                      destination: vendor.stripe_account_id,
                      orderId: item.order_id,
                      orderItemId: item.id,
                    })

                    await supabase.from('vendor_payouts')
                      .update({ stripe_transfer_id: transfer.id, status: 'processing', updated_at: new Date().toISOString() })
                      .eq('id', payoutRecord.id)
                  } catch (transferError) {
                    console.error('[Phase 4] Stripe transfer failed for no-show payout:', transferError)
                    await supabase.from('vendor_payouts')
                      .update({ status: 'failed', updated_at: new Date().toISOString() })
                      .eq('id', payoutRecord.id)
                  }
                }
              }
            }

            // Notify buyer: pickup was missed, contact vendor for resolution
            if (order?.buyer_user_id) {
              await sendNotification(order.buyer_user_id, 'pickup_missed', {
                orderNumber: order.order_number || item.order_id.slice(0, 8),
                itemTitle: listing?.title || 'Item',
                vendorName,
              }, { vertical: order.vertical_id })
            }

            totalProcessed++
          } catch (itemError) {
            console.error('Error processing missed pickup:', itemError instanceof Error ? itemError.message : 'Unknown error')
            totalErrors++
          }
        }
      }
    } catch (phase4Error) {
      console.error('Phase 4 error:', phase4Error instanceof Error ? phase4Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 4.5: Stale confirmed orders (vendor confirmed but never
    // marked ready — pickup date has passed)
    //
    // Timeline (relative to pickup_date, midnight local to truck):
    //   Day 0 midnight: First vendor notification (stale_confirmed_vendor)
    //   Day 1 during:   Second vendor notification (stale_confirmed_vendor_final)
    //                   + Buyer notification (stale_confirmed_buyer)
    //   Day 1 midnight: Blocking banner activates in vendor UI
    //                   (client-side: pickup_date < today - 1 day)
    //
    // Cron runs daily. Day calculation uses UTC dates.
    // Blocking is enforced client-side using browser local time.
    // ============================================================
    let staleConfirmedCount = 0
    try {
      const today = new Date().toISOString().split('T')[0]
      // 3-day outer lookback (widest window — covers buyer notifications)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]

      const { data: staleItems, error: staleError } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          pickup_date,
          vendor_profile_id,
          listing:listings (
            title
          ),
          order:orders (
            id,
            order_number,
            buyer_user_id,
            vertical_id
          ),
          vendor:vendor_profiles (
            id,
            user_id,
            profile_data
          )
        `)
        .eq('status', 'confirmed')
        .is('cancelled_at', null)
        .lt('pickup_date', today)
        .gte('pickup_date', threeDaysAgo)
        .limit(50)

      if (staleError) {
        console.error('[Phase 4.5] Query error:', staleError.message)
      } else if (staleItems && staleItems.length > 0) {
        // Batch dedup: 1 query for all recent stale notifications (replaces 3 queries per item)
        const { data: recentStaleNotifs } = await supabase
          .from('notifications')
          .select('user_id, type, data')
          .in('type', ['stale_confirmed_vendor', 'stale_confirmed_vendor_final', 'stale_confirmed_buyer'])
          .gte('created_at', new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString())

        const sentStaleNotifs = new Set(
          (recentStaleNotifs || []).map(n => {
            const orderItemId = (n.data as Record<string, unknown>)?.orderItemId
            return `${n.user_id}:${n.type}:${orderItemId}`
          })
        )

        for (const item of staleItems) {
          try {
            const order = item.order as any
            const listing = item.listing as any
            const vendor = item.vendor as any
            const vendorData = vendor?.profile_data as Record<string, unknown> | null
            const vendorName = (vendorData?.business_name as string) ||
              (vendorData?.farm_name as string) || 'Vendor'
            const notifData = {
              orderNumber: order?.order_number || item.order_id.slice(0, 8),
              itemTitle: listing?.title || 'Item',
              orderItemId: item.id,
            }

            // Calculate days since pickup (0 = pickup was yesterday, 1 = 2 days ago, etc.)
            const pickupMs = new Date(item.pickup_date + 'T00:00:00Z').getTime()
            const todayMs = new Date(today + 'T00:00:00Z').getTime()
            const daysSincePickup = Math.floor((todayMs - pickupMs) / (24 * 60 * 60 * 1000))

            if (vendor?.user_id) {
              // Day 1 (pickup was yesterday): First vendor notification
              if (daysSincePickup >= 1 && !sentStaleNotifs.has(`${vendor.user_id}:stale_confirmed_vendor:${item.id}`)) {
                await sendNotification(vendor.user_id, 'stale_confirmed_vendor', notifData, { vertical: order?.vertical_id })
                staleConfirmedCount++
              }

              // Day 2+ (blocking imminent/active): Final vendor notification
              if (daysSincePickup >= 2 && !sentStaleNotifs.has(`${vendor.user_id}:stale_confirmed_vendor_final:${item.id}`)) {
                await sendNotification(vendor.user_id, 'stale_confirmed_vendor_final', notifData, { vertical: order?.vertical_id })
                staleConfirmedCount++
              }
            }

            // Buyer notification: sent on day 1+ (within 3-day lookback)
            if (daysSincePickup >= 1 && order?.buyer_user_id && !sentStaleNotifs.has(`${order.buyer_user_id}:stale_confirmed_buyer:${item.id}`)) {
              await sendNotification(order.buyer_user_id, 'stale_confirmed_buyer', {
                ...notifData,
                vendorName,
              }, { vertical: order.vertical_id })
              staleConfirmedCount++
            }
          } catch (itemError) {
            console.error('[Phase 4.5] Error processing stale confirmed item:',
              itemError instanceof Error ? itemError.message : 'Unknown error')
            totalErrors++
          }
        }
      }
    } catch (phase45Error) {
      console.error('Phase 4.5 error:', phase45Error instanceof Error ? phase45Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 4.6: Auto-expire stale confirmed orders (M-12)
    // Orders stuck in 'confirmed' for 7+ days with a pickup_date in the past
    // likely had both parties not show up. Mark as expired.
    // ============================================================
    let staleConfirmedExpired = 0
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const today = new Date().toISOString().split('T')[0]

      const { data: staleConfirmed } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          order:orders!inner(buyer_user_id, order_number, vertical_id)
        `)
        .eq('status', 'confirmed')
        .is('cancelled_at', null)
        .lt('pickup_date', today)
        .lt('updated_at', sevenDaysAgo.toISOString())
        .limit(100)

      if (staleConfirmed && staleConfirmed.length > 0) {
        for (const item of staleConfirmed) {
          const orderData = (item as any).order as any
          await supabase
            .from('order_items')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', item.id)

          // Check if all items in this order are now terminal → expire the order too
          await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: item.order_id })

          if (orderData?.buyer_user_id) {
            await sendNotification(orderData.buyer_user_id, 'order_expired', {
              orderNumber: orderData.order_number,
            }, { vertical: orderData.vertical_id })
          }

          staleConfirmedExpired++
          totalProcessed++
        }
      }
    } catch (phase46Error) {
      console.error('Phase 4.6 error:', phase46Error instanceof Error ? phase46Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 4.7: Auto-miss past-due market box pickups
    // Market box pickups that are still 'scheduled' past their grace period.
    // H-3 FIX: Per-vertical grace periods — FM=2 days, FT=2 hours.
    // Uses shortest cutoff (2h) for the query, then checks per-vertical in the loop.
    // ============================================================
    let marketBoxPickupsMissed = 0
    try {
      // Use shortest grace period for the DB filter (FT=2 hours)
      const shortestCutoff = new Date()
      shortestCutoff.setHours(shortestCutoff.getHours() - 2)
      const cutoffDateStr = shortestCutoff.toISOString().split('T')[0] // YYYY-MM-DD

      const { data: overduePickups, error: overdueError } = await supabase
        .from('market_box_pickups')
        .select(`
          id,
          subscription_id,
          scheduled_date,
          week_number,
          market_box_subscriptions!inner (
            buyer_user_id,
            offering_id,
            market_box_offerings!inner (
              name,
              vendor_profile_id,
              vertical_id,
              vendor_profiles!inner (
                profile_data
              )
            )
          )
        `)
        .eq('status', 'scheduled')
        .lt('scheduled_date', cutoffDateStr)
        .limit(50)

      if (overdueError) {
        console.error('[Phase 4.7] Query error:', overdueError)
      } else if (overduePickups && overduePickups.length > 0) {
        for (const pickup of overduePickups) {
          try {
            // H-3: Per-vertical grace period check
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pickupSub = pickup.market_box_subscriptions as any
            const pickupVertical = pickupSub?.market_box_offerings?.vertical_id || 'farmers_market'
            const scheduledDate = new Date(pickup.scheduled_date)
            const now = new Date()
            const hoursElapsed = (now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60)

            // FM = 48 hours (2 days), FT = 2 hours
            const graceHours = pickupVertical === 'food_trucks' ? 2 : 48
            if (hoursElapsed < graceHours) continue

            // Mark as missed
            const { error: updateError } = await supabase
              .from('market_box_pickups')
              .update({
                status: 'missed',
                missed_at: new Date().toISOString(),
              })
              .eq('id', pickup.id)

            if (updateError) {
              console.error('[Phase 4.7] Update error for pickup', pickup.id, updateError)
              totalErrors++
              continue
            }

            // Extract notification data from the nested join
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sub = pickup.market_box_subscriptions as any
            const offering = sub?.market_box_offerings
            const vendor = offering?.vendor_profiles
            const profileData = vendor?.profile_data
            const vendorName = (profileData?.business_name as string) || 'Your vendor'
            const offeringName = (offering?.name as string) || 'Market Box'
            const verticalId = (offering?.vertical_id as string) || 'farmers_market'
            const buyerUserId = sub?.buyer_user_id as string

            // Notify buyer
            if (buyerUserId) {
              await sendNotification(buyerUserId, 'market_box_pickup_missed', {
                vendorName,
                offeringName,
                pickupDate: new Date(pickup.scheduled_date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                }),
              }, { vertical: verticalId })
            }

            marketBoxPickupsMissed++
          } catch (pickupError) {
            console.error('[Phase 4.7] Error processing overdue pickup:', pickupError instanceof Error ? pickupError.message : 'Unknown error')
            totalErrors++
          }
        }
      }
    } catch (phase47Error) {
      console.error('Phase 4.7 error:', phase47Error instanceof Error ? phase47Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 5: Retry failed vendor payouts (Stripe transfers)
    // Picks up vendor_payouts with status='failed', retries transfer
    // After 7 days of failure, marks as cancelled + alerts admin
    // ============================================================
    let payoutsRetried = 0
    let payoutsSucceeded = 0
    let payoutsCancelled = 0
    try {
      const MAX_PAYOUTS_PER_RUN = 10
      // Global Stripe transfer budget across all Phase 5 sub-queries.
      // Each Stripe API call takes 1-2s. 15 max keeps Phase 5 under 30s.
      const MAX_STRIPE_TRANSFERS_TOTAL = 15
      let stripeTransfersUsed = 0
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - PAYOUT_RETRY_MAX_DAYS)

      // Get failed payouts within retry window
      const { data: failedPayouts, error: payoutFetchError } = await supabase
        .from('vendor_payouts')
        .select(`
          id,
          order_item_id,
          vendor_profile_id,
          amount_cents,
          created_at,
          vendor_profiles!inner (
            stripe_account_id,
            stripe_payouts_enabled,
            user_id
          ),
          order_items!inner (
            order_id
          )
        `)
        .eq('status', 'failed')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: true })
        .limit(MAX_PAYOUTS_PER_RUN)

      if (payoutFetchError) {
        console.error('[Phase 5] Query error:', payoutFetchError)
      } else if (failedPayouts && failedPayouts.length > 0) {
        for (const payout of failedPayouts) {
          if (stripeTransfersUsed >= MAX_STRIPE_TRANSFERS_TOTAL) break
          const vendorProfile = payout.vendor_profiles as unknown as {
            stripe_account_id: string | null
            stripe_payouts_enabled: boolean
            user_id: string
          }
          const orderItem = payout.order_items as unknown as { order_id: string }

          // Skip if vendor still doesn't have Stripe ready
          if (!vendorProfile?.stripe_account_id || !vendorProfile.stripe_payouts_enabled) {
            continue
          }

          payoutsRetried++
          stripeTransfersUsed++

          try {
            const transfer = await transferToVendor({
              amount: payout.amount_cents,
              destination: vendorProfile.stripe_account_id,
              orderId: orderItem.order_id,
              orderItemId: payout.order_item_id,
            })

            await supabase
              .from('vendor_payouts')
              .update({
                status: 'processing',
                stripe_transfer_id: transfer.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', payout.id)

            payoutsSucceeded++
            totalProcessed++
          } catch {
            // Update timestamp so we can track retry attempts
            await supabase
              .from('vendor_payouts')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', payout.id)

            totalErrors++
          }
        }
      }

      // F8 FIX: Also retry pending_stripe_setup payouts where vendor now has Stripe ready
      const { data: pendingStripePayouts } = await supabase
        .from('vendor_payouts')
        .select(`
          id,
          order_item_id,
          vendor_profile_id,
          amount_cents,
          created_at,
          vendor_profiles!inner (
            stripe_account_id,
            stripe_payouts_enabled,
            user_id
          ),
          order_items!inner (
            order_id
          )
        `)
        .eq('status', 'pending_stripe_setup')
        .order('created_at', { ascending: true })
        .limit(MAX_PAYOUTS_PER_RUN)

      if (pendingStripePayouts && pendingStripePayouts.length > 0) {
        for (const payout of pendingStripePayouts) {
          if (stripeTransfersUsed >= MAX_STRIPE_TRANSFERS_TOTAL) break
          const vp = payout.vendor_profiles as unknown as {
            stripe_account_id: string | null
            stripe_payouts_enabled: boolean
            user_id: string
          }
          const oi = payout.order_items as unknown as { order_id: string }

          if (!vp?.stripe_account_id || !vp.stripe_payouts_enabled) {
            continue // Vendor still doesn't have Stripe ready
          }

          payoutsRetried++
          stripeTransfersUsed++
          try {
            const transfer = await transferToVendor({
              amount: payout.amount_cents,
              destination: vp.stripe_account_id,
              orderId: oi.order_id,
              orderItemId: payout.order_item_id,
            })

            await supabase
              .from('vendor_payouts')
              .update({
                status: 'processing',
                stripe_transfer_id: transfer.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', payout.id)

            payoutsSucceeded++
            totalProcessed++
          } catch {
            // Move to failed status so regular retry logic handles it
            await supabase
              .from('vendor_payouts')
              .update({
                status: 'failed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', payout.id)

            totalErrors++
          }
        }
      }

      // Retry failed market box subscription payouts (same logic as order payouts)
      const { data: failedMbPayouts } = await supabase
        .from('vendor_payouts')
        .select(`
          id,
          market_box_subscription_id,
          vendor_profile_id,
          amount_cents,
          created_at,
          vendor_profiles!inner (
            stripe_account_id,
            stripe_payouts_enabled,
            user_id
          )
        `)
        .eq('status', 'failed')
        .not('market_box_subscription_id', 'is', null)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: true })
        .limit(MAX_PAYOUTS_PER_RUN)

      if (failedMbPayouts && failedMbPayouts.length > 0) {
        for (const payout of failedMbPayouts) {
          if (stripeTransfersUsed >= MAX_STRIPE_TRANSFERS_TOTAL) break
          const vp = payout.vendor_profiles as unknown as {
            stripe_account_id: string | null
            stripe_payouts_enabled: boolean
            user_id: string
          }

          if (!vp?.stripe_account_id || !vp.stripe_payouts_enabled) continue

          payoutsRetried++
          stripeTransfersUsed++
          try {
            const transfer = await transferMarketBoxPayout({
              amount: payout.amount_cents,
              destination: vp.stripe_account_id,
              subscriptionId: payout.market_box_subscription_id!,
            })

            await supabase
              .from('vendor_payouts')
              .update({
                status: 'processing',
                stripe_transfer_id: transfer.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', payout.id)

            payoutsSucceeded++
            totalProcessed++
          } catch {
            await supabase
              .from('vendor_payouts')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', payout.id)

            totalErrors++
          }
        }
      }

      // Retry pending_stripe_setup market box payouts where vendor now has Stripe
      const { data: pendingMbPayouts } = await supabase
        .from('vendor_payouts')
        .select(`
          id,
          market_box_subscription_id,
          vendor_profile_id,
          amount_cents,
          created_at,
          vendor_profiles!inner (
            stripe_account_id,
            stripe_payouts_enabled,
            user_id
          )
        `)
        .eq('status', 'pending_stripe_setup')
        .not('market_box_subscription_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(MAX_PAYOUTS_PER_RUN)

      if (pendingMbPayouts && pendingMbPayouts.length > 0) {
        for (const payout of pendingMbPayouts) {
          if (stripeTransfersUsed >= MAX_STRIPE_TRANSFERS_TOTAL) break
          const vp = payout.vendor_profiles as unknown as {
            stripe_account_id: string | null
            stripe_payouts_enabled: boolean
            user_id: string
          }

          if (!vp?.stripe_account_id || !vp.stripe_payouts_enabled) continue

          payoutsRetried++
          stripeTransfersUsed++
          try {
            const transfer = await transferMarketBoxPayout({
              amount: payout.amount_cents,
              destination: vp.stripe_account_id,
              subscriptionId: payout.market_box_subscription_id!,
            })

            await supabase
              .from('vendor_payouts')
              .update({
                status: 'processing',
                stripe_transfer_id: transfer.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', payout.id)

            payoutsSucceeded++
            totalProcessed++
          } catch {
            await supabase
              .from('vendor_payouts')
              .update({
                status: 'failed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', payout.id)

            totalErrors++
          }
        }
      }

      // H-9: Check for stale 'processing' payouts — transfers that were initiated but never resolved.
      // If a payout has been 'processing' for 7+ days, mark as 'failed' so Phase 5 retries it.
      const STALE_PROCESSING_DAYS = 7
      const staleProcessingCutoff = new Date(Date.now() - STALE_PROCESSING_DAYS * 24 * 60 * 60 * 1000)
      const { data: staleProcessingPayouts } = await supabase
        .from('vendor_payouts')
        .select('id')
        .eq('status', 'processing')
        .lt('created_at', staleProcessingCutoff.toISOString())

      if (staleProcessingPayouts && staleProcessingPayouts.length > 0) {
        const staleIds = staleProcessingPayouts.map(p => p.id)
        await supabase
          .from('vendor_payouts')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .in('id', staleIds)

        console.warn(`[Phase 5] H-9: ${staleIds.length} stale 'processing' payouts (${STALE_PROCESSING_DAYS}+ days) marked as 'failed' for retry.`)
      }

      // M-11: Catch stale 'pending' payouts — records inserted before transfer but never updated.
      // This should only happen if the server crashed between insert and transfer.
      // A 'pending' payout older than 10 minutes is definitely stale.
      const STALE_PENDING_MINUTES = 10
      const stalePendingCutoff = new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000)
      const { data: stalePendingPayouts } = await supabase
        .from('vendor_payouts')
        .select('id')
        .eq('status', 'pending')
        .lt('created_at', stalePendingCutoff.toISOString())

      if (stalePendingPayouts && stalePendingPayouts.length > 0) {
        const stalePendingIds = stalePendingPayouts.map(p => p.id)
        await supabase
          .from('vendor_payouts')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .in('id', stalePendingIds)

        console.warn(`[Phase 5] M-11: ${stalePendingIds.length} stale 'pending' payouts (${STALE_PENDING_MINUTES}+ min) marked as 'failed' for retry.`)
      }

      // Mark expired payouts (older than retry window) as cancelled
      const { data: expiredPayouts } = await supabase
        .from('vendor_payouts')
        .select('id, amount_cents')
        .eq('status', 'failed')
        .lt('created_at', cutoffDate.toISOString())

      if (expiredPayouts && expiredPayouts.length > 0) {
        const expiredIds = expiredPayouts.map(p => p.id)
        await supabase
          .from('vendor_payouts')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .in('id', expiredIds)

        payoutsCancelled = expiredPayouts.length

        const totalCents = expiredPayouts.reduce((sum, p) => sum + p.amount_cents, 0)
        console.warn(
          `[Phase 5] ALERT: ${payoutsCancelled} payouts cancelled after ${PAYOUT_RETRY_MAX_DAYS} days. ` +
          `Total: $${(totalCents / 100).toFixed(2)}. Manual resolution required.`
        )

        // F9 FIX: Send admin alert email for permanently cancelled payouts
        const adminEmail = process.env.ADMIN_ALERT_EMAIL
        const apiKey = process.env.RESEND_API_KEY
        if (adminEmail && apiKey) {
          try {
            const { Resend } = await import('resend')
            const resend = new Resend(apiKey)
            await resend.emails.send({
              from: `Platform Alerts <${process.env.RESEND_FROM_EMAIL || 'updates@mail.farmersmarketing.app'}>`,
              to: adminEmail,
              subject: `[ACTION REQUIRED] ${payoutsCancelled} vendor payout${payoutsCancelled === 1 ? '' : 's'} cancelled — $${(totalCents / 100).toFixed(2)} needs manual resolution`,
              html: `
                <h2 style="color:#dc2626;margin:0 0 16px">Vendor Payouts Cancelled</h2>
                <p>${payoutsCancelled} vendor payout${payoutsCancelled === 1 ? '' : 's'} failed for ${PAYOUT_RETRY_MAX_DAYS}+ days and ${payoutsCancelled === 1 ? 'has' : 'have'} been permanently cancelled.</p>
                <p style="font-size:24px;font-weight:bold;margin:16px 0">$${(totalCents / 100).toFixed(2)}</p>
                <p>These vendors were not paid. Manual resolution required:</p>
                <ul>
                  ${expiredPayouts.map(p => `<li>Payout ${p.id.slice(0, 8)}... — $${(p.amount_cents / 100).toFixed(2)}</li>`).join('')}
                </ul>
                <p style="color:#6b7280;font-size:12px;margin-top:24px">Check the vendor_payouts table for full details.</p>
              `,
            })
          } catch (emailErr) {
            console.error('[Phase 5] Failed to send admin alert email:', emailErr)
          }
        }
      }
    } catch (phase5Error) {
      console.error('Phase 5 error:', phase5Error instanceof Error ? phase5Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 6: Error report digest
    // Email admin a summary of pending error reports from last 24h.
    // Groups by error_code so admin sees patterns at a glance.
    // ============================================================
    let errorReportsSummarized = 0
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data: pendingReports, error: reportsError } = await supabase
        .from('error_reports')
        .select('id, error_code, page_url, user_description, reporter_email, created_at')
        .eq('status', 'pending')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(200)

      if (reportsError) {
        console.error('[Phase 6] Error fetching reports:', reportsError.message)
      } else if (pendingReports && pendingReports.length > 0) {
        // Group by error_code
        const grouped: Record<string, typeof pendingReports> = {}
        for (const report of pendingReports) {
          const key = report.error_code || 'unknown'
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(report)
        }

        // Build digest email
        const sortedCodes = Object.entries(grouped)
          .sort((a, b) => b[1].length - a[1].length)

        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        const rows = sortedCodes.map(([code, reports]) => {
          const sample = reports[0]
          const desc = sample.user_description
            ? ` — "${esc(sample.user_description.slice(0, 80))}${sample.user_description.length > 80 ? '...' : ''}"`
            : ''
          const page = sample.page_url ? ` (${esc(sample.page_url)})` : ''
          return `<tr>
            <td style="padding:6px 12px;border:1px solid #e5e7eb;font-family:monospace;font-size:13px">${esc(code)}</td>
            <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;font-weight:bold">${reports.length}</td>
            <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">${desc}${page}</td>
          </tr>`
        }).join('')

        const adminEmail = process.env.ADMIN_ALERT_EMAIL
        const apiKey = process.env.RESEND_API_KEY
        if (adminEmail && apiKey) {
          const { Resend } = await import('resend')
          const resend = new Resend(apiKey)

          await resend.emails.send({
            from: `Platform Alerts <${process.env.RESEND_FROM_EMAIL || 'updates@mail.farmersmarketing.app'}>`,
            to: adminEmail,
            subject: `[Daily Digest] ${pendingReports.length} error report${pendingReports.length === 1 ? '' : 's'} — ${sortedCodes.length} unique error${sortedCodes.length === 1 ? '' : 's'}`,
            html: `
              <h2 style="margin:0 0 16px">Error Report Digest</h2>
              <p style="color:#6b7280;margin:0 0 16px">${pendingReports.length} user-reported error${pendingReports.length === 1 ? '' : 's'} in the last 24 hours.</p>
              <table style="border-collapse:collapse;width:100%">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left">Error Code</th>
                    <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:center">Count</th>
                    <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left">Sample</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin-top:16px">
                Review all reports: <a href="https://farmersmarketing.app/admin/errors">Admin Error Dashboard</a>
              </p>
            `,
          })

          errorReportsSummarized = pendingReports.length
          console.log(`[Phase 6] Digest sent: ${pendingReports.length} reports, ${sortedCodes.length} unique codes`)
        }
      }
    } catch (phase6Error) {
      console.error('Phase 6 error:', phase6Error instanceof Error ? phase6Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 7: Auto-fulfill stale confirmation windows
    // When buyer confirmed receipt but vendor didn't click "Fulfill"
    // within the 30-second window, the order item hangs indefinitely.
    // This phase finds stale windows (>5 min old) and auto-fulfills.
    // ============================================================
    let staleWindowsFulfilled = 0
    try {
      const fiveMinutesAgo = new Date(Date.now() - STALE_CONFIRMATION_WINDOW_MS).toISOString()

      // Order items: buyer confirmed but vendor didn't fulfill
      const { data: staleItems, error: staleError } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          vendor_profile_id,
          vendor_payout_cents,
          status,
          buyer_confirmed_at,
          vendor_confirmed_at,
          confirmation_window_expires_at,
          order:orders!inner (
            id,
            order_number,
            buyer_user_id,
            vertical_id,
            payment_method,
            tip_amount,
            tip_on_platform_fee_cents,
            stripe_checkout_session_id,
            order_items (id)
          ),
          vendor:vendor_profiles (
            id,
            stripe_account_id,
            stripe_payouts_enabled
          )
        `)
        .not('buyer_confirmed_at', 'is', null)
        .is('vendor_confirmed_at', null)
        .lt('confirmation_window_expires_at', fiveMinutesAgo)
        .in('status', ['ready', 'confirmed'])
        .limit(50)

      if (staleError) {
        console.error('[Phase 7] Error fetching stale windows:', staleError.message)
      } else if (staleItems && staleItems.length > 0) {
        for (const item of staleItems) {
          try {
            const now = new Date().toISOString()
            // Auto-set vendor_confirmed_at to fulfill the item
            const { error: updateError } = await supabase
              .from('order_items')
              .update({
                status: 'fulfilled',
                vendor_confirmed_at: now,
              })
              .eq('id', item.id)

            if (updateError) {
              console.error(`[Phase 7] Failed to auto-fulfill ${item.id}:`, updateError.message)
              totalErrors++
              continue
            }

            // Try to complete the parent order atomically
            await supabase.rpc('atomic_complete_order_if_ready', {
              p_order_id: item.order_id
            })

            // Create vendor payout (same logic as Phase 4)
            const order = item.order as any
            const vendor = item.vendor as any
            const tipAmount = order?.tip_amount || 0
            const tipOnPlatformFee = order?.tip_on_platform_fee_cents || 0
            const vendorTipCents = tipAmount - tipOnPlatformFee
            const totalItemsInOrder = order?.order_items?.length || 1
            const tipShareCents = totalItemsInOrder > 0 ? Math.round(vendorTipCents / totalItemsInOrder) : 0
            const actualPayoutCents = (item.vendor_payout_cents || 0) + tipShareCents

            if (actualPayoutCents > 0 && order?.stripe_checkout_session_id) {
              // Check for existing payout (prevent double payout)
              const { data: existingPayout } = await supabase
                .from('vendor_payouts')
                .select('id')
                .eq('order_item_id', item.id)
                .neq('status', 'failed')
                .maybeSingle()

              if (!existingPayout && vendor?.stripe_account_id && vendor?.stripe_payouts_enabled) {
                // M-11 FIX: Insert payout record BEFORE transfer to prevent tracking gaps
                const { data: payoutRecord, error: payoutInsertErr } = await supabase.from('vendor_payouts').insert({
                  order_item_id: item.id,
                  vendor_profile_id: item.vendor_profile_id,
                  amount_cents: actualPayoutCents,
                  stripe_transfer_id: null,
                  status: 'pending',
                }).select('id').single()

                if (payoutInsertErr && payoutInsertErr.code === '23505') {
                  console.log(`[Phase 7] Payout already exists (concurrent) for item ${item.id}`)
                } else {
                  try {
                    const transfer = await transferToVendor({
                      amount: actualPayoutCents,
                      destination: vendor.stripe_account_id,
                      orderId: item.order_id,
                      orderItemId: item.id,
                    })

                    if (payoutRecord) {
                      await supabase.from('vendor_payouts')
                        .update({ stripe_transfer_id: transfer.id, status: 'processing', updated_at: new Date().toISOString() })
                        .eq('id', payoutRecord.id)
                    }
                  } catch (transferError) {
                    console.error('[Phase 7] Stripe transfer failed for auto-fulfill payout:', transferError)
                    // Update to failed for retry in Phase 5
                    if (payoutRecord) {
                      await supabase.from('vendor_payouts')
                        .update({ status: 'failed', updated_at: new Date().toISOString() })
                        .eq('id', payoutRecord.id)
                    }
                  }
                }
              } else if (!existingPayout && !vendor?.stripe_payouts_enabled) {
                // Vendor doesn't have Stripe ready — record as pending
                await supabase.from('vendor_payouts').insert({
                  order_item_id: item.id,
                  vendor_profile_id: item.vendor_profile_id,
                  amount_cents: actualPayoutCents,
                  stripe_transfer_id: null,
                  status: 'pending_stripe_setup',
                })
              }
            }

            staleWindowsFulfilled++
            totalProcessed++
          } catch (itemError) {
            console.error(`[Phase 7] Error processing stale item ${item.id}:`, itemError)
            totalErrors++
          }
        }

        if (staleWindowsFulfilled > 0) {
          console.log(`[Phase 7] Auto-fulfilled ${staleWindowsFulfilled} stale confirmation windows`)
        }
      }

      // Market box pickups: same pattern
      const { data: stalePickups } = await supabase
        .from('market_box_pickups')
        .select('id, subscription_id, buyer_confirmed_at, vendor_confirmed_at, confirmation_window_expires_at')
        .not('buyer_confirmed_at', 'is', null)
        .is('vendor_confirmed_at', null)
        .lt('confirmation_window_expires_at', fiveMinutesAgo)
        .eq('status', 'ready')
        .limit(50)

      if (stalePickups && stalePickups.length > 0) {
        for (const pickup of stalePickups) {
          const { error: pickupError } = await supabase
            .from('market_box_pickups')
            .update({
              status: 'picked_up',
              vendor_confirmed_at: new Date().toISOString(),
            })
            .eq('id', pickup.id)

          if (!pickupError) {
            staleWindowsFulfilled++
            totalProcessed++
          }
        }
      }
    } catch (phase7Error) {
      console.error('Phase 7 error:', phase7Error instanceof Error ? phase7Error.message : 'Unknown error')
    }

    // ============================================================
    // PHASE 8: Expire vendor/buyer tier subscriptions
    // Downgrade vendors and buyers whose tier_expires_at has passed.
    // All vendors → 'free', Buyers → 'standard'
    // ============================================================
    let vendorTiersExpired = 0
    let buyerTiersExpired = 0
    try {
      // Expire vendor tiers
      const { data: expiredVendors } = await supabase
        .from('vendor_profiles')
        .select('id, tier, vertical_id, user_id')
        .lt('tier_expires_at', new Date().toISOString())
        .neq('tier', 'free')
        .limit(100)

      if (expiredVendors && expiredVendors.length > 0) {
        for (const vendor of expiredVendors) {
          const newTier = 'free' // Both verticals expire to free tier
          const { error: updateErr } = await supabase
            .from('vendor_profiles')
            .update({
              tier: newTier,
              tier_expires_at: null,
              stripe_subscription_id: null,
            })
            .eq('id', vendor.id)

          if (!updateErr) {
            vendorTiersExpired++
            totalProcessed++
            // Notify vendor their subscription expired
            await sendNotification(vendor.user_id, 'subscription_expired', {
              previousTier: vendor.tier,
              newTier: newTier,
            }, { vertical: vendor.vertical_id })
          }
        }
      }

      // Expire buyer tiers
      const { data: expiredBuyers } = await supabase
        .from('user_profiles')
        .select('id, buyer_tier')
        .lt('tier_expires_at', new Date().toISOString())
        .neq('buyer_tier', 'standard')
        .limit(100)

      if (expiredBuyers && expiredBuyers.length > 0) {
        const expiredIds = expiredBuyers.map(b => b.id)
        await supabase
          .from('user_profiles')
          .update({
            buyer_tier: 'standard',
            tier_expires_at: null,
          })
          .in('id', expiredIds)

        buyerTiersExpired = expiredBuyers.length
        totalProcessed += buyerTiersExpired
      }
    } catch (phase8Error) {
      console.error('Phase 8 error:', phase8Error instanceof Error ? phase8Error.message : 'Unknown error')
    }

    // ─── Phase 9: Data Retention Cleanup (Sundays only) ────────────────
    // Delete old logs, read notifications, and activity events to keep tables lean.
    // Runs weekly (Sundays) instead of daily — cleanup is not time-sensitive.
    let errorLogsDeleted = 0
    let notificationsDeleted = 0
    let activityEventsDeleted = 0
    if (isCleanupDay()) try {
      const cutoffs = calculateRetentionCutoffs()

      // Delete error_logs older than 90 days
      const { count: elCount } = await supabase
        .from('error_logs')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffs.error_logs)
      errorLogsDeleted = elCount || 0

      // Delete read notifications older than 60 days
      const { count: nCount } = await supabase
        .from('notifications')
        .delete({ count: 'exact' })
        .not('read_at', 'is', null)
        .lt('created_at', cutoffs.notifications)
      notificationsDeleted = nCount || 0

      // Delete activity_events older than 30 days
      const { count: aeCount } = await supabase
        .from('public_activity_events')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffs.activity_events)
      activityEventsDeleted = aeCount || 0

      totalProcessed += errorLogsDeleted + notificationsDeleted + activityEventsDeleted
    } catch (phase9Error) {
      console.error('Phase 9 error:', phase9Error instanceof Error ? phase9Error.message : 'Unknown error')
    }

    // ─── Phase 10: Vendor Trial Lifecycle ──────────────────────────────
    // 10a: Send trial reminder notifications (14d, 7d, 3d before expiry)
    // 10b: Expire trials past trial_ends_at → downgrade to free tier
    // 10c: Auto-unpublish excess resources after grace period ends
    let trialReminders = 0
    let trialExpired = 0
    let trialGraceProcessed = 0

    try {
      const now = new Date()
      const nowISO = now.toISOString()

      // ── Phase 10a: Trial Reminders ──
      const { data: trialVendors } = await supabase
        .from('vendor_profiles')
        .select('id, user_id, trial_ends_at, vertical_id')
        .eq('subscription_status', 'trialing')
        .not('trial_ends_at', 'is', null)
        .gt('trial_ends_at', nowISO)
        .limit(200)

      if (trialVendors && trialVendors.length > 0) {
        // Batch dedup: 1 query for all recent trial reminders (replaces 1 query per vendor)
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
        const { data: recentTrialNotifs } = await supabase
          .from('notifications')
          .select('user_id, type')
          .in('type', ['trial_reminder_14d', 'trial_reminder_7d', 'trial_reminder_3d'])
          .gte('created_at', dayAgo)

        const sentTrialReminders = new Set(
          (recentTrialNotifs || []).map(n => `${n.user_id}:${n.type}`)
        )

        for (const vendor of trialVendors) {
          const trialEnd = new Date(vendor.trial_ends_at)
          const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

          let notificationType: string | null = null
          if (daysRemaining <= 3) notificationType = 'trial_reminder_3d'
          else if (daysRemaining <= 7) notificationType = 'trial_reminder_7d'
          else if (daysRemaining <= 14) notificationType = 'trial_reminder_14d'

          if (notificationType && !sentTrialReminders.has(`${vendor.user_id}:${notificationType}`)) {
            const trialTierLabel = vendor.vertical_id === 'food_trucks' ? 'Basic' : 'Standard'
            await sendNotification(vendor.user_id, notificationType as Parameters<typeof sendNotification>[1], {
              trialTier: trialTierLabel,
              trialDays: daysRemaining,
            }, { vertical: vendor.vertical_id })
            trialReminders++
          }
        }
      }

      // ── Phase 10b: Trial Expiration ──
      const { data: expiredTrials } = await supabase
        .from('vendor_profiles')
        .select('id, user_id, trial_ends_at, trial_grace_ends_at, vertical_id')
        .eq('subscription_status', 'trialing')
        .not('trial_ends_at', 'is', null)
        .lt('trial_ends_at', nowISO)
        .limit(100)

      if (expiredTrials) {
        for (const vendor of expiredTrials) {
          // Downgrade to free tier
          await supabase
            .from('vendor_profiles')
            .update({
              tier: 'free',
              subscription_status: null,
            })
            .eq('id', vendor.id)

          // Format grace end date for notification
          const graceEnd = vendor.trial_grace_ends_at
            ? new Date(vendor.trial_grace_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : undefined

          const expiredTierLabel = vendor.vertical_id === 'food_trucks' ? 'Basic' : 'Standard'
          await sendNotification(vendor.user_id, 'trial_expired', {
            trialTier: expiredTierLabel,
            trialEndsAt: graceEnd,
          }, { vertical: vendor.vertical_id })

          trialExpired++
          totalProcessed++
        }
      }

      // ── Phase 10c: Grace Period Expiration — Auto-Unpublish Excess ──
      const { data: graceExpired } = await supabase
        .from('vendor_profiles')
        .select('id, user_id, vertical_id')
        .eq('tier', 'free')
        .not('trial_grace_ends_at', 'is', null)
        .lt('trial_grace_ends_at', nowISO)
        .limit(100)

      if (graceExpired) {
        for (const vendor of graceExpired) {
          // Use vertical-aware free tier limits
          const freeLimits = getTierLimits('free', vendor.vertical_id)
          const freeListingLimit = freeLimits.productListings
          const freeActiveBoxLimit = freeLimits.marketBoxes
          let unpublishedCount = 0
          let deactivatedBoxCount = 0

          // Get published listings ordered oldest first — keep oldest, unpublish newest
          const { data: listings } = await supabase
            .from('listings')
            .select('id')
            .eq('vendor_profile_id', vendor.id)
            .eq('status', 'published')
            .is('deleted_at', null)
            .order('created_at', { ascending: true })

          if (listings && listings.length > freeListingLimit) {
            // Keep the oldest N listings (established ones), unpublish the rest
            const toUnpublish = listings.slice(freeListingLimit).map(l => l.id)
            await supabase
              .from('listings')
              .update({ status: 'draft' })
              .in('id', toUnpublish)
            unpublishedCount = toUnpublish.length
          }

          // Deactivate excess active market boxes beyond free tier limit
          const { data: activeBoxes } = await supabase
            .from('market_box_offerings')
            .select('id')
            .eq('vendor_profile_id', vendor.id)
            .eq('active', true)
            .order('created_at', { ascending: true })

          if (activeBoxes && activeBoxes.length > freeActiveBoxLimit) {
            const toDeactivate = activeBoxes.slice(freeActiveBoxLimit).map(b => b.id)
            await supabase
              .from('market_box_offerings')
              .update({ active: false })
              .in('id', toDeactivate)
            deactivatedBoxCount = toDeactivate.length
          }

          // Clear grace period so this doesn't re-run
          await supabase
            .from('vendor_profiles')
            .update({ trial_grace_ends_at: null })
            .eq('id', vendor.id)

          // Notify vendor if anything was changed
          if (unpublishedCount > 0 || deactivatedBoxCount > 0) {
            await sendNotification(vendor.user_id, 'trial_grace_expired', {
              unpublishedCount,
              deactivatedBoxCount,
            }, { vertical: vendor.vertical_id })
          }

          trialGraceProcessed++
          totalProcessed++
        }
      }
    } catch (phase10Error) {
      console.error('Phase 10 error:', phase10Error instanceof Error ? phase10Error.message : 'Unknown error')
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} items`,
      processed: totalProcessed,
      errors: totalErrors,
      payouts: { retried: payoutsRetried, succeeded: payoutsSucceeded, cancelled: payoutsCancelled },
      externalPayments: { reminders: externalReminders, autoConfirmed: externalAutoConfirmed },
      errorDigest: { reportsSummarized: errorReportsSummarized },
      staleConfirmed: { notified: staleConfirmedCount, expired: staleConfirmedExpired },
      marketBoxPickups: { missed: marketBoxPickupsMissed },
      staleWindows: { fulfilled: staleWindowsFulfilled },
      tierExpirations: { vendors: vendorTiersExpired, buyers: buyerTiersExpired },
      dataRetention: { errorLogs: errorLogsDeleted, notifications: notificationsDeleted, activityEvents: activityEventsDeleted },
      trialLifecycle: { reminders: trialReminders, expired: trialExpired, graceProcessed: trialGraceProcessed },
    })
  })
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
