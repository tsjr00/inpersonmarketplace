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
  escapeHtml,
  sanitizeSubjectValue,
} from '../email-config'

// ── Audit item C5 (2026-09-12): HTML injection into platform-branded email ──
// Not browser XSS — mail clients do not run script — but a vendor-supplied name
// containing markup renders as live content in an organizer's inbox.
describe('escapeHtml', () => {
  it('neutralizes a link injected through a vendor business name', () => {
    const injected = '<a href="https://evil.example">Click to claim your refund</a>'
    const out = escapeHtml(injected)
    expect(out).not.toContain('<a')
    expect(out).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;')
  })

  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;')
  })

  it('escapes ampersands first so entities are not double-broken', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('renders null and undefined as an empty string, never "null"', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('sanitizeSubjectValue', () => {
  it('collapses CR/LF so a vendor name cannot forge a mail header', () => {
    expect(sanitizeSubjectValue('Farm\r\nBcc: victim@example.com')).toBe('Farm Bcc: victim@example.com')
  })

  it('does NOT escape markup — a subject is a header, not HTML', () => {
    expect(sanitizeSubjectValue('Bob & Sons <Farm>')).toBe('Bob & Sons <Farm>')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeSubjectValue('  Green Acres  ')).toBe('Green Acres')
  })
})

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
