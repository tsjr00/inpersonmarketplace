# Session 62 — Independent Audit, Bug Fixes, External Payment Safety Net, Event System, Stripe Live Prep

**Date:** 2026-03-20 to 2026-03-21
**Commits:** 42 (all on main, pushed to staging)
**Production push:** Not done — 42 commits awaiting user verification
**Migrations applied:** 085a, 085b, 093, 094, 095 (all 3 environments)
**Data fixes:** 2 one-time SQL cleanups + zip_codes seed (all 3 environments)
**Tests added:** 24 (T-7 external fee flow)

---

## Session Overview

This session started with a comprehensive independent audit of the entire codebase (58 findings), progressed into fixing 20+ bugs, building the external payment safety net feature, completing Event Phases 1/3/4, syncing Production DB with Staging, preparing Stripe for live mode with per-vertical pricing, and fixing several UX issues discovered during testing.

---

## 1. Independent Codebase Audit

### Method
Systematic section-by-section deep dive using parallel exploration agents across 10 areas: auth, pricing, checkout/Stripe, order lifecycle, notifications, cron, vendor onboarding, events, market boxes, browse/location/cart. No prior audit reports referenced.

### Key Findings (58 total)
- 6 critical (financial), 5 high (functional), 15 medium (edge cases)
- 10 missing business rules, 14 test coverage gaps, 4 high-value opportunities

### Report
`apps/web/.claude/session62_comprehensive_audit.md` — full report with per-finding status tracking.

### What Changed After Discussion
Several findings were reclassified after investigation with user:
- E-1/E-2 (external payment fees): NOT A BUG — fees deferred by design, documented in decisions.md
- E-23 (tip split): NOT A BUG — confirmed working as designed
- E-26 (FT doc validation): NOT A BUG — validation is correct
- E-6 (market box missed pickup): ACCEPTED — desired behavior (prepaid commitment)

---

## 2. Financial & Order Lifecycle Fixes

### Refund Math (E-3)
**Problem:** `resolve-issue` route refunded `subtotal_cents` only. Buyer paid subtotal + 6.5% + prorated $0.15 but only got base price back.
**Fix:** Now calculates `subtotal + buyerPercentFee + proratedFlatFee`, matching the reject route. Platform absorbs Stripe processing fee on refunds.
**Decision logged:** Refund formula documented in decisions.md.

### Active Orders Count
**Problem:** Dashboard showed wrong active order count. Root causes:
1. `atomic_complete_order_if_ready()` was broken since migration 011 (boolean/integer type mismatch — function never successfully completed an order)
2. Cancel paths didn't always update order-level status when all items cancelled
**Fix:** Migration 093 adds `trg_auto_cancel_order` trigger as safety net. Resolve-issue route now checks remaining items. One-time SQL cleanup fixed existing stuck orders.

### Admin Approval Tier Names (E-5)
**Problem:** Set `tier = 'basic'`/'standard' (legacy) instead of unified 'free'.
**Fix:** Now sets 'free' for all verticals.

