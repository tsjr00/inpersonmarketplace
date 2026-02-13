import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

// DELETE - Delete listing (soft delete with deleted_at)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/listings/[id]', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`listing-delete:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: listingId } = await params

    // Get vendor profile to verify ownership
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Verify the listing belongs to this vendor
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, vendor_profile_id')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.vendor_profile_id !== vendorProfile.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check if listing has any orders (don't allow delete if orders exist)
    const { data: orderItems, error: orderError } = await supabase
      .from('order_items')
      .select('id')
      .eq('listing_id', listingId)
      .limit(1)

    if (orderError) {
      console.error('Error checking orders:', orderError)
      return NextResponse.json({ error: 'Failed to check orders' }, { status: 500 })
    }

    if (orderItems && orderItems.length > 0) {
      return NextResponse.json({
        error: 'Cannot delete listing with existing orders. Set to draft instead.'
      }, { status: 400 })
    }

    // Soft delete - set deleted_at timestamp
    const { error: deleteError } = await supabase
      .from('listings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', listingId)
      .eq('vendor_profile_id', vendorProfile.id)

    if (deleteError) {
      console.error('Error deleting listing:', deleteError)
      return NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
