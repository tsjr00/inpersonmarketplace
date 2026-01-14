import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/markets/[id]/vendors/[vendorId] - Update vendor (approve, assign booth)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; vendorId: string }> }
) {
  const supabase = await createClient()
  const { id: marketId, vendorId } = await params

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is admin
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Parse request body
  const body = await request.json()
  const allowedFields = ['approved', 'booth_number', 'notes']

  // Filter to only allowed fields
  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  // Update market vendor
  const { data: marketVendor, error } = await supabase
    .from('market_vendors')
    .update(updateData)
    .eq('id', vendorId)
    .eq('market_id', marketId)
    .select(`
      *,
      vendor_profiles(
        id,
        profile_data,
        user_id
      )
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Market vendor not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If approving, try to send notification
  if (body.approved === true && marketVendor.vendor_profiles?.user_id) {
    try {
      const { data: market } = await supabase
        .from('markets')
        .select('name')
        .eq('id', marketId)
        .single()

      const businessName = (marketVendor.vendor_profiles.profile_data as Record<string, unknown>)?.business_name ||
                          (marketVendor.vendor_profiles.profile_data as Record<string, unknown>)?.farm_name ||
                          'Your business'

      await supabase
        .from('notifications')
        .insert({
          user_id: marketVendor.vendor_profiles.user_id,
          type: 'market_approved',
          title: 'Market Application Approved!',
          message: `${businessName} has been approved to sell at ${market?.name || 'the market'}${marketVendor.booth_number ? ` (Booth ${marketVendor.booth_number})` : ''}.`,
          data: {
            market_id: marketId,
            market_vendor_id: vendorId,
            booth_number: marketVendor.booth_number,
          }
        })
    } catch (notifError) {
      console.log('[NOTIFICATION] Could not create market approval notification:', notifError)
    }
  }

  return NextResponse.json({ market_vendor: marketVendor })
}

// DELETE /api/markets/[id]/vendors/[vendorId] - Remove vendor from market
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; vendorId: string }> }
) {
  const supabase = await createClient()
  const { id: marketId, vendorId } = await params

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user profile
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('id, role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')

  // Check if it's the vendor's own application
  const { data: marketVendor } = await supabase
    .from('market_vendors')
    .select(`
      id,
      vendor_profiles(user_id)
    `)
    .eq('id', vendorId)
    .eq('market_id', marketId)
    .single()

  if (!marketVendor) {
    return NextResponse.json({ error: 'Market vendor not found' }, { status: 404 })
  }

  const isOwnApplication = (marketVendor.vendor_profiles as { user_id: string } | null)?.user_id === userProfile?.id

  // Only allow if admin or own application
  if (!isAdmin && !isOwnApplication) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Delete market vendor
  const { error } = await supabase
    .from('market_vendors')
    .delete()
    .eq('id', vendorId)
    .eq('market_id', marketId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Vendor removed from market' })
}
