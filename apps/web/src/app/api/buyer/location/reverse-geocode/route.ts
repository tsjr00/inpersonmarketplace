import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

// Cache results in memory to avoid repeated API calls
// Key: "lat,lng" rounded to 2 decimal places, Value: { areaName, timestamp }
const locationCache = new Map<string, { areaName: string; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

function getCacheKey(lat: number, lng: number): string {
  // Round to 2 decimal places (~1km precision) for cache efficiency
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/buyer/location/reverse-geocode', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-location-reverse-geocode:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const { searchParams } = new URL(request.url)
      const latStr = searchParams.get('lat')
      const lngStr = searchParams.get('lng')

      if (!latStr || !lngStr) {
        return NextResponse.json({ error: 'Missing lat or lng parameters' }, { status: 400 })
      }

      const lat = parseFloat(latStr)
      const lng = parseFloat(lngStr)

      if (isNaN(lat) || isNaN(lng)) {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
      }

      // Check cache first
      const cacheKey = getCacheKey(lat, lng)
      const cached = locationCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json({
          areaName: cached.areaName,
          cached: true
        })
      }

      // Use Nominatim for reverse geocoding (free, no API key)
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=10`

      const response = await fetch(nominatimUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FarmersMarketingApp/1.0 (contact@farmersmarketing.app)'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })

      if (!response.ok) {
        console.error('Nominatim API error:', response.status)
        return NextResponse.json({ error: 'Geocoding service unavailable' }, { status: 503 })
      }

      const data = await response.json()
      const address = data?.address

      if (!address) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }

      // Priority order for area name:
      // 1. City (city, town, village, municipality)
      // 2. Suburb/neighborhood if in a large city
      // 3. County
      let areaName = ''

      // Try city-level names first
      const cityName = address.city || address.town || address.village || address.municipality
      if (cityName) {
        areaName = cityName
      }
      // For very large cities, suburb might be more meaningful
      else if (address.suburb && (address.city || address.town)) {
        areaName = address.suburb
      }
      // Fall back to county
      else if (address.county) {
        // Remove "County" suffix if present to avoid "X County County area"
        areaName = address.county.replace(/ County$/i, '') + ' County'
      }
      // Last resort: state
      else if (address.state) {
        areaName = address.state
      }

      if (!areaName) {
        return NextResponse.json({ error: 'Could not determine area name' }, { status: 404 })
      }

      // Cache the result
      locationCache.set(cacheKey, { areaName, timestamp: Date.now() })

      // Clean old cache entries periodically (simple cleanup)
      if (locationCache.size > 1000) {
        const now = Date.now()
        for (const [key, value] of locationCache.entries()) {
          if (now - value.timestamp > CACHE_TTL) {
            locationCache.delete(key)
          }
        }
      }

      return NextResponse.json({
        areaName,
        cached: false,
        // Include raw data for debugging
        debug: process.env.NODE_ENV === 'development' ? {
          city: address.city,
          town: address.town,
          village: address.village,
          suburb: address.suburb,
          county: address.county,
          state: address.state
        } : undefined
      })
    } catch (error) {
      console.error('Reverse geocode error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
