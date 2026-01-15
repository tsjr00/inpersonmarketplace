import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get vendor's markets
export async function GET(request: Request) {
  try {
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

    // Get vendor profile for this vertical
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Get all markets for this vertical
    const { data: allMarkets, error: marketsError } = await supabase
      .from('markets')
      .select('*')
      .eq('vertical_id', vertical)
      .eq('status', 'active')
      .order('name')

    if (marketsError) {
      console.error('[/api/vendor/markets] Error fetching markets:', marketsError)
      return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
    }

    // Get vendor's private pickup markets
    const vendorMarkets = (allMarkets || []).filter(m =>
      m.market_type === 'private_pickup' && m.vendor_profile_id === vendorProfile.id
    )

    // Get traditional markets
    const fixedMarkets = (allMarkets || []).filter(m => m.market_type === 'traditional')

    // Calculate limits based on tier
    const tier = vendorProfile.tier || 'standard'
    const fixedMarketLimit = tier === 'premium' ? 3 : 1

    // Count current fixed markets for this vendor
    const { data: currentCount } = await supabase
      .rpc('get_vendor_fixed_market_count', {
        p_vendor_profile_id: vendorProfile.id,
        p_vertical_id: vertical
      })

    const currentFixedMarketCount = currentCount || 0

    return NextResponse.json({
      fixedMarkets,
      privatePickupMarkets: vendorMarkets,
      limits: {
        fixedMarketLimit,
        currentFixedMarketCount,
        canAddFixed: currentFixedMarketCount < fixedMarketLimit
      }
    })
  } catch (error) {
    console.error('[/api/vendor/markets] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new private pickup market
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { vertical, name, address, city, state, zip } = body

    if (!vertical || !name || !address || !city || !state || !zip) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Create private pickup market
    const { data: market, error: createError } = await supabase
      .from('markets')
      .insert({
        vertical_id: vertical,
        vendor_profile_id: vendorProfile.id,
        name,
        market_type: 'private_pickup',
        address,
        city,
        state,
        zip,
        status: 'active'
      })
      .select()
      .single()

    if (createError) {
      console.error('[/api/vendor/markets] Error creating market:', createError)
      return NextResponse.json({ error: 'Failed to create market' }, { status: 500 })
    }

    return NextResponse.json({ market }, { status: 201 })
  } catch (error) {
    console.error('[/api/vendor/markets] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
