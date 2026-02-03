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

  // Track cutoff info
  const cutoffWarnings: string[] = []

  // First pass: collect market info and identify traditional market items needing cutoff check
  const traditionalMarketItems: Array<{ id: string; title: string }> = []

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

    // Collect traditional market items for batch cutoff check
    if (market.market_type === 'traditional') {
      traditionalMarketItems.push({ id: listing.id, title: listing.title })
    }
  }

  // Batch cutoff checks in parallel instead of sequential
  if (traditionalMarketItems.length > 0) {
    const cutoffResults = await Promise.all(
      traditionalMarketItems.map(async (item) => {
        const { data: isAccepting } = await supabase
          .rpc('is_listing_accepting_orders', { p_listing_id: item.id })
        return { ...item, isAccepting }
      })
    )

    for (const result of cutoffResults) {
      if (result.isAccepting === false) {
        cutoffWarnings.push(`Orders for "${result.title}" are closed - vendors are preparing for market day`)
      }
    }
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

  // Add cutoff warnings (these make checkout invalid)
  if (cutoffWarnings.length > 0) {
    warnings.push(...cutoffWarnings)
    valid = false
  }

  return NextResponse.json({
    valid,
    warnings,
    marketType,
    marketIds: Array.from(marketIds),
    itemCount: cartItems.length,
    hasCutoffIssues: cutoffWarnings.length > 0
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

    // Build response with availability info (need to use async for cutoff checks)
    const validatedItems = await Promise.all(items.map(async (cartItem) => {
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
          cutoff_passed: false,
        }
      }

      const vendorProfile = listing.vendor_profiles as unknown as Record<string, unknown> | null
      const vendorData = vendorProfile?.profile_data as Record<string, unknown> | null
      const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
      const isVendorApproved = vendorProfile?.status === 'approved'

      // Check cutoff status
      const { data: isAccepting } = await supabase
        .rpc('is_listing_accepting_orders', { p_listing_id: listing.id })
      const cutoffPassed = isAccepting === false

      // Check availability
      const availableQty = listing.quantity === null ? 999 : listing.quantity
      const isAvailable = isVendorApproved && availableQty >= cartItem.quantity && !cutoffPassed

      return {
        listingId: cartItem.listingId,
        quantity: cartItem.quantity,
        title: listing.title,
        price_cents: listing.price_cents,
        vendor_name: vendorName,
        vendor_profile_id: vendorProfile?.id as string | undefined,
        available: isAvailable,
        available_quantity: listing.quantity,
        cutoff_passed: cutoffPassed,
      }
    }))

    return NextResponse.json({ items: validatedItems })
  } catch (error) {
    console.error('Cart validation error:', error)
    return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
  }
}
