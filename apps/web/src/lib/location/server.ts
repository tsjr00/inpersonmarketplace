import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export const LOCATION_COOKIE_NAME = 'user_location'
export const DEFAULT_RADIUS = 25
export const VALID_RADIUS_OPTIONS = [2, 5, 10, 25, 50, 100]

export interface ServerLocation {
  latitude: number
  longitude: number
  locationText: string
  radius: number
}

/**
 * Get user location from cookie or user profile (server-side).
 * Priority: authenticated user profile → cookie fallback.
 */
export async function getServerLocation(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ServerLocation | null> {
  // Get cookie data first (needed for radius even if user is authenticated)
  const cookieStore = await cookies()
  const locationCookie = cookieStore.get(LOCATION_COOKIE_NAME)
  let cookieRadius = DEFAULT_RADIUS

  if (locationCookie) {
    try {
      const cookieData = JSON.parse(locationCookie.value)
      if (typeof cookieData.radius === 'number' && VALID_RADIUS_OPTIONS.includes(cookieData.radius)) {
        cookieRadius = cookieData.radius
      }
    } catch {
      // Invalid cookie, use default radius
    }
  }

  // First try to get from user profile if authenticated
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('preferred_latitude, preferred_longitude, location_source, location_text')
      .eq('user_id', user.id)
      .single()

    if (profile?.preferred_latitude && profile?.preferred_longitude) {
      return {
        latitude: profile.preferred_latitude,
        longitude: profile.preferred_longitude,
        locationText: profile.location_text || (profile.location_source === 'gps' ? 'Current location' : 'Your location'),
        radius: cookieRadius
      }
    }
  }

  // Fall back to cookie for location
  if (locationCookie) {
    try {
      const { latitude, longitude, locationText, source, radius } = JSON.parse(locationCookie.value)
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        const validRadius = typeof radius === 'number' && VALID_RADIUS_OPTIONS.includes(radius)
          ? radius
          : DEFAULT_RADIUS
        return {
          latitude,
          longitude,
          locationText: locationText || (source === 'gps' ? 'Current location' : 'Your location'),
          radius: validRadius
        }
      }
    } catch {
      // Invalid cookie, ignore
    }
  }

  return null
}
