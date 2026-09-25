import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { timingSafeEqual } from 'crypto'
import { withErrorTracing } from '@/lib/errors'
import { runTaxRateRefresh } from '@/lib/tax/rate-refresh'

/**
 * Sales-tax quarterly rate refresh (tax build step 12; owner Q4 2026-09-24).
 *
 * Keeps `markets.tax_rate_version` on the current quarter so the checkout tax
 * engine keeps taxing at admin-verified markets, applies Comptroller rate
 * changes forward, carries last quarter's rates forward when the new file is
 * late (it has landed 22 days after a quarter began), and reminds the admins
 * daily while that lasts. Logic + I/O: `lib/tax/rate-refresh.ts`.
 *
 * Schedule (vercel.json — two entries, same path; Vercel sends
 * `x-vercel-cron-schedule` to tell them apart):
 *   `0 9 1 * *`             the 1st of EVERY month — a health check (rates only
 *                           change at quarter starts, so most months are no-ops)
 *   `0 9 2-31 1,4,7,10 *`   DAILY for the rest of Jan/Apr/Jul/Oct — the window
 *                           in which the new quarter's file is expected; the
 *                           job exits in milliseconds once it has been applied.
 * Owner 2026-09-25: "monthly with a contingency to run again if the monthly
 * comes up empty" — a cron cannot retry itself, so the schedule encodes the
 * contingency. ⚠ Staging previews never run Vercel crons — curl this route
 * with the CRON_SECRET to exercise it there. Auth: CRON_SECRET Bearer, same
 * as the other crons. No money moves here.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/tax-rate-refresh', 'GET', async () => {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('[CRON-TAX-RATES] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const expected = `Bearer ${cronSecret}`
    if (!authHeader || authHeader.length !== expected.length) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const summary = await runTaxRateRefresh(createServiceClient())
    return NextResponse.json({ ...summary, schedule: request.headers.get('x-vercel-cron-schedule') })
  })
}
