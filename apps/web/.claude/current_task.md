# Current Task: Session 52 — Corporate Catering Phase 1 Build + Settlement Report

Started: 2026-03-07

## Session Summary So Far
- [x] Share menu overflow fix (`63c1ffb`) — PUSHED TO PROD
- [x] Help search widget + help page search (`d96e0ac`) — pushed to staging
- [x] Migration 069: 6 stale help articles (`6ffed30`) — pushed to staging
- [x] Migration 069 applied, schema/log updated (`c7607e3`) — pushed to staging
- [x] Schedule bug RESOLVED: migrations 039/040/047/066/067 applied to prod manually
- [x] Documentation commit (`327deae`) — pushed to staging
- [x] Corporate catering plan approved — persistent guide at `apps/web/.claude/corporate_catering_plan.md`
- [x] Corporate catering Phase 1 code COMPLETE — 8 commits (`74cdcd8` through `14fb5e0`)
- [x] All catering commits pushed to staging (`14fb5e0`)
- [x] Migrations 070 + 071 applied to ALL 3 environments (Dev, Staging, Prod)
- [x] Schema snapshot + migration log updated, files moved to applied/ (`2c9e4bb`)
- [x] Corporate catering plan updated with Phase 1.5 ticket system docs
- [x] Settlement report API + page — IN PROGRESS (see details below)

## Git State — UNCOMMITTED CHANGES
- Branch: main, 13 commits ahead of origin/main
- Staging synced through `14fb5e0`
- Latest commit: `2c9e4bb` — schema snapshot + migration log for 070+071
- **UNCOMMITTED WORK:**
  - NEW: `src/app/api/admin/catering/[id]/settlement/route.ts` — settlement report API
  - NEW: `src/app/[vertical]/admin/catering/[id]/settlement/page.tsx` — printable settlement report page
  - MODIFIED: `src/app/[vertical]/admin/catering/page.tsx` — added settlement report link in Event Market section
  - MODIFIED: `apps/web/.claude/corporate_catering_plan.md` — added Phase 1.5 ticket system docs
  - MODIFIED: `apps/web/.claude/current_task.md` — this file

## IMPORTANT: Schema Snapshot Structured Tables Are STALE
- Migration 070 added a NEW TABLE (`catering_requests`) and NEW COLUMNS on `markets` and `market_vendors`
- Changelog entries were added but structured column/FK/index tables have NOT been regenerated
- User needs to run `supabase/REFRESH_SCHEMA.sql` in SQL Editor and paste results so structured tables can be rebuilt

## Settlement Report — STATUS: Type-checks clean, needs final review

### What was built
1. **Settlement report API** — `src/app/api/admin/catering/[id]/settlement/route.ts`
   - GET route, admin auth + rate limiting
   - Fetches all order_items for the catering event market
   - Groups by vendor, calculates fees per payment method
   - Returns buyer fees, vendor fees, flat fees, net payouts, platform revenue, ticket reconciliation

2. **Settlement report page** — `src/app/[vertical]/admin/catering/[id]/settlement/page.tsx`
   - Printable layout with `@media print` CSS
   - CSV export using existing `exportToCSV` utility
   - Event header, summary cards, per-vendor order tables
   - Per-vendor financial breakdown showing buyer + vendor fees
   - Grand total settlement summary with platform revenue
   - Ticket reconciliation section
   - Booking fee fill-in line

3. **Admin catering page** — "Settlement Report" button added next to "View Event Market Page" link

### CRITICAL: Fee Structure by Payment Method
This was caught during review. The fee structure differs by payment type:

| | Card (Stripe) | External (cash/Venmo/ticket) |
|---|---|---|
| **Buyer fee %** | 6.5% of subtotal | 6.5% of subtotal |
| **Buyer flat fee** | $0.15/order | $0 |
| **Vendor fee %** | 6.5% of subtotal | 3.5% of subtotal |
| **Vendor flat fee** | $0.15/order | $0 |
| **Platform total** | 13% + $0.30/order | 10% + $0 |

**Source:** `src/lib/payments/vendor-fees.ts` line 15: `SELLER_FEE_PERCENT = 3.5`
**Source:** `src/lib/payments/vendor-fees.ts` line 14: `EXTERNAL_BUYER_FEE_FIXED_CENTS = 0`
**Source:** `src/lib/pricing.ts` lines 14-19: `FEES` object (6.5%/6.5%/$0.15/$0.15)

### How order_items stores fees (important for any future code reading these)
- **Stripe orders** (`checkout/session/route.ts` lines 497-511):
  - `platform_fee_cents` = COMBINED 13% (buyer 6.5% + vendor 6.5%) — NOT just vendor fee
  - `vendor_payout_cents` = subtotal - vendor 6.5% - prorated $0.15
