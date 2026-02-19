import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/marketing/activity-feed?vertical={id}&limit=10
 *
 * Public endpoint — returns recent anonymized activity events for social proof toasts.
 * Cached for 60 seconds to reduce DB load.
 */
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`activity-feed:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/marketing/activity-feed', 'GET', async () => {
    const vertical = request.nextUrl.searchParams.get('vertical')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = Math.min(parseInt(limitParam || '10', 10) || 10, 20)

    if (!vertical) {
      return NextResponse.json({ error: 'vertical parameter required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: events, error } = await supabase
      .from('public_activity_events')
      .select('id, event_type, city, item_name, vendor_display_name, item_category, created_at')
      .eq('vertical_id', vertical)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ events: [] })
    }

    return NextResponse.json(
      { events: events || [] },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    )
  })
}
