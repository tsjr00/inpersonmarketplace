import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/buyer/orders/unrated - Get completed orders that haven't been rated yet
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get completed/fulfilled orders that don't have ratings
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      created_at,
      total_cents,
      order_items (
        id,
        listing:listings (
          id,
          title,
          vendor_profiles (
            id,
            profile_data
          )
        )
      )
    `)
    .eq('buyer_user_id', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }

  // Get existing ratings for these orders
  const orderIds = (orders || []).map(o => o.id)

  if (orderIds.length === 0) {
    return NextResponse.json({ orders: [] })
  }

  const { data: existingRatings } = await supabase
    .from('order_ratings')
    .select('order_id, vendor_profile_id')
    .in('order_id', orderIds)
    .eq('buyer_user_id', user.id)

  // Create a set of "order_id-vendor_profile_id" keys for existing ratings
  const ratedKeys = new Set(
    (existingRatings || []).map(r => `${r.order_id}-${r.vendor_profile_id}`)
  )

  // Filter orders to find unrated vendor combinations
  const unratedOrders = (orders || []).map(order => {
    // Get unique vendors from order items
    const vendors = new Map<string, { id: string; name: string }>()

    for (const item of order.order_items || []) {
      const listing = item.listing as any
      const vendorProfile = listing?.vendor_profiles
      if (vendorProfile) {
        const profileData = vendorProfile.profile_data as Record<string, unknown> | null
        const vendorName = (profileData?.business_name as string) ||
                         (profileData?.farm_name as string) ||
                         'Vendor'
        vendors.set(vendorProfile.id, { id: vendorProfile.id, name: vendorName })
      }
    }

    // Check which vendors haven't been rated for this order
    const unratedVendors = Array.from(vendors.values()).filter(
      vendor => !ratedKeys.has(`${order.id}-${vendor.id}`)
    )

    if (unratedVendors.length === 0) {
      return null
    }

    return {
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      total_cents: order.total_cents,
      unrated_vendors: unratedVendors
    }
  }).filter(Boolean)

  return NextResponse.json({ orders: unratedOrders })
}