### Inventory Restore (E-13)
**Problem:** Unconditionally restored inventory on refund regardless of vertical or status.
**Fix:** FT fulfilled items no longer restore (cooked food can't be resold). FM items and non-fulfilled items still restore.
**Decision logged.**

---

## 3. External Payment Safety Net (New Feature)

### Problem
Buyer places Venmo/CashApp/PayPal order but payment fails (insufficient funds, app issue). No clean way to exit. Vendor can reject but it hurts their score.

### Solution
**Buyer side:**
- Penalty-free cancel button on order list + detail page for pending external payment orders
- ConfirmDialog before cancel — `cancelled_by: 'system'` (doesn't affect vendor metrics)

**Vendor side:**
- "Payment Not Received" button — notifies buyer to send payment or cancel
- "Cancel for Non-Payment" button — cancels with no vendor score impact

**New API routes:** `payment-not-received`, `cancel-nonpayment`
**New notification types:** `external_payment_not_received`, `order_cancelled_nonpayment`
**External checkout now sends buyer notification** with payment method in title.

### How It Works
- `cancel-nonpayment/route.ts` sets `cancelled_by: 'system'` (not 'vendor') so vendor score is unaffected
- Updates order-level status to 'cancelled' (prevents phantom active orders)
- Restores inventory for all items
- Buyer sees disclaimer about external payment refunds at checkout and on issue reports

### Protected Architecture
The external payment fee flow is documented in decisions.md with all 5 coordinating files listed. T-7 test (24 tests) protects the fee constants and calculations.

---

## 4. Notification System Improvements

### Deep-linking
All buyer-facing order notifications now link to the specific order detail page (`/buyer/orders/{orderId}`) instead of generic orders list. Updated 12 call sites.

### i18n Completion
All 36+ notification titles converted from hardcoded English to `t('notif.xxx_title', locale)` with both EN and ES translations. Zero hardcoded titles remain.

### New Notification Types (5)
- `external_payment_not_received`, `order_cancelled_nonpayment`
- `order_expired_vendor` — vendor notified when their order expires
- `event_prep_reminder` — 24h before event
- `event_settlement_summary` — settlement complete

### Pickup Instructions
- `order_ready` and `order_confirmed` notifications include handoff instructions
- "Show your order screen to vendor, both confirm the handoff"

---

## 5. Event System — Phases 1, 3, 4

### Phase 1: Per-Event Vendor Menus
- **Migration 094:** `event_vendor_listings` table
- Vendor accept flow requires selecting 1-5 catering-eligible menu items
- Event detail page shows vendor's event-specific menu
- Lifecycle statuses: `approved → ready → active → review → completed`
- Admin has transition buttons for each status

### Phase 3: Post-Event
- Attendee feedback form on event page during active/review status
- Vendor prep reminder 24h before event (cron Phase 11)
- Settlement notification to vendors when event completed

### Phase 4: Vendor Revenue Visibility
- Revenue estimate on vendor invitation page
- Admin event detail shows vendor menu selections + copy event link

### Event Page Ordering
- "Pre-Orders Open" banner when status is ready/active
- Menu items become tappable links to listing detail page
- Status labels: "Upcoming Event" / "Pre-Orders Open" / "Past Event"

---

## 6. Production Database Sync (Migration 095)

### Problem
Staging and Production had significant schema drift: ~58 missing triggers, ~30 missing indexes, 2 missing tables, RLS policy mismatches.

### Process
1. Ran 7 comparison queries on both environments
2. Saved results to `docs/Pre-live DB comparison.txt` as permanent record
3. Verified all trigger functions existed on Prod before creating triggers
4. Wrote comprehensive idempotent migration (DROP IF EXISTS + CREATE)
5. Applied to Dev first, then Staging (no-op), then Prod
6. Verified: Staging=72 triggers, Prod=72 triggers

### What Was Synced
- 58 triggers (updated_at, premium window, order expiration, vendor cache, fee balance, etc.)
- 30 indexes (including critical unique constraints on orders, payments, market_vendors)
- 2 tables (push_subscriptions, public_activity_events)
- 3 columns on market_box_pickups
- 2 payout_status enum values
- RLS policies (admin access on vendor_profiles, vendor_verifications, verticals)

---

## 7. Stripe Live Mode Preparation

### Keys Configured (Vercel Production scope)
- `STRIPE_SECRET_KEY` (sk_live_...)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live_...)
- `STRIPE_WEBHOOK_SECRET` (whsec_... from live webhook)
- 10 per-vertical price IDs (FM Pro/Boss, FT Pro/Boss, Buyer Premium — monthly + annual)

### Code Updated
`stripe/config.ts` rewritten to support per-vertical Stripe price IDs:
- `VERTICAL_VENDOR_PRICES` object keyed by vertical slug
- `getVendorPriceConfig(tier, cycle, vertical)` routes to correct price ID
- `getFtPriceConfig()` and `getFmPriceConfig()` use vertical-specific lookups
- Future verticals add a new section + env vars — no code changes needed

### Per-Vertical Stripe Products
Each vertical has its own Stripe products for branding on receipts/statements:
- FM: prod_U5sVZr6rwkfgHr (Pro), prod_U5sXaUbbjuw4c0 (Boss)
- FT: prod_U5sAqiVY7EzueR (Pro), prod_U5sNbxPjwJLfbp (Boss)
- Buyer Premium: prod_U5sZyHKKnvsA0p (shared)

### Not Done Yet
- Push main to prod (user not ready for live transactions)
- Vendor re-onboarding with real Stripe Connect accounts
- Prod data cleanup before go-live

---

## 8. Other Fixes & Improvements

### Password Reset (Critical)
**Problem:** Reset page showed "invalid or expired link" immediately for every user.
**Root cause:** Page called `getSession()` before Supabase processed the hash fragment tokens from the reset email link.
**Fix:** Uses `onAuthStateChange` to listen for `PASSWORD_RECOVERY` event. 5-second timeout for genuinely invalid links.

### Listing Edit Draft Demotion
**Problem:** Editing a published listing re-checked onboarding gates and demoted to draft if any gate was incomplete.
**Fix:** If listing is already published AND vendor is approved, preserve published status on edit.

### Where-Today FM Text
- Header: "What Markets Are Open?" → "Where Are Local Vendors?"
- Subtitle/count labels updated
- Zip persistence: reads from API (httpOnly cookie can't be read client-side)

### Cancelled Order Banner
- External payment orders no longer show refund text
- New banner for system-cancelled (non-payment)

### Vendor Profile Layout
- Desktop split into 3 lines (name, badges+reviews, social links)
- Social buttons reduced ~10%

### Admin Dashboard Cards
- Stuck orders warning (>24hrs in paid/confirmed)
- Open issues count with link to order issues page

### Buyer Premium Copy
- Removed market box exclusivity claims (anyone can subscribe)
- Removed "priority customer support" (we don't offer it)
- Replaced with premium badge visibility + vendor priority recognition
- Updated across upgrade page, dashboard, settings, subscription success — EN + ES

### Buyer Cancel RLS Fix
- Removed 50-order limit workaround
- Now queries order_items directly by ID, RLS authorizes via `user_buyer_order_ids()`

### FT Time Slot UX
- "Closing soon" badge when <1 hour remains (accounts for 31-min lead time)
- "No pickup times available" message when time slots are empty

### Cart Cross-Vertical Validation (E-8/E-9)
- Listing + market box add-to-cart now validates vertical match

---

## 9. Tests Written

### T-7: External Payment Fee Flow (24 tests)
Protects the 5-file deferred fee architecture. Covers:
- Fee constants match pricing.ts
- External buyer fee = 6.5% (no flat fee) vs Stripe 6.5% + $0.15
- External seller fee = 3.5%
- Vendor payout at checkout = full subtotal (fees invoiced later)
- Auto-deduction caps at 50%
- Rounding consistency, edge cases

---

## 10. Business Rules Documented (decisions.md)

- External payment fee flow (5-file architecture)
- External payment refund policy
- Stripe refund fee absorption
- Refund amount formula
- Market box missed pickup = no refund
- Trial tier = 'free'
- FT fulfilled items don't restore inventory
- Per-vertical Stripe products

---

## 11. Known Issues for Next Session

### Vendor Hours Display
Market cards and vendor profiles show **market hours** (e.g., 9:00 PM) but vendor-specific override hours may be earlier (e.g., 8:00 PM). Buyer sees "open until 9" but can't order after 8. Needs to display vendor hours when they differ from market hours.

### Vendor Lead Time Setting
FT vendors have a hardcoded 31-min lead time for pickup slots. Vendor can't configure this. Proposed: `pickup_lead_minutes` column on `vendor_profiles` with 15/30 min toggle. Specs ready, deferred to next session.

### Outstanding Backlog
- Priority tests (T-2, T-3, T-11)
- Event Phase 2 (wave-based ordering)
- Timezone centralization
- Inventory change notifications
- 4 audit opportunities
- Sample vendor showcase setup
- Prod data cleanup before go-live

---

## 12. Session Lessons

1. **Present before implementing** — when discovering new issues during investigation, stop and present options before writing code.
2. **Data integrity** — never treat memory of data as equivalent to the actual data. If the record is deleted, recreate from source.
3. **DB trigger safety nets** — `trg_auto_cancel_order` pattern prevents systemic issues regardless of which code path runs.
4. **Migration split required** — PostgreSQL requires `ALTER TYPE ADD VALUE` to commit before new values can be used.
5. **Pre-launch DB comparison** — full schema comparison between environments is essential before going live.
6. **Stale backlog items** — always verify items aren't already done before building.
7. **Per-vertical architecture** — Stripe products, notification titles, availability badges all need vertical awareness for multi-vertical platforms.

---

## 13. Commit Log (42 commits)

All commits on main, merged to staging. Not pushed to prod.

Migrations: 085a (enum values), 085b (functions), 093 (auto-cancel trigger), 094 (event vendor listings), 095 (prod sync)
