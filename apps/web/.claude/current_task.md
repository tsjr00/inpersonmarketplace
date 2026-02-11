# Current Task: Marketing & Organic Growth Features (Session 16)
Started: 2026-02-10

## Status: All 4 Phases COMPLETE, TypeScript check in progress

## What Was Built

### Phase 1: ShareButton Integration — COMPLETE
- Added ShareButton to vendor profile, listing detail, and market box detail pages
- Files modified: `[vertical]/vendor/[vendorId]/profile/page.tsx`, `[vertical]/listing/[listingId]/page.tsx`, `[vertical]/market-box/[id]/MarketBoxDetailClient.tsx`

### Phase 2: JSON-LD Structured Data — COMPLETE
- New file: `src/lib/marketing/json-ld.ts` — 3 generators (vendorProfileJsonLd, listingJsonLd, marketBoxJsonLd)
- Added script tags to vendor profile, listing, and market box pages
- Market box page made async to fetch data for JSON-LD (Next.js deduplicates query)

### Phase 3: Post-Purchase Share + Google Review — COMPLETE
- New file: `src/components/marketing/PostPurchaseSharePrompt.tsx` — modal after pickup confirmation
- Added `vendor_profile_id` to order API response
- Added share prompt trigger to `handleConfirmPickup` in order detail page
- Added Google review prompt to `RateOrderCard` — shows after 4-5 star rating when NEXT_PUBLIC_GOOGLE_PLACE_ID is set
- Files modified: `api/buyer/orders/[id]/route.ts`, `[vertical]/buyer/orders/[id]/page.tsx`, `components/buyer/RateOrderCard.tsx`

### Phase 4: Social Proof Activity Toast — COMPLETE
- New migration: `supabase/migrations/20260210_013_public_activity_events.sql`
- New file: `src/lib/marketing/activity-events.ts` — event logger (service client, never throws)
- New file: `src/app/api/marketing/activity-feed/route.ts` — public GET, 60s cache
- New file: `src/components/marketing/SocialProofToast.tsx` — bottom-left rotating toast
- Added event logging: checkout success (purchase + sold_out), vendor verify (new_vendor)
- Added SocialProofToast to browse page
- Note: `new_listing` event deferred (PublishButton is client-side, would need new API route)

## Files Created (NEW)
- `src/lib/marketing/json-ld.ts`
- `src/components/marketing/PostPurchaseSharePrompt.tsx`
- `src/components/marketing/SocialProofToast.tsx`
- `src/lib/marketing/activity-events.ts`
- `src/app/api/marketing/activity-feed/route.ts`
- `supabase/migrations/20260210_013_public_activity_events.sql`

## Files Modified
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — ShareButton + JSON-LD
- `src/app/[vertical]/listing/[listingId]/page.tsx` — ShareButton + JSON-LD
- `src/app/[vertical]/market-box/[id]/MarketBoxDetailClient.tsx` — ShareButton
- `src/app/[vertical]/market-box/[id]/page.tsx` — JSON-LD + async page
- `src/app/[vertical]/buyer/orders/[id]/page.tsx` — PostPurchaseSharePrompt
- `src/app/[vertical]/browse/page.tsx` — SocialProofToast
- `src/app/api/buyer/orders/[id]/route.ts` — vendor_profile_id
- `src/app/api/checkout/success/route.ts` — activity event logging
- `src/app/api/admin/vendors/[id]/verify/route.ts` — activity event logging
- `src/components/buyer/RateOrderCard.tsx` — Google review prompt

## Environment Variables Needed
- `NEXT_PUBLIC_GOOGLE_PLACE_ID` — Optional. When set, shows Google review prompt after 4-5 star ratings.

## Migration Pending
- `20260210_013_public_activity_events.sql` — NOT applied to any DB yet

## What's Left
1. Run `npx tsc --noEmit` — fix any errors
2. Commit all changes
3. Push to staging
4. User applies migration 013 to Dev and Staging
