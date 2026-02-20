import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { DEFAULT_CUTOFF_HOURS } from '@/lib/constants'

// POST - Submit a traditional market suggestion for admin approval
export async function POST(request: NextRequest) {
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
      const { vertical, name, address, city, state, zip, description, website, season_start, season_end, schedules, vendor_sells_at_market = true, market_type = 'traditional', event_start_date, event_end_date, event_url } = body

      if (!vertical || !name || !address || !city || !state || !zip) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      // Validate market_type
      if (!['traditional', 'event'].includes(market_type)) {
        return NextResponse.json({ error: 'Invalid market_type' }, { status: 400 })
      }

      // Event-specific validation
      if (market_type === 'event') {
        if (!event_start_date || !event_end_date) {
          return NextResponse.json({ error: 'Events require start and end dates' }, { status: 400 })
        }
        if (event_end_date < event_start_date) {
          return NextResponse.json({ error: 'Event end date must be on or after start date' }, { status: 400 })
        }
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

      // Check for duplicate market name in this vertical and market_type (case-insensitive)
      const { data: existingMarket } = await supabase
        .from('markets')
        .select('id, name')
        .eq('vertical_id', vertical)
        .eq('market_type', market_type)
        .ilike('name', name.trim())
        .maybeSingle()

      if (existingMarket) {
        return NextResponse.json({
          error: `A ${market_type === 'event' ? 'event' : 'location'} named "${existingMarket.name}" already exists. If you want to sell at this ${market_type === 'event' ? 'event' : 'location'}, look for it in the ${market_type === 'event' ? 'events' : 'markets'} section above.`
        }, { status: 400 })
      }

      // Check if vendor already submitted this market (by similar name)
      const { data: existingSuggestion } = await supabase
        .from('markets')
        .select('id, name, approval_status')
        .eq('vertical_id', vertical)
        .eq('market_type', market_type)
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
      const insertData: Record<string, unknown> = {
        vertical_id: vertical,
        name: name.trim(),
        market_type,
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
        vendor_sells_at_market: vendor_sells_at_market === true,
      }
      // Event-specific fields
      if (market_type === 'event') {
        insertData.event_start_date = event_start_date
        insertData.event_end_date = event_end_date
        insertData.event_url = event_url || null
        insertData.cutoff_hours = DEFAULT_CUTOFF_HOURS.event // 24h advance cutoff
      } else if (vertical === 'food_trucks') {
        insertData.cutoff_hours = DEFAULT_CUTOFF_HOURS.food_trucks
      }
      const { data: market, error: createError } = await supabase
        .from('markets')
        .insert(insertData)
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

      const { data: createdSchedules, error: scheduleError } = await supabase
        .from('market_schedules')
        .insert(scheduleInserts)
        .select('id')

      if (scheduleError) {
        console.error('[/api/vendor/markets/suggest] Error creating schedules:', scheduleError)
        // Market was created but schedules failed - clean up
        await supabase.from('markets').delete().eq('id', market.id)
        return NextResponse.json({ error: 'Failed to create market schedule' }, { status: 500 })
      }

      // Auto-create vendor attendance records when vendor sells at this market
      if (vendor_sells_at_market && createdSchedules && createdSchedules.length > 0) {
        const attendanceEntries = createdSchedules.map(ms => ({
          vendor_profile_id: vendorProfile.id,
          market_id: market.id,
          schedule_id: ms.id,
          is_active: true
        }))

        const { error: attendanceError } = await supabase
          .from('vendor_market_schedules')
          .upsert(attendanceEntries, {
            onConflict: 'vendor_profile_id,schedule_id',
            ignoreDuplicates: true
          })

        if (attendanceError) {
          // Non-blocking: market + schedules were created successfully
          console.warn('[/api/vendor/markets/suggest] Failed to auto-create attendance:', attendanceError)
        }
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
