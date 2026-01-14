import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/markets/[id]/schedules - List schedules for market
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: marketId } = await params

  // Verify market exists
  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('id, type')
    .eq('id', marketId)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  // Get schedules
  const { data: schedules, error } = await supabase
    .from('market_schedules')
    .select('*')
    .eq('market_id', marketId)
    .order('day_of_week', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ schedules })
}

// POST /api/markets/[id]/schedules - Add schedule (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: marketId } = await params

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

  // Verify market exists and is traditional type
  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('id, type')
    .eq('id', marketId)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  if (market.type !== 'traditional') {
    return NextResponse.json(
      { error: 'Schedules can only be added to traditional markets' },
      { status: 400 }
    )
  }

  // Parse request body
  const body = await request.json()
  const { day_of_week, start_time, end_time, active = true } = body

  // Validate required fields
  if (day_of_week === undefined || !start_time || !end_time) {
    return NextResponse.json(
      { error: 'Missing required fields: day_of_week, start_time, end_time' },
      { status: 400 }
    )
  }

  // Validate day_of_week
  if (typeof day_of_week !== 'number' || day_of_week < 0 || day_of_week > 6) {
    return NextResponse.json(
      { error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' },
      { status: 400 }
    )
  }

  // Validate time format (HH:MM or HH:MM:SS)
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/
  if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
    return NextResponse.json(
      { error: 'Invalid time format. Use HH:MM or HH:MM:SS' },
      { status: 400 }
    )
  }

  // Create schedule
  const { data: schedule, error } = await supabase
    .from('market_schedules')
    .insert({
      market_id: marketId,
      day_of_week,
      start_time,
      end_time,
      active,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ schedule }, { status: 201 })
}
