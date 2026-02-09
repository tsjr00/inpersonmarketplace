import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

// GET /api/markets/[id]/vendors - List vendors at market
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/markets/[id]/vendors', 'GET', async () => {
    const supabase = await createClient()
    const { id: marketId } = await params
    const { searchParams } = new URL(request.url)

    const approved = searchParams.get('approved')

    // Build query
    let query = supabase
      .from('market_vendors')
      .select(`
        id,
        vendor_profile_id,
        approved,
        booth_number,
        notes,
        created_at,
        vendor_profiles(
          id,
          profile_data,
          status,
          vertical_id
        )
      `)
      .eq('market_id', marketId)
      .order('created_at', { ascending: false })

    if (approved !== null) {
      query = query.eq('approved', approved === 'true')
    }

    const { data: marketVendors, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data
    const vendors = marketVendors?.map((mv: {
      id: string
      vendor_profile_id: string
      approved: boolean
      booth_number: string | null
      notes: string | null
      created_at: string
      vendor_profiles: {
        id: string
        profile_data: Record<string, unknown>
        status: string
        vertical_id: string
      }[]
    }) => {
      const vp = mv.vendor_profiles?.[0]
      return {
        id: mv.id,
        vendor_profile_id: mv.vendor_profile_id,
        approved: mv.approved,
        booth_number: mv.booth_number,
        notes: mv.notes,
        created_at: mv.created_at,
        business_name: vp?.profile_data?.business_name ||
                       vp?.profile_data?.farm_name ||
                       'Unknown',
        vendor_status: vp?.status,
        vertical_id: vp?.vertical_id,
      }
    })

    return NextResponse.json({ vendors })
  })
}

// POST /api/markets/[id]/vendors - Vendor applies to market
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/markets/[id]/vendors', 'POST', async () => {
    const supabase = await createClient()
    const { id: marketId } = await params

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { vendor_profile_id, notes } = body

    if (!vendor_profile_id) {
      return NextResponse.json(
        { error: 'Missing required field: vendor_profile_id' },
        { status: 400 }
      )
    }

    // Verify the vendor profile belongs to this user
    const { data: vendorProfile, error: vendorError } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, vertical_id')
      .eq('id', vendor_profile_id)
      .single()

    if (vendorError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    if (vendorProfile.user_id !== userProfile.id) {
      return NextResponse.json(
        { error: 'You can only apply with your own vendor profile' },
        { status: 403 }
      )
    }

    // Verify market exists and matches vendor vertical
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, vertical_id, active')
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    if (!market.active) {
      return NextResponse.json(
        { error: 'Cannot apply to inactive market' },
        { status: 400 }
      )
    }

    if (market.vertical_id !== vendorProfile.vertical_id) {
      return NextResponse.json(
        { error: 'Vendor and market must be in the same vertical' },
        { status: 400 }
      )
    }

    // Check if already applied
    const { data: existing } = await supabase
      .from('market_vendors')
      .select('id')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendor_profile_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'You have already applied to this market' },
        { status: 400 }
      )
    }

    // Create application
    const { data: marketVendor, error } = await supabase
      .from('market_vendors')
      .insert({
        market_id: marketId,
        vendor_profile_id,
        notes,
        approved: false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { market_vendor: marketVendor, message: 'Application submitted' },
      { status: 201 }
    )
  })
}
