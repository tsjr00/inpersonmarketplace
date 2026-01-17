import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { latitude, longitude, source } = body

    // Validate inputs
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
    }

    if (!['gps', 'manual', 'ip'].includes(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 })
    }

    // Update user profile with location
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        preferred_latitude: latitude,
        preferred_longitude: longitude,
        location_source: source,
        location_updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating location:', updateError)
      return NextResponse.json({ error: 'Failed to save location' }, { status: 500 })
    }

    // Generate location text for display
    let locationText = 'your location'
    if (source === 'gps') {
      locationText = 'your current location'
    }

    return NextResponse.json({
      success: true,
      locationText,
      latitude,
      longitude
    })
  } catch (error) {
    console.error('Location API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's saved location
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('preferred_latitude, preferred_longitude, location_source, location_updated_at')
      .eq('user_id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Failed to get location' }, { status: 500 })
    }

    if (!profile?.preferred_latitude || !profile?.preferred_longitude) {
      return NextResponse.json({ hasLocation: false })
    }

    return NextResponse.json({
      hasLocation: true,
      latitude: profile.preferred_latitude,
      longitude: profile.preferred_longitude,
      source: profile.location_source,
      updatedAt: profile.location_updated_at
    })
  } catch (error) {
    console.error('Location API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
