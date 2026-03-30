import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { autoMatchAndInvite } from '@/lib/events/event-actions'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/admin/events/[id]/rematch
 *
 * Re-run auto-match for an approved event. Finds new qualifying vendors
 * who weren't invited in the original match (e.g., vendors who added
 * event-eligible items after the initial submission).
 *
 * Only invites vendors not already in market_vendors for this event.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing(
    '/api/admin/events/[id]/rematch',
    'POST',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(
        `admin:${clientIp}`,
        rateLimits.admin
      )
      if (!rateLimitResult.success) {
        return rateLimitResponse(rateLimitResult)
      }

      const supabase = await createClient()

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role, roles')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      if (!hasAdminRole(userProfile || {})) {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        )
      }

      const { id } = await context.params
      const serviceClient = createServiceClient()

      // Get the catering request
      const { data: cateringRequest, error: fetchError } = await serviceClient
        .from('catering_requests')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !cateringRequest) {
        return NextResponse.json(
          { error: 'Event request not found' },
          { status: 404 }
        )
      }

      if (!cateringRequest.market_id) {
        return NextResponse.json(
          { error: 'Event must be approved (market created) before re-matching' },
          { status: 400 }
        )
      }

      // Run auto-match — it already skips vendors who are already invited
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
