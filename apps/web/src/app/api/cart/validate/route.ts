import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CartItem {
  listingId: string
  quantity: number
}

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
