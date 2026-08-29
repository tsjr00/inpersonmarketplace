import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'

/**
 * GET /api/events/[token]/ratings  (Events Tier-1, survey-3a)
 *
 * Read-only summary of ATTENDEE event ratings for the organizer. Attendees
 * rate the event via /api/buyer/events/[token]/rate (status='pending'); an
 * admin approves/hides them (/api/admin/event-ratings). This surfaces only
 * status='approved' rows to the organizer — pending/hidden never reach them,
 * matching the moderation intent ("reviewed before it's shared with the
 * organizer"). Ratings are shown anonymously (no reviewer identity).
 *
 * Auth: the event's organizer (catering_requests.organizer_user_id === user.id).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/ratings', 'GET', async () => {
    const { token } = await params

    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`event-ratings:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'catering_requests')
    const { data: evt } = await observed(serviceClient
      .from('catering_requests')
      .select('id, organizer_user_id')
      .eq('event_token', token)
      .maybeSingle(), { table: 'catering_requests' })

    if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (evt.organizer_user_id !== user.id) {
      return NextResponse.json({ error: 'Not the organizer of this event' }, { status: 403 })
    }

    crumb.supabase('select', 'event_ratings')
    const { data: rows, error } = await serviceClient
      .from('event_ratings')
      .select('rating, comment, created_at')
      .eq('catering_request_id', evt.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
    if (error) {
      throw traced.fromSupabase(error, { table: 'event_ratings', operation: 'select' })
    }

    const ratings = (rows ?? []).map((r) => ({
      rating: r.rating as number,
      comment: (r.comment as string | null) || null,
      created_at: r.created_at as string,
    }))
    const count = ratings.length
    const average = count > 0
      ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
      : null

    return NextResponse.json({ count, average, ratings })
  })
}
