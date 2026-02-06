import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/notifications - Fetch user's notifications (paginated)
 *
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 20, max: 50)
 *   - unread_only (default: false)
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/notifications', 'GET', async () => {
    const rateResult = checkRateLimit(`notifications:${getClientIp(request)}`, rateLimits.api)
    if (!rateResult.success) return rateLimitResponse(rateResult)

    crumb.auth('Checking user')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const unreadOnly = searchParams.get('unread_only') === 'true'
    const offset = (page - 1) * limit

    crumb.supabase('select', 'notifications')

    // Build query - user can only see their own via RLS
    let query = supabase
      .from('notifications')
      .select('id, type, title, message, data, read_at, created_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.is('read_at', null)
    }

    const { data: notifications, error, count } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }

    return NextResponse.json({
      notifications: notifications || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  })
}
