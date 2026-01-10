import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get order items for this vendor with related data
  const { data: orderItems, error } = await supabase
    .from('order_items')
    .select(`
      *,
      order:orders(
        id,
        order_number,
        status,
        created_at,
        buyer_user_id
      ),
      listing:listings(title, description)
    `)
    .eq('vendor_profile_id', vendorProfile.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ orderItems })
}
