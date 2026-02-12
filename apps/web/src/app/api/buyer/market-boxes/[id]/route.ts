import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/buyer/market-boxes/[id]
 * Get a single subscription with full details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/buyer/market-boxes/[id]', 'GET', async () => {
    const { id: subscriptionId } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get subscription with all related data
    const { data: subscription, error } = await supabase
      .from('market_box_subscriptions')
      .select(`
        id,
        total_paid_cents,
        start_date,
        status,
        weeks_completed,
        term_weeks,
        extended_weeks,
        created_at,
        completed_at,
        cancelled_at,
        offering:market_box_offerings (
          id,
          name,
          description,
          image_urls,
          price_cents,
          pickup_day_of_week,
          pickup_start_time,
          pickup_end_time,
          vendor:vendor_profiles (
            id,
            profile_data,
            description,
            profile_image_url
          ),
          market:markets (
            id,
            name,
            market_type,
            address,
            city,
            state,
            zip,
            contact_email,
            contact_phone
          )
        ),
        pickups:market_box_pickups (
          id,
          week_number,
          scheduled_date,
          status,
          ready_at,
          picked_up_at,
          missed_at,
          rescheduled_to,
          vendor_notes,
          is_extension,
          skipped_by_vendor_at,
          skip_reason,
          buyer_confirmed_at,
          vendor_confirmed_at,
          confirmation_window_expires_at
        )
      `)
      .eq('id', subscriptionId)
      .eq('buyer_user_id', user.id)
      .single()

    if (error || !subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    // Transform
    const offering = subscription.offering as any
    const vendor = offering?.vendor
    const profileData = vendor?.profile_data as Record<string, unknown> | null
    const vendorName =
      (profileData?.business_name as string) ||
      (profileData?.farm_name as string) ||
      'Vendor'

    // Sort pickups by week number
    const pickups = ((subscription.pickups as any[]) || []).sort((a, b) => a.week_number - b.week_number)

    // Find next upcoming pickup
    const today = new Date().toISOString().split('T')[0]
    const nextPickup = pickups.find(p =>
      p.scheduled_date >= today && ['scheduled', 'ready'].includes(p.status)
    )

    // Calculate total weeks and end date
    const termWeeks = (subscription as any).term_weeks || 4
    const extendedWeeks = (subscription as any).extended_weeks || 0
    const totalWeeks = termWeeks + extendedWeeks
    const startDate = new Date(subscription.start_date)
    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + (totalWeeks - 1) * 7)
    const endDateStr = endDate.toISOString().split('T')[0]

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        total_paid_cents: subscription.total_paid_cents,
        start_date: subscription.start_date,
        end_date: endDateStr,
        weeks_completed: subscription.weeks_completed,
        term_weeks: termWeeks,
        extended_weeks: extendedWeeks,
        total_weeks: totalWeeks,
        weeks_remaining: totalWeeks - (subscription.weeks_completed || 0),
        created_at: subscription.created_at,
        completed_at: subscription.completed_at,
        cancelled_at: subscription.cancelled_at,
      },
      offering: {
        id: offering?.id,
        name: offering?.name,
        description: offering?.description,
        image_urls: offering?.image_urls,
        price_cents: offering?.price_cents,
        pickup_day_of_week: offering?.pickup_day_of_week,
        pickup_start_time: offering?.pickup_start_time,
        pickup_end_time: offering?.pickup_end_time,
      },
      vendor: {
        id: vendor?.id,
        name: vendorName,
        description: vendor?.description,
        profile_image_url: vendor?.profile_image_url,
      },
      market: offering?.market,
      pickups,
      next_pickup: nextPickup || null,
    })
  })
}
