import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

// POST - Submit a traditional market suggestion for admin approval
export async function POST(request: Request) {
  return withErrorTracing('/api/vendor/markets/suggest', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-suggest:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const body = await request.json()
      const { vertical, name, address, city, state, zip, description, website, season_start, season_end, schedules, vendor_sells_at_market = true } = body

      if (!vertical || !name || !address || !city || !state || !zip) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      // Validate schedules - at least one required
      if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
        return NextResponse.json({ error: 'At least one market day/time is required' }, { status: 400 })
      }

      // Validate each schedule entry
      for (const schedule of schedules) {
        if (schedule.day_of_week === undefined || schedule.day_of_week === null ||
            !schedule.start_time || !schedule.end_time) {
          return NextResponse.json({ error: 'Each schedule requires day, start time, and end time' }, { status: 400 })
        }
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

      // Check for duplicate market name in this vertical (case-insensitive)
      const { data: existingMarket } = await supabase
        .from('markets')
        .select('id, name')
        .eq('vertical_id', vertical)
        .eq('market_type', 'traditional')
        .ilike('name', name.trim())
        .maybeSingle()

      if (existingMarket) {
        return NextResponse.json({
          error: `A market named "${existingMarket.name}" already exists. If you want to sell at this market, look for it in the Traditional Markets section above.`
        }, { status: 400 })
      }

      // Check if vendor already submitted this market (by similar name)
      const { data: existingSuggestion } = await supabase
        .from('markets')
        .select('id, name, approval_status')
        .eq('vertical_id', vertical)
        .eq('market_type', 'traditional')
        .eq('submitted_by_vendor_id', vendorProfile.id)
        .ilike('name', `%${name.trim()}%`)
        .maybeSingle()

      if (existingSuggestion) {
        const statusText = existingSuggestion.approval_status === 'pending'
          ? 'is pending review'
          : `was ${existingSuggestion.approval_status}`
        return NextResponse.json({
          error: `You already submitted a similar market "${existingSuggestion.name}" which ${statusText}.`
        }, { status: 400 })
      }

      // Create the market suggestion with pending approval status
      const { data: market, error: createError } = await supabase
        .from('markets')
        .insert({
          vertical_id: vertical,
          name: name.trim(),
          market_type: 'traditional',
          address: address.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim(),
          description: description?.trim() || null,
          website: website?.trim() || null,
          season_start: season_start || null,
          season_end: season_end || null,
          status: 'active',
          approval_status: 'pending',
          submitted_by_vendor_id: vendorProfile.id,
          submitted_at: new Date().toISOString(),
          vendor_sells_at_market: vendor_sells_at_market === true
        })
        .select()
        .single()

      if (createError) {
        console.error('[/api/vendor/markets/suggest] Error creating market:', createError)
        // Return more specific error message for debugging
        return NextResponse.json({
          error: 'Failed to submit market suggestion',
          details: createError.message,
          code: createError.code
        }, { status: 500 })
      }

      // Create market_schedules
      const scheduleInserts = schedules.map((s: { day_of_week: number; start_time: string; end_time: string }) => ({
        market_id: market.id,
        day_of_week: typeof s.day_of_week === 'string' ? parseInt(s.day_of_week) : s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        active: true
      }))

      const { error: scheduleError } = await supabase
        .from('market_schedules')
        .insert(scheduleInserts)

      if (scheduleError) {
        console.error('[/api/vendor/markets/suggest] Error creating schedules:', scheduleError)
        // Market was created but schedules failed - clean up
        await supabase.from('markets').delete().eq('id', market.id)
        return NextResponse.json({ error: 'Failed to create market schedule' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        market: {
          id: market.id,
          name: market.name,
          approval_status: market.approval_status
        },
        message: 'Market suggestion submitted! Our team will review it and notify you once approved.'
      }, { status: 201 })
    } catch (error) {
      console.error('[/api/vendor/markets/suggest] Unexpected error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
