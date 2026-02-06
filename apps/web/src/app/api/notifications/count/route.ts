import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/notifications/count - Get unread notification count (for badge)
 *
 * Returns: { count: number }
 * Uses idx_notifications_unread index for performance.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/notifications/count', 'GET', async () => {
    const rateResult = checkRateLimit(`notif-count:${getClientIp(request)}`, rateLimits.api)
    if (!rateResult.success) return rateLimitResponse(rateResult)

    crumb.auth('Checking user')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    crumb.supabase('select', 'notifications')
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch count' }, { status: 500 })
    }

    return NextResponse.json({ count: count || 0 })
  })
}
