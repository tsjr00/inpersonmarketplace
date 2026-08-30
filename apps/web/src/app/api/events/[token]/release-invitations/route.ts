import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
import { autoMatchAndInvite } from '@/lib/events/event-actions'
import { eventRefColumn } from '@/lib/events/event-ref'
import { invitationsHeld, missingInvitationDetails } from '@/lib/events/invitation-gate'

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * POST /api/events/[token]/release-invitations
 *
 * Invitation gate (mig 239, owner 2026-08-29). The organizer's "Send
 * invitations" click. Self-service events are approved + preliminarily
 * matched at intake but NOT invited; this is the one place invitations are
 * first released for them.
 *
 *   1. auth + organizer identity (same as refresh-matches / details PATCH)
 *   2. event must be approved (market exists)
 *   3. every required detail answered (lib/events/invitation-gate.ts) — else
 *      409 with the list, so the UI can never get ahead of the rule
 *   4. stamp invitations_released_at (atomic: only the first click wins)
 *   5. run the real match + invite; stamp auto_invite_sent_at so the cron's
 *      24h gap alert / 48h results email count from the REAL send
 *
 * Idempotent after step 4: a second click returns the receipt, invites nobody.
 * Admin-assisted events are not gated (owner: later) — they 409 here because
 * their invitations already went out at approval.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/events/[token]/release-invitations',
    'POST',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(`event-release-invitations:${clientIp}`, rateLimits.submit)
      if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Sign in to send invitations' }, { status: 401 })
      }

      const { token } = await context.params
      const serviceClient = createServiceClient()
      const { data: cateringRequest } = await observed(serviceClient
        .from('catering_requests')
        .select('*')
        .eq(eventRefColumn(token), token)
        .maybeSingle(), { table: 'catering_requests' })
      if (!cateringRequest) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      const isOrganizerById = cateringRequest.organizer_user_id === user.id
      const isOrganizerByEmail = (cateringRequest.contact_email as string | null)?.toLowerCase() === user.email?.toLowerCase()
      if (!isOrganizerById && !isOrganizerByEmail) {
        return NextResponse.json({ error: 'Only the event organizer can send invitations' }, { status: 403 })
      }

      if (!cateringRequest.market_id) {
        return NextResponse.json({ error: 'Your event needs an address and approval before invitations can go out' }, { status: 400 })
      }
      if (!['approved', 'ready'].includes(cateringRequest.status as string)) {
        return NextResponse.json({ error: `Invitations cannot be sent while the event is ${cateringRequest.status}` }, { status: 409 })
      }
      if (!invitationsHeld(cateringRequest)) {
        return NextResponse.json({
          ok: true,
          already_released: true,
          released_at: cateringRequest.invitations_released_at ?? cateringRequest.auto_invite_sent_at ?? null,
          invited: 0,
          message: 'Invitations already went out for this event.',
        })
      }

      const missing = missingInvitationDetails(cateringRequest)
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `${missing.length} detail${missing.length === 1 ? '' : 's'} still needed before invitations can go out`, missing },
          { status: 409 }
        )
      }

      // Atomic release — a double-click cannot invite twice.
      const nowIso = new Date().toISOString()
      const { data: released } = await observed(serviceClient
        .from('catering_requests')
        .update({ invitations_released_at: nowIso })
        .eq('id', cateringRequest.id)
        .is('invitations_released_at', null)
        .select('id'), { table: 'catering_requests', operation: 'update' })
      if (!released || released.length === 0) {
        return NextResponse.json({ ok: true, already_released: true, invited: 0, message: 'Invitations already went out for this event.' })
      }

      const result = await autoMatchAndInvite(serviceClient, cateringRequest, cateringRequest.market_id as string)
      if (result.invited > 0) {
        await observed(serviceClient
          .from('catering_requests')
          .update({ auto_invite_sent_at: nowIso })
          .eq('id', cateringRequest.id), { table: 'catering_requests', operation: 'update' })
      }

      return NextResponse.json({
        ok: true,
        released_at: nowIso,
        invited: result.invited,
        matched: result.matched,
        skipped: result.skipped || [],
        message: result.invited > 0
          ? `${result.invited} vendor${result.invited === 1 ? '' : 's'} invited`
          : result.error || 'No qualifying vendors right now — widen your criteria to reach more',
      })
    }
  )
}
