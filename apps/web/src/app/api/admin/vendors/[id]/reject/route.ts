import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: vendorId } = await params

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is admin - check BOTH columns during transition
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Get rejection reason from request body (optional)
  let reason = null
  try {
    const body = await request.json()
    reason = body.reason
  } catch {
    // No body provided, that's ok
  }

  // Update vendor status to rejected
  const { data, error } = await supabase
    .from('vendor_profiles')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString()
    })
    .eq('id', vendorId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // TODO: Send rejection email to vendor with reason

  return NextResponse.json({
    success: true,
    vendor: data,
    message: 'Vendor rejected'
  })
}
