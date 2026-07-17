import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { backfillStripeFees } from '@/lib/stripe/fee-capture'

/**
 * POST /api/admin/backfill-stripe-fees
 *
 * ADM-2: populate payments.stripe_fee_cents for historical rows from each
 * charge's balance_transaction fee (going-forward capture is done in the
 * settlement webhook). Platform-admin only; bounded per call — call repeatedly
 * until `remaining` is 0. Requires migration 196 applied.
 * Body (optional): { limit?: number }  (default 100, max 500).
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/backfill-stripe-fees', 'POST', async () => {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`admin-backfill-fees:${ip}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()
    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const requested = Number(body?.limit)
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 500) : 100

    const result = await backfillStripeFees(createServiceClient(), limit)
    return NextResponse.json(result)
  })
}
