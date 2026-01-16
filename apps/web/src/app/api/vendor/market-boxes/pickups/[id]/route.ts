import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/vendor/market-boxes/pickups/[id]
 * Get a single pickup with subscription details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: pickupId } = await context.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get pickup with full details
  const { data: pickup, error } = await supabase
    .from('market_box_pickups')
    .select(`
      id,
      week_number,
      scheduled_date,
      status,
      ready_at,
      picked_up_at,
      missed_at,
      rescheduled_to,
      vendor_notes,
      subscription:market_box_subscriptions (
        id,
        start_date,
        status,
        weeks_completed,
        buyer:user_profiles!market_box_subscriptions_buyer_user_id_fkey (
          display_name,
          email
        ),
        offering:market_box_offerings (
          id,
          name,
          vendor_profile_id
        )
      )
    `)
    .eq('id', pickupId)
    .single()

  if (error || !pickup) {
    return NextResponse.json({ error: 'Pickup not found' }, { status: 404 })
  }

  // Verify vendor owns this offering
  const offering = (pickup.subscription as any)?.offering
  if (!offering || offering.vendor_profile_id !== vendor.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  return NextResponse.json({ pickup })
}

/**
 * PATCH /api/vendor/market-boxes/pickups/[id]
 * Update pickup status (ready, picked_up, missed, reschedule)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: pickupId } = await context.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get pickup with offering info to verify ownership
  const { data: pickup } = await supabase
    .from('market_box_pickups')
    .select(`
      id,
      status,
      ready_at,
      subscription:market_box_subscriptions (
        id,
        offering:market_box_offerings (
          id,
          vendor_profile_id
        )
      )
    `)
    .eq('id', pickupId)
    .single()

  if (!pickup) {
    return NextResponse.json({ error: 'Pickup not found' }, { status: 404 })
  }

  // Verify vendor owns this offering
  const offering = (pickup.subscription as any)?.offering
  if (!offering || offering.vendor_profile_id !== vendor.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const { action, vendor_notes, rescheduled_to } = body

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (vendor_notes !== undefined) {
    updates.vendor_notes = vendor_notes
  }

  switch (action) {
    case 'ready':
      // Mark as ready for pickup
      if (pickup.status !== 'scheduled') {
        return NextResponse.json({ error: 'Can only mark scheduled pickups as ready' }, { status: 400 })
      }
      updates.status = 'ready'
      updates.ready_at = new Date().toISOString()
      break

    case 'picked_up':
      // Mark as picked up (vendor confirms buyer got it)
      if (!['scheduled', 'ready'].includes(pickup.status)) {
        return NextResponse.json({ error: 'Can only mark scheduled or ready pickups as picked up' }, { status: 400 })
      }
      updates.status = 'picked_up'
      updates.picked_up_at = new Date().toISOString()
      if (!pickup.ready_at) {
        updates.ready_at = new Date().toISOString()
      }
      break

    case 'missed':
      // Mark as missed (buyer didn't show)
      if (!['scheduled', 'ready'].includes(pickup.status)) {
        return NextResponse.json({ error: 'Can only mark scheduled or ready pickups as missed' }, { status: 400 })
      }
      updates.status = 'missed'
      updates.missed_at = new Date().toISOString()
      break

    case 'reschedule':
      // Vendor allows reschedule after miss
      if (pickup.status !== 'missed') {
        return NextResponse.json({ error: 'Can only reschedule missed pickups' }, { status: 400 })
      }
      if (!rescheduled_to) {
        return NextResponse.json({ error: 'rescheduled_to date is required' }, { status: 400 })
      }
      updates.status = 'rescheduled'
      updates.rescheduled_to = rescheduled_to
      break

    default:
      if (!action) {
        // Just updating notes, no status change
        break
      }
      return NextResponse.json({ error: 'Invalid action. Use: ready, picked_up, missed, or reschedule' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('market_box_pickups')
    .update(updates)
    .eq('id', pickupId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ pickup: updated })
}
