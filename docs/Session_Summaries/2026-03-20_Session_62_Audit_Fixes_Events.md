# Session 62 — Independent Audit, Bug Fixes, External Payment Safety Net, Event System Completion

**Date:** 2026-03-20
**Commits:** 28 (all on main, pushed to staging)
**Production push:** Not done — 28 commits awaiting user verification on staging
**Migrations applied:** 085a, 085b, 093, 094 (all 3 environments)
**Data fixes:** 2 one-time SQL cleanups (all 3 environments)
**Prod zip_codes:** Seeded 33,793 rows via CSV import

---

## Session Overview

This session started with a comprehensive independent audit of the entire codebase — no prior audit reports referenced. The audit identified 58 findings across 10 areas (auth, pricing, checkout/Stripe, order lifecycle, notifications, cron, vendor onboarding, events, market boxes, browse/location/cart). From there, the session progressed into fixing 20+ bugs, building the external payment safety net feature, completing Event Phase 1, implementing Phase 3/4 event features, and finishing vendor notification i18n.

---

## 1. Independent Codebase Audit

### Method
Systematic section-by-section deep dive using parallel exploration agents. Each area was investigated, findings written immediately to working file, then consolidated into final report.

### Key Findings (58 total)
- **6 critical** (financial impact): external payment fee handling, refund math, admin tier names, market box missed pickups
- **5 high** (functional/security): event invite without approval check, cart cross-vertical isolation, admin tier display
- **15 medium** (edge cases): migration 085 not applied, inventory restore logic, timezone issues, notification gaps
- **10 missing business rules** documented
- **14 test coverage gaps** identified
- **4 high-value opportunities** surfaced

### Report Location
`apps/web/.claude/session62_comprehensive_audit.md` — full report with status tracking per finding.

---

## 2. Bug Fixes (20+ items)

### Financial Fixes
- **Resolve-issue refund math** — was refunding subtotal only, now includes buyer fees (6.5% + prorated $0.15). Platform absorbs Stripe processing fee on refunds.
- **Admin approval tier names** — was setting 'basic'/'standard' (legacy), now sets 'free' (unified system). Every new vendor was getting wrong tier.
- **Active orders count** — root cause: `atomic_complete_order_if_ready()` was broken since creation (boolean/integer type mismatch in migration 011). Fixed by migration 092. DB trigger 093 added as safety net for cancelled orders. One-time data cleanup applied.

### Security/Validation Fixes
- **Event invite** — now checks `event_approved=true` before allowing vendor invitation.
- **Cart cross-vertical isolation** — listing + market box add-to-cart now validates vertical match.
- **Event request past dates** — rejects `event_date < today`.
- **JSONB race condition** — document upload uses optimistic concurrency with retry.
- **Where-today rate limit** — public endpoint now has rate limiting.

### UI/UX Fixes
- **Admin vendor/listing tables** — tier filter, badge colors, display names updated to Free/Pro/Boss.
- **Listing edit** — no longer demotes published listings to draft when vendor edits (was re-checking onboarding gates unnecessarily).
- **Cancelled order banner** — external payment orders no longer show refund text.
- **Vendor profile layout** — desktop split into 3 lines (name, badges+reviews, social links). Social buttons reduced ~10%.
- **Admin dashboard** — stuck orders warning card + open issues count with link.
- **Where-today FM** — header, subtitle, count labels updated for FM vertical. Zip persistence fixed (reads from API, not httpOnly cookie).

