# Code Vault Manifest

## Current Vault
- **Branch:** `vault`
- **Commit:** `7f895e5` — i18n: translate BackLink and ConfirmDialog defaults
- **Date vaulted:** 2026-03-16
- **Vaulted by:** User (pre-Session 59, before performance audit)
- **Tag:** `vault/pre-session-59`

## What the Vault Is

The vault branch is a snapshot of the last user-verified working state of the codebase. It is the "known good" baseline. When code breaks, restore from vault instead of guessing at fixes.

## Vault Update Rules

1. **Only the user can authorize a vault update.** Claude never moves the vault branch.
2. Vault is updated AFTER staging or production verification — never after just committing.
3. When updating: `git branch -f vault <commit>` + `git tag vault/<label> <commit>` + update this manifest.

## Vaulted Systems

These systems were confirmed working at the vault commit. Before modifying any of these, Claude MUST run `git diff vault -- <file>` to understand the working version.

| System | Key Files | Status at Vault |
|--------|-----------|-----------------|
| **Location Search** | `src/app/[vertical]/browse/page.tsx`, `src/app/[vertical]/browse/BrowseLocationPrompt.tsx`, `src/components/location/LocationEntry.tsx`, `src/components/location/LocationSearchInline.tsx`, `src/app/api/buyer/location/route.ts`, `src/app/api/buyer/location/geocode/route.ts`, `src/lib/location/server.ts`, `src/lib/geocode.ts` | Working — cookie-based filtering, Haversine distance, radius pills |
| **Checkout Flow** | `src/app/[vertical]/checkout/page.tsx`, `src/app/[vertical]/checkout/success/`, `src/app/api/checkout/route.ts`, `src/lib/pricing.ts` | Working — Stripe Connect, per-item rounding, tip calculation |
| **Payments & Payouts** | `src/lib/stripe/payments.ts`, `src/lib/stripe/webhooks.ts`, `src/app/api/vendor/payouts/`, `src/app/[vertical]/vendor/pickup/page.tsx` | Working — vendor payouts, market box payouts, Phase 5 retry |
| **Notification System** | `src/lib/notifications/service.ts`, `src/lib/notifications/types.ts`, `src/lib/notifications/templates/` | Working — 4-channel (in-app, push, SMS, email) |
| **Vendor Onboarding** | `src/app/[vertical]/vendor/onboarding/`, `src/app/api/vendor/onboarding/` | Working — 3-gate system |
| **Vendor Trial System** | `src/app/api/vendor/trial/`, `src/components/vendor/TrialStatusBanner.tsx` | Working — 90-day trial, cron Phase 10 |
| **i18n / Translations** | `src/lib/i18n/`, `src/messages/` | Working — Spanish translations, locale cookie |
| **Landing Pages** | `src/components/landing/`, `src/app/[vertical]/page.tsx` | Working — per-vertical branding, Hero, LocationEntry |
| **Dashboard** | `src/app/[vertical]/dashboard/page.tsx`, `src/app/[vertical]/vendor/dashboard/page.tsx` | Working — buyer + vendor dashboards |
| **Admin** | `src/app/admin/`, `src/lib/auth/admin.ts` | Working — quality checks, reports, vendor management |

## Vault History

| Tag | Commit | Date | Note |
|-----|--------|------|------|
| `vault/pre-session-59` | `7f895e5` | 2026-03-16 | Initial vault. Last good state before perf audit broke location search. |
