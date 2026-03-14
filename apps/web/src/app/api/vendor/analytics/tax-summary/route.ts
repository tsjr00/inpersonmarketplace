import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/tax-summary', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-analytics-tax:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendor_id')
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // No tier gating — available to all tiers

    // Fetch order items with listing is_taxable flag
    const { data: orderItems, error } = await supabase
      .from('order_items')
      .select('subtotal_cents, status, listing_id, listings!inner(is_taxable)')
      .eq('vendor_profile_id', vendorId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let totalSalesCents = 0
    let taxableSalesCents = 0
    let totalOrderCount = 0
    let taxableOrderCount = 0

    for (const item of orderItems || []) {
      // Only count completed/fulfilled orders (same as overview route)
      if (item.status !== 'fulfilled' && item.status !== 'completed') continue

      const amount = item.subtotal_cents || 0
      totalSalesCents += amount
      totalOrderCount++

      // listings is joined as object (inner join, single record)
      const listing = item.listings as unknown as { is_taxable: boolean } | null
      if (listing?.is_taxable) {
        taxableSalesCents += amount
        taxableOrderCount++
      }
    }

    return NextResponse.json({
      totalSalesCents,
      taxableSalesCents,
      nonTaxableSalesCents: totalSalesCents - taxableSalesCents,
      totalOrderCount,
      taxableOrderCount,
      nonTaxableOrderCount: totalOrderCount - taxableOrderCount,
    })
  })
}
