import { NextRequest, NextResponse } from 'next/server'

// ZIP code to coordinates lookup using Census Geocoding API (free, no API key needed)
// Falls back to a static lookup table for common ZIP codes

// Static lookup for faster responses on common ZIP codes
const ZIP_LOOKUP: Record<string, { lat: number; lng: number; city: string; state: string }> = {
  // Major US cities - extend as needed
  '10001': { lat: 40.7506, lng: -73.9971, city: 'New York', state: 'NY' },
  '90001': { lat: 33.9425, lng: -118.2551, city: 'Los Angeles', state: 'CA' },
  '60601': { lat: 41.8819, lng: -87.6278, city: 'Chicago', state: 'IL' },
  '77001': { lat: 29.7604, lng: -95.3698, city: 'Houston', state: 'TX' },
  '85001': { lat: 33.4484, lng: -112.074, city: 'Phoenix', state: 'AZ' },
  '19101': { lat: 39.9526, lng: -75.1652, city: 'Philadelphia', state: 'PA' },
  '78201': { lat: 29.4241, lng: -98.4936, city: 'San Antonio', state: 'TX' },
  '92101': { lat: 32.7157, lng: -117.1611, city: 'San Diego', state: 'CA' },
  '75201': { lat: 32.7767, lng: -96.7970, city: 'Dallas', state: 'TX' },
  '95101': { lat: 37.3382, lng: -121.8863, city: 'San Jose', state: 'CA' },
  // Amarillo, TX area
  '79106': { lat: 35.1992, lng: -101.8451, city: 'Amarillo', state: 'TX' },
  '79101': { lat: 35.2220, lng: -101.8313, city: 'Amarillo', state: 'TX' },
  '79102': { lat: 35.1958, lng: -101.8568, city: 'Amarillo', state: 'TX' },
  '79109': { lat: 35.1731, lng: -101.8779, city: 'Amarillo', state: 'TX' },
  '79110': { lat: 35.1542, lng: -101.9156, city: 'Amarillo', state: 'TX' },
}

export async function POST(request: NextRequest) {
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
      console.log('Census API failed, trying Nominatim:', censusError)
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
      console.log('Nominatim API also failed:', nominatimError)
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
}
