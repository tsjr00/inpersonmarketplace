import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyOrderExpired, sendNotification } from '@/lib/notifications'
import { createRefund, transferToVendor } from '@/lib/stripe/payments'
import { restoreInventory, restoreOrderInventory } from '@/lib/inventory'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { FEES } from '@/lib/pricing'
import { recordExternalPaymentFee } from '@/lib/payments/vendor-fees'

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
 * Phase 5: Retry failed vendor payouts (Stripe transfers)
 * Phase 6: Error report digest — email admin a summary of pending reports
 * Phase 7: Auto-fulfill stale confirmation windows (buyer confirmed, vendor didn't)
 * Phase 8: Expire vendor/buyer tier subscriptions past tier_expires_at
 *
 * Called by Vercel Cron daily at 6am UTC (configured in vercel.json)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/expire-orders', 'GET', async () => {
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
            const proratedFlatFee = totalItemsInOrder ? Math.round(FEES.buyerFlatFeeCents / totalItemsInOrder) : 0
            const buyerPaidForItem = item.subtotal_cents + buyerPercentFee + proratedFlatFee

            // Mark item as cancelled due to expiration
            const { error: updateError } = await supabase
              .from('order_items')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: 'system',
                cancellation_reason: 'Order expired - vendor did not confirm in time',
                refund_amount_cents: buyerPaidForItem
              })
              .eq('id', item.id)

            if (updateError) {
              console.error('Error expiring order item:', updateError.message)
              totalErrors++
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
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

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
    // Nudge vendors who haven't confirmed external payment 2+ hours
    // after order was placed (same day) or 24+ hours (events).
    // Does NOT auto-confirm — just sends a reminder notification.
    // ============================================================
    let externalReminders = 0
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

      const { data: unreminderOrders, error: reminderError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          payment_method,
          total_cents,
          buyer_user_id,
          vertical_id,
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
        .in('payment_method', ['venmo', 'cashapp', 'paypal', 'cash'])
        .is('external_payment_confirmed_at', null)
        .lte('created_at', twoHoursAgo)
        .limit(50)

      if (reminderError) {
        console.error('[Phase 3.5] Error fetching unconfirmed external orders:', reminderError.message)
      } else if (unreminderOrders && unreminderOrders.length > 0) {
        // Group by vendor to send one reminder per vendor
        const vendorOrders = new Map<string, { userId: string; orderCount: number; vertical: string }>()
        for (const order of unreminderOrders) {
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
                vertical: order.vertical_id || 'farmers_market',
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
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const yesterdayDate = yesterday.toISOString().split('T')[0] // YYYY-MM-DD

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

            const activeItems = items.filter(i => !i.cancelled_at)
            if (activeItems.length === 0) continue

            // All active items must have pickup_date 24+ hours ago
            const allPastWindow = activeItems.every(item => {
              if (!item.pickup_date) return false
              return item.pickup_date <= yesterdayDate
            })

            if (!allPastWindow) continue

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
              const methodLabel = order.payment_method === 'cashapp' ? 'Cash App'
                : order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
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
        .lt('pickup_date', today)
        .limit(100)

      if (missedError) {
        console.error('Error fetching missed pickup items:', missedError.message)
      } else if (missedItems && missedItems.length > 0) {
        for (const item of missedItems) {
          try {
            const order = item.order as any
            const listing = item.listing as any
            const vendor = item.vendor as any
            const vendorData = vendor?.profile_data as Record<string, unknown> | null
            const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'

            // Mark as fulfilled — vendor did their part, buyer didn't show
            await supabase
              .from('order_items')
              .update({ status: 'fulfilled' })
              .eq('id', item.id)

            // H19 FIX: Pay vendor for no-show items (vendor prepared the order)
            // Calculate payout: vendor_payout_cents + prorated tip share
            const tipAmount = order?.tip_amount || 0
            const totalItemsInOrder = order?.order_items?.length || 1
            const tipShareCents = totalItemsInOrder > 0 ? Math.round(tipAmount / totalItemsInOrder) : 0
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
                try {
                  const transfer = await transferToVendor({
                    amount: actualPayoutCents,
                    destination: vendor.stripe_account_id,
                    orderId: item.order_id,
                    orderItemId: item.id,
                  })

                  await supabase.from('vendor_payouts').insert({
                    order_item_id: item.id,
                    vendor_profile_id: item.vendor_profile_id,
                    amount_cents: actualPayoutCents,
                    stripe_transfer_id: transfer.id,
                    status: 'processing',
                  })
                } catch (transferError) {
                  console.error('[Phase 4] Stripe transfer failed for no-show payout:', transferError)
                  // Record failed payout for retry in Phase 5
                  await supabase.from('vendor_payouts').insert({
                    order_item_id: item.id,
                    vendor_profile_id: item.vendor_profile_id,
                    amount_cents: actualPayoutCents,
                    stripe_transfer_id: null,
                    status: 'failed',
                  })
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
    // PHASE 5: Retry failed vendor payouts (Stripe transfers)
    // Picks up vendor_payouts with status='failed', retries transfer
    // After 7 days of failure, marks as cancelled + alerts admin
    // ============================================================
    let payoutsRetried = 0
    let payoutsSucceeded = 0
    let payoutsCancelled = 0
    try {
      const MAX_RETRY_AGE_DAYS = 7
      const MAX_PAYOUTS_PER_RUN = 10
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - MAX_RETRY_AGE_DAYS)

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
          `[Phase 5] ALERT: ${payoutsCancelled} payouts cancelled after ${MAX_RETRY_AGE_DAYS} days. ` +
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
              from: `Platform Alerts <${process.env.RESEND_FROM_EMAIL || 'noreply@mail.farmersmarketing.app'}>`,
              to: adminEmail,
              subject: `[ACTION REQUIRED] ${payoutsCancelled} vendor payout${payoutsCancelled === 1 ? '' : 's'} cancelled — $${(totalCents / 100).toFixed(2)} needs manual resolution`,
              html: `
                <h2 style="color:#dc2626;margin:0 0 16px">Vendor Payouts Cancelled</h2>
                <p>${payoutsCancelled} vendor payout${payoutsCancelled === 1 ? '' : 's'} failed for ${MAX_RETRY_AGE_DAYS}+ days and ${payoutsCancelled === 1 ? 'has' : 'have'} been permanently cancelled.</p>
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
            from: `Platform Alerts <${process.env.RESEND_FROM_EMAIL || 'noreply@mail.farmersmarketing.app'}>`,
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
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

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
            payment_method
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
    // FT vendors → 'free', FM vendors → 'standard', Buyers → 'standard'
    // ============================================================
    let vendorTiersExpired = 0
    let buyerTiersExpired = 0
    try {
      // Expire vendor tiers
      const { data: expiredVendors } = await supabase
        .from('vendor_profiles')
        .select('id, tier, vertical_id, user_id')
        .lt('tier_expires_at', new Date().toISOString())
        .not('tier', 'in', '("standard","free")')
        .limit(100)

      if (expiredVendors && expiredVendors.length > 0) {
        for (const vendor of expiredVendors) {
          const newTier = vendor.vertical_id === 'food_trucks' ? 'free' : 'standard'
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
            await sendNotification(vendor.user_id, 'payout_failed', {
              orderNumber: 'subscription',
              amountCents: 0,
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

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} items`,
      processed: totalProcessed,
      errors: totalErrors,
      payouts: { retried: payoutsRetried, succeeded: payoutsSucceeded, cancelled: payoutsCancelled },
      externalPayments: { reminders: externalReminders, autoConfirmed: externalAutoConfirmed },
      errorDigest: { reportsSummarized: errorReportsSummarized },
      staleWindows: { fulfilled: staleWindowsFulfilled },
      tierExpirations: { vendors: vendorTiersExpired, buyers: buyerTiersExpired },
    })
  })
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
