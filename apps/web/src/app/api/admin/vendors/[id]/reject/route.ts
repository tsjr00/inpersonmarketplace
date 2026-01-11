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

  // Get vendor details for notification
  const profileData = data.profile_data as Record<string, unknown> | null
  const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Your business'
  const vendorEmail = profileData?.email as string

  // Try to create in-app notification (table may not exist yet)
  try {
    await supabase
      .from('notifications')
      .insert({
        user_id: data.user_id,
        type: 'vendor_rejected',
        title: 'Vendor Application Update',
        message: `We were unable to approve ${businessName} at this time. Please contact support for more information.`,
        data: {
          vendor_profile_id: vendorId,
          rejected_at: new Date().toISOString(),
          reason: reason || null
        }
      })
  } catch (notifError) {
    // Notifications table may not exist - log but don't fail
    console.log('[NOTIFICATION] Could not create notification:', notifError)
  }

  // Log for email integration (future)
  console.log(`[VENDOR REJECTED] ${vendorEmail || data.user_id} - ${businessName}${reason ? ` - Reason: ${reason}` : ''}`)

  return NextResponse.json({
    success: true,
    vendor: data,
    message: 'Vendor rejected'
  })
}
