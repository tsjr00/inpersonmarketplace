/**
 * Email Configuration Tests
 *
 * Tests pure functions extracted from notifications service.
 * Covers: IR-R29 (per-vertical email domain)
 *
 * Run: npx vitest run src/lib/notifications/__tests__/email-config.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  VERIFIED_EMAIL_DOMAINS,
  getEmailFromAddress,
  getEmailBranding,
} from '../email-config'

describe('Email Configuration', () => {
  // ── VERIFIED_EMAIL_DOMAINS ─────────────────────────────────────
  it('FM uses farmersmarketing.app domain', () => {
    expect(VERIFIED_EMAIL_DOMAINS.farmers_market).toBe('updates@mail.farmersmarketing.app')
  })

  it('FT uses foodtruckn.app domain', () => {
    expect(VERIFIED_EMAIL_DOMAINS.food_trucks).toBe('updates@mail.foodtruckn.app')
  })

  it('FW falls back to FM domain (not yet verified)', () => {
    expect(VERIFIED_EMAIL_DOMAINS.fire_works).toBe('updates@mail.farmersmarketing.app')
  })

  // ── getEmailFromAddress ────────────────────────────────────────
  it('FM → updates@mail.farmersmarketing.app', () => {
    expect(getEmailFromAddress('farmers_market')).toBe('updates@mail.farmersmarketing.app')
  })

  it('FT → updates@mail.foodtruckn.app', () => {
    expect(getEmailFromAddress('food_trucks')).toBe('updates@mail.foodtruckn.app')
  })

  it('undefined → falls back to FM', () => {
    expect(getEmailFromAddress()).toBe('updates@mail.farmersmarketing.app')
  })

  it('unknown vertical → falls back to FM', () => {
    expect(getEmailFromAddress('something_else')).toBe('updates@mail.farmersmarketing.app')
  })

  // ── getEmailBranding ───────────────────────────────────────────
  it('FM branding → green primary, "Farmers Marketing"', () => {
    const b = getEmailBranding('farmers_market')
    expect(b.brandName).toBe('Farmers Marketing')
    expect(b.brandDomain).toBe('farmersmarketing.app')
    expect(b.brandColor).toBe('#2d5016')
  })

  it('FT branding → red primary, "Food Truck\'n"', () => {
    const b = getEmailBranding('food_trucks')
    expect(b.brandName).toBe("Food Truck'n")
    expect(b.brandDomain).toBe('foodtruckn.app')
    expect(b.brandColor).toBe('#ff5757')
  })

  it('undefined vertical → FM fallback', () => {
    const b = getEmailBranding()
    expect(b.brandName).toBe('Farmers Marketing')
  })
})
