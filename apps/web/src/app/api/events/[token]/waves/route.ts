import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

// GET - Wave availability for an event (lightweight, cacheable)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/waves', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`wave-check:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await params
    const supabase = createServiceClient()

    // Look up market_id from token
    const { data: event } = await supabase
      .from('catering_requests')
      .select('market_id')
      .eq('event_token', token)
      .in('status', ['approved', 'ready', 'active'])
      .single()

    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Fetch wave availability
    const { data: waves } = await supabase
      .rpc('get_event_waves_with_availability', { p_market_id: event.market_id })

    return NextResponse.json({
      waves: (waves || []).map((w: Record<string, unknown>) => ({
        id: w.wave_id,
        wave_number: w.wave_number,
        start_time: w.start_time,
        end_time: w.end_time,
        remaining: w.remaining,
        status: w.status,
      })),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' }
    })
  })
}
