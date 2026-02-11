import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * POST /api/vendor/onboarding/acknowledge-prohibited-items
 *
 * Record that the vendor has acknowledged the prohibited items policy.
 */
export async function POST() {
  return withErrorTracing('/api/vendor/onboarding/acknowledge-prohibited-items', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    crumb.supabase('select', 'vendor_profiles')
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    crumb.supabase('update', 'vendor_verifications')
    const { error: updateError } = await supabase
      .from('vendor_verifications')
      .update({
        prohibited_items_acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('vendor_profile_id', vendor.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'vendor_verifications', operation: 'update' })
    }

    return NextResponse.json({ success: true })
  })
}
