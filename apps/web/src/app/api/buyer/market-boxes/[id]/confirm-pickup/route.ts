import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/buyer/market-boxes/[id]/confirm-pickup
 * Buyer confirms they picked up their market box
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: subscriptionId } = await context.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify subscription belongs to user
  const { data: subscription } = await supabase
    .from('market_box_subscriptions')
    .select('id, status')
    .eq('id', subscriptionId)
    .eq('buyer_user_id', user.id)
    .single()

  if (!subscription) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  }

  if (subscription.status !== 'active') {
    return NextResponse.json({ error: 'Subscription is not active' }, { status: 400 })
  }

  const body = await request.json()
  const { pickup_id } = body

  if (!pickup_id) {
    return NextResponse.json({ error: 'pickup_id is required' }, { status: 400 })
  }

  // Get the pickup
  const { data: pickup } = await supabase
    .from('market_box_pickups')
    .select('id, status, subscription_id')
    .eq('id', pickup_id)
    .eq('subscription_id', subscriptionId)
    .single()

  if (!pickup) {
    return NextResponse.json({ error: 'Pickup not found' }, { status: 404 })
  }

  // Can only confirm 'ready' pickups
  if (pickup.status !== 'ready') {
    if (pickup.status === 'picked_up') {
      return NextResponse.json({ error: 'This pickup has already been confirmed' }, { status: 400 })
    }
    if (pickup.status === 'scheduled') {
      return NextResponse.json({ error: 'Vendor has not marked this pickup as ready yet' }, { status: 400 })
    }
    return NextResponse.json({ error: `Cannot confirm pickup with status: ${pickup.status}` }, { status: 400 })
  }

  // Mark as picked up
  const { data: updated, error } = await supabase
    .from('market_box_pickups')
    .update({
      status: 'picked_up',
      picked_up_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pickup_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The trigger will auto-update subscription.weeks_completed

  return NextResponse.json({
    pickup: updated,
    message: 'Pickup confirmed! Enjoy your market box.',
  })
}
