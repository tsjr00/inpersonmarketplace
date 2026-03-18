import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

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

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const vertical = request.nextUrl.searchParams.get('vertical')
    const serviceClient = createServiceClient()

    let query = serviceClient
      .from('vendor_profiles')
      .select('id, profile_data, created_at')
      .eq('event_approved', false)
      .eq('status', 'approved')

    if (vertical) {
      query = query.eq('vertical_id', vertical)
    }

    const { data: vendors } = await query

    // Filter to those with pending_review application status
    const applications = (vendors || [])
      .filter(v => {
        const pd = v.profile_data as Record<string, unknown> | null
        const er = pd?.event_readiness as Record<string, unknown> | null
        return er?.application_status === 'pending_review'
      })
      .map(v => {
        const pd = v.profile_data as Record<string, unknown>
        const er = pd.event_readiness as Record<string, unknown>
        return {
          id: v.id,
          business_name: (pd.business_name as string) || (pd.farm_name as string) || 'Unknown',
          submitted_at: (er.submitted_at as string) || v.created_at,
        }
      })
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())

    return NextResponse.json({ applications })
  })
}
