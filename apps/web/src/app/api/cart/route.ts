import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'

/*
 * CART API
 *
 * Returns cart items of two types:
 * - 'listing': Regular marketplace items with pickup scheduling
 * - 'market_box': Market box subscriptions (qty always 1)
 *
 * See: docs/Build_Instructions/Market_Box_Checkout_Integration_Plan.md
 */

interface CartItemListing {
  id: string
  title: string
  price_cents: number
  quantity: number | null
  status: string
  vendor_profiles: {
    id: string
    profile_data: Record<string, unknown>
  } | null
}

interface CartItemMarket {
  id: string
  name: string
  market_type: string
  city: string
  state: string
}

interface CartItemSchedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface CartItemOffering {
  id: string
  name: string
  description: string | null
  image_urls: string[]
  price_4week_cents: number
  price_8week_cents: number | null
  pickup_day_of_week: number
  pickup_start_time: string
  pickup_end_time: string
  active: boolean
  vendor_profiles: {
    id: string
    profile_data: Record<string, unknown>
  } | null
  markets: CartItemMarket | null
}

interface CartItemResult {
  id: string
  item_type: string
  quantity: number
  market_id: string | null
  schedule_id: string | null
  pickup_date: string | null
  // Market box fields
  offering_id: string | null
  term_weeks: number | null
  start_date: string | null
  // Joined relations
  listings: CartItemListing | null
  markets: CartItemMarket | null
  market_schedules: CartItemSchedule | null
  market_box_offerings: CartItemOffering | null
}

