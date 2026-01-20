import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const LOCATION_COOKIE_NAME = 'user_location'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
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

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()

    // Generate location text for display
    let locationText = 'your location'
    if (source === 'gps') {
      locationText = 'your current location'
    }

    // If authenticated, save to user profile
    if (user) {
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
        // Fall through to cookie storage
      } else {
        return NextResponse.json({
          success: true,
          locationText,
          latitude,
          longitude
        })
      }
    }

    // For anonymous users (or if profile update failed), store in cookie
    const locationData = JSON.stringify({ latitude, longitude, source })
    const response = NextResponse.json({
      success: true,
      locationText,
      latitude,
      longitude
    })

    response.cookies.set(LOCATION_COOKIE_NAME, locationData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Location API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()

    // If authenticated, try to get location from user profile
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('preferred_latitude, preferred_longitude, location_source, location_updated_at')
        .eq('user_id', user.id)
        .single()

      if (!profileError && profile?.preferred_latitude && profile?.preferred_longitude) {
        return NextResponse.json({
          hasLocation: true,
          latitude: profile.preferred_latitude,
          longitude: profile.preferred_longitude,
          source: profile.location_source,
          updatedAt: profile.location_updated_at
        })
      }
    }

    // Check for location in cookie (works for both anonymous and authenticated users)
    const locationCookie = request.cookies.get(LOCATION_COOKIE_NAME)
    if (locationCookie) {
      try {
        const { latitude, longitude, source } = JSON.parse(locationCookie.value)
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          return NextResponse.json({
            hasLocation: true,
            latitude,
            longitude,
            source
          })
        }
      } catch {
        // Invalid cookie data, ignore
      }
    }

    // No location found
    return NextResponse.json({ hasLocation: false })
  } catch (error) {
    console.error('Location API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
