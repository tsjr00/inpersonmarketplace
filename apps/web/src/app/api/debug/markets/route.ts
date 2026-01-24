import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Debug endpoint to check market data - remove after debugging
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const vertical = searchParams.get('vertical') || 'farmers_market'

    // Get ALL markets for this vertical (no filters)
    const { data: allMarkets, error: allError } = await supabase
      .from('markets')
      .select('id, name, market_type, status, approval_status, latitude, longitude, vertical_id')
      .eq('vertical_id', vertical)

    if (allError) {
      return NextResponse.json({ error: 'Failed to fetch markets', details: allError }, { status: 500 })
    }

    // Get traditional markets with all required fields
    const { data: traditionalMarkets, error: tradError } = await supabase
      .from('markets')
      .select('id, name, market_type, status, approval_status, latitude, longitude, vertical_id')
      .eq('vertical_id', vertical)
      .eq('market_type', 'traditional')

    // Get markets that WOULD match the nearby query filters
    const { data: filteredMarkets, error: filtError } = await supabase
      .from('markets')
      .select('id, name, market_type, status, approval_status, latitude, longitude, vertical_id')
      .eq('vertical_id', vertical)
      .eq('market_type', 'traditional')
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    return NextResponse.json({
      summary: {
        total_markets_in_vertical: allMarkets?.length || 0,
        traditional_markets: traditionalMarkets?.length || 0,
        markets_matching_nearby_filters: filteredMarkets?.length || 0,
      },
      all_markets: allMarkets?.map(m => ({
        id: m.id,
        name: m.name,
        market_type: m.market_type,
        status: m.status,
        approval_status: m.approval_status,
        has_lat: m.latitude !== null,
        has_lng: m.longitude !== null,
        lat: m.latitude,
        lng: m.longitude,
        issues: [
          m.status !== 'active' ? `status=${m.status}` : null,
          m.approval_status !== 'approved' ? `approval_status=${m.approval_status}` : null,
          m.latitude === null ? 'missing latitude' : null,
          m.longitude === null ? 'missing longitude' : null,
          m.market_type !== 'traditional' ? `market_type=${m.market_type}` : null,
        ].filter(Boolean)
      })),
      markets_ready_for_search: filteredMarkets,
    })
  } catch (error) {
    console.error('Debug markets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
