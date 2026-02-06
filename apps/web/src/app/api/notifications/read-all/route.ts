import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/notifications/read-all - Mark all notifications as read
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/notifications/read-all', 'POST', async () => {
    const rateResult = checkRateLimit(`notif-read-all:${getClientIp(request)}`, rateLimits.submit)
    if (!rateResult.success) return rateLimitResponse(rateResult)

    crumb.auth('Checking user')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    crumb.supabase('update', 'notifications')
    // RLS ensures user can only update their own notifications
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)

    if (error) {
      return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
