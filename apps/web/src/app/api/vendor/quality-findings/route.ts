import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/vendor/quality-findings?vertical=food_trucks
 * Returns active quality findings for the authenticated vendor.
 *
 * PATCH /api/vendor/quality-findings
 * Body: { findingId: string }
 * Dismisses a finding.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/quality-findings', 'GET', async () => {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')

    // Get vendor profile
    let profileQuery = supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)

    if (vertical) {
      profileQuery = profileQuery.eq('vertical_id', vertical)
    }

    const { data: vendorProfile } = await profileQuery.maybeSingle()
    if (!vendorProfile) {
      return NextResponse.json({ findings: [] })
    }

    // Fetch active findings
    const { data: findings, error } = await supabase
      .from('vendor_quality_findings')
      .select('id, check_type, severity, title, message, details, reference_key, created_at')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'active')
      .order('severity', { ascending: true }) // action_required first
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 })
    }

    return NextResponse.json({ findings: findings || [] })
  })
}

export async function PATCH(request: NextRequest) {
  return withErrorTracing('/api/vendor/quality-findings', 'PATCH', async () => {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { findingId } = body

    if (!findingId || typeof findingId !== 'string') {
      return NextResponse.json({ error: 'findingId is required' }, { status: 400 })
    }

    // Verify ownership via RLS (vendor can only update own findings)
    const { error: updateError } = await supabase
      .from('vendor_quality_findings')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', findingId)
      .eq('status', 'active')

    if (updateError) {
      return NextResponse.json({ error: 'Failed to dismiss finding' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
