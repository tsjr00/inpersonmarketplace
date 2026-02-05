import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/*
 * PICKUP SCHEDULING CONTEXT
 *
 * Cart items now include schedule_id and pickup_date for specific pickup selection.
 *
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 */

interface CartItemListing {
  id: string
  title: string
  price_cents: number
  quantity: number | null
  status: string
  vendor_profiles: {
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

interface VendorMarketSchedule {
  schedule_id: string
  is_active: boolean
}

interface CartItemResult {
  id: string
  quantity: number
  market_id: string | null
  schedule_id: string | null
  pickup_date: string | null
  listings: CartItemListing
  markets: CartItemMarket | null
  market_schedules: CartItemSchedule | null
}

// GET - Get user's cart with items
export async function GET(request: Request) {
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

  // Get cart items with listing, market, and schedule details
  // Include schedule_id and pickup_date for new pickup scheduling
  const { data: items, error: itemsError } = await supabase
    .from('cart_items')
    .select(`
      id,
      quantity,
      market_id,
      schedule_id,
      pickup_date,
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
      )
    `)
    .eq('cart_id', cartId)

  if (itemsError) {
    console.error('Error fetching cart items:', itemsError)
    return NextResponse.json({ error: 'Failed to fetch cart items' }, { status: 500 })
  }

  // Type the items for processing
  const typedItems = items as unknown as CartItemResult[] | null

  // Build a map to check vendor schedule activation status
  // For traditional markets, we need to check vendor_market_schedules
  const scheduleValidationMap = new Map<string, boolean>()

  // Get unique schedule IDs that need validation (traditional markets only)
  const traditionalScheduleItems = (typedItems || []).filter(
    item => item.schedule_id && item.markets?.market_type === 'traditional'
  )

  if (traditionalScheduleItems.length > 0) {
    // Get unique schedule_id + vendor_profile_id combinations to check
    const checkPairs = traditionalScheduleItems.map(item => ({
      scheduleId: item.schedule_id!,
      vendorProfileId: (item.listings?.vendor_profiles as unknown as { id: string })?.id,
      marketId: item.market_id
    })).filter(p => p.vendorProfileId && p.marketId)

    if (checkPairs.length > 0) {
      // Query vendor_market_schedules to check if vendors are still attending
      const scheduleIds = [...new Set(checkPairs.map(p => p.scheduleId))]
      const { data: vendorSchedules } = await supabase
        .from('vendor_market_schedules')
        .select('schedule_id, vendor_profile_id, is_active')
        .in('schedule_id', scheduleIds)
        .eq('is_active', true)

      // Build lookup of active vendor+schedule combos
      const activeVendorSchedules = new Set(
        (vendorSchedules || []).map(vs => `${vs.vendor_profile_id}|${vs.schedule_id}`)
      )

      // Mark each cart item's schedule as valid or invalid
      for (const item of traditionalScheduleItems) {
        const vendorId = (item.listings?.vendor_profiles as unknown as { id: string })?.id
        const key = `${vendorId}|${item.schedule_id}`
        const isActive = activeVendorSchedules.has(key)
        scheduleValidationMap.set(item.id, isActive)
      }
    }
  }

  // For private pickup markets, check if the schedule itself is still active
  const privateScheduleItems = (typedItems || []).filter(
    item => item.schedule_id && item.markets?.market_type === 'private_pickup'
  )
  for (const item of privateScheduleItems) {
    // Schedule is valid if it exists and is active
    const scheduleActive = item.market_schedules?.active ?? false
    scheduleValidationMap.set(item.id, scheduleActive)
  }

  // Get cart summary
  const { data: summary, error: summaryError } = await supabase
    .rpc('get_cart_summary', { p_cart_id: cartId })

  if (summaryError) {
    console.error('Error getting cart summary:', summaryError)
  }

  // Helper to format time for display
  const formatTime12h = (time24: string): string => {
    if (!time24) return ''
    const [hours, minutes] = time24.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  // Helper to format date for display
  const formatPickupDate = (dateStr: string | null): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.getTime() === today.getTime()) return 'Today'
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  // Transform items for response
  const cartItems = (typedItems || []).map(item => {
    const vendorProfile = item.listings?.vendor_profiles as unknown as { id: string; profile_data: Record<string, unknown> } | null
    const profileData = vendorProfile?.profile_data || {}
    const vendorName = (profileData.business_name as string) ||
                       (profileData.farm_name as string) || 'Vendor'

    // Determine schedule validity
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

    // Build pickup display info
    const schedule = item.market_schedules
    const pickupDisplay = item.pickup_date ? {
      date_formatted: formatPickupDate(item.pickup_date),
      time_formatted: schedule ? `${formatTime12h(schedule.start_time)} - ${formatTime12h(schedule.end_time)}` : null,
      day_name: schedule ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][schedule.day_of_week] : null
    } : null

    return {
      id: item.id,
      listingId: item.listings.id,
      quantity: item.quantity,
      title: item.listings.title,
      price_cents: item.listings.price_cents,
      vendor_name: vendorName,
      quantity_available: item.listings.quantity,
      status: item.listings.status,
      market_id: item.market_id,
      market_name: item.markets?.name,
      market_type: item.markets?.market_type,
      market_city: item.markets?.city,
      market_state: item.markets?.state,
      // New pickup scheduling fields
      schedule_id: item.schedule_id,
      pickup_date: item.pickup_date,
      pickup_display: pickupDisplay,
      // Schedule validation
      schedule_issue: scheduleIssue
    }
  })

  // Check if any items have schedule issues
  const hasScheduleIssues = cartItems.some(item => item.schedule_issue !== null)

  return NextResponse.json({
    items: cartItems,
    summary: summary?.[0] || { total_items: 0, total_cents: 0, vendor_count: 0 },
    hasScheduleIssues
  })
}
