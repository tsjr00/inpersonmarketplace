/**
 * Batch Geocode Script
 *
 * Geocodes existing markets and vendors that have addresses but no lat/lng.
 * Uses free Census Geocoding API with Nominatim fallback.
 *
 * Usage: npx ts-node scripts/batch-geocode.ts
 *
 * Note: Run this against your Supabase database by setting environment variables.
 */

import { createClient } from '@supabase/supabase-js'

// Load from environment or set directly for testing
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Set these environment variables before running.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Rate limiting - be nice to free APIs
const DELAY_MS = 1500 // 1.5 seconds between requests

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function geocodeAddress(address: string, city?: string, state?: string, zip?: string): Promise<{ lat: number; lng: number } | null> {
  // Build full address string
  const parts = [address, city, state, zip].filter(Boolean)
  const fullAddress = parts.join(', ')

  if (!fullAddress || fullAddress.length < 5) {
    return null
  }

  console.log(`  Geocoding: ${fullAddress}`)

  // Try Census Geocoding API first (US addresses, free, no key)
  try {
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(fullAddress)}&benchmark=Public_AR_Current&format=json`

    const response = await fetch(censusUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    })

    if (response.ok) {
      const data = await response.json()
      const match = data?.result?.addressMatches?.[0]

      if (match?.coordinates) {
        console.log(`  ✓ Census API: ${match.coordinates.y}, ${match.coordinates.x}`)
        return { lat: match.coordinates.y, lng: match.coordinates.x }
      }
    }
  } catch (err) {
    console.log(`  Census API failed, trying Nominatim...`)
  }

  // Fallback to Nominatim (OpenStreetMap)
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1&countrycodes=us`

    const response = await fetch(nominatimUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'InPersonMarketplace-BatchGeocoder/1.0'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (response.ok) {
      const data = await response.json()

      if (data?.[0]) {
        const lat = parseFloat(data[0].lat)
        const lng = parseFloat(data[0].lon)
        console.log(`  ✓ Nominatim: ${lat}, ${lng}`)
        return { lat, lng }
      }
    }
  } catch (err) {
    console.log(`  Nominatim also failed`)
  }

  console.log(`  ✗ Could not geocode`)
  return null
}

async function geocodeMarkets() {
  console.log('\n=== GEOCODING MARKETS ===\n')

  // Get markets without coordinates
  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, name, address, city, state, zip_code')
    .is('latitude', null)
    .not('address', 'is', null)

  if (error) {
    console.error('Error fetching markets:', error)
    return
  }

  console.log(`Found ${markets?.length || 0} markets to geocode\n`)

  let success = 0
  let failed = 0

  for (const market of markets || []) {
    console.log(`Market: ${market.name}`)

    const coords = await geocodeAddress(
      market.address,
      market.city,
      market.state,
      market.zip_code
    )

    if (coords) {
      const { error: updateError } = await supabase
        .from('markets')
        .update({
          latitude: coords.lat,
          longitude: coords.lng,
          geocoding_failed: false
        })
        .eq('id', market.id)

      if (updateError) {
        console.log(`  ✗ Failed to save: ${updateError.message}`)
        failed++
      } else {
        console.log(`  ✓ Saved to database`)
        success++
      }
    } else {
      // Mark as failed so we don't keep retrying
      await supabase
        .from('markets')
        .update({ geocoding_failed: true })
        .eq('id', market.id)
      failed++
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nMarkets: ${success} geocoded, ${failed} failed`)
}

async function geocodeVendors() {
  console.log('\n=== GEOCODING VENDORS ===\n')

  // Get vendors without coordinates
  const { data: vendors, error } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, address, city, state, zip_code')
    .is('latitude', null)
    .not('address', 'is', null)

  if (error) {
    console.error('Error fetching vendors:', error)
    return
  }

  console.log(`Found ${vendors?.length || 0} vendors to geocode\n`)

  let success = 0
  let failed = 0

  for (const vendor of vendors || []) {
    console.log(`Vendor: ${vendor.business_name}`)

    const coords = await geocodeAddress(
      vendor.address,
      vendor.city,
      vendor.state,
      vendor.zip_code
    )

    if (coords) {
      const { error: updateError } = await supabase
        .from('vendor_profiles')
        .update({
          latitude: coords.lat,
          longitude: coords.lng,
          geocoding_failed: false
        })
        .eq('id', vendor.id)

      if (updateError) {
        console.log(`  ✗ Failed to save: ${updateError.message}`)
        failed++
      } else {
        console.log(`  ✓ Saved to database`)
        success++
      }
    } else {
      await supabase
        .from('vendor_profiles')
        .update({ geocoding_failed: true })
        .eq('id', vendor.id)
      failed++
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nVendors: ${success} geocoded, ${failed} failed`)
}

async function main() {
  console.log('========================================')
  console.log('  Batch Geocoding Script')
  console.log('========================================')
  console.log(`\nUsing Supabase: ${SUPABASE_URL}`)
  console.log('Using: Census Geocoding API + Nominatim fallback (free)')
  console.log(`Rate limit: ${DELAY_MS}ms between requests\n`)

  await geocodeMarkets()
  await geocodeVendors()

  console.log('\n========================================')
  console.log('  Done!')
  console.log('========================================\n')
}

main().catch(console.error)
