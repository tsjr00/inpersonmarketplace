# Current Task: Session 11 — Notifications, Cancellation Policy, Dashboard Reorg
Started: 2026-02-09
Last Updated: 2026-02-09

## What Was Completed This Session

### 1. Notification Triggers Wired into 11 API Routes (COMMITTED - `04bfc61`)
- 8 NEW notification triggers added to order lifecycle routes
- 2 UPGRADED from direct DB inserts to multi-channel `sendNotification()` service
- 1 NEW market box buyer route wired with vendor notification
- Routes: checkout/success, vendor confirm/ready/fulfill/reject/confirm-handoff/confirm-external-payment, vendor market-box pickups, buyer confirm (upgrade), buyer cancel (upgrade), buyer market-box confirm-pickup

### 2. Notification Template Refinements (COMMITTED - `8261052`, `807090f`)
- `order_ready` tone changed to calmer wording ("has been marked ready...no need to rush")
- `order_ready` urgency kept at `immediate` (push is free, helps buyers plan)
- New `pickup_missed` notification type with neutral tone (not punitive)

### 3. Vendor Cancellation Policy MVP (COMMITTED - `215d064`)
- Migration `20260209_006_vendor_cancellation_tracking.sql` — APPLIED to Dev & Staging
  - 3 columns: `orders_confirmed_count`, `orders_cancelled_after_confirm_count`, `cancellation_warning_sent_at`
  - 2 SECURITY DEFINER RPCs: `increment_vendor_confirmed(uuid)`, `increment_vendor_cancelled(uuid)`
- Confirm route increments confirmed count
- Reject route increments cancelled count (only for confirmed/ready items), checks thresholds, sends warning
- Thresholds: 10%+ = orange warning, 20%+ = red warning, min 10 orders
- New notification type: `vendor_cancellation_warning`
- Business Profile card shows orange/red border + warning text
- Admin vendors table has "Cancel %" column with color-coded badges
- Vendor order confirm has commitment dialog (window.confirm)

### 4. External Payment Inventory Bug Fix (COMMITTED - `112ff59`)
- `confirm-external-payment/route.ts` now calls `atomic_decrement_inventory` for each order item
- Sends low stock / out of stock notifications matching Stripe flow
- Was completely missing before — external payment orders left inventory untouched

### 5. Vendor Dashboard Reorganization (COMMITTED - `112ff59`)
- New layout by operational priority:
  - Row 1: Pickup Mode | Upcoming Pickups | Manage Locations
  - Row 2: Orders | Listings (with stock/draft badges) | Market Boxes
  - Row 3: Business Profile | Payment Methods (with fee balance) | Analytics
  - Row 4: Notifications | Reviews
- Removed top banners (low stock, draft listings) — warnings now on Listings card
- FeeBalanceCard collapsed into PaymentMethodsCard (shows inline when balance > 0)

### 6. External Payment Refund Disclaimer (COMMITTED - `112ff59`)
- Info box on external checkout page: "Refunds for orders paid via [method] are handled directly between you and the vendor."

### 7. Schema & Migration Tracking Updated (COMMITTED - `4b30d41`)
- Migration 20260209_006 moved to applied/
- Schema snapshot updated with 3 new columns + 2 RPCs
- Migration log updated with all Session 10+11 migrations

## Commits This Session
1. `04bfc61` — Wire sendNotification into 11 order lifecycle API routes
2. `8261052` — Refine notification templates: calmer order_ready, new pickup_missed type
3. `807090f` — Restore immediate urgency for order_ready
4. `215d064` — Vendor cancellation policy MVP
5. `4b30d41` — Move migration to applied, update schema snapshot + migration log
6. `112ff59` — Fix external payment inventory bug, reorganize dashboard, add refund disclaimer

## Pending / Backlog Items
- [x] **Vendor document uploads** — BUILT (pending commit). Storage bucket migration, upload API route, CertificationsForm with file upload per cert, certifications API preserves document_url, admin vendor detail shows documents with download links.
- [ ] Redis rate limiter (deferred — needs infrastructure/provider decision)
- [ ] A2P 10DLC campaign approval (waiting on Twilio/carrier)
- [ ] Test notifications on staging (in-app + email via Resend dashboard)
- [ ] Stripe branding cleanup
- [ ] Per-vendor/listing low stock threshold (backlogged — small feature)
- [ ] External payment confirmation UX copy change (backlogged — just button label)
- [ ] Vendor cancellation: automatic pausing (deferred), excused cancellations (deferred), rolling 90-day window (deferred — using lifetime counts for MVP)

## Vendor Document Uploads — BUILT (Session 12)
Files created/modified:
1. `supabase/migrations/20260209_007_vendor_documents_storage.sql` — Storage bucket (10MB, PDF/JPG/PNG) + RLS policies
2. `src/app/api/vendor/profile/certifications/upload/route.ts` — NEW upload endpoint with auth, validation, withErrorTracing
3. `src/components/vendor/CertificationsForm.tsx` — Added document_url to interface, upload per cert, attach/replace/view buttons
4. `src/app/api/vendor/profile/certifications/route.ts` — Preserves document_url in sanitization (validates it's a vendor-documents URL)
5. `src/app/admin/vendors/[vendorId]/page.tsx` — Certifications & Documents section with View Document links
Migration needs to be applied to dev & staging before testing.

## User Preferences & Decisions Made This Session
- Low stock warning: on Listings card, NOT as top banner (operational items only at top)
- Dashboard order: Pickup Mode first, then Upcoming Pickups, Manage Locations
- order_ready: calm tone but immediate urgency (push is free, prevents missed orders)
- External payments for market boxes: restrict to Stripe only (decision made, not yet enforced in code — market boxes already use Stripe checkout)
- External payment refunds: buyer-vendor responsibility, platform can't help
- Vendor cancellation: MVP only (no auto-pausing, no excused cancellations, lifetime counts)
- Fee balance: collapsed into Payment Methods card
- Document uploads: PDF/JPG/PNG, 10MB max, part of profile settings not onboarding
