import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyOrderExpired, sendNotification } from '@/lib/notifications'
import { createRefund, transferToVendor } from '@/lib/stripe/payments'
import { restoreInventory, restoreOrderInventory } from '@/lib/inventory'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { FEES } from '@/lib/pricing'

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
 * Phase 4: Notify buyers about missed pickups
 * Phase 5: Retry failed vendor payouts (Stripe transfers)
 * Phase 6: Error report digest — email admin a summary of pending reports
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
                  console.error('Stripe refund failed for expired item:', refundError)
                  // Continue processing — admin will need to handle manually
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
    // PHASE 4: Notify buyers about missed pickups
    // Order items with status 'ready' where pickup_date has passed
    // Vendor marked ready but buyer never showed up
    // ============================================================
    try {
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

      const { data: missedItems, error: missedError } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          pickup_date,
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
            profile_data
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

            // Send pickup_missed notification to buyer
            if (order?.buyer_user_id) {
              await sendNotification(order.buyer_user_id, 'pickup_missed', {
                orderNumber: order.order_number || item.order_id.slice(0, 8),
                itemTitle: listing?.title || 'Item',
                vendorName: (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor',
              }, { vertical: order.vertical_id })
            }

            // Mark as fulfilled — vendor did their part, buyer didn't show
            await supabase
              .from('order_items')
              .update({ status: 'fulfilled' })
              .eq('id', item.id)

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

        const rows = sortedCodes.map(([code, reports]) => {
          const sample = reports[0]
          const desc = sample.user_description
            ? ` — "${sample.user_description.slice(0, 80)}${sample.user_description.length > 80 ? '...' : ''}"`
            : ''
          const page = sample.page_url ? ` (${sample.page_url})` : ''
          return `<tr>
            <td style="padding:6px 12px;border:1px solid #e5e7eb;font-family:monospace;font-size:13px">${code}</td>
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
            from: 'alerts@farmersmarketing.app',
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

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} items`,
      processed: totalProcessed,
      errors: totalErrors,
      payouts: { retried: payoutsRetried, succeeded: payoutsSucceeded, cancelled: payoutsCancelled },
      errorDigest: { reportsSummarized: errorReportsSummarized },
    })
  })
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
