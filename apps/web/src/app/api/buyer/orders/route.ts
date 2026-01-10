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

  // Get buyer's orders with items
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(
        *,
        listing:listings(title, description),
        vendor:vendor_profiles(business_name)
      )
    `)
    .eq('buyer_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ orders })
}
