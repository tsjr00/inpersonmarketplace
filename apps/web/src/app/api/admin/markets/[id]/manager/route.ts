import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import type { NotificationType } from '@/lib/notifications/types'

async function verifyAdminAccess(
  supabase: SupabaseClient,
  userId: string,
  verticalId: string
): Promise<boolean> {
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()

  if (hasAdminRole(userProfile || {})) return true

  const { data: va } = await supabase
    .from('vertical_admins')
    .select('id')
    .eq('user_id', userId)
    .eq('vertical_id', verticalId)
    .single()

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
    const { data: market } = await serviceClient
      .from('markets')
      .select('id, vertical_id, name, manager_email, manager_user_id, manager_status')
      .eq('id', marketId)
      .maybeSingle()

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

      return NextResponse.json({
        success: true,
        action: 'assigned',
        manager_email: normalizedEmail,
        manager_invited_at: now,
      })
    }

    throw traced.validation('ERR_VALIDATION_001', 'action must be "assign", "clear", "suspend", or "restore"')
  })
}
