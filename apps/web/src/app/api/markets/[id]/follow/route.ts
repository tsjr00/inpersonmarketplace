import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Market follow/unfollow (Session 92 Phase B). Mirrors the vendor_favorites
 * route shape. Own-row RLS on market_favorites means the auth user's client
 * is sufficient — no service client needed.
 *
 * POST   /api/markets/[id]/follow  → follow (idempotent upsert)
 * DELETE /api/markets/[id]/follow  → unfollow
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/markets/[id]/follow', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`market-follow:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: marketId } = await context.params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('market_favorites')
      .upsert(
        { user_id: user.id, market_id: marketId },
        { onConflict: 'user_id,market_id' }
      )

    if (error) {
      console.error('Error following market:', error)
      return NextResponse.json({ error: 'Failed to follow market' }, { status: 500 })
    }

    return NextResponse.json({ success: true, following: true })
  })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/markets/[id]/follow', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`market-unfollow:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: marketId } = await context.params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('market_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('market_id', marketId)

    if (error) {
      console.error('Error unfollowing market:', error)
      return NextResponse.json({ error: 'Failed to unfollow market' }, { status: 500 })
    }

    return NextResponse.json({ success: true, following: false })
  })
}
