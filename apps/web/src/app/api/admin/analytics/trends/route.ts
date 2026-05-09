import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/admin/analytics/trends
 *
 * Returns revenue + order-count trend buckets (day / week / month) for the
 * admin dashboard chart, optionally scoped to a single vertical.
 *
 * Data model: queries the live `orders` + `market_box_subscriptions` tables.
 * Previously queried legacy `transactions` (empty since orders/order_items
 * migration in Feb 2026); fixed Session 80 alongside the overview + top-
 * vendors routes.
 *
 * Revenue semantic: gross product subtotal (orders.subtotal_cents for
 * completed orders + subscriptions.total_paid_cents for active/completed
 * subs). Excludes platform fees.
 *
 * Order count semantic: order-level (one per checkout).
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/analytics/trends', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { isAdmin } = await verifyAdminForApi()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const verticalId = searchParams.get('vertical_id')
    const period = searchParams.get('period') || 'day' // day, week, month
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    const serviceClient = createServiceClient()

    // Orders query — vertical filter is direct
    let ordersQuery = serviceClient
      .from('orders')
      .select('id, status, subtotal_cents, created_at')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)
      .order('created_at', { ascending: true })

    if (verticalId) {
      ordersQuery = ordersQuery.eq('vertical_id', verticalId)
    }

    const { data: orders, error: ordersError } = await ordersQuery

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    // Market box subscriptions — for vertical filter, find offerings that
    // belong to vendors in that vertical (subs don't have vertical_id directly)
    let offeringIds: string[] | null = null
    if (verticalId) {
      const { data: vendorRows } = await serviceClient
        .from('vendor_profiles')
        .select('id')
        .eq('vertical_id', verticalId)
      const vendorIds = (vendorRows || []).map((v) => v.id as string)

      if (vendorIds.length === 0) {
        offeringIds = []
      } else {
        const { data: offeringRows } = await serviceClient
          .from('market_box_offerings')
          .select('id')
          .in('vendor_profile_id', vendorIds)
        offeringIds = (offeringRows || []).map((o) => o.id as string)
      }
    }

    let subsQuery = serviceClient
      .from('market_box_subscriptions')
      .select('id, status, total_paid_cents, created_at')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (offeringIds !== null) {
      if (offeringIds.length === 0) {
        subsQuery = subsQuery.in('offering_id', ['00000000-0000-0000-0000-000000000000'])
      } else {
        subsQuery = subsQuery.in('offering_id', offeringIds)
      }
    }

    const { data: subscriptions } = await subsQuery

    // Period bucketing helper
    const periodKeyFor = (createdAt: string): string => {
      const date = new Date(createdAt)
      if (period === 'week') {
        const day = date.getUTCDay()
        const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1)
        const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff))
        return weekStart.toISOString().split('T')[0] as string
      } else if (period === 'month') {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
      }
      return date.toISOString().split('T')[0] as string
    }

    // Aggregate orders + subs into the same date buckets
    const dateStats: Record<string, { date: string; revenue: number; orders: number }> = {}

    for (const order of orders || []) {
      const periodKey = periodKeyFor(order.created_at as string)
      if (!dateStats[periodKey]) {
        dateStats[periodKey] = { date: periodKey, revenue: 0, orders: 0 }
      }
      dateStats[periodKey].orders++
      if (order.status === 'completed') {
        dateStats[periodKey].revenue += order.subtotal_cents || 0
      }
    }

    for (const sub of subscriptions || []) {
      const periodKey = periodKeyFor(sub.created_at as string)
      if (!dateStats[periodKey]) {
        dateStats[periodKey] = { date: periodKey, revenue: 0, orders: 0 }
      }
      dateStats[periodKey].orders++
      if (sub.status === 'active' || sub.status === 'completed') {
        dateStats[periodKey].revenue += sub.total_paid_cents || 0
      }
    }

    // Fill missing dates so the chart shows zero buckets, not gaps
    const trends: Array<{ date: string; revenue: number; orders: number }> = []
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (period === 'day') {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0] as string
        trends.push(dateStats[dateKey] || { date: dateKey, revenue: 0, orders: 0 })
      }
    } else if (period === 'week') {
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      start.setDate(diff)

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        const dateKey = d.toISOString().split('T')[0] as string
        trends.push(dateStats[dateKey] || { date: dateKey, revenue: 0, orders: 0 })
      }
    } else if (period === 'month') {
      for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        trends.push(dateStats[dateKey] || { date: dateKey, revenue: 0, orders: 0 })
      }
    }

    return NextResponse.json(trends)
  })
}
