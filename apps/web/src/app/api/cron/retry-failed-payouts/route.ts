import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { transferToVendor } from '@/lib/stripe/payments'
import { sendNotification } from '@/lib/notifications'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const buf = Buffer.from(a)
    timingSafeEqual(buf, buf)
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// Max age for retry attempts (7 days)
const MAX_RETRY_AGE_DAYS = 7
// Max payouts to process per cron run (avoid Vercel timeout)
const MAX_PER_RUN = 10

/**
 * Cron endpoint to retry failed Stripe vendor payouts.
 *
 * - Picks up vendor_payouts with status='failed' created within the last 7 days
 * - Retries the Stripe transfer using the same idempotency key
 * - On success: updates status to 'processing'
 * - On failure: keeps 'failed' (will be retried next run)
 * - After 7 days: marks as 'cancelled' and alerts admin
 *
 * Called by Vercel Cron (configured in vercel.json)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/retry-failed-payouts', 'GET', async () => {
    const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!cronSecret || !process.env.CRON_SECRET || !safeCompare(cronSecret, process.env.CRON_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - MAX_RETRY_AGE_DAYS)

    // Get failed payouts within retry window
    const { data: failedPayouts, error: fetchError } = await supabase
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
      .limit(MAX_PER_RUN)

    if (fetchError) {
      console.error('[retry-failed-payouts] Query error:', fetchError)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    if (!failedPayouts || failedPayouts.length === 0) {
      return NextResponse.json({ message: 'No failed payouts to retry', retried: 0 })
    }

    let retried = 0
    let succeeded = 0
    let stillFailed = 0

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

      retried++

      try {
        const transfer = await transferToVendor({
          amount: payout.amount_cents,
          destination: vendorProfile.stripe_account_id,
          orderId: orderItem.order_id,
          orderItemId: payout.order_item_id,
        })

        // Success — update payout record
        await supabase
          .from('vendor_payouts')
          .update({
            status: 'processing',
            stripe_transfer_id: transfer.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payout.id)

        succeeded++
        console.log(`[retry-failed-payouts] Retried payout ${payout.id} successfully: ${transfer.id}`)
      } catch (err) {
        stillFailed++
        // Update timestamp so we can track retry attempts
        await supabase
          .from('vendor_payouts')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', payout.id)

        console.error(`[retry-failed-payouts] Payout ${payout.id} still failing:`, err)
      }
    }

    // Mark expired payouts (older than retry window) as cancelled
    const { data: expiredPayouts } = await supabase
      .from('vendor_payouts')
      .select('id, order_item_id, vendor_profile_id, amount_cents')
      .eq('status', 'failed')
      .lt('created_at', cutoffDate.toISOString())

    let cancelled = 0
    if (expiredPayouts && expiredPayouts.length > 0) {
      const expiredIds = expiredPayouts.map(p => p.id)
      await supabase
        .from('vendor_payouts')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', expiredIds)

      cancelled = expiredPayouts.length

      // Alert admin about cancelled payouts that need manual resolution
      const adminAlertEmail = process.env.ADMIN_ALERT_EMAIL
      if (adminAlertEmail) {
        const totalCents = expiredPayouts.reduce((sum, p) => sum + p.amount_cents, 0)
        console.warn(
          `[retry-failed-payouts] ALERT: ${cancelled} payouts cancelled after ${MAX_RETRY_AGE_DAYS} days. ` +
          `Total: $${(totalCents / 100).toFixed(2)}. Manual resolution required.`
        )
      }
    }

    return NextResponse.json({
      message: 'Payout retry complete',
      retried,
      succeeded,
      stillFailed,
      cancelled,
    })
  })
}
