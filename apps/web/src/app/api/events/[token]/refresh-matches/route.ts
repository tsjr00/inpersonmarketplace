import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { autoMatchAndInvite } from '@/lib/events/event-actions'

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * POST /api/events/[token]/refresh-matches
 *
 * Organizer-initiated re-run of vendor auto-match for their own event. Used
 * when the organizer updates Stage 2 details that affect matching (event_type,
 * times, headcount, vendor_count, categories, children_present, event_setting)
 * and the dashboard surfaces a "Refresh matches" banner.
 *
 * Auth: caller must be the event organizer (organizer_user_id match OR
 * contact_email match — same pattern as events/[token]/details PATCH).
 *
 * Identical core behavior to admin/events/[id]/rematch — invites only NEW
 * qualifying vendors, never re-invites already-invited ones (per
 * autoMatchAndInvite's idempotency check).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/events/[token]/refresh-matches',
    'POST',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(
        `event-refresh-matches:${clientIp}`,
        rateLimits.submit
      )
      if (!rateLimitResult.success) {
        return rateLimitResponse(rateLimitResult)
      }

      // Auth required
      const supabase = await createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Sign in to refresh matches' }, { status: 401 })
      }

      const { token } = await context.params
      const serviceClient = createServiceClient()

      // Fetch the event
      const { data: cateringRequest } = await serviceClient
        .from('catering_requests')
        .select('*')
        .eq('event_token', token)
        .single()

      if (!cateringRequest) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      // Verify organizer identity (same pattern as details PATCH)
      const isOrganizerById = cateringRequest.organizer_user_id === user.id
      const isOrganizerByEmail = cateringRequest.contact_email?.toLowerCase() === user.email?.toLowerCase()
      if (!isOrganizerById && !isOrganizerByEmail) {
        return NextResponse.json(
          { error: 'Only the event organizer can refresh matches' },
          { status: 403 }
        )
      }

      // Event must be approved (have a market_id) to re-match
      if (!cateringRequest.market_id) {
        return NextResponse.json(
          { error: 'Event must be approved before vendor matches can be refreshed' },
          { status: 400 }
        )
      }

      // Run the same matching logic as admin rematch — already idempotent on
      // re-invites, so safe to call multiple times.
      const result = await autoMatchAndInvite(
        serviceClient,
        cateringRequest,
        cateringRequest.market_id
      )

      return NextResponse.json({
        ok: true,
        invited: result.invited,
        matched: result.matched,
        skipped: result.skipped || [],
        message: result.invited > 0
          ? `${result.invited} new vendor${result.invited > 1 ? 's' : ''} invited`
          : result.error || 'No new qualifying vendors found',
      })
    }
  )
}
