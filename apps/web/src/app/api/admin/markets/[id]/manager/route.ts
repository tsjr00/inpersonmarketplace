import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

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

/**
 * POST /api/admin/markets/[id]/manager
 *
 * Admin assigns or clears the market manager for a market.
 *
 * Body:
 *   { action: 'assign', email: string }   → set manager_email + manager_invited_at,
 *                                            clear any prior manager_user_id +
 *                                            manager_accepted_at (fresh assignment)
 *   { action: 'clear' }                   → set all 4 manager fields to NULL
 *
 * Auth: platform admin OR vertical admin for the market's vertical.
 *
 * Note: this endpoint does NOT send an invite email. The user signs up
 * (or is already signed up) using the assigned email; on first
 * authenticated buyer dashboard visit, the existing backfill flow links
 * manager_user_id + sets manager_accepted_at. A magic-link invite path
 * is queued for a later phase.
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

    crumb.auth('Checking admin auth for market manager assignment')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const serviceClient = createServiceClient()

    // Look up the market to (a) verify it exists and (b) get vertical_id
    // for vertical-admin auth check
    crumb.supabase('select', 'markets')
    const { data: existingMarket } = await serviceClient
      .from('markets')
      .select('id, vertical_id')
      .eq('id', marketId)
      .maybeSingle()

    if (!existingMarket) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    if (!(await verifyAdminAccess(supabase, user.id, existingMarket.vertical_id as string))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Parse body
    const body = await request.json().catch(() => ({}))
    const action = body?.action as string | undefined

    if (action !== 'assign' && action !== 'clear') {
      throw traced.validation('ERR_VALIDATION_001', 'action must be "assign" or "clear"')
    }

    const now = new Date().toISOString()

    if (action === 'clear') {
      crumb.supabase('update', 'markets')
      const { error: updateError } = await serviceClient
        .from('markets')
        .update({
          manager_email: null,
          manager_user_id: null,
          manager_invited_at: null,
          manager_accepted_at: null,
        })
        .eq('id', marketId)

      if (updateError) {
        throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })
      }

      return NextResponse.json({ success: true, action: 'cleared' })
    }

    // action === 'assign'
    const rawEmail = typeof body?.email === 'string' ? body.email.trim() : ''
    if (!rawEmail) {
      throw traced.validation('ERR_VALIDATION_002', 'email is required for assign')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      throw traced.validation('ERR_VALIDATION_003', 'email must be a valid email address')
    }
    const normalizedEmail = rawEmail.toLowerCase()

    // Fresh assignment: set email + invited_at, clear user_id + accepted_at
    // (those repopulate when the assigned user next loads the buyer dashboard,
    // via the backfill flow at dashboard/page.tsx).
    crumb.supabase('update', 'markets')
    const { error: updateError } = await serviceClient
      .from('markets')
      .update({
        manager_email: normalizedEmail,
        manager_invited_at: now,
        manager_user_id: null,
        manager_accepted_at: null,
      })
      .eq('id', marketId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })
    }

    return NextResponse.json({
      success: true,
      action: 'assigned',
      manager_email: normalizedEmail,
      manager_invited_at: now,
    })
  })
}
