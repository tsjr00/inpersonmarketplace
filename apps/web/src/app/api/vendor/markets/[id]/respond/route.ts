import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

/**
 * PATCH /api/vendor/markets/[id]/respond
 *
 * Vendor accepts or declines a manager-initiated invitation to a standard
 * (non-catering) market. Companion to:
 *   - POST /api/market-manager/[marketId]/vendor-invitations (manager invite)
 *   - DELETE .../vendor-invitations/[vendorProfileId]      (manager revoke)
 *
 * Distinct from /api/vendor/events/[marketId]/respond which handles
 * catering event invitations (different state requirements — listing
 * selection, max orders per wave).
 *
 * Body: { response_status: 'accepted' | 'declined', response_notes?: string }
 *
 * On accept:
 *   - response_status → 'accepted'
 *   - approved → true  (auto-approval — manager initiated the invite)
 *   - response_notes → optional vendor note to manager
 *   - Vendor is immediately active at the market
 *
 * On decline:
 *   - response_status → 'declined'
 *   - approved stays false
 *   - response_notes → optional decline reason
 *   - Row stays for audit (manager sees declined response_status)
 *
 * Auth: vendor must own a vendor_profile in the market's vertical AND
 * the market_vendors row must be in the 'invited' state (response_status='invited'
 * AND approved=false). Otherwise 409 — vendor can't accept twice or
 * accept after manager revoked.
 *
 * Returns:
 *   200 → { success, response_status, approved }
 *   400 → bad payload
 *   401 → not authenticated
 *   404 → market not found / no invitation for this vendor at this market
 *   409 → invitation not in 'invited' state (already responded / manager revoked)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/respond', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-mkt-respond:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId } = await params

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))
    const responseStatus = typeof body?.response_status === 'string' ? body.response_status : ''
    if (responseStatus !== 'accepted' && responseStatus !== 'declined') {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'response_status must be "accepted" or "declined"'
      )
    }
    const responseNotes =
      typeof body?.response_notes === 'string' && body.response_notes.trim().length > 0
        ? body.response_notes.trim().slice(0, 500)
        : null

    const serviceClient = createServiceClient()

    // Resolve market metadata + vertical to scope the vendor profile lookup.
    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, name, vertical_id, manager_user_id')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const verticalId = (market.vertical_id as string) || 'farmers_market'

    // Vendor profile for this user in the market's vertical.
    const { data: vendorProfile } = await serviceClient
      .from('vendor_profiles')
      .select('id, profile_data')
      .eq('user_id', user.id)
      .eq('vertical_id', verticalId)
      .maybeSingle()

    if (!vendorProfile) {
      return NextResponse.json(
        { error: 'Vendor profile not found for this market\'s vertical' },
        { status: 404 }
      )
    }

    // Strict state gate: the invitation row must exist AND be in the
    // 'invited' state. This prevents the vendor from "re-accepting" an
    // already-accepted row, or accepting a row the manager revoked.
    crumb.supabase('select', 'market_vendors')
    const { data: invitation, error: inviteErr } = await serviceClient
      .from('market_vendors')
      .select('id, response_status, approved')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .maybeSingle()

    if (inviteErr) {
      throw traced.fromSupabase(inviteErr, { table: 'market_vendors', operation: 'select' })
    }
    if (!invitation) {
      return NextResponse.json(
        { error: 'No invitation found for this vendor at this market.' },
        { status: 404 }
      )
    }

    const isPendingInvitation =
      (invitation.response_status as string | null) === 'invited' &&
      invitation.approved === false

    if (!isPendingInvitation) {
      return NextResponse.json(
        {
          error:
            'This invitation is no longer pending. It may have already been responded to or revoked by the manager.',
        },
        { status: 409 }
      )
    }

    // Apply the response. Race-safe via the .eq filter on the prior state
    // (response_status='invited' AND approved=false) — if another request
    // already flipped it, our update affects 0 rows.
    //
    // On accept: approved auto-flips to true. Manager initiated the
    // invitation, so the manager's choice IS the approval — no need to
    // route through vendor-approval again.
    const update: Record<string, unknown> = {
      response_status: responseStatus,
      updated_at: new Date().toISOString(),
    }
    if (responseStatus === 'accepted') {
      update.approved = true
    }
    if (responseNotes !== null) {
      update.response_notes = responseNotes
    }

    crumb.supabase('update', 'market_vendors')
    const { data: updated, error: updateErr } = await serviceClient
      .from('market_vendors')
      .update(update)
      .eq('id', invitation.id)
      .eq('response_status', 'invited')
      .eq('approved', false)
      .select('id, response_status, approved')
      .maybeSingle()

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'market_vendors', operation: 'update' })
    }
    if (!updated) {
      // Race: someone else flipped the state between our read and write.
      return NextResponse.json(
        {
          error:
            'This invitation was just updated by another action. Refresh and try again.',
        },
        { status: 409 }
      )
    }

    // Notify the manager that the vendor responded. Non-blocking — wrap in
    // try/catch so notification failure doesn't fail the response API.
    // No notification fires if manager_user_id is null (manager hasn't
    // signed up yet — edge case for admin-pre-assigned invites).
    if (market.manager_user_id) {
      try {
        const profileData = (vendorProfile.profile_data || {}) as Record<string, unknown>
        const vendorName =
          (profileData.business_name as string | undefined) ||
          (profileData.farm_name as string | undefined) ||
          'A vendor'

        // Reuse the existing catering_vendor_responded template — it's
        // generic enough ("vendor responded to invitation for market").
        // The template currently targets the admin audience but the
        // shape works for managers too. If we want a manager-specific
        // template later, register a new type.
        await sendNotification(
          market.manager_user_id as string,
          'catering_vendor_responded',
          {
            vendorName,
            marketName: (market.name as string) || 'your market',
            responseAction:
              responseStatus === 'accepted' ? 'accepted' : 'declined',
          },
          { vertical: verticalId }
        )
      } catch (notifErr) {
        // Non-blocking — vendor response already persisted; notification
        // failure shouldn't fail the API response.
        console.error(
          '[vendor-respond] Manager notification failed:',
          notifErr instanceof Error ? notifErr.message : 'Unknown'
        )
      }
    }

    return NextResponse.json({
      success: true,
      response_status: updated.response_status,
      approved: updated.approved,
    })
  })
}
