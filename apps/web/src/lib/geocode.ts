/**
 * Shared ZIP code geocoding utilities
 * Used by vendor/markets and buyer/location/geocode routes
 */

export interface ZipEntry {
  lat: number
  lng: number
  city?: string
  state?: string
}

// Static ZIP code lookup for common areas (fast response, no API call)
export const ZIP_LOOKUP: Record<string, ZipEntry> = {
  // Major US cities
  '10001': { lat: 40.7506, lng: -73.9971, city: 'New York', state: 'NY' },
  '90001': { lat: 33.9425, lng: -118.2551, city: 'Los Angeles', state: 'CA' },
  '60601': { lat: 41.8819, lng: -87.6278, city: 'Chicago', state: 'IL' },
  '85001': { lat: 33.4484, lng: -112.074, city: 'Phoenix', state: 'AZ' },
  '19101': { lat: 39.9526, lng: -75.1652, city: 'Philadelphia', state: 'PA' },
  '92101': { lat: 32.7157, lng: -117.1611, city: 'San Diego', state: 'CA' },
  '95101': { lat: 37.3382, lng: -121.8863, city: 'San Jose', state: 'CA' },
  // Major TX cities
  '77001': { lat: 29.7604, lng: -95.3698, city: 'Houston', state: 'TX' },
  '78201': { lat: 29.4241, lng: -98.4936, city: 'San Antonio', state: 'TX' },
  '75201': { lat: 32.7767, lng: -96.7970, city: 'Dallas', state: 'TX' },
  '73301': { lat: 30.2672, lng: -97.7431, city: 'Austin', state: 'TX' },
  // Amarillo, TX area
  '79106': { lat: 35.1992, lng: -101.8451, city: 'Amarillo', state: 'TX' },
  '79101': { lat: 35.2220, lng: -101.8313, city: 'Amarillo', state: 'TX' },
  '79102': { lat: 35.1958, lng: -101.8568, city: 'Amarillo', state: 'TX' },
  '79107': { lat: 35.2283, lng: -101.7897, city: 'Amarillo', state: 'TX' },
  '79109': { lat: 35.1731, lng: -101.8779, city: 'Amarillo', state: 'TX' },
  '79110': { lat: 35.1542, lng: -101.9156, city: 'Amarillo', state: 'TX' },
  '79118': { lat: 35.1089, lng: -101.8010, city: 'Amarillo', state: 'TX' },
  '79119': { lat: 35.1456, lng: -101.9456, city: 'Amarillo', state: 'TX' },
}

/**
 * Geocode a ZIP code to coordinates
 * Uses static lookup first, then Census API, then Nominatim as fallback
 */
export async function geocodeZipCode(zip: string): Promise<{ latitude: number; longitude: number } | null> {
  // Clean ZIP code (first 5 digits only)
  const cleanZip = zip.replace(/\D/g, '').substring(0, 5)
  if (cleanZip.length !== 5) return null

  // Check static lookup first
  const staticResult = ZIP_LOOKUP[cleanZip]
  if (staticResult) {
    return { latitude: staticResult.lat, longitude: staticResult.lng }
  }

  // Try Census Geocoding API (free, no API key needed)
  try {
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${cleanZip}&benchmark=Public_AR_Current&format=json`
    const response = await fetch(censusUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    })

    if (response.ok) {
      const data = await response.json()
      const match = data?.result?.addressMatches?.[0]
      if (match?.coordinates) {
        return { latitude: match.coordinates.y, longitude: match.coordinates.x }
      }
    }
  } catch (error) {
    console.warn('[geocodeZipCode] Census API failed:', error)
  }

  // Fallback to Nominatim (OpenStreetMap)
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?postalcode=${cleanZip}&country=USA&format=json&limit=1`
    const response = await fetch(nominatimUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'InPersonMarketplace/1.0'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (response.ok) {
      const data = await response.json()
      if (data?.[0]) {
        return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }
      }
    }
  } catch (error) {
    console.warn('[geocodeZipCode] Nominatim API also failed:', error)
  }

  return null
}
