/**
 * ZIP Code Data Loader
 *
 * Downloads US ZIP code data and loads it into the zip_codes table.
 * Uses the free simplemaps.com US ZIP codes dataset (basic version).
 *
 * Usage:
 *   npx tsx scripts/load-zip-codes.ts
 *
 * Requirements:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 *   - Or run from a directory with .env.local file
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables from .env.local if available
// Try multiple possible locations
const envPaths = [
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), 'apps', 'web', '.env.local'),
  path.join(__dirname, '..', '.env.local')
]

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment from: ${envPath}`)
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value
        }
      }
    })
    break
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing environment variables:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
  console.error('  SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Data source: OpenDataSoft US ZIP Code dataset (public domain)
// Contains: ZIP, city, state, lat, lng, timezone, county
const DATA_URL = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-united-states-of-america-zc-point/exports/csv?lang=en&timezone=UTC&use_labels=false&delimiter=%3B'

interface ZipCodeRow {
  zip: string
  city: string
  state: string
  state_name: string
  county: string
  lat: number
  lng: number
  timezone: string
  population: number
}

async function downloadData(): Promise<ZipCodeRow[]> {
  const cacheDir = path.join(process.cwd(), 'scripts', '.cache')
  const csvPath = path.join(cacheDir, 'uszips.csv')

  let csvContent: string

  // Check if we already have the CSV cached
  if (fs.existsSync(csvPath)) {
    console.log('Using cached ZIP code data...')
    csvContent = fs.readFileSync(csvPath, 'utf-8')
  } else {
    console.log('Downloading ZIP code data from OpenDataSoft...')
    fs.mkdirSync(cacheDir, { recursive: true })

    const response = await fetch(DATA_URL)
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
    }

    csvContent = await response.text()
    fs.writeFileSync(csvPath, csvContent)
    console.log('ZIP code data downloaded and cached.')
  }

  // Parse the CSV (semicolon-delimited)
  return parseOpenDataSoftCSV(csvContent)
}

function parseOpenDataSoftCSV(content: string): ZipCodeRow[] {
  const lines = content.split('\n')
  const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim().toLowerCase())

  // Find column indices - match exact OpenDataSoft column names
  const zipIdx = headers.findIndex(h => h === 'zip_code' || h.includes('zip'))
  const cityIdx = headers.findIndex(h => h === 'usps_city' || h.includes('city'))
  const stateIdx = headers.findIndex(h => h === 'stusps_code' || h === 'ste_code')
  const stateNameIdx = headers.findIndex(h => h === 'ste_name')
  const countyIdx = headers.findIndex(h => h === 'primary_coty_name' || h.includes('coty_name'))
  const geoPointIdx = headers.findIndex(h => h === 'geo_point_2d' || h.includes('geo_point'))
  const tzIdx = headers.findIndex(h => h === 'timezone')
  const popIdx = headers.findIndex(h => h === 'population')

  console.log(`CSV headers: ${headers.slice(0, 10).join(', ')}...`)
  console.log(`CSV columns detected: ZIP=${zipIdx}, City=${cityIdx}, State=${stateIdx}, GeoPoint=${geoPointIdx}, TZ=${tzIdx}`)

  const rows: ZipCodeRow[] = []
  const seenZips = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(';').map(v => v.replace(/"/g, '').trim())

    // Extract ZIP code
    let zip = values[zipIdx] || ''
    // Handle ZIP codes that might have leading zeros stripped
    if (zip && /^\d+$/.test(zip)) {
      zip = zip.padStart(5, '0')
    }

    // Only include valid 5-digit ZIP codes, skip duplicates
    if (zip && /^\d{5}$/.test(zip) && !seenZips.has(zip)) {
      seenZips.add(zip)

      // Parse lat/lng from geo_point_2d field (format: "lat, lng")
      let lat = 0, lng = 0
      const geoValue = values[geoPointIdx] || ''
      if (geoValue.includes(',')) {
        const [latStr, lngStr] = geoValue.split(',')
        lat = parseFloat(latStr.trim()) || 0
        lng = parseFloat(lngStr.trim()) || 0
      }

      // Parse population
      const pop = popIdx >= 0 ? parseInt(values[popIdx]) || 0 : 0

      rows.push({
        zip,
        city: values[cityIdx] || '',
        state: values[stateIdx] || '',
        state_name: values[stateNameIdx] || '',
        county: values[countyIdx] || '',
        lat,
        lng,
        timezone: values[tzIdx] || '',
        population: pop
      })
    }
  }

  return rows
}

// State code to name mapping
const STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'District of Columbia', 'PR': 'Puerto Rico', 'VI': 'Virgin Islands', 'GU': 'Guam',
  'AS': 'American Samoa', 'MP': 'Northern Mariana Islands'
}

async function loadZipCodes() {
  console.log('=== ZIP Code Data Loader ===\n')

  // Check if table already has data
  const { count, error: countError } = await supabase
    .from('zip_codes')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.error('Error checking existing data:', countError.message)
    console.error('Make sure the zip_codes table exists (run migrations first)')
    process.exit(1)
  }

  if (count && count > 0) {
    console.log(`Table already contains ${count} ZIP codes.`)
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const answer = await new Promise<string>(resolve => {
      rl.question('Do you want to replace existing data? (y/N): ', resolve)
    })
    rl.close()

    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.')
      process.exit(0)
    }

    console.log('Clearing existing data...')
    const { error: deleteError } = await supabase
      .from('zip_codes')
      .delete()
      .neq('zip', '') // Delete all rows

    if (deleteError) {
      console.error('Error clearing data:', deleteError.message)
      process.exit(1)
    }
  }

  // Download and parse data
  const rows = await downloadData()

  console.log(`Parsed ${rows.length} ZIP codes.`)

  // Insert in batches for performance
  const BATCH_SIZE = 1000
  let inserted = 0
  let errors = 0

  console.log('Inserting ZIP codes...')

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(row => ({
      zip: row.zip,
      city: row.city,
      state: row.state,
      state_name: row.state_name || STATE_NAMES[row.state] || null,
      county: row.county || null,
      latitude: row.lat || 0,
      longitude: row.lng || 0,
      timezone: row.timezone || null,
      population: row.population || null,
      region_code: null, // To be set later for partner territories
      active_market_area: false
    }))

    const { error } = await supabase
      .from('zip_codes')
      .insert(batch)

    if (error) {
      console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error.message)
      errors++
    } else {
      inserted += batch.length
    }

    // Progress indicator
    const progress = Math.round((i + batch.length) / rows.length * 100)
    process.stdout.write(`\rProgress: ${progress}% (${inserted} inserted)`)
  }

  console.log('\n')
  console.log('=== Load Complete ===')
  console.log(`Total parsed: ${rows.length}`)
  console.log(`Successfully inserted: ${inserted}`)
  if (errors > 0) {
    console.log(`Batches with errors: ${errors}`)
  }

  // Verify final count
  const { count: finalCount } = await supabase
    .from('zip_codes')
    .select('*', { count: 'exact', head: true })

  console.log(`Final table count: ${finalCount}`)
  console.log('\nData source: OpenDataSoft US ZIP Codes (public domain)')
}

// Run the loader
loadZipCodes().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
