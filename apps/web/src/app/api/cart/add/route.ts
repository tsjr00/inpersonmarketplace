import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/cart/add', 'POST', async () => {
    const supabase = await createClient()
    const { listingId, quantity } = await request.json()

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Please log in to add items to your cart' }, { status: 401 })
    }

    // Validate listing exists and has inventory
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.quantity < quantity) {
      return NextResponse.json({ error: 'Insufficient inventory' }, { status: 400 })
    }

    // Add to session cart (store in cookies/session for now)
    // For MVP, can use simple session storage
    // Later: create cart table in database

    return NextResponse.json({ success: true, listing, quantity })
  })
}
