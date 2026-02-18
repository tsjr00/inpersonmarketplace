import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/vendor/favorites?vertical=food_trucks
 * Returns array of vendor_profile_ids the user has favorited in this vertical
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/favorites', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-favorites-get:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vertical = request.nextUrl.searchParams.get('vertical')

    // Query favorites, joining vendor_profiles to filter by vertical
    let query = supabase
      .from('vendor_favorites')
      .select('vendor_profile_id, vendor_profiles!inner(vertical_id)')
      .eq('user_id', user.id)

    if (vertical) {
      query = query.eq('vendor_profiles.vertical_id', vertical)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching favorites:', error)
      return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
    }

    const favorites = (data || []).map(row => row.vendor_profile_id)
    return NextResponse.json({ favorites })
  })
}

/**
 * POST /api/vendor/favorites
 * Body: { vendor_profile_id: string }
 * Adds a vendor to the user's favorites
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/favorites', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-favorites-post:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { vendor_profile_id } = body

    if (!vendor_profile_id) {
      return NextResponse.json({ error: 'vendor_profile_id required' }, { status: 400 })
    }

    // Upsert to handle duplicate gracefully
    const { error } = await supabase
      .from('vendor_favorites')
      .upsert(
        { user_id: user.id, vendor_profile_id },
        { onConflict: 'user_id,vendor_profile_id' }
      )

    if (error) {
      console.error('Error adding favorite:', error)
      return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}

/**
 * DELETE /api/vendor/favorites?vendor_profile_id=xxx
 * Removes a vendor from the user's favorites
 */
export async function DELETE(request: NextRequest) {
  return withErrorTracing('/api/vendor/favorites', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-favorites-del:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vendor_profile_id = request.nextUrl.searchParams.get('vendor_profile_id')

    if (!vendor_profile_id) {
      return NextResponse.json({ error: 'vendor_profile_id required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('vendor_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('vendor_profile_id', vendor_profile_id)

    if (error) {
      console.error('Error removing favorite:', error)
      return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
