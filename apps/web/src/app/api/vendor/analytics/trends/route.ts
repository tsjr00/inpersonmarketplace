import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams
  const vendorId = searchParams.get('vendor_id')
  const period = searchParams.get('period') || 'day' // day, week, month
  const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

  if (!vendorId) {
    return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
  }

  // Verify the user owns this vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('id', vendorId)
    .single()

  if (!vendorProfile || vendorProfile.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized to view this vendor analytics' }, { status: 403 })
  }

  // Get transactions with listing data
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      status,
      created_at,
      listing:listings(price_cents)
    `)
    .eq('vendor_profile_id', vendorId)
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by date period
  const dateStats: Record<string, { date: string; revenue: number; orders: number }> = {}

  for (const tx of transactions || []) {
    const txDate = new Date(tx.created_at)
    let dateKey: string

    if (period === 'week') {
      // Get the Monday of the week
      const day = txDate.getDay()
      const diff = txDate.getDate() - day + (day === 0 ? -6 : 1)
      const weekStart = new Date(txDate)
      weekStart.setDate(diff)
      dateKey = weekStart.toISOString().split('T')[0]
    } else if (period === 'month') {
      dateKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-01`
    } else {
      // day
      dateKey = txDate.toISOString().split('T')[0]
    }

    if (!dateStats[dateKey]) {
      dateStats[dateKey] = { date: dateKey, revenue: 0, orders: 0 }
    }

    dateStats[dateKey].orders++

    // Only count revenue for fulfilled transactions
    if (tx.status === 'fulfilled') {
      // Supabase returns relations as arrays, get first element
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
    // Start from the Monday of start date
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
}
