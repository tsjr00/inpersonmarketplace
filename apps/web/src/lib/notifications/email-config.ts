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

/**
 * Escape a value before interpolating it into an HTML email body.
 *
 * WHY (audit item C5, 2026-09-12): three outbound templates interpolated
 * vendor- and organizer-supplied text straight into HTML — the event-results
 * email (`cron/expire-orders`), the vendor→organizer message relay
 * (`vendor/events/[marketId]/message`) and the event confirmation
 * (`events/[token]/select`). Mail clients do not run script, so this is not
 * browser XSS; it is HTML injection into a platform-branded email. A vendor
 * whose business name is `<a href="...">Click to claim your refund</a>` gets a
 * live link rendered inside a message the organizer believes came from us.
 *
 * Six private copies of this function already exist in individual routes. They
 * are left alone deliberately — they work, and rewriting them would be churn.
 * New sites use this one.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Sanitize a value destined for an email SUBJECT line.
 *
 * Subjects are headers, not markup: the risk is a CR or LF turning one header
 * into two (header injection). Escaping is pointless there and would show raw
 * entities to the reader, so collapse line breaks to spaces instead.
 */
export function sanitizeSubjectValue(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

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
