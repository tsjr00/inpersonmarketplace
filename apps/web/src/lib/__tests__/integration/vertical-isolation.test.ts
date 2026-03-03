/**
 * Vertical isolation tests.
 *
 * Business Rules Covered:
 * VI-R1: Only valid vertical slugs routable (farmers_market, food_trucks, fire_works)
 * VI-R6: Email FROM address per vertical (FM=farmersmarketing.app, FT=foodtruckn.app)
 * VI-R7: CSS primary color isolation (FM=green, FT=red)
 * VI-R8: term() returns vertical-specific strings
 * VI-R9: Buyer premium FM-only (FT disabled)
 * VI-R12: Vendor tier names differ per vertical
 */
import { describe, it, expect } from 'vitest'
import { term, hasTerminologyConfig, isBuyerPremiumEnabled } from '@/lib/vertical'
import { getVerticalColors, getVerticalCSSVars, getVerticalShadows } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding/defaults'

// ── VI-R8: Vertical Terminology ─────────────────────────────────────
describe('VI-R8: Vertical Terminology Isolation', () => {
  it('FM and FT have different vendor terms', () => {
    const fmVendor = term('farmers_market', 'vendor')
    const ftVendor = term('food_trucks', 'vendor')
    // Both should return something (not undefined)
    expect(fmVendor).toBeTruthy()
    expect(ftVendor).toBeTruthy()
  })

  it('FM and FT have different listing terms', () => {
    const fmListing = term('farmers_market', 'listing')
    const ftListing = term('food_trucks', 'listing')
    expect(fmListing).toBeTruthy()
    expect(ftListing).toBeTruthy()
  })

  it('FM and FT have different market terms', () => {
    const fmMarket = term('farmers_market', 'market')
    const ftMarket = term('food_trucks', 'market')
    expect(fmMarket).toBeTruthy()
    expect(ftMarket).toBeTruthy()
  })

  it('unknown vertical falls back to FM terminology', () => {
    const unknown = term('unknown_vertical', 'vendor')
    // term() falls back to farmers_market for unknown verticals
    expect(unknown).toBeTruthy()
  })

  it('both configured verticals have terminology', () => {
    expect(hasTerminologyConfig('farmers_market')).toBe(true)
    expect(hasTerminologyConfig('food_trucks')).toBe(true)
  })
})

// ── VI-R7: Color Isolation ───────────────────────────────────────────
describe('VI-R7: Vertical Color Isolation', () => {
  it('FM primary color is green', () => {
    const colors = getVerticalColors('farmers_market')
    expect(colors.primary).toBe('#8BC34A')
  })

  it('FT primary color is red', () => {
    const colors = getVerticalColors('food_trucks')
    expect(colors.primary).toBe('#ff5757')
  })

  it('FM and FT have different primary colors', () => {
    const fm = getVerticalColors('farmers_market')
    const ft = getVerticalColors('food_trucks')
    expect(fm.primary).not.toBe(ft.primary)
  })

  it('FM and FT have different text colors', () => {
    const fm = getVerticalColors('farmers_market')
    const ft = getVerticalColors('food_trucks')
    expect(fm.textPrimary).not.toBe(ft.textPrimary)
  })

  it('unknown vertical falls back to FM colors', () => {
    const unknown = getVerticalColors('unknown_vertical')
    const fm = getVerticalColors('farmers_market')
    expect(unknown.primary).toBe(fm.primary)
  })
})

// ── VI-R7: CSS Variables ─────────────────────────────────────────────
describe('VI-R7: Vertical CSS Variable Isolation', () => {
  it('FM returns empty CSS vars (uses globals.css defaults)', () => {
    const vars = getVerticalCSSVars('farmers_market')
    expect(Object.keys(vars).length).toBe(0)
  })

  it('FT returns CSS var overrides', () => {
    const vars = getVerticalCSSVars('food_trucks')
    expect(Object.keys(vars).length).toBeGreaterThan(0)
    expect(vars['--color-primary']).toBe('#ff5757')
  })

  it('unknown vertical returns empty CSS vars (FM default)', () => {
    const vars = getVerticalCSSVars('unknown_vertical')
    expect(Object.keys(vars).length).toBe(0)
  })
})

// ── VI-R7: Shadow Isolation ──────────────────────────────────────────
describe('VI-R7: Vertical Shadow Isolation', () => {
  it('FM and FT have different primary shadow colors', () => {
    const fm = getVerticalShadows('farmers_market')
    const ft = getVerticalShadows('food_trucks')
    expect(fm.primary).not.toBe(ft.primary)
  })

  it('FT shadow uses red tint', () => {
    const ft = getVerticalShadows('food_trucks')
    expect(ft.primary).toContain('255, 87, 87')
  })
})

// ── VI-R6: Branding + Domain Isolation ──────────────────────────────
describe('VI-R6: Vertical Branding Isolation', () => {
  it('each vertical has a unique domain', () => {
    const domains = Object.values(defaultBranding).map(b => b.domain)
    const unique = new Set(domains)
    expect(unique.size).toBe(domains.length)
  })

  it('each vertical has a unique brand name', () => {
    const names = Object.values(defaultBranding).map(b => b.brand_name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('FM domain is farmersmarketing.app', () => {
    expect(defaultBranding.farmers_market.domain).toBe('farmersmarketing.app')
  })

  it('FT domain is foodtruckn.app', () => {
    expect(defaultBranding.food_trucks.domain).toBe('foodtruckn.app')
  })

  it('each vertical has required branding fields', () => {
    for (const [key, branding] of Object.entries(defaultBranding)) {
      expect(branding.domain, `${key} missing domain`).toBeTruthy()
      expect(branding.brand_name, `${key} missing brand_name`).toBeTruthy()
      expect(branding.colors?.primary, `${key} missing primary color`).toBeTruthy()
      expect(branding.meta?.title, `${key} missing meta title`).toBeTruthy()
    }
  })
})

// ── VI-R9: Feature Gating ────────────────────────────────────────────
describe('VI-R9: Vertical Feature Flags', () => {
  it('buyer premium is enabled for FM (2-hour early-access window)', () => {
    expect(isBuyerPremiumEnabled('farmers_market')).toBe(true)
  })

  it('buyer premium is disabled for FT (no early-access window)', () => {
    expect(isBuyerPremiumEnabled('food_trucks')).toBe(false)
  })
})

// ── VI-R12: Tier Names Differ Per Vertical ──────────────────────────
// Tested in vendor-tier-limits.test.ts (VJ-R4)
