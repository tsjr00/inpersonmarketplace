import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/buyer/orders/[id]', 'GET', async () => {
    const { id: orderId } = await context.params
    const supabase = await createClient()

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch order
    // Use explicit relationship hint for market_id FK
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_cents,
        created_at,
        updated_at,
        order_items (
          id,
          quantity,
          unit_price_cents,
          subtotal_cents,
          status,
          market_id,
          schedule_id,
          pickup_date,
          pickup_snapshot,
          buyer_confirmed_at,
          vendor_confirmed_at,
          confirmation_window_expires_at,
          issue_reported_at,
          issue_reported_by,
          issue_description,
          cancelled_at,
          cancelled_by,
          cancellation_reason,
          refund_amount_cents,
          expires_at,
          listing:listings (
            id,
            title,
            description,
            image_urls,
            quantity_amount,
            quantity_unit,
            vendor_profiles (
              id,
              profile_data
            )
          ),
          market:markets!market_id (
            id,
            name,
            market_type,
            address,
            city,
            state,
            zip,
            contact_email,
            contact_phone,
            market_schedules (
              day_of_week,
              start_time,
              end_time
            )
          )
        )
      `)
      .eq('id', orderId)
      .eq('buyer_user_id', user.id) // Only buyer's orders
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Transform order
    const transformedOrder = {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_cents: order.total_cents,
      created_at: order.created_at,
      updated_at: order.updated_at,
      items: (order.order_items || []).map((item: any) => {
        const listing = item.listing
        const vendorProfile = listing?.vendor_profiles
        const profileData = vendorProfile?.profile_data as Record<string, unknown> | null
        const market = item.market
        const pickupSnapshot = item.pickup_snapshot as Record<string, unknown> | null

        // Use pickup_snapshot for display when available (immutable order details)
        // Fall back to market data for backwards compatibility with older orders
        const displayMarket = pickupSnapshot || (market ? {
          market_name: market.name || 'Unknown',
          market_type: market.market_type || 'traditional',
          address: market.address,
          city: market.city,
          state: market.state,
          zip: market.zip
        } : null)

        return {
          id: item.id,
          listing_id: listing?.id,
          listing_title: listing?.title || 'Unknown',
          listing_description: listing?.description || '',
          listing_image: listing?.image_urls?.[0] || null,
          quantity_amount: listing?.quantity_amount ?? null,
          quantity_unit: listing?.quantity_unit ?? null,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          subtotal_cents: item.subtotal_cents,
          status: item.status,
          vendor_name:
            (profileData?.business_name as string) ||
            (profileData?.farm_name as string) ||
            'Vendor',
          vendor_profile_id: vendorProfile?.id || null,
          vendor_email: (profileData?.email as string) || null,
          vendor_phone: (profileData?.phone as string) || null,
          market: {
            id: market?.id,
            name: market?.name || 'Unknown',
            type: market?.market_type || 'traditional',
            address: market?.address,
            city: market?.city,
            state: market?.state,
            zip: market?.zip,
            contact_email: market?.contact_email,
            contact_phone: market?.contact_phone,
            schedules: market?.market_schedules || []
          },
          pickup_date: item.pickup_date,
          pickup_snapshot: pickupSnapshot,
          // Unified display data (prefers pickup_snapshot when available)
          display: displayMarket ? {
            market_name: (displayMarket.market_name as string) || 'Unknown',
            pickup_date: item.pickup_date,
            start_time: (pickupSnapshot?.start_time as string) || null,
            end_time: (pickupSnapshot?.end_time as string) || null,
            address: displayMarket.address as string | null,
            city: displayMarket.city as string | null,
            state: displayMarket.state as string | null
          } : null,
          buyer_confirmed_at: item.buyer_confirmed_at,
          vendor_confirmed_at: item.vendor_confirmed_at,
          confirmation_window_expires_at: item.confirmation_window_expires_at,
          lockdown_active: item.confirmation_window_expires_at && new Date(item.confirmation_window_expires_at) > new Date(),
          issue_reported_at: item.issue_reported_at,
          issue_reported_by: item.issue_reported_by,
          issue_description: item.issue_description,
          cancelled_at: item.cancelled_at,
          cancelled_by: item.cancelled_by,
          cancellation_reason: item.cancellation_reason,
          refund_amount_cents: item.refund_amount_cents,
          expires_at: item.expires_at,
          is_expired: item.expires_at && new Date(item.expires_at) < new Date() && item.status === 'pending' && !item.cancelled_at
        }
      })
    }

    return NextResponse.json({ order: transformedOrder })
  })
}
