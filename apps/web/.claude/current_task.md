# Current Task: Post-Demo Bug Fixes & UX Improvements (Session 40)
Started: 2026-02-20

## Goal
Implement 8 items from post-demo testing across 4 tiers: critical bugs, UX improvements, data quality, branding polish.

## Implementation Order
1. **B1** — ConfirmDialog (replaces browser popups) — CRITICAL
2. **U1** — Buyer order status feedback
3. **U2** — Vendor profile address + events
4. **B2** — Seed data Stripe gate fix
5. **U3** — Markets page layout + filter
6. **D1** — Lat/lng in market suggestions
7. **D2** — Input validation utilities
8. **P1** — PickupScheduleGrid branding

## What's Been Completed
- [x] B1: ConfirmDialog component — replaced 5 browser popups across 3 files
- [x] U1: Buyer status feedback — success page info card + order detail status banner
- [x] U2: Profile addresses + events — full address links + event date range display
- [x] B2: Seed data fix — FT + FM seed vendors get stripe_payouts_enabled=true
- [x] U3: Markets page layout — events below filters + location type dropdown
- [x] D1: Lat/lng suggestions — optional fields in vendor form + API accept
- [x] D2: Input validation — validation.ts + applied to vendor/admin market forms
- [x] P1: Availability branding — all hardcoded colors → design tokens

## Files Created
- `src/components/shared/ConfirmDialog.tsx` — reusable inline modal dialog
- `src/lib/validation.ts` — zip, phone, state validation + formatting

## Files Modified
- `src/app/[vertical]/vendor/orders/page.tsx` — 3 confirm() → ConfirmDialog
- `src/components/vendor/OrderCard.tsx` — prompt() → ConfirmDialog w/ input
- `src/app/[vertical]/vendor/listings/[listingId]/DeleteListingButton.tsx` — confirm()+alert() → ConfirmDialog+Toast
- `src/app/[vertical]/checkout/success/page.tsx` — FT expectation info card
- `src/app/[vertical]/buyer/orders/[id]/page.tsx` — status info banner
- `src/components/vendor/PickupScheduleGrid.tsx` — events section + design tokens
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — include events in availability filter
- `src/app/[vertical]/markets/page.tsx` — events below filters + type filter support
- `src/app/[vertical]/markets/MarketFilters.tsx` — location type dropdown
- `src/app/[vertical]/vendor/markets/page.tsx` — lat/lng fields + input validation
- `src/app/api/vendor/markets/suggest/route.ts` — accept lat/lng
- `src/app/[vertical]/admin/markets/page.tsx` — input validation on forms
- `supabase/migrations/FT_SEED_PART_A.sql` — stripe gate for FT seed vendors
- `supabase/migrations/STAGING_SEED_DATA.sql` — stripe gate for FM seed vendors

## Status: ALL 8 ITEMS COMPLETE — TSC clean, 34 tests pass. Ready to commit.
