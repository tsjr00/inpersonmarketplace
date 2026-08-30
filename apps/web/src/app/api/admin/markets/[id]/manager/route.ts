import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPlatformAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { sendExternalEmail } from '@/lib/notifications/service'
import { getEmailBranding } from '@/lib/notifications/email-config'
import type { NotificationType } from '@/lib/notifications/types'

/**
 * (g) 2026-08-29 (owner): assigning a manager used to send NOTHING — the
 * in-app notifier needs a user_id, and an invited manager has no account
 * yet. Until they sign in with this email, every manager-facing notice is
 * skipped. So the assignment itself must carry the invitation, by plain
 * email to the address the admin typed. Best-effort: never fails the assign.
 */
async function sendManagerInviteEmail(
  email: string,
  marketName: string,
  vertical: string
): Promise<boolean> {
  const { brandName, brandDomain } = getEmailBranding(vertical)
  const appBase = process.env.NEXT_PUBLIC_APP_URL || `https://${brandDomain}`
  const signupUrl = `${appBase}/${vertical}/signup?email=${encodeURIComponent(email)}`
  const body = [
    `You've been set up as the manager for ${marketName} on ${brandName}.`,
    '',
    `To accept, create your account (or sign in) using this email address — ${email} — and open your dashboard. Your manager tools for ${marketName} appear as soon as you sign in:`,
    signupUrl,
    '',
    'Once you are in you can review vendors, set the schedule and booth inventory, and see who is selling on each market day.',
    '',
    `If you were not expecting this, you can ignore it — nothing happens until you sign in.`,
  ].join('\n')
  const result = await sendExternalEmail(email, `You're the manager for ${marketName} — accept your invite`, body, vertical)
  return result.success && !result.skipped
}

async function verifyAdminAccess(
  supabase: SupabaseClient,
  userId: string,
  verticalId: string
): Promise<boolean> {
  const { data: userProfile } = await observed(supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single(), { table: 'user_profiles' })

  // S4-2: platform_admin bypasses; vertical admin falls through to vertical_admins.
  if (hasPlatformAdminRole(userProfile || {})) return true

  const { data: va } = await observed(supabase
    .from('vertical_admins')
    .select('id')
    .eq('user_id', userId)
    .eq('vertical_id', verticalId)
    .single(), { table: 'vertical_admins' })

  return !!va
}

/** Close the market's currently-active history row (ended_at IS NULL), if any.
 *  Required before inserting a new active row — uq_market_manager_history_active
 *  (mig 154) enforces at most one active row per market. */
async function closeActiveHistory(
  serviceClient: SupabaseClient,
  marketId: string,
  adminUserId: string,
  endReason: string | null
): Promise<void> {
  await serviceClient
    .from('market_manager_history')
    .update({
      ended_at: new Date().toISOString(),
      ended_by_user_id: adminUserId,
      ...(endReason ? { end_reason: endReason } : {}),
    })
    .eq('market_id', marketId)
    .is('ended_at', null)
}

/** Notify the affected manager (if we have a user_id). Best-effort. */
async function notifyManager(
  serviceClient: SupabaseClient,
  type: NotificationType,
  managerUserId: string | null,
  managerEmail: string | null,
  marketName: string,
  marketId: string,
  vertical: string,
  reason: string | null
): Promise<void> {
  if (!managerUserId) return // not yet linked → no in-app target
  await sendNotification(
    managerUserId,
    type,
    { marketName, marketId, ...(reason ? { reason } : {}) },
    { vertical, ...(managerEmail ? { userEmail: managerEmail } : {}) }
  )
}

