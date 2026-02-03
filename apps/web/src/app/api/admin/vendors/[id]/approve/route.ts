import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'

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

  // Verify user is admin - check platform admin role or vertical admin
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  let isAdmin = hasAdminRole(userProfile || {})

  // If not platform admin, check if they're a vertical admin for this vendor's vertical
  if (!isAdmin) {
    // First get the vendor's vertical
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('vertical_id')
      .eq('id', vendorId)
      .single()

    if (vendor) {
      const { data: verticalAdmin } = await supabase
        .from('vertical_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', vendor.vertical_id)
        .single()
      isAdmin = !!verticalAdmin
    }
  }

  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Use service client for the update to bypass RLS
  const serviceClient = createServiceClient()

  // Update vendor status to approved
  const { data, error } = await serviceClient
    .from('vendor_profiles')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', vendorId)
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
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
        type: 'vendor_approved',
        title: 'Your Vendor Account is Approved!',
        message: `Congratulations! ${businessName} has been approved. You can now publish your listings.`,
        data: {
          vendor_profile_id: vendorId,
          approved_at: new Date().toISOString()
        }
      })
  } catch (notifError) {
    // Notifications table may not exist - log but don't fail
    console.log('[NOTIFICATION] Could not create notification:', notifError)
  }

  // Log for email integration (future)
  console.log(`[VENDOR APPROVED] ${vendorEmail || data.user_id} - ${businessName}`)

  return NextResponse.json({
    success: true,
    vendor: data,
    message: 'Vendor approved successfully'
  })
}
