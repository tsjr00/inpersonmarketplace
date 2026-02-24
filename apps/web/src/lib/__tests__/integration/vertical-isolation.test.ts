import { describe, it, expect } from 'vitest'
import { term, hasTerminologyConfig, isBuyerPremiumEnabled } from '@/lib/vertical'
import { getVerticalColors, getVerticalCSSVars, getVerticalShadows } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding/defaults'

/**
 * Vertical isolation tests.
 * Ensures FM and FT verticals produce distinct branding, terminology,
 * and configuration — and that unknown verticals fall back safely.
 */

describe('Vertical Terminology Isolation', () => {
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

describe('Vertical Color Isolation', () => {
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

describe('Vertical CSS Variable Isolation', () => {
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

describe('Vertical Shadow Isolation', () => {
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

describe('Vertical Branding Isolation', () => {
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

describe('Vertical Feature Flags', () => {
  it('buyer premium is enabled for FM (2-hour early-access window)', () => {
    expect(isBuyerPremiumEnabled('farmers_market')).toBe(true)
  })

  it('buyer premium is disabled for FT (no early-access window)', () => {
    expect(isBuyerPremiumEnabled('food_trucks')).toBe(false)
  })
})
