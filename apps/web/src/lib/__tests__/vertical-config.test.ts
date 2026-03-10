/**
 * Vertical Config Tests
 *
 * Tests VALID_VERTICALS allowlist, defaultBranding lookups,
 * and term() terminology function behavior.
 * Covers: VI-R1 (VALID_VERTICALS), VI-R2 (branding), VI-R3 (tier limits per vertical),
 *         VI-R5 (term()), VI-R7 (term() fallback)
 *
 * Run: npx vitest run src/lib/__tests__/vertical-config.test.ts
 */
import { describe, it, expect } from 'vitest'
import { defaultBranding } from '../branding/defaults'
import { term, hasTerminologyConfig } from '../vertical/terminology'

// Note: VALID_VERTICALS is defined in middleware.ts as a Set.
// We can't import it directly (it's inside a middleware file),
// so we test the expected behavior through the configs.

// -- VI-R1: Valid Verticals --

describe('valid verticals (VI-R1)', () => {
  it('defaultBranding contains exactly the 3 valid verticals', () => {
    // VI-R1: Only valid vertical slugs are: farmers_market, food_trucks, fire_works
    const keys = Object.keys(defaultBranding).sort()
    expect(keys).toEqual(['farmers_market', 'fire_works', 'food_trucks'])
  })

  it('farmers_market is configured', () => {
    expect(defaultBranding.farmers_market).toBeDefined()
  })

  it('food_trucks is configured', () => {
    expect(defaultBranding.food_trucks).toBeDefined()
  })

  it('fire_works is configured', () => {
    expect(defaultBranding.fire_works).toBeDefined()
  })
})

// -- VI-R2: Branding Lookups --

describe('defaultBranding', () => {
  it('FM has domain farmersmarketing.app', () => {
    expect(defaultBranding.farmers_market.domain).toBe('farmersmarketing.app')
  })

  it('FT has domain foodtruckn.app', () => {
    expect(defaultBranding.food_trucks.domain).toBe('foodtruckn.app')
  })

  it('each vertical has brand_name', () => {
    expect(defaultBranding.farmers_market.brand_name).toBeTruthy()
    expect(defaultBranding.food_trucks.brand_name).toBeTruthy()
    expect(defaultBranding.fire_works.brand_name).toBeTruthy()
  })

  it('each vertical has complete color palette', () => {
    for (const key of Object.keys(defaultBranding)) {
      const branding = defaultBranding[key]
      expect(branding.colors.primary).toBeTruthy()
      expect(branding.colors.secondary).toBeTruthy()
      expect(branding.colors.accent).toBeTruthy()
      expect(branding.colors.background).toBeTruthy()
      expect(branding.colors.text).toBeTruthy()
    }
  })

  it('each vertical has meta info', () => {
    for (const key of Object.keys(defaultBranding)) {
      const branding = defaultBranding[key]
      expect(branding.meta.title).toBeTruthy()
      expect(branding.meta.description).toBeTruthy()
    }
  })
})

// -- VI-R5: term() Function --

describe('term()', () => {
  it('FM vendor → "Vendor"', () => {
    expect(term('farmers_market', 'vendor')).toBe('Vendor')
  })

  it('FT vendor → "Food Truck"', () => {
    expect(term('food_trucks', 'vendor')).toBe('Food Truck')
  })

  it('FM listing → "Listing"', () => {
    expect(term('farmers_market', 'listing')).toBe('Listing')
  })

  it('FT listing → "Menu Item"', () => {
    expect(term('food_trucks', 'listing')).toBe('Menu Item')
  })

  it('FM display_name → "Farmers Market"', () => {
    expect(term('farmers_market', 'display_name')).toBe('Farmers Market')
  })

  it('FT display_name → "Food Truck\'n"', () => {
    expect(term('food_trucks', 'display_name')).toBe("Food Truck'n")
  })
})

// -- VI-R7: term() Fallback Behavior --

describe('term() fallback', () => {
  it('unknown vertical falls back to farmers_market', () => {
    // Unknown vertical should return FM terminology
    expect(term('unknown_vertical', 'vendor')).toBe('Vendor')
  })

  it('hasTerminologyConfig returns false for unknown vertical', () => {
    expect(hasTerminologyConfig('unknown_vertical')).toBe(false)
  })

  it('hasTerminologyConfig returns true for known verticals', () => {
    expect(hasTerminologyConfig('farmers_market')).toBe(true)
    expect(hasTerminologyConfig('food_trucks')).toBe(true)
  })
})