- **External orders** (`checkout/external/route.ts` lines 254-263):
  - `platform_fee_cents` = buyer fee only (6.5%)
  - `vendor_payout_cents` = full subtotal (vendor gets everything; 3.5% tracked in vendor_fee_ledger)

### Settlement report fee calculation approach
All fees computed from `subtotal_cents` — does NOT read `platform_fee_cents` or `vendor_payout_cents` from DB to avoid misinterpretation of those overloaded fields:
- Buyer % fee: `subtotal * 6.5%` (same for both payment types)
- Buyer flat fee: `$0.15/order` for Stripe only, `$0` for external
- Vendor % fee: `subtotal * 6.5%` for Stripe, `subtotal * 3.5%` for external
- Vendor flat fee: `$0.15/order` for Stripe only, `$0` for external
- Net vendor payout: `gross - vendor % fee - vendor flat fee`
- Platform revenue: `buyer % + buyer flat + vendor % + vendor flat`

### Bugs caught and fixed during this work
1. **Wrong vendor fee %**: Initially used 6.5% for all orders. User caught that external = 3.5%. Source: `SELLER_FEE_PERCENT = 3.5` in `vendor-fees.ts`.
2. **`platform_fee_cents` misread**: For Stripe, `platform_fee_cents` = combined 13%, not vendor-only 6.5%. Would have shown inflated vendor fees.
3. **Double flat fee deduction**: Was reading `vendor_payout_cents` (already has flat fee baked in) AND subtracting flat fee again. Fixed by computing all values from subtotal.
4. **Missing buyer fees**: Report initially only showed vendor-side fees. User asked "where are the buyer fees?" — added buyer fee tracking for complete platform revenue picture.

### What still needs verification
- [ ] `npx tsc --noEmit` passes (confirmed clean)
- [ ] ESLint passes (not yet run on latest changes)
- [ ] User should review the settlement math with real numbers
- [ ] The page's vendor financial summary and grand total sections show both buyer + vendor fees — verify layout looks right

## Corporate Catering Phase 1 — COMPLETE (committed)

**Full plan:** `apps/web/.claude/corporate_catering_plan.md`

### All 10 Build Items Done

- [x] **1. Migration file** — `74cdcd8` — `catering_requests` table + new columns on `markets` and `market_vendors`
- [x] **2. Notification types** — `74cdcd8` — 3 types added to `src/lib/notifications/types.ts`
- [x] **3. Public catering request API** — `f158a64` — `src/app/api/catering-requests/route.ts`
- [x] **4. Public catering page** — `5e0e0b8` — `src/app/[vertical]/catering/page.tsx` + `CateringRequestForm.tsx`
- [x] **5. Admin catering API routes** — `69a8d73` — GET list + PATCH update/approve + POST invite
- [x] **6. Admin catering page** — `8f76631` — `src/app/[vertical]/admin/catering/page.tsx`
- [x] **7. Vendor respond API** — `69a8d73` — `src/app/api/vendor/catering/[marketId]/respond/route.ts`
- [x] **8. Vendor catering detail page** — `8f76631` — + GET route at `src/app/api/vendor/catering/[marketId]/route.ts`
- [x] **9. Modified files** — `8f76631` AdminNav + `20a4aa9` Header dropdown/mobile menu + Footer
- [x] **10. Help articles** — `14fb5e0` — Migration 071: 6 vendor catering help articles

### User Decision: Nav Placement
- User explicitly said: "do not add catering as a top level nav component. it can be a footer menu link and it can be an option under the drop down nav, but not on top."
- Implemented as: dropdown menu item + mobile menu item + footer link (NOT top-level nav bar)

### Remaining / Optional (not yet requested)
- Dashboard catering invitation card for vendors (query market_vendors for invited status)
- Market detail page headcount badge for catering events
- Schema snapshot structured tables need regeneration (REFRESH_SCHEMA.sql)
- Main still 13 commits ahead of origin/main (not pushed to prod yet)

### Catering Commits (chronological)
1. `74cdcd8` — Migration 070 + notification types
2. `f158a64` — Public catering request API route
3. `5e0e0b8` — Public catering page + form component
4. `69a8d73` — Admin + vendor API routes (4 routes)
5. `8f76631` — Admin page + vendor detail page + vendor GET route + AdminNav
6. `20a4aa9` — Header dropdown/mobile + footer nav links
7. `14fb5e0` — Migration 071: 6 vendor catering help articles
8. `2c9e4bb` — Schema snapshot + migration log for 070+071

## Lesson Reinforced This Session
**ALWAYS check actual code before making claims about fee structures, data formats, or calculations.** Three separate bugs were caught because I initially assumed instead of reading the source:
- `SELLER_FEE_PERCENT` (3.5% not 6.5%)
- `platform_fee_cents` meaning differs by payment method
- `vendor_payout_cents` already includes flat fee deduction for Stripe

The user's rule in CLAUDE.md is clear: "Never make assumptions when data is available." This session proved why.