/**
 * POST /api/admin/markets/[id]/manager
 *
 * Admin assigns / clears / suspends / restores the market manager.
 *
 * Body:
 *   { action: 'assign', email }       → set manager_email + invited_at, reset
 *                                        user_id/accepted_at, manager_status='active';
 *                                        close prior history row + open a new one
 *   { action: 'clear', reason? }      → null all manager fields, manager_status='active';
 *                                        close history row; notify removed manager
 *   { action: 'suspend', reason? }    → manager_status='suspended'; notify; history unchanged
 *   { action: 'restore' }             → manager_status='active'; notify; history unchanged
 *
 * Auth: platform admin OR vertical admin for the market's vertical.
 * Phase 1B (Session 92): adds suspend/restore + market_manager_history writes
 * + manager notifications. Phase 1A shipped the enforcement (layout guard +
 * access pages + manager_status column).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/markets/[id]/manager', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId } = await params

    crumb.auth('Checking admin auth for market manager action')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'markets')
    const { data: market } = await observed(serviceClient
      .from('markets')
      .select('id, vertical_id, name, manager_email, manager_user_id, manager_status')
      .eq('id', marketId)
      .maybeSingle(), { table: 'markets' })

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const verticalId = market.vertical_id as string
    if (!(await verifyAdminAccess(supabase, user.id, verticalId))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = body?.action as string | undefined
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null
    const marketName = (market.name as string | null) || 'your market'
    const currentManagerUserId = (market.manager_user_id as string | null) ?? null
    const currentManagerEmail = (market.manager_email as string | null) ?? null
    const now = new Date().toISOString()

    // ── CLEAR / REMOVE ──────────────────────────────────────────────────
    if (action === 'clear') {
      await closeActiveHistory(serviceClient, marketId, user.id, reason || 'Removed by admin')

      crumb.supabase('update', 'markets')
      const { error: updateError } = await serviceClient
        .from('markets')
        .update({
          manager_email: null,
          manager_user_id: null,
          manager_invited_at: null,
          manager_accepted_at: null,
          manager_status: 'active', // reset for the next assignment
        })
        .eq('id', marketId)
      if (updateError) throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })

      await notifyManager(serviceClient, 'manager_access_removed', currentManagerUserId, currentManagerEmail, marketName, marketId, verticalId, reason)
      return NextResponse.json({ success: true, action: 'cleared' })
    }

    // ── SUSPEND ─────────────────────────────────────────────────────────
    if (action === 'suspend') {
      if (!currentManagerEmail) {
        throw traced.validation('ERR_VALIDATION_004', 'No manager is assigned to suspend')
      }
      crumb.supabase('update', 'markets')
      const { error: updateError } = await serviceClient
        .from('markets')
        .update({ manager_status: 'suspended' })
        .eq('id', marketId)
      if (updateError) throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })

      await notifyManager(serviceClient, 'manager_access_suspended', currentManagerUserId, currentManagerEmail, marketName, marketId, verticalId, reason)
      return NextResponse.json({ success: true, action: 'suspended' })
    }

    // ── RESTORE ─────────────────────────────────────────────────────────
    if (action === 'restore') {
      if (!currentManagerEmail) {
        throw traced.validation('ERR_VALIDATION_005', 'No manager is assigned to restore')
      }
      crumb.supabase('update', 'markets')
      const { error: updateError } = await serviceClient
        .from('markets')
        .update({ manager_status: 'active' })
        .eq('id', marketId)
      if (updateError) throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })

      await notifyManager(serviceClient, 'manager_access_restored', currentManagerUserId, currentManagerEmail, marketName, marketId, verticalId, null)
      return NextResponse.json({ success: true, action: 'restored' })
    }

    // ── ASSIGN ──────────────────────────────────────────────────────────
    if (action === 'assign') {
      const rawEmail = typeof body?.email === 'string' ? body.email.trim() : ''
      if (!rawEmail) throw traced.validation('ERR_VALIDATION_002', 'email is required for assign')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        throw traced.validation('ERR_VALIDATION_003', 'email must be a valid email address')
      }
      const normalizedEmail = rawEmail.toLowerCase()

      // Close any prior active history row before opening a new one
      // (partial-unique constraint allows one active row per market).
      await closeActiveHistory(serviceClient, marketId, user.id, reason || 'Reassigned')

      crumb.supabase('update', 'markets')
      const { error: updateError } = await serviceClient
        .from('markets')
        .update({
          manager_email: normalizedEmail,
          manager_invited_at: now,
          manager_user_id: null,
          manager_accepted_at: null,
          manager_status: 'active',
        })
        .eq('id', marketId)
      if (updateError) throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })

      crumb.supabase('insert', 'market_manager_history')
      const { error: histError } = await serviceClient
        .from('market_manager_history')
        .insert({
          market_id: marketId,
          manager_user_id: null, // links when the user next signs in
          manager_email_snapshot: normalizedEmail,
          assigned_at: now,
          assigned_by_user_id: user.id,
        })
      if (histError) throw traced.fromSupabase(histError, { table: 'market_manager_history', operation: 'insert' })

      const inviteSent = await sendManagerInviteEmail(normalizedEmail, marketName, verticalId)

      return NextResponse.json({
        success: true,
        action: 'assigned',
        manager_email: normalizedEmail,
        manager_invited_at: now,
        invite_email_sent: inviteSent,
      })
    }

    // ── RESEND INVITE (g, 2026-08-29) ────────────────────────────────────
    if (action === 'resend_invite') {
      if (!currentManagerEmail) {
        throw traced.validation('ERR_VALIDATION_006', 'No manager is assigned to invite')
      }
      if (currentManagerUserId) {
        throw traced.validation('ERR_VALIDATION_007', 'This manager has already accepted — nothing to resend')
      }
      const inviteSent = await sendManagerInviteEmail(currentManagerEmail, marketName, verticalId)
      if (!inviteSent) {
        return NextResponse.json({ error: 'Email could not be sent — check the email service configuration' }, { status: 502 })
      }
      crumb.supabase('update', 'markets')
      await observed(serviceClient
        .from('markets')
        .update({ manager_invited_at: now })
        .eq('id', marketId), { table: 'markets', operation: 'update' })
      return NextResponse.json({ success: true, action: 'invite_resent', manager_email: currentManagerEmail, manager_invited_at: now })
    }

    throw traced.validation('ERR_VALIDATION_001', 'action must be "assign", "clear", "suspend", "restore", or "resend_invite"')
  })
}
