import { describe, it, expect } from 'vitest'
import { calculateTipShare, calculateVendorTip, calculatePlatformFeeTip } from '@/lib/payments/tip-math'

describe('calculateTipShare', () => {
  it('splits tip evenly across items', () => {
    // $5 tip (500 cents) / 2 items = 250 each
    expect(calculateTipShare(500, 2)).toBe(250)
  })

  it('rounds when tip does not divide evenly', () => {
    // $1 tip (100 cents) / 3 items = 33.33 → 33
    expect(calculateTipShare(100, 3)).toBe(33)
  })

  it('returns 0 for null tip', () => {
    expect(calculateTipShare(null, 2)).toBe(0)
  })

  it('returns 0 for undefined tip', () => {
    expect(calculateTipShare(undefined, 2)).toBe(0)
  })

  it('returns 0 for zero tip', () => {
    expect(calculateTipShare(0, 2)).toBe(0)
  })

  it('returns 0 for null item count', () => {
    expect(calculateTipShare(500, null)).toBe(0)
  })

  it('returns 0 for zero item count', () => {
    expect(calculateTipShare(500, 0)).toBe(0)
  })
})

describe('calculateVendorTip', () => {
  it('subtracts platform fee tip from total tip', () => {
    // $1.92 total tip, $0.12 platform fee tip → vendor gets $1.80
    expect(calculateVendorTip(192, 12)).toBe(180)
  })

  it('returns full tip when platform fee tip is 0', () => {
    expect(calculateVendorTip(500, 0)).toBe(500)
  })

  it('returns full tip when platform fee tip is null', () => {
    expect(calculateVendorTip(500, null)).toBe(500)
  })

  it('returns 0 for null tip', () => {
    expect(calculateVendorTip(null, 12)).toBe(0)
  })

  it('returns 0 for zero tip', () => {
    expect(calculateVendorTip(0, 0)).toBe(0)
  })
})

describe('calculatePlatformFeeTip', () => {
  it('calculates platform fee tip for 10% on $18 order with 6.5% buyer fee', () => {
    // Base: $18.00 (1800 cents), displayed subtotal includes 6.5% fee
    // Customer sees $19.17 or $19.18, tips 10%
    // Total tip = 192 (10% of 1918 per-item rounded subtotal)
    // Vendor tip = round(1800 * 10/100) = 180
    // Platform fee tip = 192 - 180 = 12
    expect(calculatePlatformFeeTip(192, 1800, 10)).toBe(12)
  })

  it('calculates platform fee tip for 15% tip', () => {
    // Base: $18.00, 15% tip on displayed subtotal
    // Total tip = round(1918 * 15/100) = 288
    // Vendor tip = round(1800 * 15/100) = 270
    // Platform fee tip = 288 - 270 = 18
    expect(calculatePlatformFeeTip(288, 1800, 15)).toBe(18)
  })

  it('calculates platform fee tip for 20% tip', () => {
    // Base: $18.00, 20% tip
    // Total tip = round(1918 * 20/100) = 384
    // Vendor tip = round(1800 * 20/100) = 360
    // Platform fee tip = 384 - 360 = 24
    expect(calculatePlatformFeeTip(384, 1800, 20)).toBe(24)
  })

  it('returns 0 for zero tip', () => {
    expect(calculatePlatformFeeTip(0, 1800, 10)).toBe(0)
  })

  it('returns 0 for zero percentage', () => {
    expect(calculatePlatformFeeTip(180, 1800, 0)).toBe(0)
  })

  it('handles tip capped below vendor portion', () => {
    // If tip is capped at $50 but vendor portion would be $60
    // vendorTipCents = min(5000, round(100000 * 10/100)) = min(5000, 10000) = 5000
    // platformFeeTip = 5000 - 5000 = 0
    expect(calculatePlatformFeeTip(5000, 100000, 10)).toBe(0)
  })
})
