/**
 * Browse Location Tests
 *
 * PURPOSE: Prevent regressions in browse page location functionality.
 * This has broken 3 times — each time because location-related code changed
 * without tests catching the regression.
 *
 * These tests verify:
 * 1. BrowseLocationPrompt fetches location from API on mount (ISR can't read cookies)
 * 2. BrowseLocationPrompt wires up radius change handlers in ALL UI states
 * 3. Location changes use window.location.reload() (not router.refresh which serves ISR cache)
 * 4. GET /api/buyer/location endpoint reads the httpOnly cookie
 * 5. Browse page renders BrowseLocationPrompt with correct props
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

// ─── LOC-1: BrowseLocationPrompt fetches location from API on mount ─────────

describe('LOC-1: BrowseLocationPrompt fetches location client-side on mount', () => {
  const prompt = () => readSource('app/[vertical]/browse/BrowseLocationPrompt.tsx')

  it('is a client component (uses "use client" directive)', () => {
    const source = prompt()
    expect(source).toMatch(/^['"]use client['"]/)
  })

  it('calls GET /api/buyer/location on mount via useEffect', () => {
    const source = prompt()
    // Must fetch from the location API endpoint
    expect(source).toContain("fetch('/api/buyer/location')")
    // Must be inside a useEffect (not called during render)
    expect(source).toContain('useEffect')
  })

  it('updates hasLocation state from API response', () => {
    const source = prompt()
    // After API call, must update the hasLocation state
    expect(source).toContain('setHasLocation(true)')
    // And set the location text from response
    expect(source).toContain('setLocationText(data.locationText)')
  })

  it('updates radius state from API response', () => {
    const source = prompt()
    // Must read radius from the API response
    expect(source).toMatch(/setRadius\(data\.radius/)
  })

  it('skips API fetch when server already provided location (e.g. ?zip= param)', () => {
    const source = prompt()
    // Early return when server props already indicate location
    expect(source).toContain('if (serverHasLocation) return')
  })
})

// ─── LOC-2: Radius buttons are functional in ALL UI states ──────────────────

describe('LOC-2: Radius change handler is wired in all BrowseLocationPrompt states', () => {
  const prompt = () => readSource('app/[vertical]/browse/BrowseLocationPrompt.tsx')

  it('defines handleRadiusChange function', () => {
    const source = prompt()
    expect(source).toContain('handleRadiusChange')
  })

  it('handleRadiusChange saves radius via PATCH /api/buyer/location', () => {
    const source = prompt()
    // Must PATCH the API to persist radius
    expect(source).toMatch(/fetch\(['"]\/api\/buyer\/location['"]/)
    expect(source).toContain("method: 'PATCH'")
    expect(source).toContain('radius: newRadius')
  })

  it('passes onRadiusChange to LocationSearchInline in green bar mode (hasLocation=true)', () => {
    const source = prompt()
    // When hasLocation is true, the second render path must pass onRadiusChange
    expect(source).toContain('onRadiusChange={handleRadiusChange}')
  })

  it('passes radiusOptions to LocationSearchInline in BOTH modes', () => {
    const source = prompt()
    // Count occurrences of radiusOptions prop
    const matches = source.match(/radiusOptions=\{radiusOptions\}/g)
    expect(matches).toBeTruthy()
    // Must appear at least twice — once for input mode, once for green bar mode
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── LOC-3: LocationSearchInline radius buttons call onRadiusChange ─────────

describe('LOC-3: LocationSearchInline radius buttons are wired to onRadiusChange', () => {
  const inline = () => readSource('components/location/LocationSearchInline.tsx')

  it('RadiusSelector buttons call onRadiusChange on click', () => {
    const source = inline()
    // Each radius button must call onRadiusChange
    expect(source).toMatch(/onClick=\{?\(\)\s*=>\s*onRadiusChange\?\.\(r\)/)
  })

  it('RadiusSelector is rendered in BOTH modes (input form and green bar)', () => {
    const source = inline()
    // Count RadiusSelector usage — must appear in both the hasLocation branch and the form
    const matches = source.match(/<RadiusSelector/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts onRadiusChange as an optional prop', () => {
    const source = inline()
    expect(source).toContain('onRadiusChange?: (radius: number) => void')
  })
})

// ─── LOC-4: Location changes bypass ISR cache ───────────────────────────────

describe('LOC-4: Location changes use window.location.reload() to bypass ISR cache', () => {
  const prompt = () => readSource('app/[vertical]/browse/BrowseLocationPrompt.tsx')

  it('onLocationSet callback uses window.location.reload() (not router.refresh())', () => {
    const source = prompt()
    // After setting location, must hard reload (bypasses revalidate=300 ISR cache)
    expect(source).toContain('window.location.reload()')
  })

  it('handleRadiusChange uses window.location.reload() after PATCH', () => {
    const source = prompt()
    // After changing radius, must hard reload
    // Extract handleRadiusChange function body to verify it contains reload
    const match = source.match(/handleRadiusChange[\s\S]*?window\.location\.reload\(\)/)
    expect(match).toBeTruthy()
  })

  it('does NOT use router.refresh() for location set (would serve ISR cached page)', () => {
    const source = prompt()
    // router.refresh() after location changes would serve stale ISR cache
    // The only allowed use of router.refresh() is handleClear (clears location, OK to refresh)
    // onLocationSet callbacks must NOT use router.refresh()

    // Find all onLocationSet callbacks
    const onLocationSetBlocks = source.match(/onLocationSet=\{[^}]*\}/g) || []
    for (const block of onLocationSetBlocks) {
      expect(block).not.toContain('router.refresh()')
    }
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
    // Must read the cookie by name
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

// ─── LOC-6: Browse page renders BrowseLocationPrompt correctly ──────────────

describe('LOC-6: Browse page renders BrowseLocationPrompt with ISR-compatible props', () => {
  const browsePage = () => readSource('app/[vertical]/browse/page.tsx')

  it('imports and renders BrowseLocationPrompt', () => {
    const source = browsePage()
    expect(source).toContain("import BrowseLocationPrompt from './BrowseLocationPrompt'")
    expect(source).toContain('<BrowseLocationPrompt')
  })

  it('passes vertical prop to BrowseLocationPrompt', () => {
    const source = browsePage()
    // BrowseLocationPrompt needs vertical to know radius options and labels
    expect(source).toMatch(/<BrowseLocationPrompt[\s\S]*?vertical=\{vertical\}/)
  })

  it('does NOT import cookies from next/headers (would break ISR)', () => {
    const source = browsePage()
    // cookies() from next/headers forces dynamic rendering, breaking ISR
    expect(source).not.toMatch(/import\s*\{[^}]*cookies[^}]*\}\s*from\s*['"]next\/headers['"]/)
  })

  it('does NOT import getServerLocation (location handled client-side)', () => {
    const source = browsePage()
    expect(source).not.toMatch(/import.*getServerLocation/)
  })

  it('does NOT import LOCATION_COOKIE_NAME (cookie read server-side via API)', () => {
    const source = browsePage()
    expect(source).not.toMatch(/import.*LOCATION_COOKIE_NAME/)
  })

  it('BrowseLocationPrompt is NOT rendered when ?zip= param is present', () => {
    const source = browsePage()
    // When zip param is present, the server handles location filtering
    // BrowseLocationPrompt should be conditionally rendered
    expect(source).toMatch(/\{!zip\s*&&[\s\S]*?<BrowseLocationPrompt/)
  })
})

// ─── LOC-7: ZIP code validation ─────────────────────────────────────────────

describe('LOC-7: ZIP code validation in LocationSearchInline', () => {
  const inline = () => readSource('components/location/LocationSearchInline.tsx')

  it('validates ZIP code format (5 digits)', () => {
    const source = inline()
    // Must validate that input is exactly 5 digits
    expect(source).toMatch(/\\d\{5\}/)
  })

  it('strips non-digit characters from ZIP input', () => {
    const source = inline()
    // Input handler should strip non-digits
    expect(source).toMatch(/replace\(\/\\D\/g/)
  })

  it('limits ZIP input to 5 characters', () => {
    const source = inline()
    // Input handler should limit to 5 chars
    expect(source).toContain('.slice(0, 5)')
  })

  it('geocodes ZIP via /api/buyer/location/geocode before saving', () => {
    const source = inline()
    // Must geocode the ZIP to get lat/lng
    expect(source).toContain('/api/buyer/location/geocode')
  })

  it('saves geocoded location via POST /api/buyer/location', () => {
    const source = inline()
    // After geocoding, saves location via POST
    expect(source).toContain('/api/buyer/location')
    expect(source).toContain("method: 'POST'")
  })
})
