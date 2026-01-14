import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PUT - Update market
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id: marketId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, address, city, state, zip } = body

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Verify ownership
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found or unauthorized' }, { status: 404 })
    }

    // Update market
    const { data: updated, error: updateError } = await supabase
      .from('markets')
      .update({
        name,
        address,
        city,
        state,
        zip
      })
      .eq('id', marketId)
      .select()
      .single()

    if (updateError) {
      console.error('[/api/vendor/markets/[id]] Error updating market:', updateError)
      return NextResponse.json({ error: 'Failed to update market' }, { status: 500 })
    }

    return NextResponse.json({ market: updated })
  } catch (error) {
    console.error('[/api/vendor/markets/[id]] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete market
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id: marketId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Verify ownership
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found or unauthorized' }, { status: 404 })
    }

    // Check if market has active listings
    const { data: listingCount, error: countError } = await supabase
      .rpc('get_vendor_listing_count_at_market', {
        p_vendor_profile_id: vendorProfile.id,
        p_market_id: marketId
      })

    if (countError) {
      console.error('[/api/vendor/markets/[id]] Error checking listing count:', countError)
      return NextResponse.json({ error: 'Failed to check listings' }, { status: 500 })
    }

    if (listingCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete market with active listings. Remove listings first.'
      }, { status: 400 })
    }

    // Delete market (will cascade to listing_markets due to FK)
    const { error: deleteError } = await supabase
      .from('markets')
      .delete()
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)

    if (deleteError) {
      console.error('[/api/vendor/markets/[id]] Error deleting market:', deleteError)
      return NextResponse.json({ error: 'Failed to delete market' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[/api/vendor/markets/[id]] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
