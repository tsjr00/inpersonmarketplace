import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced } from '@/lib/errors'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { findAllDeclaredOverlaps } from '@/lib/markets/booking-gates'
import { dayOfWeekName, formatTimeDisplay } from '@/lib/utils/schedule-overlap'

/**
 * GET /api/vendor/schedule-overlaps?vertical=<v> — READ-ONLY.
 *
 * The caller's picked market days that overlap at two different markets
 * (owner 2026-09-25, OB-031 option b). The profile page shows them while the
 * "I can staff more than one location at the same time" box is off: with the
 * box off, booking a week at either market is refused (booking-gates step 4),
 * so the vendor sees which days to remove BEFORE they hit that refusal.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/schedule-overlaps', 'GET', async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const vertical = request.nextUrl.searchParams.get('vertical') || 'farmers_market'
    const { profile } = await getVendorProfileForVertical<{ id: string }>(supabase, user.id, vertical, 'id')
    if (!profile) return NextResponse.json({ overlaps: [] })

    const pairs = await findAllDeclaredOverlaps(createServiceClient(), profile.id)
    return NextResponse.json({
      overlaps: pairs.map((p) => ({
        marketA: p.a.marketName,
        marketB: p.b.marketName,
        day: `${dayOfWeekName(p.a.dayOfWeek)}s`,
        timeA: `${formatTimeDisplay(p.a.startTime)} - ${formatTimeDisplay(p.a.endTime)}`,
        timeB: `${formatTimeDisplay(p.b.startTime)} - ${formatTimeDisplay(p.b.endTime)}`,
      })),
    })
  })
}
