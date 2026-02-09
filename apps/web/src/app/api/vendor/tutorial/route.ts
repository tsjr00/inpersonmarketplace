import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

/**
 * POST /api/vendor/tutorial
 *
 * Mark vendor tutorial as completed or skipped
 *
 * Body:
 * - action: 'complete' | 'skip'
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/tutorial', 'POST', async () => {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (!action || !['complete', 'skip'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "complete" or "skip"' }, { status: 400 })
    }

    try {
      const updateData = action === 'complete'
        ? { vendor_tutorial_completed_at: new Date().toISOString() }
        : { vendor_tutorial_skipped_at: new Date().toISOString() }

      const { error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('user_id', user.id)

      if (error) {
        console.error('[VENDOR-TUTORIAL] Error updating tutorial status:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action,
        message: action === 'complete' ? 'Vendor tutorial completed!' : 'Vendor tutorial skipped'
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