### Inventory Logic
- **FT fulfilled items** — no longer restore inventory on refund (cooked food can't be resold). FM items still restore.

---

## 3. External Payment Safety Net (New Feature)

### Problem
Buyer places Venmo/CashApp/PayPal order but payment fails (insufficient funds, app issue). No clean way to exit. Vendor can reject but it hurts their score.

### Solution
**Buyer side:**
- Penalty-free cancel button on order list + order detail page for pending external payment orders
- ConfirmDialog before cancel — no penalty to buyer or vendor
- `cancelled_by: 'system'` (not 'buyer') — doesn't affect vendor metrics

**Vendor side:**
- "Payment Not Received" button — notifies buyer to send payment or cancel
- "Cancel for Non-Payment" button — cancels order with no vendor score impact, restores inventory

**New API routes:**
- `POST /api/vendor/orders/[id]/payment-not-received`
- `POST /api/vendor/orders/[id]/cancel-nonpayment`

**New notification types:**
- `external_payment_not_received` (buyer-facing)
- `order_cancelled_nonpayment` (buyer-facing)

**External checkout now sends buyer notification** with payment method in title: "Order Placed — pay via Venmo"

---

## 4. Notification System Improvements

### Deep-linking
All buyer-facing order notifications now link to the specific order detail page (`/buyer/orders/{orderId}`) instead of the generic orders list. Updated 12 call sites across checkout, confirm, ready, fulfill, handoff, resolve-issue routes.

### i18n Completion
All 36 vendor notification titles converted from hardcoded English strings to `t('notif.xxx_title', locale)` with both English and Spanish translations. Zero hardcoded titles remain in the notification registry.

### New Notification Types Added This Session
- `external_payment_not_received` — vendor flags non-payment
- `order_cancelled_nonpayment` — order cancelled for non-payment
- `order_expired_vendor` — vendor notified when their order expires
- `event_prep_reminder` — 24h before event reminder
- `event_settlement_summary` — settlement complete notification

### Pickup Instructions
- `order_ready` notification now includes handoff instructions: "show your order screen to vendor, both confirm"
- `order_confirmed` notification includes next-steps guidance
- Both updated in English and Spanish

---

## 5. Event System — Phase 1 Completion + Phase 3/4

### Phase 1: Per-Event Vendor Menus (NEW)
- **Migration 094:** `event_vendor_listings` table (market_id, vendor_profile_id, listing_id) with unique constraint, indexes, RLS
- **Vendor accept flow:** Accepting an event invitation now requires selecting 1-5 catering-eligible menu items. Listing picker shows only items with `event_menu_item=true`.
- **Event detail page:** Shows vendor's event-specific menu (falls back to all catering-eligible if none selected)

### Phase 1: Event Lifecycle Statuses (NEW)
- `catering_requests.status` CHECK constraint updated: `approved → ready → active → review → completed`
- Admin event page has transition buttons: "Open Pre-Orders" → "Event Started" → "Event Ended — Collect Feedback" → "Mark Complete"

### Phase 3: Post-Event Features (NEW)
- **Attendee feedback form** — `EventFeedbackForm` client component embedded in event page during `active`/`review` status. Star rating + comment per vendor.
- **Vendor prep reminder** — Cron Phase 11 sends notification 24h before event with headcount per vendor and setup time. Deduped per-day.
- **Settlement notification** — When admin marks event completed, accepted vendors receive `event_settlement_summary` with order count.

### Phase 4: Vendor Revenue Visibility (NEW)
- Revenue estimate on vendor invitation page: "~65 servings × $10-15/plate = $650-975"

---

## 6. Migrations Applied

| Migration | Description | Environments |
|-----------|-------------|-------------|
| 085a | Add `platform_admin` + `regional_admin` to user_role enum | Dev, Staging, Prod |
| 085b | `ensure_user_profile()` RPC, `is_regional_admin()`, `is_platform_admin()` update | Dev, Staging, Prod |
| 093 | `trg_auto_cancel_order` trigger — auto-cancels order when all items cancelled | Dev, Staging, Prod |
| 094 | `event_vendor_listings` table + `catering_requests` lifecycle status update | Dev, Staging, Prod |

### One-Time Data Fixes
- Cancelled orders with `orders.status='pending'` (all items cancelled but order not updated) → set to `'cancelled'`
- Fulfilled orders with `orders.status='paid'` (all items fulfilled but order stuck) → set to `'completed'`
- Both applied to all 3 environments

### Prod Zip Codes
- 33,793 US zip codes seeded via CSV import (was empty on Prod, populated on Staging)

---

## 7. Documentation & Business Rules

### Decisions Logged (decisions.md)
- External payment fee flow documented (5-file architecture)
- External payment refund policy (buyer handles directly with vendor)
- Stripe refund fee absorption (platform absorbs)
- Refund amount formula (subtotal + 6.5% + prorated $0.15)
- Market box missed pickup = no refund (prepaid commitment)
- Trial tier = 'free' for all verticals
- FT fulfilled items don't restore inventory on refund

### Other Documentation
- Session 62 audit report: `apps/web/.claude/session62_comprehensive_audit.md`
- Session 62 research notes: `apps/web/.claude/session62_audit_research.md`
- Backlog updated: 38 items archived, remaining items organized by priority
- Memory file added: `feedback_present_before_implementing.md`

---

## 8. Admin UI Built

### Vendor Resolve-Issue UI
- Red alert box on vendor order items with buyer-reported issues
- Shows issue timestamp + description + "Resolve Issue" button
- ConfirmDialog: "I Did Deliver This" (disputes, notifies admin) or "Issue Refund" (cancels, refunds)

### Admin Order Issues Page (`/admin/order-issues`)
- Status filter tabs with counts (New / In Review / Resolved / All)
- Issue cards: order number, vertical badge, buyer, vendor, market, amount
- Inline editing for status and admin notes
- Nav link added to admin sidebar

### Admin Dashboard Cards
- Stuck orders warning (orders >24hrs in paid/confirmed)
- Open issues count with "Review →" link to order issues page

---

## 9. Files Changed (Key Files)

### New Files Created
- `src/app/api/vendor/orders/[id]/payment-not-received/route.ts`
- `src/app/api/vendor/orders/[id]/cancel-nonpayment/route.ts`
- `src/app/admin/order-issues/page.tsx`
- `src/components/events/EventFeedbackForm.tsx`
- `supabase/migrations/applied/20260320_093_auto_cancel_order_when_all_items_cancelled.sql`
- `supabase/migrations/applied/20260320_094_event_vendor_listings_and_lifecycle.sql`
- `supabase/migrations/applied/20260316_085a_add_role_enum_values.sql`
- `supabase/migrations/applied/20260316_085b_lazy_profile_and_role_functions.sql`

### Heavily Modified
- `src/lib/notifications/types.ts` — 5 new types, 36 titles i18n'd, deep-linking
- `src/lib/locale/messages/en.ts` — 40+ new locale keys
- `src/lib/locale/messages/es.ts` — 40+ new locale keys
- `src/components/vendor/OrderCard.tsx` — issue UI, payment buttons
- `src/app/[vertical]/buyer/orders/page.tsx` — external payment cancel
- `src/app/[vertical]/buyer/orders/[id]/page.tsx` — cancel button, banner fix
- `src/app/[vertical]/vendor/orders/page.tsx` — resolve-issue + payment handlers
- `src/app/[vertical]/vendor/events/[marketId]/page.tsx` — menu picker, revenue estimate
- `src/app/api/cron/expire-orders/route.ts` — vendor expiration notification, event prep reminders
- `src/app/api/vendor/orders/[id]/resolve-issue/route.ts` — refund math, inventory logic, order status

---

## 10. Remaining Open Items (Next Session)

### High Priority
- Priority tests (T-2, T-3, T-7, T-11) — protect revenue and recent fixes
- Event Phase 2 (wave-based ordering) — significant build
- Buyer premium upgrade page copy rewrite
- Timezone centralization design

### Medium Priority
- Inventory change notification system (favorites-only, batched)
- Where-today schedule mismatch investigation
- Stripe payouts_enabled flag sync
- BR-4, BR-7, BR-8, BR-10 business rules documentation

### Lower Priority
- 4 audit opportunities (buyer interest dashboard, quality findings, trial funnel, leads UI)
- Playwright smoke tests
- Push notification testing on staging
- Area-specific deep dive documentation series

---

## Session Lessons

1. **Present before implementing** — When discovering new issues during investigation, stop and present options before writing code. Claude was corrected on this mid-session (recorded in memory).
2. **DB trigger as safety net** — Adding `trg_auto_cancel_order` trigger prevents order status inconsistency regardless of which code path cancels items. Pattern worth repeating for other systemic issues.
3. **Stale backlog items** — 3 items on the backlog ("View Menu → View Products", "hide Free badge", "show FM tier badges") turned out to be already done. Always verify before building.
4. **Migration split required** — PostgreSQL requires `ALTER TYPE ADD VALUE` to commit before new values can be used. Split 085 into 085a (enum) + 085b (functions).
5. **External payment gap** — Real user testing revealed the gap where buyers can't cleanly exit a failed external payment. The penalty-free cancel + vendor non-payment flow closes this gracefully.
