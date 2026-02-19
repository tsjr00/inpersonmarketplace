import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/analytics/trends', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    // Verify admin role using centralized utility
    const { isAdmin } = await verifyAdminForApi()

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const verticalId = searchParams.get('vertical_id')
    const period = searchParams.get('period') || 'day' // day, week, month
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    // Use service client for full access
    const serviceClient = createServiceClient()

    // Build transactions query
    let txQuery = serviceClient
      .from('transactions')
      .select(`
        id,
        status,
        created_at,
        listing:listings(price_cents, vertical_id)
      `)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)
      .order('created_at', { ascending: true })

    if (verticalId) {
      txQuery = txQuery.eq('listing.vertical_id', verticalId)
    }

    const { data: transactions, error } = await txQuery

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // TODO: At scale, replace in-memory grouping with a Supabase RPC that
    // does DATE_TRUNC + GROUP BY on the server for better performance.
    const dateStats: Record<string, { date: string; revenue: number; orders: number }> = {}

    for (const tx of transactions || []) {
      const txDate = new Date(tx.created_at)
      let dateKey: string

      if (period === 'week') {
        const day = txDate.getDay()
        const diff = txDate.getDate() - day + (day === 0 ? -6 : 1)
        const weekStart = new Date(txDate)
        weekStart.setDate(diff)
        dateKey = weekStart.toISOString().split('T')[0]
      } else if (period === 'month') {
        dateKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-01`
      } else {
        dateKey = txDate.toISOString().split('T')[0]
      }

      if (!dateStats[dateKey]) {
        dateStats[dateKey] = { date: dateKey, revenue: 0, orders: 0 }
      }

      dateStats[dateKey].orders++

      if (tx.status === 'fulfilled') {
        const listingData = tx.listing as unknown
        const listing = Array.isArray(listingData) ? listingData[0] : listingData
        dateStats[dateKey].revenue += (listing as { price_cents?: number })?.price_cents || 0
      }
    }

    // Fill in missing dates
    const trends: Array<{ date: string; revenue: number; orders: number }> = []
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (period === 'day') {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0]
        trends.push(dateStats[dateKey] || { date: dateKey, revenue: 0, orders: 0 })
      }
    } else if (period === 'week') {
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      start.setDate(diff)

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        const dateKey = d.toISOString().split('T')[0]
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
