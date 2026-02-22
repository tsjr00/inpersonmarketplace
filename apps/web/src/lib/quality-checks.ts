/**
 * Vendor Quality Checks
 *
 * 5 nightly checks that catch common vendor data issues:
 * 1. Schedule conflict — overlapping market/event times
 * 2. Low stock + event — low inventory before upcoming event
 * 3. Price anomaly — price changed >50% from last sale
 * 4. Ghost listing — published but no valid pickup path
 * 5. Inventory velocity — will sell out before next market day
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { LOW_STOCK_THRESHOLD } from './constants'
import { TracedError, logError } from './errors'

// ── Types ─────────────────────────────────────────────────────

export interface QualityFinding {
  vendor_profile_id: string
  vertical_id: string
  check_type: string
  severity: 'action_required' | 'heads_up' | 'suggestion'
  title: string
  message: string
  details: Record<string, unknown>
  reference_key: string
}

// ── Check 1: Schedule Conflict ────────────────────────────────

export async function checkScheduleConflicts(
  supabase: SupabaseClient
): Promise<QualityFinding[]> {
  const findings: QualityFinding[] = []

  // Get all active vendor market schedules with their market + schedule details
  const { data: schedules, error } = await supabase
    .from('vendor_market_schedules')
    .select(`
      id,
      vendor_profile_id,
      market_id,
      schedule_id,
      vendor_start_time,
      vendor_end_time,
      markets!inner (
        id, name, vertical_id, day_of_week, start_time, end_time, market_type, status
      ),
      market_schedules!inner (
        day_of_week, start_time, end_time, active
      )
    `)
    .eq('is_active', true)

  if (error || !schedules) {
    await logError(new TracedError('ERR_QC_001', `Schedule conflict check failed: ${error?.message}`, { route: '/api/cron/vendor-quality-checks' }))
    return findings
  }

  // Group by vendor
  const byVendor = new Map<string, typeof schedules>()
  for (const s of schedules) {
    const market = s.markets as any
    const sched = s.market_schedules as any
    if (market?.status !== 'active' || sched?.active === false) continue

    const list = byVendor.get(s.vendor_profile_id) || []
    list.push(s)
    byVendor.set(s.vendor_profile_id, list)
  }

  for (const [vendorId, vendorSchedules] of byVendor) {
    // Compare every pair of schedules for same day overlap
    for (let i = 0; i < vendorSchedules.length; i++) {
      for (let j = i + 1; j < vendorSchedules.length; j++) {
        const a = vendorSchedules[i]
        const b = vendorSchedules[j]
        const mA = a.markets as any
        const mB = b.markets as any
        const sA = a.market_schedules as any
        const sB = b.market_schedules as any

        if (sA.day_of_week !== sB.day_of_week) continue
        if (a.market_id === b.market_id) continue

        // Use vendor-specific times if set, otherwise market schedule times
        const startA = a.vendor_start_time || sA.start_time
        const endA = a.vendor_end_time || sA.end_time
        const startB = b.vendor_start_time || sB.start_time
        const endB = b.vendor_end_time || sB.end_time

        // Check overlap: A starts before B ends AND B starts before A ends
        if (startA < endB && startB < endA) {
          const [id1, id2] = [a.market_id, b.market_id].sort()
          findings.push({
            vendor_profile_id: vendorId,
            vertical_id: mA.vertical_id,
            check_type: 'schedule_conflict',
            severity: 'action_required',
            title: 'Schedule Conflict',
            message: `You're scheduled at "${mA.name}" and "${mB.name}" at overlapping times on the same day.`,
            details: {
              market1: { id: mA.id, name: mA.name, dayOfWeek: sA.day_of_week, startTime: startA, endTime: endA },
              market2: { id: mB.id, name: mB.name, dayOfWeek: sB.day_of_week, startTime: startB, endTime: endB },
            },
            reference_key: `schedule:${id1}:${id2}`,
          })
        }
      }
    }
  }

  return findings
}

// ── Check 2: Low Stock + Event ────────────────────────────────

export async function checkLowStockEvents(
  supabase: SupabaseClient
): Promise<QualityFinding[]> {
  const findings: QualityFinding[] = []
  const today = new Date().toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('listings')
    .select(`
      id, title, quantity, vendor_profile_id, vertical_id,
      listing_markets!inner (
        market_id,
        markets!inner (
          id, name, market_type, event_start_date, status
        )
      )
    `)
    .eq('status', 'published')
    .is('deleted_at', null)
    .lte('quantity', LOW_STOCK_THRESHOLD)
    .gt('quantity', 0)

  if (error || !data) {
    await logError(new TracedError('ERR_QC_002', `Low stock + event check failed: ${error?.message}`, { route: '/api/cron/vendor-quality-checks' }))
    return findings
  }

  for (const listing of data) {
    const listingMarkets = listing.listing_markets as any[]
    for (const lm of listingMarkets) {
      const market = lm.markets as any
      if (market.market_type !== 'event') continue
      if (market.status !== 'active') continue
      if (!market.event_start_date) continue
      if (market.event_start_date < today || market.event_start_date > nextWeek) continue

      findings.push({
        vendor_profile_id: listing.vendor_profile_id,
        vertical_id: listing.vertical_id,
        check_type: 'low_stock_event',
        severity: 'heads_up',
        title: 'Low Stock Before Event',
        message: `"${listing.title}" has only ${listing.quantity} left and is listed at "${market.name}" starting ${market.event_start_date}. Consider restocking.`,
        details: {
          listingId: listing.id,
          listingTitle: listing.title,
          quantity: listing.quantity,
          eventName: market.name,
          eventStartDate: market.event_start_date,
        },
        reference_key: `listing:${listing.id}:event:${market.id}`,
      })
    }
  }

  return findings
}

// ── Check 3: Price Anomaly ────────────────────────────────────

export async function checkPriceAnomalies(
  supabase: SupabaseClient
): Promise<QualityFinding[]> {
  const findings: QualityFinding[] = []
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Get recently updated published listings
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, title, price_cents, vendor_profile_id, vertical_id')
    .eq('status', 'published')
    .is('deleted_at', null)
    .gte('updated_at', yesterday)

  if (error || !listings) {
    await logError(new TracedError('ERR_QC_003', `Price anomaly check failed: ${error?.message}`, { route: '/api/cron/vendor-quality-checks' }))
    return findings
  }

  for (const listing of listings) {
    // Get most recent order_item price for this listing
    const { data: recentSale } = await supabase
      .from('order_items')
      .select('unit_price_cents')
      .eq('listing_id', listing.id)
      .not('status', 'in', '("cancelled","refunded")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!recentSale?.unit_price_cents) continue

    const currentPrice = listing.price_cents
    const previousPrice = recentSale.unit_price_cents
    if (!currentPrice || !previousPrice) continue

    const percentChange = Math.abs((currentPrice - previousPrice) / previousPrice) * 100
    if (percentChange <= 50) continue

    findings.push({
      vendor_profile_id: listing.vendor_profile_id,
      vertical_id: listing.vertical_id,
      check_type: 'price_anomaly',
      severity: 'action_required',
      title: 'Large Price Change Detected',
      message: `"${listing.title}" price changed ${percentChange > 100 ? 'dramatically' : 'significantly'} from $${(previousPrice / 100).toFixed(2)} to $${(currentPrice / 100).toFixed(2)} (${Math.round(percentChange)}% change). If this wasn't intentional, please correct it.`,
      details: {
        listingId: listing.id,
        listingTitle: listing.title,
        currentPriceCents: currentPrice,
        previousPriceCents: previousPrice,
        percentChange: Math.round(percentChange),
      },
      reference_key: `listing:${listing.id}`,
    })
  }

  return findings
}

// ── Check 4: Ghost Listing ────────────────────────────────────

export async function checkGhostListings(
  supabase: SupabaseClient
): Promise<QualityFinding[]> {
  const findings: QualityFinding[] = []
  const today = new Date().toISOString().split('T')[0]

  // Get all published listings with their market associations
  const { data: listings, error } = await supabase
    .from('listings')
    .select(`
      id, title, vendor_profile_id, vertical_id,
      listing_markets (
        market_id,
        markets (
          id, status, market_type, event_end_date,
          market_schedules (active)
        )
      )
    `)
    .eq('status', 'published')
    .is('deleted_at', null)

  if (error || !listings) {
    await logError(new TracedError('ERR_QC_004', `Ghost listing check failed: ${error?.message}`, { route: '/api/cron/vendor-quality-checks' }))
    return findings
  }

  for (const listing of listings) {
    const listingMarkets = (listing.listing_markets || []) as any[]

    if (listingMarkets.length === 0) {
      findings.push({
        vendor_profile_id: listing.vendor_profile_id,
        vertical_id: listing.vertical_id,
        check_type: 'ghost_listing',
        severity: 'heads_up',
        title: 'Listing Has No Markets',
        message: `"${listing.title}" is published but not listed at any market or pickup location. Buyers can't order it.`,
        details: { listingId: listing.id, listingTitle: listing.title, reason: 'no_markets' },
        reference_key: `listing:${listing.id}`,
      })
      continue
    }

    // Check if at least one market provides a valid pickup path
    let hasValidPath = false
    for (const lm of listingMarkets) {
      const market = lm.markets as any
      if (!market || market.status !== 'active') continue

      if (market.market_type === 'event') {
        // Events are valid if end_date >= today
        if (market.event_end_date && market.event_end_date >= today) {
          hasValidPath = true
          break
        }
      } else {
        // Traditional/private_pickup: need at least one active schedule
        const schedules = (market.market_schedules || []) as any[]
        if (schedules.some((s: any) => s.active !== false)) {
          hasValidPath = true
          break
        }
      }
    }

    if (!hasValidPath) {
      findings.push({
        vendor_profile_id: listing.vendor_profile_id,
        vertical_id: listing.vertical_id,
        check_type: 'ghost_listing',
        severity: 'heads_up',
        title: 'Listing Has No Active Pickup Dates',
        message: `"${listing.title}" is published but all its markets are inactive or have ended. Buyers can see it but can't order.`,
        details: { listingId: listing.id, listingTitle: listing.title, reason: 'no_active_markets' },
        reference_key: `listing:${listing.id}`,
      })
    }
  }

  return findings
}

// ── Check 5: Inventory Velocity ───────────────────────────────

export async function checkInventoryVelocity(
  supabase: SupabaseClient
): Promise<QualityFinding[]> {
  const findings: QualityFinding[] = []
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Get published listings with remaining inventory
  const { data: listings, error } = await supabase
    .from('listings')
    .select(`
      id, title, quantity, vendor_profile_id, vertical_id,
      listing_markets (
        market_id,
        markets (
          id, day_of_week, market_type, event_start_date, status,
          market_schedules (day_of_week, active)
        )
      )
    `)
    .eq('status', 'published')
    .is('deleted_at', null)
    .gt('quantity', 0)

  if (error || !listings) {
    await logError(new TracedError('ERR_QC_005', `Inventory velocity check failed: ${error?.message}`, { route: '/api/cron/vendor-quality-checks' }))
    return findings
  }

  for (const listing of listings) {
    // Calculate 7-day sales volume
    const { count: salesCount } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .not('status', 'in', '("cancelled","refunded")')
      .gte('created_at', sevenDaysAgo)

    const totalSold = salesCount || 0
    if (totalSold === 0) continue // No recent sales, skip

    const dailyRate = totalSold / 7
    const daysUntilSellout = listing.quantity! / dailyRate

    // Find next market day
    const now = new Date()
    const currentDayOfWeek = now.getDay() // 0=Sun, 6=Sat
    let daysUntilNextMarket = Infinity

    const listingMarkets = (listing.listing_markets || []) as any[]
    for (const lm of listingMarkets) {
      const market = lm.markets as any
      if (!market || market.status !== 'active') continue

      if (market.market_type === 'event' && market.event_start_date) {
        const eventDate = new Date(market.event_start_date + 'T00:00:00')
        const diffDays = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays > 0 && diffDays < daysUntilNextMarket) {
          daysUntilNextMarket = diffDays
        }
      } else {
        const schedules = (market.market_schedules || []) as any[]
        for (const sched of schedules) {
          if (sched.active === false) continue
          const marketDay = sched.day_of_week as number
          let diff = marketDay - currentDayOfWeek
          if (diff <= 0) diff += 7
          if (diff < daysUntilNextMarket) {
            daysUntilNextMarket = diff
          }
        }
      }
    }

    if (daysUntilNextMarket === Infinity) continue // No upcoming market

    // Will sell out before next market?
    if (daysUntilSellout < daysUntilNextMarket) {
      const nextMarketDate = new Date(now)
      nextMarketDate.setDate(nextMarketDate.getDate() + daysUntilNextMarket)

      findings.push({
        vendor_profile_id: listing.vendor_profile_id,
        vertical_id: listing.vertical_id,
        check_type: 'inventory_velocity',
        severity: 'suggestion',
        title: 'May Sell Out Before Next Market',
        message: `"${listing.title}" has ${listing.quantity} left and is selling ~${dailyRate.toFixed(1)}/day. At this rate, it may sell out in ${Math.round(daysUntilSellout)} day${Math.round(daysUntilSellout) !== 1 ? 's' : ''} — before your next market day.`,
        details: {
          listingId: listing.id,
          listingTitle: listing.title,
          currentQuantity: listing.quantity,
          dailySalesRate: Math.round(dailyRate * 10) / 10,
          daysUntilSellout: Math.round(daysUntilSellout),
          nextMarketDate: nextMarketDate.toISOString().split('T')[0],
        },
        reference_key: `listing:${listing.id}`,
      })
    }
  }

  return findings
}
