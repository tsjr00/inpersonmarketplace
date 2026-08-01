import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { runCauseRemitSweep } from '@/lib/cause/remit'

/**
 * Community Chip In — batched Connect remittance sweep (mig 213).
 *
 * Pays out accumulated chip-in balances to CONNECT beneficiaries (≥ $10) via
 * stripe.transfers.create. Check-method orgs are paid manually by an admin at
 * /admin/cause. Schedule (vercel.json): weekly is plenty — batching is the whole
 * point (no $0.55 transfers). Auth: CRON_SECRET Bearer, same as the other crons.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/remit-cause-funds', 'GET', async () => {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('[CRON-CAUSE-REMIT] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const expected = `Bearer ${cronSecret}`
    if (!authHeader || authHeader.length !== expected.length) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const summary = await runCauseRemitSweep(createServiceClient(), new Date().toISOString())
    return NextResponse.json(summary)
  })
}
