import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface CartItemListing {
  id: string
  title: string
  price_cents: number
  quantity: number | null
  status: string
  vendor_profiles: {
    profile_data: Record<string, unknown>
  } | null
}

interface CartItemResult {
  id: string
  quantity: number
  listings: CartItemListing
}

// GET - Get user's cart with items
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const vertical = searchParams.get('vertical')

  if (!vertical) {
    return NextResponse.json({ error: 'Vertical required' }, { status: 400 })
  }

  // Get vertical
  const { data: verticalData, error: vertError } = await supabase
    .from('verticals')
    .select('id')
    .eq('vertical_id', vertical)
    .single()

  if (vertError || !verticalData) {
    return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
  }

  // Get or create cart
  const { data: cartId, error: cartError } = await supabase
    .rpc('get_or_create_cart', {
      p_user_id: user.id,
      p_vertical_id: verticalData.id
    })

  if (cartError) {
    console.error('Error getting cart:', cartError)
    return NextResponse.json({ error: 'Failed to get cart' }, { status: 500 })
  }

  // Get cart items with listing details
  const { data: items, error: itemsError } = await supabase
    .from('cart_items')
    .select(`
      id,
      quantity,
      listings (
        id,
        title,
        price_cents,
        quantity,
        status,
        vendor_profiles (
          profile_data
        )
      )
    `)
    .eq('cart_id', cartId)

  if (itemsError) {
    console.error('Error fetching cart items:', itemsError)
    return NextResponse.json({ error: 'Failed to fetch cart items' }, { status: 500 })
  }

  // Get cart summary
  const { data: summary, error: summaryError } = await supabase
    .rpc('get_cart_summary', { p_cart_id: cartId })

  if (summaryError) {
    console.error('Error getting cart summary:', summaryError)
  }

  // Transform items for response
  const typedItems = items as unknown as CartItemResult[] | null
  const cartItems = (typedItems || []).map(item => {
    const profileData = item.listings?.vendor_profiles?.profile_data || {}
    const vendorName = (profileData.business_name as string) ||
                       (profileData.farm_name as string) || 'Vendor'
    return {
      id: item.id,
      listingId: item.listings.id,
      quantity: item.quantity,
      title: item.listings.title,
      price_cents: item.listings.price_cents,
      vendor_name: vendorName,
      quantity_available: item.listings.quantity,
      status: item.listings.status
    }
  })

  return NextResponse.json({
    items: cartItems,
    summary: summary?.[0] || { total_items: 0, total_cents: 0, vendor_count: 0 }
  })
}
