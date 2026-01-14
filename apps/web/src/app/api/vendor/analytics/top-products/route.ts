import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams
  const vendorId = searchParams.get('vendor_id')
  const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]
  const limit = parseInt(searchParams.get('limit') || '10')

  if (!vendorId) {
    return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
  }

  // Verify the user owns this vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('id', vendorId)
    .single()

  if (!vendorProfile || vendorProfile.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized to view this vendor analytics' }, { status: 403 })
  }

  // Get fulfilled transactions with listing data
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      listing_id,
      listing:listings(
        id,
        title,
        price_cents,
        listing_images(url, is_primary)
      )
    `)
    .eq('vendor_profile_id', vendorId)
    .eq('status', 'fulfilled')
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate by listing
  const productStats: Record<string, {
    listing_id: string
    title: string
    image_url: string | null
    total_sold: number
    revenue: number
  }> = {}

  for (const tx of transactions || []) {
    // Supabase returns relations as arrays, get first element
    const listingData = tx.listing as unknown
    const listing = Array.isArray(listingData) ? listingData[0] : listingData

    if (!listing) continue

    const typedListing = listing as {
      id: string
      title: string
      price_cents: number
      listing_images: Array<{ url: string; is_primary: boolean }>
    }

    const listingId = tx.listing_id
    if (!productStats[listingId]) {
      // Get primary image or first image
      const images = typedListing.listing_images || []
      const primaryImage = images.find(img => img.is_primary)
      const imageUrl = primaryImage?.url || images[0]?.url || null

      productStats[listingId] = {
        listing_id: listingId,
        title: typedListing.title || 'Untitled',
        image_url: imageUrl,
        total_sold: 0,
        revenue: 0
      }
    }

    productStats[listingId].total_sold++
    productStats[listingId].revenue += typedListing.price_cents || 0
  }

  // Sort by total sold and limit
  const topProducts = Object.values(productStats)
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, limit)

  return NextResponse.json(topProducts)
}
