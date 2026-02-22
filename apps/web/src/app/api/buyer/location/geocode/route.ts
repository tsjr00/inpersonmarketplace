import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { ZIP_LOOKUP } from '@/lib/geocode'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/buyer/location/geocode', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-location-geocode:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const body = await request.json()
      const { zipCode } = body

      // Validate ZIP code format
      if (!zipCode || !/^\d{5}$/.test(zipCode)) {
        return NextResponse.json({ error: 'Invalid ZIP code format' }, { status: 400 })
      }

      // Check static lookup first
      const staticResult = ZIP_LOOKUP[zipCode]
      if (staticResult) {
        return NextResponse.json({
          latitude: staticResult.lat,
          longitude: staticResult.lng,
          locationText: `${staticResult.city}, ${staticResult.state}`,
          source: 'static'
        })
      }

      // Try Census Geocoding API (free, no API key)
      try {
        const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${zipCode}&benchmark=Public_AR_Current&format=json`

        const response = await fetch(censusUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        })

        if (response.ok) {
          const data = await response.json()
          const match = data?.result?.addressMatches?.[0]

          if (match?.coordinates) {
            return NextResponse.json({
              latitude: match.coordinates.y,
              longitude: match.coordinates.x,
              locationText: match.matchedAddress || `ZIP ${zipCode}`,
              source: 'census'
            })
          }
        }
      } catch (censusError) {
        console.warn('Census API failed, trying Nominatim:', censusError)
      }

      // Fallback to Nominatim (OpenStreetMap) - also free
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?postalcode=${zipCode}&country=USA&format=json&limit=1`

        const response = await fetch(nominatimUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'InPersonMarketplace/1.0' // Required by Nominatim
          },
          signal: AbortSignal.timeout(10000)
        })

        if (response.ok) {
          const data = await response.json()

          if (data?.[0]) {
            return NextResponse.json({
              latitude: parseFloat(data[0].lat),
              longitude: parseFloat(data[0].lon),
              locationText: data[0].display_name?.split(',').slice(0, 2).join(',') || `ZIP ${zipCode}`,
              source: 'nominatim'
            })
          }
        }
      } catch (nominatimError) {
        console.warn('Nominatim API also failed:', nominatimError)
      }

      // If all APIs fail
      return NextResponse.json(
        { error: 'Could not find that ZIP code. Please try again.' },
        { status: 404 }
      )
    } catch (error) {
      console.error('Geocode API error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
