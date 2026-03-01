# Current Task: Tier Restructure — FM Free Tier + Updated Limits
Started: 2026-02-28

## Goal
1. Add FM "free" tier (below current "standard")
2. Update all tier limits for both verticals to match user's new structure
3. Enable FM trial system (same mechanism as FT, already built)

## Status: ALL 6 PHASES COMPLETE + BUSINESS RULES AUDIT DONE — 3 audit fixes applied

## Implementation Summary (ALL COMPLETE)

### Phase 1: Type System + Limit Values — DONE
- `src/lib/vendor-limits.ts` — Added `'free'` to `VendorTier` type, FM free tier limits, updated all FM/FT values
- `src/lib/constants.ts` — Added `free` to `TIER_BADGES`

### Phase 2: Migration 061 — DONE
- `supabase/migrations/20260228_061_fm_free_tier.sql` — Updated `enforce_listing_tier_limit()` with FM free limits, renamed trigger to `set_default_vendor_tier()`

### Phase 3: Backend API Changes — DONE
- Approval route: Both verticals get trial (FM→standard, FT→basic, 90 days)
- Webhooks: Both verticals downgrade to 'free'
- Cron: Phase 8 → 'free', Phase 10c uses `getTierLimits('free', vertical)` for vertical-aware limits
- downgrade-free: Supports both verticals
- vendor/tier/downgrade: Lowest tier check = 'free'

### Phase 4: Fallback Changes — DONE
- ~40 occurrences of `|| 'standard'` → `|| 'free'` across 28+ files
- Exception: `buyer_tier || 'standard'` unchanged (correct)
- Fixed `isFT` undefined variable in dashboard page (→ `vertical === 'food_trucks'`)

### Phase 5: UI Updates — DONE
- FM upgrade page: Complete rewrite to 4-tier (free/standard/premium/featured)
- VendorTierManager: FM shows 4 tiers, FT fallback fixed
- Browse page: 'free' in tier badge exclusion
- Admin tables: 'free' option added to tier dropdowns

### Phase 6: Stripe Configuration — DONE
- `pricing.ts` — Added `fm_standard_monthly_cents: 999`
- `stripe/config.ts` — Added `fm_vendor.standard_monthly` price, `getFmPriceConfig()` helper
- `checkout/route.ts` — FM tier-based pricing, tier-specific duplicate check, existing sub cancellation

### Business Rules Audit — DONE (3 issues found + fixed)

**Audit Results (38 checks across 3 parallel agents):**

| Domain | Checks | Pass | Fail | Fixed |
|--------|--------|------|------|-------|
| VJ-R3/R4 (tier limits match) | 10 | 8 | 2 | 2 ✅ |
| Checkout + Downgrade + Trial | 14 | 14 | 0 | — |
| Cron + Fallbacks + UI | 14 | 13 | 1 | 1 ✅ |
| **TOTAL** | **38** | **35** | **3** | **3 ✅** |

**3 Issues Found & Fixed:**

1. **CRITICAL — Migration 061 status regression**: Used `'active'` instead of `'published'` for listing status check (3 occurrences). Migration 052 (currently deployed) uses `'published'`. Without this fix, applying migration 061 would have **silently disabled** DB-level tier enforcement.
   - **FIX**: Replaced all 3 `'active'` → `'published'` in migration 061

2. **MEDIUM — getTierLimits() FM fallback**: `vendor-limits.ts` line 190 fell back to `TIER_LIMITS.standard` for unknown FM tiers. DB trigger defaults to free (5 listings) but code gave standard (10 listings).
   - **FIX**: Changed `TIER_LIMITS.standard` → `TIER_LIMITS.free` at line 190

3. **LOW — Admin users table missing tiers**: `[vertical]/admin/users/UsersTableClient.tsx` vendor tier dropdown only had standard/premium, missing free/featured.
   - **FIX**: Added `free` and `featured` options to dropdown

### TypeScript: 0 errors (verified after Phase 6, need to re-verify after audit fixes)

## WHAT STILL NEEDS TO BE DONE
1. **Re-run TypeScript check** (`npx tsc --noEmit`) after audit fixes
2. **Update business_rules_audit_and_testing.md** — Update rule VI-R12, VJ-R4, VJ-R6 with new tier values
3. **Ready for commit** after TSC passes

## Files Modified (comprehensive list)
- `src/lib/vendor-limits.ts` — Type + limits + fallback fix
- `src/lib/constants.ts` — TIER_BADGES
- `src/lib/pricing.ts` — fm_standard_monthly_cents
- `src/lib/stripe/config.ts` — fm_vendor price + getFmPriceConfig()
- `supabase/migrations/20260228_061_fm_free_tier.sql` (NEW) — trigger + limits + status fix
- `src/app/api/admin/vendors/[id]/approve/route.ts` — trial both verticals
- `src/lib/stripe/webhooks.ts` — downgrade to 'free'
- `src/app/api/cron/expire-orders/route.ts` — Phase 8/10 changes
- `src/app/api/vendor/subscription/downgrade-free/route.ts` — both verticals
- `src/app/api/vendor/tier/downgrade/route.ts` — lowest = 'free'
- `src/app/api/subscriptions/checkout/route.ts` — FM tier pricing + same-tier check + sub cancel
- `src/app/[vertical]/vendor/dashboard/upgrade/page.tsx` — FM 4-tier rewrite
- `src/app/[vertical]/settings/VendorTierManager.tsx` — FM 4 tiers, FT fallback
- `src/app/[vertical]/browse/page.tsx` — badge exclusion
- `src/app/[vertical]/dashboard/page.tsx` — upgrade prompt + isFT fix
- `src/app/[vertical]/vendor/listings/new/page.tsx` — free tier message
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — image limits
- `src/app/[vertical]/vendor-signup/page.tsx` — market limit message
- `src/app/api/vendor/markets/route.ts` — window limit error
- `src/app/api/vendor/markets/[id]/route.ts` — window limit error
- `src/app/[vertical]/admin/users/UsersTableClient.tsx` — tier dropdown fix
- ~24 additional files with `|| 'standard'` → `|| 'free'` fallback changes
- 4 admin table files with `<option value="free">Free</option>` added

## User Action Required (after commit)
- Create FM Standard Price in Stripe Dashboard ($9.99/mo recurring)
- Set `STRIPE_FM_STANDARD_MONTHLY_PRICE_ID` env var in all environments
- Apply migration 061 to Dev, Staging, and Prod

## Key Decisions
- FM Standard pricing: $9.99/mo (user chose)
- Existing FM vendors: Grandfathered at standard (no data migration)
- defaultSubscribersPerOffering = maxSubscribersPerOffering for all tiers
- FM featured uses same Stripe price as premium ($24.99/mo)
- Both verticals now share 'free' as the lowest/default tier

## Business Rules That Need Updating in Audit Doc
- **VI-R12**: FM tiers now `free/standard/premium/featured` (was `standard/premium/featured`)
- **VJ-R4**: FM tier limits table needs updating to new values
- **VJ-R6**: FM default tier is now 'free' (was 'standard'), trigger renamed to `set_default_vendor_tier()`
- **VJ-R8**: FM market limits: free=1, standard=2, premium=3, featured=5

## Open Items (Carried Over)
- Instagram URLs still placeholder `#` in Coming Soon footers
- Events Phase 5 (reminders + conversion) — deferred
- Dev DB may be out of sync on some migrations
- Migrations 057+058 schema snapshot update still needed
- Business rules audit: user still working through remaining domains
