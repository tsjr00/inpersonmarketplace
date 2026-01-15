import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateFees, createCheckoutSession } from '@/lib/stripe/payments'

interface CartItem {
  listingId: string
  quantity: number
}

interface Listing {
  id: string
  title: string
  description: string | null
  price_cents: number
  vertical_id: string
  vendor_profile_id: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { items } = await request.json() as { items: CartItem[] }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch listings with vendor and market info
    const listingIds = items.map((i) => i.listingId)
    const { data: listings } = await supabase
      .from('listings')
      .select(`
        id, title, description, price_cents, vertical_id, vendor_profile_id,
        listing_markets (
          market_id,
          markets (
            id,
            name,
            market_type
          )
        )
      `)
      .in('id', listingIds)

    if (!listings || listings.length !== items.length) {
      return NextResponse.json({ error: 'Invalid items' }, { status: 400 })
    }

    // Validate market compatibility
    const marketTypes = new Set<string>()
    const marketIds = new Set<string>()

    for (const listing of listings) {
      const listingMarkets = listing.listing_markets as unknown as Array<{
        market_id: string
        markets: { id: string; name: string; market_type: string }
      }> | null

      if (!listingMarkets || listingMarkets.length === 0) {
        return NextResponse.json({
          error: `"${listing.title}" is not available at any markets`
        }, { status: 400 })
      }

      const market = listingMarkets[0].markets
      marketTypes.add(market.market_type)
      marketIds.add(market.id)
    }

    // Check for mixed market types
    if (marketTypes.size > 1) {
      return NextResponse.json({
        error: 'Cannot checkout with items from both traditional markets and private pickup'
      }, { status: 400 })
    }

    // Check traditional markets use same market
    const marketType = Array.from(marketTypes)[0]
    if (marketType === 'traditional' && marketIds.size > 1) {
      return NextResponse.json({
        error: 'All traditional market items must be from the same market'
      }, { status: 400 })
    }

    // Calculate totals
    let subtotalCents = 0
    let platformFeeCents = 0

    const orderItems = items.map((item) => {
      const listing = listings.find((l) => l.id === item.listingId) as Listing
      const itemSubtotal = listing.price_cents * item.quantity
      const fees = calculateFees(itemSubtotal)

      subtotalCents += fees.basePriceCents
      platformFeeCents += fees.platformFeeCents

      return {
        listing_id: listing.id,
        vendor_profile_id: listing.vendor_profile_id,
        quantity: item.quantity,
        unit_price_cents: listing.price_cents,
        subtotal_cents: fees.basePriceCents,
        platform_fee_cents: fees.platformFeeCents,
        vendor_payout_cents: fees.vendorGetsCents,
      }
    })

    const totalCents = subtotalCents + platformFeeCents

    // Create order record
    const orderNumber = `FW-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_user_id: user.id,
        vertical_id: (listings[0] as Listing).vertical_id,
        order_number: orderNumber,
        status: 'pending',
        subtotal_cents: subtotalCents,
        platform_fee_cents: platformFeeCents,
        total_cents: totalCents,
      })
      .select()
      .single()

    if (orderError) throw orderError

    // Create order items
    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItems.map((item) => ({
        ...item,
        order_id: order.id,
      }))
    )

    if (itemsError) throw itemsError

    // Create Stripe checkout session
    const baseUrl = request.nextUrl.origin
    const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/checkout/cancel`

    const checkoutItems = listings.map((listing) => {
      const item = items.find((i) => i.listingId === listing.id)!
      const fees = calculateFees(listing.price_cents)

      return {
        name: listing.title,
        description: listing.description || '',
        amount: fees.buyerPaysCents,
        quantity: item.quantity,
      }
    })

    const session = await createCheckoutSession({
      orderId: order.id,
      orderNumber: order.order_number,
      items: checkoutItems,
      successUrl,
      cancelUrl,
    })

    // Save session ID
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id)

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
