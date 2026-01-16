import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyOrderExpired } from '@/lib/notifications'

/**
 * Cron endpoint to expire order items that haven't been confirmed in time
 *
 * Called by Vercel Cron daily (configured in vercel.json)
 *
 * Security: Vercel cron requests include CRON_SECRET header
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // In production, verify the cron secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

  try {
    // Find order items that have expired
    // - expires_at has passed
    // - status is pending or paid (not yet confirmed by vendor)
    // - not already cancelled
    const { data: expiredItems, error: fetchError } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        subtotal_cents,
        status,
        listing:listings (
          title
        ),
        order:orders (
          id,
          order_number,
          buyer_user_id,
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
      console.error('Error fetching expired items:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!expiredItems || expiredItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired items found',
        processed: 0
      })
    }

    console.log(`Found ${expiredItems.length} expired order items to process`)

    let processed = 0
    let errors = 0

    for (const item of expiredItems) {
      try {
        // Mark item as cancelled due to expiration
        const { error: updateError } = await supabase
          .from('order_items')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: 'system',
            cancellation_reason: 'Order expired - vendor did not confirm in time',
            refund_amount_cents: item.subtotal_cents
          })
          .eq('id', item.id)

        if (updateError) {
          console.error(`Error expiring item ${item.id}:`, updateError)
          errors++
          continue
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

        // Send notification to buyer
        const order = item.order as any
        const listing = item.listing as any
        const vendor = item.vendor as any
        const vendorData = vendor?.profile_data as Record<string, unknown> | null

        if (order?.buyer?.email) {
          await notifyOrderExpired(
            order.buyer.email,
            order.buyer.display_name || 'Customer',
            {
              orderNumber: order.order_number || item.order_id.slice(0, 8),
              itemTitle: listing?.title || 'Item',
              vendorName: (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor',
              amount: item.subtotal_cents
            }
          )
        }

        processed++

        // TODO: In production, trigger Stripe refund here

      } catch (itemError) {
        console.error(`Error processing expired item ${item.id}:`, itemError)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} expired items`,
      processed,
      errors,
      total: expiredItems.length
    })

  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({
      error: 'Failed to process expired orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
