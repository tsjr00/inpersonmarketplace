/**
 * Browse Location Tests
 *
 * PURPOSE: Prevent regressions in browse page location functionality.
 * This has broken 3 times — each time because location-related code changed
 * without tests catching the regression.
 *
 * These tests verify:
 * 1. Browse page reads location cookie server-side and filters by Haversine distance
 * 2. BrowseLocationPrompt receives location props from the server
 * 3. Radius change handler is wired in BrowseLocationPrompt
 * 4. LocationSearchInline radius buttons call onRadiusChange
 * 5. GET /api/buyer/location endpoint exists and reads httpOnly cookie
 * 6. ZIP code validation in LocationSearchInline
 *
 * ABSOLUTE RULE: These tests assert what the architecture SHOULD be.
 * If the code violates these, THAT IS A REGRESSION — not a reason to update the test.
 *
 * Run: npx vitest run src/lib/__tests__/browse-location.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const APPS_WEB = path.resolve(__dirname, '..', '..', '..')
const SRC = path.join(APPS_WEB, 'src')

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), 'utf-8')
}

// ─── LOC-1: Browse page reads cookie and filters by distance (server-side) ──

describe('LOC-1: Browse page reads location cookie and filters by Haversine distance', () => {
  const browsePage = () => readSource('app/[vertical]/browse/page.tsx')

  it('imports cookies from next/headers', () => {
    const source = browsePage()
    expect(source).toMatch(/import\s*\{[^}]*cookies[^}]*\}\s*from\s*['"]next\/headers['"]/)
  })

  it('imports LOCATION_COOKIE_NAME from location/server', () => {
    const source = browsePage()
    expect(source).toContain('LOCATION_COOKIE_NAME')
  })

  it('contains Haversine distance calculation function', () => {
    const source = browsePage()
    // Haversine formula uses Earth radius and trig functions
    expect(source).toContain('distanceKm')
    expect(source).toContain('Math.sin')
    expect(source).toContain('Math.cos')
    expect(source).toContain('Math.atan2')
  })

  it('filters listings by distance using Haversine result', () => {
    const source = browsePage()
    // Must filter listings based on distance calculation
    expect(source).toMatch(/listings\s*=\s*listings\.filter/)
    expect(source).toContain('distanceKm')
    expect(source).toContain('maxDistKm')
  })

  it('reads radius from cookie and converts miles to km', () => {
    const source = browsePage()
    // Must convert miles to km for Haversine comparison
    expect(source).toMatch(/1\.609/) // miles-to-km conversion factor
  })

  it('supports both ?zip= param and cookie-based location (with fallthrough)', () => {
    const source = browsePage()
    // Path 1: ?zip= URL param (tries zip_codes table first)
    expect(source).toContain("if (zip && listings")
    // Path 2: cookie-based location (runs as fallback if zip_codes fails OR no ?zip=)
    expect(source).toContain('if (!hasLocationFilter && listings')
  })

  it('checks authenticated user profile location before cookie fallback', () => {
    const source = browsePage()
    // Profile location is checked first (already fetched in user_profiles query)
    expect(source).toContain('profileLocation?.preferred_latitude')
    expect(source).toContain('profileLocation?.preferred_longitude')
  })

  it('does NOT export revalidate (CDN caching breaks cookie-dependent filtering)', () => {
    const source = browsePage()
    // revalidate causes Vercel CDN to cache the page, serving stale results
    // that ignore cookie changes (radius, location). This page is dynamic.
    expect(source).not.toMatch(/export\s+const\s+revalidate\s*=/)
  })

  it('exports dynamic = force-dynamic (ensures no server-side caching)', () => {
    const source = browsePage()
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)
  })

  it('reads radius from ?r= URL param as priority over cookie radius', () => {
    const source = browsePage()
    // URL param ?r= is set by client-side radius change for reliable re-render
    expect(source).toContain('urlRadius')
    expect(source).toContain('parsedUrlRadius')
  })
})

// ─── LOC-2: BrowseLocationPrompt receives server-side location props ────────

describe('LOC-2: BrowseLocationPrompt receives location props from server', () => {
  const prompt = () => readSource('app/[vertical]/browse/BrowseLocationPrompt.tsx')
  const browsePage = () => readSource('app/[vertical]/browse/page.tsx')

  it('is a client component (uses "use client" directive)', () => {
    const source = prompt()
    expect(source).toMatch(/^['"]use client['"]/)
  })

  it('accepts hasLocation, locationText, and currentRadius props', () => {
    const source = prompt()
    expect(source).toContain('hasLocation')
    expect(source).toContain('locationText')
    expect(source).toContain('currentRadius')
  })

  it('browse page passes hasLocation prop from server-side location resolution', () => {
    const source = browsePage()
    expect(source).toMatch(/<BrowseLocationPrompt[\s\S]*?hasLocation=\{/)
  })

  it('browse page passes locationText prop from server-side location resolution', () => {
    const source = browsePage()
    expect(source).toMatch(/<BrowseLocationPrompt[\s\S]*?locationText=\{/)
  })

  it('browse page passes currentRadius prop', () => {
    const source = browsePage()
    expect(source).toMatch(/<BrowseLocationPrompt[\s\S]*?currentRadius=\{/)
  })

  it('BrowseLocationPrompt is NOT rendered when ?zip= param is present', () => {
    const source = browsePage()
    expect(source).toMatch(/\{!zip\s*&&[\s\S]*?<BrowseLocationPrompt/)
  })
})

// ─── LOC-3: Radius change handler is wired in BrowseLocationPrompt ──────────

describe('LOC-3: Radius change handler is wired in BrowseLocationPrompt', () => {
  const prompt = () => readSource('app/[vertical]/browse/BrowseLocationPrompt.tsx')

  it('defines handleRadiusChange function', () => {
    const source = prompt()
    expect(source).toContain('handleRadiusChange')
  })

  it('handleRadiusChange saves radius via PATCH /api/buyer/location', () => {
    const source = prompt()
    expect(source).toMatch(/fetch\(['"]\/api\/buyer\/location['"]/)
    expect(source).toContain("method: 'PATCH'")
    expect(source).toContain('radius: newRadius')
  })

  it('handleRadiusChange navigates with ?r= URL param via router.replace (forces server re-render)', () => {
    const source = prompt()
    // After radius change, navigate with ?r= param to force Next.js server re-render
    // router.refresh() doesn't reliably re-read cookies on Vercel CDN
    // Must NOT use window.location.reload() — causes flash/bounce/slowness
    expect(source).toMatch(/searchParams\.set\(['"]r['"]/)
    expect(source).toContain('router.replace(')
    // Verify window.location.reload is NOT used for radius changes
    const reloadInHandler = source.match(/handleRadiusChange[\s\S]*?window\.location\.reload/)
    expect(reloadInHandler).toBeFalsy()
  })

  it('passes onRadiusChange to LocationSearchInline in green bar mode (hasLocation=true)', () => {
    const source = prompt()
    expect(source).toContain('onRadiusChange={handleRadiusChange}')
  })

  it('passes radiusOptions to LocationSearchInline in BOTH modes', () => {
    const source = prompt()
    const matches = source.match(/radiusOptions=\{radiusOptions\}/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── LOC-4: LocationSearchInline radius buttons call onRadiusChange ─────────

describe('LOC-4: LocationSearchInline radius buttons are wired to onRadiusChange', () => {
  const inline = () => readSource('components/location/LocationSearchInline.tsx')

  it('RadiusSelector buttons call onRadiusChange on click', () => {
    const source = inline()
    expect(source).toMatch(/onClick=\{?\(\)\s*=>\s*onRadiusChange\?\.\(r\)/)
  })

  it('RadiusSelector is rendered in BOTH modes (input form and green bar)', () => {
    const source = inline()
    const matches = source.match(/<RadiusSelector/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts onRadiusChange as an optional prop', () => {
    const source = inline()
    expect(source).toContain('onRadiusChange?: (radius: number) => void')
  })
})

// ─── LOC-5: GET /api/buyer/location reads httpOnly cookie ───────────────────

describe('LOC-5: GET /api/buyer/location reads httpOnly cookie', () => {
  const route = () => readSource('app/api/buyer/location/route.ts')

  it('exports a GET handler', () => {
    const source = route()
    expect(source).toMatch(/export\s+async\s+function\s+GET/)
  })

  it('GET handler reads user_location cookie', () => {
    const source = route()
    expect(source).toContain('user_location')
    expect(source).toContain('request.cookies.get')
  })

  it('GET handler returns hasLocation in response', () => {
    const source = route()
    expect(source).toContain('hasLocation: true')
    expect(source).toContain('hasLocation: false')
  })

  it('GET handler returns locationText and radius', () => {
    const source = route()
    expect(source).toContain('locationText')
    expect(source).toContain('radius')
  })

  it('exports POST, PATCH, and DELETE handlers for full location lifecycle', () => {
    const source = route()
    expect(source).toMatch(/export\s+async\s+function\s+POST/)
    expect(source).toMatch(/export\s+async\s+function\s+PATCH/)
    expect(source).toMatch(/export\s+async\s+function\s+DELETE/)
  })

  it('cookie is set as httpOnly (cannot be read client-side)', () => {
    const source = route()
    expect(source).toContain('httpOnly: true')
  })
})

// ─── LOC-6: ZIP code validation ─────────────────────────────────────────────

describe('LOC-6: ZIP code validation in LocationSearchInline', () => {
  const inline = () => readSource('components/location/LocationSearchInline.tsx')

  it('validates ZIP code format (5 digits)', () => {
    const source = inline()
    expect(source).toMatch(/\\d\{5\}/)
  })

  it('strips non-digit characters from ZIP input', () => {
    const source = inline()
    expect(source).toMatch(/replace\(\/\\D\/g/)
  })

  it('limits ZIP input to 5 characters', () => {
    const source = inline()
    expect(source).toContain('.slice(0, 5)')
  })

  it('geocodes ZIP via /api/buyer/location/geocode before saving', () => {
    const source = inline()
    expect(source).toContain('/api/buyer/location/geocode')
  })

  it('saves geocoded location via POST /api/buyer/location', () => {
    const source = inline()
    expect(source).toContain('/api/buyer/location')
    expect(source).toContain("method: 'POST'")
  })
})
