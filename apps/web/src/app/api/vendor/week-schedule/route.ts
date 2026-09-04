import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { loadVendorWeekStrip } from '@/lib/vendor/week-strip'

/**
 * GET /api/vendor/week-schedule?vertical=X&start=YYYY-MM-DD
 *
 * The vendor's own next-14-days strip (lib/vendor/week-strip.ts) — where they
 * are committed, per DATE, with blackout/cancelled days struck and explained.
 *
 * `start` is the CLIENT's local date: the server runs in UTC (Vercel) and the
 * vendor's "today" is a browser fact — taking it as a param avoids hardcoding
 * any timezone. Missing/invalid start falls back to UTC today (worst case the
 * strip starts a day off near midnight).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')
    if (!vertical) {
      return NextResponse.json({ error: 'Vertical required' }, { status: 400 })
    }

    const startParam = searchParams.get('start')
    const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam)
      ? startParam
      : new Date().toISOString().split('T')[0]!

    const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical<{
      id: string
      deleted_at: string | null
    }>(supabase, user.id, vertical, 'id, deleted_at')
    if (vpError || !vendorProfile || vendorProfile.deleted_at !== null) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Service client: park/booth/blackout tables are RLS-deny for this read
    // path (same pattern as lib/events/availability.ts's loader). Auth was
    // enforced above; every query is scoped to this vendor's profile id.
    const serviceClient = createServiceClient()
    const days = await loadVendorWeekStrip(serviceClient, vendorProfile.id, vertical, start)

    return NextResponse.json({ days })
  } catch (error) {
    console.error('[/api/vendor/week-schedule] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to load schedule' }, { status: 500 })
  }
}
