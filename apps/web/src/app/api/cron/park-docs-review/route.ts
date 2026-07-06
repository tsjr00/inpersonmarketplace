import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { runParkDocsReviewSweep } from '@/lib/markets/park-docs-review'

/**
 * FT park-manager B3 — docs-to-review notification sweep (option B).
 *
 * Schedule (vercel.json): hourly across a ~7am–8pm Central window
 * (`0 12-23,0-2 * * *` UTC — the DST-safe mapping; skips the overnight hours).
 * The sweep itself is timezone-agnostic (absolute-instant comparisons); the
 * schedule only decides WHEN we bother running it.
 *
 * Auth: CRON_SECRET Bearer header — same pattern as the other crons.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/park-docs-review', 'GET', async () => {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('[CRON-PARK-DOCS] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const expected = `Bearer ${cronSecret}`
    if (!authHeader || authHeader.length !== expected.length) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const summary = await runParkDocsReviewSweep(createServiceClient())
    return NextResponse.json(summary)
  })
}
