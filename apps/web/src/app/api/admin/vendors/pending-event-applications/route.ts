import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getEventApplicationState } from '@/lib/vendor-event-application'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/vendors/pending-event-applications', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await observed(supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single(), { table: 'user_profiles' })

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const vertical = request.nextUrl.searchParams.get('vertical')
    const serviceClient = createServiceClient()

    // Owner decision 2026-08-15: no vendor-status filter — applications from
    // not-yet-approved vendors APPEAR in the queue, flagged not-eligible,
    // instead of badging on the detail page while never surfacing here.
    let query = serviceClient
      .from('vendor_profiles')
      .select('id, profile_data, created_at, status')
      .eq('event_approved', false)

    if (vertical) {
      query = query.eq('vertical_id', vertical)
    }

    const { data: vendors } = await query

    const applications = (vendors || [])
      .filter(v => getEventApplicationState(v.profile_data as Record<string, unknown>).isPendingReview)
      .map(v => {
        const pd = v.profile_data as Record<string, unknown>
        const er = pd.event_readiness as Record<string, unknown>
        return {
          id: v.id,
          business_name: (pd.business_name as string) || (pd.farm_name as string) || 'Unknown',
          submitted_at: (er.submitted_at as string) || v.created_at,
          // Not eligible for event approval until the vendor itself is approved.
          vendor_status: v.status as string,
          eligible: v.status === 'approved',
        }
      })
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())

    return NextResponse.json({ applications })
  })
}
