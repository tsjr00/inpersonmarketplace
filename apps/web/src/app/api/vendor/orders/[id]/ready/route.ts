import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: orderItemId } = await params

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

  // Verify vendor owns this order item
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('*')
    .eq('id', orderItemId)
    .eq('vendor_profile_id', vendorProfile.id)
    .single()

  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  // Update status
  const { error } = await supabase
    .from('order_items')
    .update({ status: 'ready' })
    .eq('id', orderItemId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
