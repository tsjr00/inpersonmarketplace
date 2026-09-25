# Code Vault Manifest

## Current Vault
- **Branch:** `vault`
- **Commit:** `d704d3bb` — fix(browse): remove the dead PostGIS radius call (E0) — the commit PRODUCTION has run since 2026-09-13
- **Date vaulted:** 2026-09-24
- **Vaulted by:** Owner ("move the vault to the current Prod commit before we touch the refund paths" — tax Batch 3 ahead)
- **Tag:** `vault/prod-2026-09-13-pre-tax-batch3`
- **What this vault holds that the old one did not:** the whole 2026-04→09 money-path history — refund paths for
  buyer cancel / bundle cancel / vendor reject / resolve-issue / cron expiry / market-day cancellation / event
  cancellation, the sales-tax seam wired DARK into checkout (`lib/tax/*`, `TAX_STREAM1_ENABLED=false`), booth
  rentals + credits, bundles, VIP/offers, events. `git diff vault -- <money file>` is meaningful again for
  `payments.ts`, `webhooks.ts`, `pricing.ts`, the checkout routes and the refund routes.
- **Caveat:** Prod at `d704d3bb` is owed migrations 252→258 and ~40 commits (Staging is ahead); this vault is
  "last state a real user population ran on", not "everything verified on Staging".

## Previous Vault — kept, do not lose (owner 2026-09-24: "it was pretty stable")
- **Commit:** `7f895e5` — i18n: translate BackLink and ConfirmDialog defaults · vaulted 2026-03-16 · tag
  `vault/pre-session-59` (still present; `git checkout vault/pre-session-59 -- <file>` restores from it).
- What it was: the last good state before the Session-59 performance audit broke location search. Six months of
  verified-stable operation on the pre-tax, pre-booth-model, pre-bundles code. Its checkout/payments/webhooks are
  the SIMPLER money paths — a fallback reference if a later change to the refund paths needs a known-quiet
  baseline to compare against.

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
| `vault/pre-session-59` | `7f895e5` | 2026-03-16 | Initial vault. Last good state before perf audit broke location search. Kept as the "pretty stable" pre-tax baseline (owner 2026-09-24). |
| `vault/prod-2026-09-13-pre-tax-batch3` | `d704d3bb` | 2026-09-24 | Moved to the Prod commit before the tax refund-path build (Batch 3). Money files diff meaningfully again. |
