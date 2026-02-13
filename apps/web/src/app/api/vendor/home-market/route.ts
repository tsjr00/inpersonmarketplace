import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { setHomeMarket, getHomeMarket, canChangeHomeMarket, isPremiumTier } from '@/lib/vendor-limits'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/vendor/home-market
 * Get vendor's current home market
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/home-market', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-home-market-get:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')

    if (!vertical) {
      return NextResponse.json({ error: 'Vertical required' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, tier, home_market_id')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Get home market details if set
    let homeMarket = null
    if (vendor.home_market_id) {
      const { data: market } = await supabase
        .from('markets')
        .select('id, name, address, city, state')
        .eq('id', vendor.home_market_id)
        .single()
      homeMarket = market
    }

    // Check if vendor can change home market
    const canChange = await canChangeHomeMarket(supabase, vendor.id, vendor.home_market_id)

    return NextResponse.json({
      homeMarketId: vendor.home_market_id,
      homeMarket,
      tier: vendor.tier || 'standard',
      isPremium: isPremiumTier(vendor.tier || 'standard'),
      canChange: canChange.allowed,
      changeBlockedReason: canChange.reason
    })
  })
}

/**
 * POST /api/vendor/home-market
 * Set or update vendor's home market
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/home-market', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-home-market-post:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { vertical, marketId } = body

    if (!vertical || !marketId) {
      return NextResponse.json({ error: 'Vertical and marketId required' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, tier, home_market_id')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Premium vendors don't need a home market restriction
    if (isPremiumTier(vendor.tier || 'standard')) {
      return NextResponse.json({
        success: true,
        message: 'Premium vendors can use any market',
        homeMarketId: null
      })
    }

    // Verify the market exists and is a traditional market
    const { data: market } = await supabase
      .from('markets')
      .select('id, name, market_type')
      .eq('id', marketId)
      .single()

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    if (market.market_type === 'private_pickup') {
      return NextResponse.json({
        error: 'Cannot set private pickup as home market',
        success: false
      }, { status: 400 })
    }

    // If vendor already has a home market, check if they can change it
    if (vendor.home_market_id && vendor.home_market_id !== marketId) {
      const canChange = await canChangeHomeMarket(supabase, vendor.id, vendor.home_market_id)
      if (!canChange.allowed) {
        return NextResponse.json({
          error: canChange.reason,
          success: false
        }, { status: 400 })
      }
    }

    // Set the home market
    const result = await setHomeMarket(supabase, vendor.id, marketId)

    if (!result.success) {
      return NextResponse.json({ error: result.error, success: false }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      homeMarketId: marketId,
      message: `Home market set to ${market.name}`
    })
  })
}
