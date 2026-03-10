/**
 * Email Configuration — Per-Vertical Domains + Branding
 *
 * Extracted from: src/lib/notifications/service.ts (lines 175-186)
 * Purpose: Map verticals to verified email FROM addresses and branding
 * for outbound notification emails.
 *
 * Pure functions — no Resend, no side effects.
 */

import { defaultBranding } from '@/lib/branding/defaults'

/** Verified email domains — each requires Resend DNS verification on mail. subdomain */
export const VERIFIED_EMAIL_DOMAINS: Record<string, string> = {
  farmers_market: 'updates@mail.farmersmarketing.app',
  food_trucks: 'updates@mail.foodtruckn.app',
  fire_works: 'updates@mail.farmersmarketing.app', // Not yet verified — uses FM fallback
}

const FALLBACK_FROM = 'updates@mail.farmersmarketing.app'

/**
 * Get the email FROM address for a vertical.
 * Falls back to FM address for unknown verticals.
 */
export function getEmailFromAddress(vertical?: string): string {
  return VERIFIED_EMAIL_DOMAINS[vertical || 'farmers_market'] || FALLBACK_FROM
}

/**
 * Get email branding (name, domain, primary color) for a vertical.
 * Falls back to FM branding for unknown verticals.
 */
export function getEmailBranding(vertical?: string): {
  brandName: string
  brandDomain: string
  brandColor: string
} {
  const branding = defaultBranding[vertical || 'farmers_market']
  return {
    brandName: branding?.brand_name || 'Farmers Marketing',
    brandDomain: branding?.domain || 'farmersmarketing.app',
    brandColor: branding?.colors?.primary || '#2d5016',
  }
}
