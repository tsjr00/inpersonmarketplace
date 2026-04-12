import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/buyer/events/[token]/rate
 *
 * Attendee-submitted rating of the event experience itself (not
 * vendor-specific). Goes into `event_ratings` with status='pending'
 * for admin moderation. Once approved, visible to the event organizer
 * and platform admin.
 *
 * Vendor ratings from event attendees continue to flow through the
 * existing /api/buyer/orders/[id]/rate endpoint — do not route
 * vendor rating logic here.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  return withErrorTracing(`/api/buyer/events/${token}/rate`, 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`buyer-event-rate-post:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let rating: number
    let comment: string | null = null
    try {
      const body = await request.json()
      rating = body.rating
      comment = body.comment ? String(body.comment).trim() || null : null

      if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (comment) {
      const { checkFields } = await import('@/lib/content-moderation')
      const modCheck = checkFields({ comment })
      if (!modCheck.passed) {
        return NextResponse.json({ error: modCheck.reason }, { status: 400 })
      }
    }

    // Resolve event_token → catering_requests row and verify it's in a
    // ratable status. Anything still 'approved' or 'ready' is pre-event —
    // rating doesn't make sense yet.
    const { data: event, error: eventError } = await supabase
      .from('catering_requests')
      .select('id, status')
      .eq('event_token', token)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const ratableStatuses = ['active', 'review', 'completed']
    if (!ratableStatuses.includes(event.status as string)) {
      return NextResponse.json(
        { error: 'This event is not yet open for ratings' },
        { status: 400 }
      )
    }

    // Upsert: attendees can edit their pending rating; admin-approved
    // rows are locked by the UPDATE RLS policy (status = 'pending' check).
    const { data: upserted, error: upsertError } = await supabase
      .from('event_ratings')
      .upsert(
        {
          catering_request_id: event.id,
          user_id: user.id,
          rating,
          comment,
          status: 'pending',
        },
        { onConflict: 'catering_request_id,user_id' }
      )
      .select('id, status')
      .single()

    if (upsertError) {
      console.error('[/api/buyer/events/[token]/rate] upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to save rating' }, { status: 500 })
    }

    return NextResponse.json(
      {
        success: true,
        status: upserted.status,
        message: 'Thanks — your feedback will be reviewed before it\'s shared with the organizer.',
      },
      { status: 201 }
    )
  })
}
