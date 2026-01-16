import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { vendorId, description, social_links } = await request.json()

    // Verify vendor ownership
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, tier')
      .eq('id', vendorId)
      .single()

    if (!vendor || vendor.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    if (description !== undefined) {
      updates.description = description
    }

    // Only premium can save social links
    if (social_links !== undefined && (vendor.tier === 'premium' || vendor.tier === 'featured')) {
      updates.social_links = social_links
    }

    // Update
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update(updates)
      .eq('id', vendorId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
