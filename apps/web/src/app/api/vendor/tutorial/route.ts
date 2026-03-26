import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/vendor/tutorial
 *
 * Mark vendor tutorial as completed or skipped
 *
 * Body:
 * - action: 'complete' | 'skip'
 * - phase: 1 | 2 (default 1)
 *   Phase 1: "Getting Approved" (pre-onboarding) — stored in vendor_tutorial_completed/skipped_at
 *   Phase 2: "Your Dashboard" (post-onboarding) — stored in notification_preferences JSONB
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/tutorial', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-tutorial:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, phase = 1 } = body

    if (!action || !['complete', 'skip'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "complete" or "skip"' }, { status: 400 })
    }

    try {
      if (phase === 2) {
        // Phase 2: store in notification_preferences JSONB (no migration needed)
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('notification_preferences')
          .eq('user_id', user.id)
          .single()

        const prefs = (profile?.notification_preferences || {}) as Record<string, unknown>
        const key = action === 'complete' ? 'dashboard_tutorial_completed_at' : 'dashboard_tutorial_skipped_at'
        prefs[key] = new Date().toISOString()

        const { error } = await supabase
          .from('user_profiles')
          .update({ notification_preferences: prefs })
          .eq('user_id', user.id)

        if (error) {
          console.error('[VENDOR-TUTORIAL] Error updating phase 2 status:', error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      } else {
        // Phase 1: store in dedicated columns (existing behavior)
        const updateData = action === 'complete'
          ? { vendor_tutorial_completed_at: new Date().toISOString() }
          : { vendor_tutorial_skipped_at: new Date().toISOString() }

        const { error } = await supabase
          .from('user_profiles')
          .update(updateData)
          .eq('user_id', user.id)

        if (error) {
          console.error('[VENDOR-TUTORIAL] Error updating phase 1 status:', error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      }

      return NextResponse.json({
        success: true,
        action,
        phase,
        message: action === 'complete'
          ? `Vendor tutorial phase ${phase} completed!`
          : `Vendor tutorial phase ${phase} skipped`
      })

    } catch (error) {
      console.error('[VENDOR-TUTORIAL] Error:', error)
      return NextResponse.json({
        error: 'Failed to update vendor tutorial status',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  })
}
