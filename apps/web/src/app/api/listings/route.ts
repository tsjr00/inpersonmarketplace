import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const vertical = searchParams.get('vertical')
  const admin = searchParams.get('admin') === 'true'
  const status = searchParams.get('status')
  const vendorId = searchParams.get('vendor_id')

  if (!vertical) {
    return NextResponse.json({ error: 'vertical parameter is required' }, { status: 400 })
  }

  try {
    // Use service client for admin queries to bypass RLS
    const supabase = admin ? createServiceClient() : await createClient()

    let query = supabase
      .from('listings')
      .select(`
        id,
        title,
        description,
        status,
        price_cents,
        category,
        created_at,
        updated_at,
        vertical_id,
        vendor_profile_id,
        vendor_profiles (
          id,
          tier,
          profile_data
        )
      `)
      .eq('vertical_id', vertical)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    // Apply status filter if provided
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter by vendor if provided (for vendor's own listings view)
    if (vendorId) {
      query = query.eq('vendor_profile_id', vendorId)
    }

    // For non-admin queries, only show published listings
    if (!admin) {
      query = query.eq('status', 'published')
    }

    const { data: listings, error } = await query

    if (error) {
      console.error('Error fetching listings:', error)
      return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
    }

    return NextResponse.json({ listings: listings || [] })
  } catch (error) {
    console.error('Error in listings API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
