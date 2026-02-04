import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const LOCATION_COOKIE_NAME = 'user_location'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const DEFAULT_RADIUS = 25
const VALID_RADIUS_OPTIONS = [10, 25, 50, 100]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { latitude, longitude, source, zipCode, locationText: providedLocationText, radius: providedRadius } = body

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

    // Determine location text for display
    // Priority: provided locationText > zipCode > default based on source
    let locationText = providedLocationText || ''
    if (!locationText && zipCode) {
      locationText = zipCode // Show just the ZIP code
    }
    if (!locationText) {
      locationText = source === 'gps' ? 'Current location' : 'Your location'
    }

    // Validate radius if provided
    const radius = typeof providedRadius === 'number' && VALID_RADIUS_OPTIONS.includes(providedRadius)
      ? providedRadius
      : DEFAULT_RADIUS

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()

    // If authenticated, save to user profile
    if (user) {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          preferred_latitude: latitude,
          preferred_longitude: longitude,
          location_source: source,
          location_text: locationText,
          location_updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Error updating location:', updateError)
        // Fall through to cookie storage
      } else {
        // Also save radius to cookie for consistency
        const locationData = JSON.stringify({ latitude, longitude, source, locationText, radius })
        const response = NextResponse.json({
          success: true,
          locationText,
          latitude,
          longitude,
          radius
        })
        response.cookies.set(LOCATION_COOKIE_NAME, locationData, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE,
          path: '/'
        })
        return response
      }
    }

    // For anonymous users (or if profile update failed), store in cookie
    const locationData = JSON.stringify({ latitude, longitude, source, locationText, radius })
    const response = NextResponse.json({
      success: true,
      locationText,
      latitude,
      longitude,
      radius
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
        .select('preferred_latitude, preferred_longitude, location_source, location_text, location_updated_at')
        .eq('user_id', user.id)
        .single()

      if (!profileError && profile?.preferred_latitude && profile?.preferred_longitude) {
        // Get radius from cookie if available
        const locationCookie = request.cookies.get(LOCATION_COOKIE_NAME)
        let radius = DEFAULT_RADIUS
        if (locationCookie) {
          try {
            const cookieData = JSON.parse(locationCookie.value)
            if (typeof cookieData.radius === 'number' && VALID_RADIUS_OPTIONS.includes(cookieData.radius)) {
              radius = cookieData.radius
            }
          } catch {
            // Invalid cookie data, use default
          }
        }

        return NextResponse.json({
          hasLocation: true,
          latitude: profile.preferred_latitude,
          longitude: profile.preferred_longitude,
          source: profile.location_source,
          locationText: profile.location_text || (profile.location_source === 'gps' ? 'Current location' : 'Your location'),
          updatedAt: profile.location_updated_at,
          radius
        })
      }
    }

    // Check for location in cookie (works for both anonymous and authenticated users)
    const locationCookie = request.cookies.get(LOCATION_COOKIE_NAME)
    if (locationCookie) {
      try {
        const { latitude, longitude, source, locationText, radius: cookieRadius } = JSON.parse(locationCookie.value)
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          const radius = typeof cookieRadius === 'number' && VALID_RADIUS_OPTIONS.includes(cookieRadius)
            ? cookieRadius
            : DEFAULT_RADIUS
          return NextResponse.json({
            hasLocation: true,
            latitude,
            longitude,
            source,
            locationText: locationText || (source === 'gps' ? 'Current location' : 'Your location'),
            radius
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

// PATCH - Update partial location data (e.g., radius only)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { radius: newRadius } = body

    // Validate radius
    if (typeof newRadius !== 'number' || !VALID_RADIUS_OPTIONS.includes(newRadius)) {
      return NextResponse.json({ error: 'Invalid radius. Must be one of: 10, 25, 50, 100' }, { status: 400 })
    }

    // Get existing location data from cookie
    const locationCookie = request.cookies.get(LOCATION_COOKIE_NAME)
    let existingData: {
      latitude?: number
      longitude?: number
      source?: string
      locationText?: string
      radius?: number
    } = {}

    if (locationCookie) {
      try {
        existingData = JSON.parse(locationCookie.value)
      } catch {
        // Invalid cookie, start fresh
      }
    }

    // Update with new radius
    const updatedData = {
      ...existingData,
      radius: newRadius
    }

    const response = NextResponse.json({
      success: true,
      radius: newRadius
    })

    response.cookies.set(LOCATION_COOKIE_NAME, JSON.stringify(updatedData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Location PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