// GET - Get user's cart with items
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cart', 'GET', async () => {
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

    // Get vertical
    const { data: verticalData, error: vertError } = await supabase
      .from('verticals')
      .select('id')
      .eq('vertical_id', vertical)
      .single()

    if (vertError || !verticalData) {
      return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
    }

    // Get or create cart
    const { data: cartId, error: cartError } = await supabase
      .rpc('get_or_create_cart', {
        p_user_id: user.id,
        p_vertical_id: verticalData.id
      })

    if (cartError) {
      console.error('Error getting cart:', cartError)
      return NextResponse.json({ error: 'Failed to get cart' }, { status: 500 })
    }

    // Get cart items with listing, market, schedule, AND market_box_offerings details
    const { data: items, error: itemsError } = await supabase
      .from('cart_items')
      .select(`
        id,
        item_type,
        quantity,
        market_id,
        schedule_id,
        pickup_date,
        offering_id,
        term_weeks,
        start_date,
        listings (
          id,
          title,
          price_cents,
          quantity,
          status,
          vendor_profiles (
            id,
            profile_data
          )
        ),
        markets!market_id (
          id,
          name,
          market_type,
          city,
          state
        ),
        market_schedules!schedule_id (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        ),
        market_box_offerings!offering_id (
          id,
          name,
          description,
          image_urls,
          price_4week_cents,
          price_8week_cents,
          pickup_day_of_week,
          pickup_start_time,
          pickup_end_time,
          active,
          vendor_profiles (
            id,
            profile_data
          ),
          markets:markets!pickup_market_id (
            id,
            name,
            market_type,
            city,
            state
          )
        )
      `)
      .eq('cart_id', cartId)

    if (itemsError) {
      console.error('Error fetching cart items:', itemsError)
      return NextResponse.json({ error: 'Failed to fetch cart items' }, { status: 500 })
    }

    // Type the items for processing
    const typedItems = items as unknown as CartItemResult[] | null

    // ── Schedule validation for listing items ────────────────────────────
    const scheduleValidationMap = new Map<string, boolean>()

    // Traditional market schedule validation
    const traditionalScheduleItems = (typedItems || []).filter(
      item => item.item_type === 'listing' && item.schedule_id && item.markets?.market_type === 'traditional'
    )

    if (traditionalScheduleItems.length > 0) {
      const checkPairs = traditionalScheduleItems.map(item => ({
        scheduleId: item.schedule_id!,
        vendorProfileId: (item.listings?.vendor_profiles as unknown as { id: string })?.id,
        marketId: item.market_id
      })).filter(p => p.vendorProfileId && p.marketId)

      if (checkPairs.length > 0) {
        const scheduleIds = [...new Set(checkPairs.map(p => p.scheduleId))]
        const { data: vendorSchedules } = await supabase
          .from('vendor_market_schedules')
          .select('schedule_id, vendor_profile_id, is_active')
          .in('schedule_id', scheduleIds)
          .eq('is_active', true)

        const activeVendorSchedules = new Set(
          (vendorSchedules || []).map(vs => `${vs.vendor_profile_id}|${vs.schedule_id}`)
        )

        for (const item of traditionalScheduleItems) {
          const vendorId = (item.listings?.vendor_profiles as unknown as { id: string })?.id
          const key = `${vendorId}|${item.schedule_id}`
          const isActive = activeVendorSchedules.has(key)
          scheduleValidationMap.set(item.id, isActive)
        }
      }
    }

    // Private pickup schedule validation
    const privateScheduleItems = (typedItems || []).filter(
      item => item.item_type === 'listing' && item.schedule_id && item.markets?.market_type === 'private_pickup'
    )
    for (const item of privateScheduleItems) {
      const scheduleActive = item.market_schedules?.active ?? false
      scheduleValidationMap.set(item.id, scheduleActive)
    }

    // Get cart summary (updated function handles both item types)
    const { data: summary, error: summaryError } = await supabase
      .rpc('get_cart_summary', { p_cart_id: cartId })

    if (summaryError) {
      console.error('Error getting cart summary:', summaryError)
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    const formatTime12h = (time24: string): string => {
      if (!time24) return ''
      const [hours, minutes] = time24.split(':').map(Number)
      const period = hours >= 12 ? 'PM' : 'AM'
      const hours12 = hours % 12 || 12
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
    }

    const formatPickupDate = (dateStr: string | null): string => {
      if (!dateStr) return ''
      const date = new Date(dateStr + 'T00:00:00')
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    }

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    // ── Transform items ─────────────────────────────────────────────────

    const cartItems = (typedItems || []).map(item => {
      const isMarketBox = item.item_type === 'market_box'

      if (isMarketBox) {
        // Market box item
        const offering = item.market_box_offerings
        const vendorProfile = offering?.vendor_profiles as unknown as { id: string; profile_data: Record<string, unknown> } | null
        const profileData = vendorProfile?.profile_data || {}
        const vendorName = (profileData.business_name as string) ||
                           (profileData.farm_name as string) || 'Vendor'
        const offeringMarket = offering?.markets as unknown as CartItemMarket | null

        const termWeeks = item.term_weeks || 4
        const priceCents = termWeeks === 8
          ? (offering?.price_8week_cents || offering?.price_4week_cents || 0)
          : (offering?.price_4week_cents || 0)

        return {
          id: item.id,
          itemType: 'market_box' as const,
          listingId: null,
          offeringId: item.offering_id,
          offeringName: offering?.name || 'Market Box',
          quantity: 1,
          title: offering?.name || 'Market Box',
          price_cents: priceCents,
          termWeeks,
          startDate: item.start_date,
          termPriceCents: priceCents,
          vendor_name: vendorName,
          quantity_available: null,
          status: offering?.active ? 'active' : 'inactive',
          market_id: item.market_id,
          market_name: offeringMarket?.name || item.markets?.name,
          market_type: offeringMarket?.market_type || item.markets?.market_type,
          market_city: offeringMarket?.city || item.markets?.city,
          market_state: offeringMarket?.state || item.markets?.state,
          pickupDayOfWeek: offering?.pickup_day_of_week ?? null,
          pickupStartTime: offering?.pickup_start_time || null,
          pickupEndTime: offering?.pickup_end_time || null,
          // Pickup display for market boxes
          schedule_id: null,
          pickup_date: item.start_date,
          pickup_display: offering ? {
            date_formatted: item.start_date ? formatPickupDate(item.start_date) : `Starts ${DAY_NAMES[offering.pickup_day_of_week] || 'TBD'}`,
            time_formatted: `${formatTime12h(offering.pickup_start_time)} - ${formatTime12h(offering.pickup_end_time)}`,
            day_name: DAY_NAMES[offering.pickup_day_of_week] || null
          } : null,
          schedule_issue: offering && !offering.active ? 'This market box is no longer available' : null
        }
      }

      // Regular listing item
      const vendorProfile = item.listings?.vendor_profiles as unknown as { id: string; profile_data: Record<string, unknown> } | null
      const profileData = vendorProfile?.profile_data || {}
      const vendorName = (profileData.business_name as string) ||
                         (profileData.farm_name as string) || 'Vendor'

      let scheduleIssue: string | null = null
      if (item.schedule_id) {
        const isValid = scheduleValidationMap.get(item.id)
        if (isValid === false) {
          if (item.markets?.market_type === 'traditional') {
            scheduleIssue = 'Vendor is no longer attending this market day'
          } else {
            scheduleIssue = 'This pickup time is no longer available'
          }
        }
      }

      const schedule = item.market_schedules
      const pickupDisplay = item.pickup_date ? {
        date_formatted: formatPickupDate(item.pickup_date),
        time_formatted: schedule ? `${formatTime12h(schedule.start_time)} - ${formatTime12h(schedule.end_time)}` : null,
        day_name: schedule ? DAY_NAMES[schedule.day_of_week] : null
      } : null

      return {
        id: item.id,
        itemType: 'listing' as const,
        listingId: item.listings?.id || null,
        offeringId: null,
        offeringName: null,
        quantity: item.quantity,
        title: item.listings?.title || 'Unknown Item',
        price_cents: item.listings?.price_cents || 0,
        termWeeks: null,
        startDate: null,
        termPriceCents: null,
        vendor_name: vendorName,
        quantity_available: item.listings?.quantity ?? null,
        status: item.listings?.status || 'unknown',
        market_id: item.market_id,
        market_name: item.markets?.name,
        market_type: item.markets?.market_type,
        market_city: item.markets?.city,
        market_state: item.markets?.state,
        pickupDayOfWeek: null,
        pickupStartTime: null,
        pickupEndTime: null,
        schedule_id: item.schedule_id,
        pickup_date: item.pickup_date,
        pickup_display: pickupDisplay,
        schedule_issue: scheduleIssue
      }
    })

    const hasScheduleIssues = cartItems.some(item => item.schedule_issue !== null)
    const hasMarketBoxItems = cartItems.some(item => item.itemType === 'market_box')

    return NextResponse.json({
      items: cartItems,
      summary: summary?.[0] || { total_items: 0, total_cents: 0, vendor_count: 0 },
      hasScheduleIssues,
      hasMarketBoxItems
    })
  })
}
