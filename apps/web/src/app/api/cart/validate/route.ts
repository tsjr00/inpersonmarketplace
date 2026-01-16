import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CartItem {
  listingId: string
  quantity: number
}

// GET: Validate market compatibility
export async function GET() {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's cart with market info
  const { data: cartItems } = await supabase
    .from('cart_items')
    .select(`
      id,
      quantity,
      listing_id,
      listings (
        id,
        title,
        price_cents,
        listing_markets (
          market_id,
          markets (
            id,
            name,
            market_type
          )
        )
      )
    `)
    .eq('user_id', user.id)

  if (!cartItems || cartItems.length === 0) {
    return NextResponse.json({
      valid: true,
      warnings: [],
      marketType: null,
      marketIds: []
    })
  }

  const warnings: string[] = []
  const marketTypes = new Set<string>()
  const marketIds = new Set<string>()

  // Check each item
  for (const item of cartItems) {
    const listing = item.listings as unknown as {
      id: string
      title: string
      listing_markets: Array<{
        market_id: string
        markets: { id: string; name: string; market_type: string }
      }>
    } | null

    if (!listing || !listing.listing_markets || listing.listing_markets.length === 0) {
      warnings.push(`"${listing?.title || 'Unknown item'}" is not available at any markets`)
      continue
    }

    // Get first market for this listing
    const market = listing.listing_markets[0].markets
    marketTypes.add(market.market_type)
    marketIds.add(market.id)
  }

  // Validation checks
  let valid = warnings.length === 0

  // Check for mixed market types
  if (marketTypes.size > 1) {
    warnings.push('Cart contains items from both traditional markets and private pickup locations. Please checkout separately.')
    valid = false
  }

  const marketType = marketTypes.size === 1 ? Array.from(marketTypes)[0] : null

  // For traditional markets, all items should be from same market
  if (marketType === 'traditional' && marketIds.size > 1) {
    warnings.push('Traditional market items must all be from the same market. Please remove items from other markets.')
    valid = false
  }

  return NextResponse.json({
    valid,
    warnings,
    marketType,
    marketIds: Array.from(marketIds),
    itemCount: cartItems.length
  })
}

// POST: Validate item availability
export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json() as { items: CartItem[] }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const supabase = await createClient()

    // Fetch all listings at once
    const listingIds = items.map(item => item.listingId)
    const { data: listings, error } = await supabase
      .from('listings')
      .select(`
        id,
        title,
        price_cents,
        quantity,
        status,
        vendor_profiles (
          id,
          profile_data,
          status
        )
      `)
      .in('id', listingIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    if (error) {
      console.error('Failed to fetch listings:', error)
      return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
    }

    // Build response with availability info
    const validatedItems = items.map(cartItem => {
      const listing = listings?.find(l => l.id === cartItem.listingId)

      if (!listing) {
        return {
          listingId: cartItem.listingId,
          quantity: cartItem.quantity,
          title: 'Unknown Item',
          price_cents: 0,
          vendor_name: 'Unknown',
          available: false,
          available_quantity: 0,
        }
      }

      const vendorProfile = listing.vendor_profiles as unknown as Record<string, unknown> | null
      const vendorData = vendorProfile?.profile_data as Record<string, unknown> | null
      const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
      const isVendorApproved = vendorProfile?.status === 'approved'

      // Check availability
      const availableQty = listing.quantity === null ? 999 : listing.quantity
      const isAvailable = isVendorApproved && availableQty >= cartItem.quantity

      return {
        listingId: cartItem.listingId,
        quantity: cartItem.quantity,
        title: listing.title,
        price_cents: listing.price_cents,
        vendor_name: vendorName,
        vendor_profile_id: vendorProfile?.id as string | undefined,
        available: isAvailable,
        available_quantity: listing.quantity,
      }
    })

    return NextResponse.json({ items: validatedItems })
  } catch (error) {
    console.error('Cart validation error:', error)
    return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
  }
}
