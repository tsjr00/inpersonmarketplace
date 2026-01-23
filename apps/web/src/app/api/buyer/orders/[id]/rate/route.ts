import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/buyer/orders/[id]/rate - Submit a rating for an order
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body
  let rating: number
  let comment: string | undefined
  let vendorProfileId: string

  try {
    const body = await request.json()
    rating = body.rating
    comment = body.comment
    vendorProfileId = body.vendor_profile_id

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }

    if (!vendorProfileId) {
      return NextResponse.json({ error: 'Vendor profile ID required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Verify the order belongs to this user and is completed
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, buyer_user_id')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.buyer_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!['completed', 'fulfilled'].includes(order.status)) {
    return NextResponse.json({ error: 'Can only rate completed orders' }, { status: 400 })
  }

  // Check if rating already exists
  const { data: existingRating } = await supabase
    .from('order_ratings')
    .select('id')
    .eq('order_id', orderId)
    .eq('vendor_profile_id', vendorProfileId)
    .single()

  if (existingRating) {
    // Update existing rating
    const { data: updatedRating, error: updateError } = await supabase
      .from('order_ratings')
      .update({
        rating,
        comment: comment || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingRating.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating rating:', updateError)
      return NextResponse.json({ error: 'Failed to update rating' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Rating updated',
      rating: updatedRating
    })
  }

  // Create new rating
  const { data: newRating, error: insertError } = await supabase
    .from('order_ratings')
    .insert({
      order_id: orderId,
      buyer_user_id: user.id,
      vendor_profile_id: vendorProfileId,
      rating,
      comment: comment || null
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating rating:', insertError)
    return NextResponse.json({ error: 'Failed to submit rating' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Rating submitted',
    rating: newRating
  }, { status: 201 })
}

// GET /api/buyer/orders/[id]/rate - Get existing rating for an order
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get ratings for this order
  const { data: ratings, error } = await supabase
    .from('order_ratings')
    .select(`
      id,
      rating,
      comment,
      created_at,
      vendor_profile_id,
      vendor:vendor_profiles (
        id,
        profile_data
      )
    `)
    .eq('order_id', orderId)
    .eq('buyer_user_id', user.id)

  if (error) {
    console.error('Error fetching ratings:', error)
    return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 })
  }

  return NextResponse.json({ ratings: ratings || [] })
}
