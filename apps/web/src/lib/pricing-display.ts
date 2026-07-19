/**
 * Pricing Display Strings
 *
 * Human-readable price and tier text DERIVED from `SUBSCRIPTION_AMOUNTS`
 * (`lib/pricing.ts`), so customer-facing copy cannot drift from what the
 * platform actually charges.
 *
 * WHY THIS FILE EXISTS: prices were previously re-typed as prose in at least
 * four places. By 2026-07-18 three of them were wrong — including the vendor
 * service agreement, which quoted "$24.99/month" and "Basic ($10/month)" for
 * tiers that cost $25.00 and $0. Vendors were accepting a contract stating
 * prices the platform does not charge.
 *
 * RULE: never write a subscription price as a literal in UI, legal, or
 * marketing copy. Import from here. If you need a shape this file doesn't
 * expose, add it here rather than hardcoding at the call site.
 *
 * This module deliberately lives OUTSIDE pricing.ts: pricing.ts is a protected
 * critical-path file (change-discipline Rule 3), and display formatting has no
 * business sharing a change-approval gate with fee arithmetic.
 */

import { SUBSCRIPTION_AMOUNTS } from '@/lib/pricing'

/** Cents → "$25.00" / "$208.15". */
export function formatCentsUSD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** Cents → "$25" when whole dollars, else "$24.99". For prose, where a
 *  trailing ".00" reads as noise. */
export function formatCentsCompact(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : formatCentsUSD(cents)
}

/**
 * The paid vendor tiers, in ascending order.
 *
 * Tiers were unified across verticals: the legacy per-vertical names
 * (FM standard/premium/featured, FT basic/pro/boss) now alias these same
 * amounts, and `normalizeTier()` in vendor-limits.ts maps every legacy paid
 * name that no longer has a price onto `free`. So one list is correct for
 * both verticals — do not reintroduce per-vertical tier pricing text.
 */
export const PAID_VENDOR_TIERS = [
  { key: 'pro', label: 'Pro', monthlyCents: SUBSCRIPTION_AMOUNTS.pro_monthly_cents, annualCents: SUBSCRIPTION_AMOUNTS.pro_annual_cents },
  { key: 'boss', label: 'Boss', monthlyCents: SUBSCRIPTION_AMOUNTS.boss_monthly_cents, annualCents: SUBSCRIPTION_AMOUNTS.boss_annual_cents },
] as const

/** The lowest-priced paid tier — what a free vendor is upgraded *to*. */
export const ENTRY_PAID_TIER = PAID_VENDOR_TIERS[0]

/**
 * Vendor tier list for prose: "Free, Pro ($25/month), and Boss ($50/month)".
 * Used in the vendor service agreement and public marketing copy.
 */
export function vendorTiersSentence(period: 'month' | 'mo' = 'month'): string {
  const paid = PAID_VENDOR_TIERS.map((t) => `${t.label} (${formatCentsCompact(t.monthlyCents)}/${period})`)
  const all = ['Free', ...paid]
  return `${all.slice(0, -1).join(', ')}, and ${all[all.length - 1]}`
}

/** Short form for buttons/badges: "Pro — $25/mo". */
export function upgradeCallToAction(): string {
  return `${ENTRY_PAID_TIER.label} — ${formatCentsCompact(ENTRY_PAID_TIER.monthlyCents)}/mo`
}

/** Buyer premium monthly price, e.g. "$9.99". */
export function buyerPremiumMonthly(): string {
  return formatCentsUSD(SUBSCRIPTION_AMOUNTS.buyer_monthly_cents)
}
