# Session 31 Codebase Audit Findings

Date: 2026-02-18

## Context
User requested a thorough codebase review to identify incomplete features from context loss across prior sessions, conflicts, and opportunities. Two deep exploration agents were run covering the FT tier system completeness and broader incomplete features.

---

## STALE DOCUMENTATION (Fixed This Session)
- `current_task.md` said tipping Steps 4-5 were remaining — ALL DONE in code
- MEMORY.md said FT tier system Steps 7-9 incomplete — ALL DONE in code
- MEMORY.md said "14+ uncommitted files" — all were committed in prior session

---

## BUGS FIXED THIS SESSION

### Bug 1: QUANTITY_UNITS Filter (FIXED — commit a3f986c)
- **File**: `ListingForm.tsx:699`
- **Issue**: FM-only units (bag, bunch, bouquet) showed for FT vendors
- **Fix**: Removed `|| u.verticals.includes('farmers_market')` fallback

### Bug 2: Cart Pickup Time Missing (FIXED — commit a3f986c)
- **Files**: `api/cart/route.ts`, `useCart.tsx`
- **Issue**: `preferred_pickup_time` not returned in cart GET response
- **Fix**: Added field to response object and CartItem interface

### Bug 3: FT Subscription Renewal (FIXED — commit a3f986c)
- **File**: `src/lib/stripe/webhooks.ts:448`
- **Issue**: `handleInvoicePaymentSucceeded` only handled `'vendor'`, not `'food_truck_vendor'`
- **Fix**: Added `|| subscriptionType === 'food_truck_vendor'` to the vendor branch

### Bug 4: FT Cutoff Hours + Same-Day Ordering (FIXED — commit 6cbec96)
- **Files**: 10 files (migration + 9 TypeScript files)
- **Issue**: FT markets used 18/10hr cutoff defaults, markets disappeared once started, no same-day flow
- **Fix**: Migration 030 + vertical-aware cutoff logic + FT location picker UI

---

## REMAINING BUGS / INCOMPLETE FEATURES (NOT YET FIXED)

### HIGH PRIORITY — Blocks FT Launch

#### 1. Chef Boxes Not Implemented
- **Impact**: Session 28 decided on 5 Chef Box types (Weekly Dinner, Family Kit, Mystery Box, Meal Prep, Office Lunch) but only terminology mapping exists (`market_box` → "Meal Plan")
- **Current state**: Market box pages work for FT using terminology system, but no distinct Chef Box types or category UI
- **Files affected**: Market box creation/edit pages, potentially new data structure
- **Decision needed**: Is this needed for FT launch or can it wait?

#### 2. Vendor Signup Has No FT-Specific Flow
- **File**: `src/app/[vertical]/vendor-signup/page.tsx`
- **Impact**: Signup form uses generic language, doesn't reference food_trucks at all
- **Current state**: FT vendors go through same signup as FM vendors
- **Decision needed**: Does FT signup need different fields/language?

### MEDIUM PRIORITY — Should Fix Before Launch

#### 3. ShopperFeedbackForm Hardcoded FM Text
- **File**: `src/components/buyer/ShopperFeedbackForm.tsx`
- **Lines**: 18, 212, 304
- **Issue**: "Tell us about a farmers market you shop at..." shown to FT buyers
- **Fix**: Use `term()` or vertical-aware text

#### 4. Email Template Hardcoded Brand Color
- **File**: `src/lib/notifications/service.ts:214`
- **Issue**: `#166534` (FM green) hardcoded in HTML email template. CSS vars don't work in email.
- **Fix**: Pass brand color from vertical config into email template

#### 5. Analytics Export CSV is a Stub
- **File**: `src/app/[vertical]/vendor/analytics/page.tsx:271-274`
- **Issue**: Boss-tier export button shows `alert('Export feature coming soon!')`
- **Impact**: FT Boss vendors pay $50/mo and see a stub button

#### 6. Vendor Signup File Upload Placeholder
- **File**: `src/app/[vertical]/vendor-signup/page.tsx:714`
- **Issue**: "(File upload coming soon - filename recorded only)" — filenames recorded but no actual file upload
- **Impact**: FT requires food handler permit + health dept license uploads

### LOW PRIORITY — Known Issues

#### 7. Notification Channel Gating — Push Not Tier-Gated
- **File**: `src/lib/notifications/service.ts:409-429`
- **Issue**: Push notifications allowed for all FT tiers (Basic/Pro/Boss). MEMORY.md said "Pro=+push, Boss=+push+email+SMS" but code gives push to all. This may be intentional (push is free).
- **Decision needed**: Is current behavior correct?

#### 8. Food Truck Icon
- **Status**: User wants proper SVG, not delivery truck emoji. Options not yet presented.

#### 9. URL Rewrite
- **Issue**: Redundant `/farmers_market/` in URLs on single-vertical domains
- **Fix**: Next.js middleware to determine vertical from domain instead of URL path

#### 10. Production DB Empty
- No users, vendors, listings, or orders in production

---

## ARCHITECTURE CONCERNS (From Initial Review)

### Fee Constants Duplicated
- `STRIPE_CONFIG` in `stripe/config.ts` and `FEES` in `pricing.ts` define the same fee values independently
- Risk: desync if one is updated without the other
- Recommendation: Have `STRIPE_CONFIG` import from `pricing.ts`

### `force-dynamic` on Many Routes
- Audit item H1: `export const dynamic = 'force-dynamic'` kills Next.js caching
- Many routes have this unnecessarily
- Impact: Every page load hits the server, no edge caching

### Soft Delete Not Filtered Everywhere
- Audit item H5: `deleted_at` column exists on some tables but not all queries filter `WHERE deleted_at IS NULL`

### No Stripe Transfer Retry
- Audit item H3: If a Stripe transfer fails after DB status update, there's no retry mechanism
- Orphaned fulfillment prevention exists (catch block reverts status) but no retry queue

### Payout Status Enum Gap
- `skipped_dev` and `pending_stripe_setup` payout statuses used in code but NOT in `payout_status` DB enum

---

## GIT STATUS
- **main** is 6 commits ahead of **origin/main** (production)
- **staging** is fully synced with main
- Recent commits on main (newest first):
  - `6cbec96` FT same-day ordering flow
  - `a3f986c` Fix 3 bugs
  - `f5fbf17` Tipping
  - `14b336f` Pickup time slots
  - `bd54bbe` Migration 027
  - `8956bdb` FT 3-tier subscription
- Migration 030 applied to all 3 envs, file needs moving to applied/

---

## IMMEDIATE NEXT STEPS
1. Move migration 030 to applied/ folder
2. Commit schema snapshot + migration log updates
3. User tests staging
4. Push to production when staging verified
5. Address audit items in priority order
