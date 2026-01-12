import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[/api/buyer/orders] Auth error:', authError)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    if (!user) {
      console.error('[/api/buyer/orders] No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[/api/buyer/orders] Fetching orders for user:', user.id)

    // Get buyer's orders with items
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_amount_cents,
        created_at,
        order_items(
          id,
          quantity,
          unit_price_cents,
          subtotal_cents,
          status,
          listing:listings(
            id,
            title,
            vendor_profile_id,
            vendor_profiles(
              id,
              profile_data
            )
          )
        )
      `)
      .eq('buyer_user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[/api/buyer/orders] Database error:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: 'Failed to fetch orders', details: error.message },
        { status: 500 }
      )
    }

    console.log('[/api/buyer/orders] Found orders:', orders?.length || 0)

    // Transform data to match frontend expected format
    const transformedOrders = (orders || []).map(order => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_amount_cents: order.total_amount_cents,
      created_at: order.created_at,
      items: (order.order_items || []).map((item: Record<string, unknown>) => {
        const listing = item.listing as Record<string, unknown> | null
        const vendorProfiles = listing?.vendor_profiles as Record<string, unknown> | null
        const profileData = vendorProfiles?.profile_data as Record<string, unknown> | null
        const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'

        return {
          id: item.id,
          listing_title: (listing?.title as string) || 'Unknown Item',
          vendor_name: vendorName,
          quantity: item.quantity,
          subtotal_cents: item.subtotal_cents,
          status: item.status || order.status,
        }
      })
    }))

    return NextResponse.json({ orders: transformedOrders })

  } catch (error) {
    console.error('[/api/buyer/orders] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
