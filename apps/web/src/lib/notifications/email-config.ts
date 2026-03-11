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
/** Per-vertical logo paths (served from /public/logos/) */
const EMAIL_LOGOS: Record<string, string> = {
  farmers_market: '/logos/farmersmarketing-full-logo.png',
  food_trucks: '/logos/food-truckn-logo.png',
}

export function getEmailBranding(vertical?: string): {
  brandName: string
  brandDomain: string
  brandColor: string
  logoUrl: string
} {
  const v = vertical || 'farmers_market'
  const branding = defaultBranding[v]
  const domain = branding?.domain || 'farmersmarketing.app'
  return {
    brandName: branding?.brand_name || 'Farmers Marketing',
    brandDomain: domain,
    brandColor: branding?.colors?.primary || '#2d5016',
    logoUrl: `https://${domain}${EMAIL_LOGOS[v] || EMAIL_LOGOS.farmers_market}`,
  }
}
