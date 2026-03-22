# Backlog

Last updated: 2026-03-20 (end of Session 62)

## Priority 0 — Next Session (from Session 62 end)

### Vendor Hours & Ordering UX
- [ ] **Vendor hours display mismatch** — Market cards and vendor profiles show market hours (e.g., 9 PM) but vendor-specific override hours may be earlier (e.g., 8 PM). Buyer sees "open until 9" but can't order after 8. Need to display vendor hours when they differ from market hours. Affects: browse cards, listing detail, vendor profile, where-today page.
- [ ] **Vendor configurable pickup lead time** — FT vendors have hardcoded 31-min lead time for pickup slots. Proposed: `pickup_lead_minutes` column on `vendor_profiles` (INTEGER, default 30), vendor settings toggle for 15/30 min. `generateTimeSlots()` already accepts `minLeadMinutes` param — just needs to read from vendor profile. One migration + settings UI + AddToCartButton update.
- [ ] **Password reset verification** — Fix deployed to staging (uses onAuthStateChange instead of getSession). Needs manual testing to confirm it works.

## Priority 1 — From Session 62

### Notifications & Communication
- [x] **Confirmation email pickup instructions** — DONE Session 62. order_ready notification includes handoff instructions + deep-link to specific order.
- [x] **Vendor expiration notification** — DONE Session 62. Cron Phase 1 now notifies vendor when order expires.
- [ ] **Inventory change notifications (design needed)** — Notify buyers when favorited vendors restock. Design: favorites-only, 15-30 min batch window after last change, max 1 per vendor per buyer per day.
- [ ] **Vendor notification titles i18n** — 20+ vendor notifications use hardcoded English strings. Buyer notifications use `t()`. Should be consistent.
- [x] **Notification deep-linking** — DONE Session 62. All buyer order notifications link to specific order detail page.
- [ ] **Notification click routing review** — 48 actionUrls need review for appropriate destinations. Not a wiring issue — each type's actionUrl needs individual review. Tedious but mechanical.

### Tests — Protect Revenue & Recent Fixes
- [ ] **T-7: External payment fee flow test** — HIGHEST PRIORITY. User said "if it breaks we lose money."
- [ ] **T-2: Refund calculation consistency test** — All 4 refund paths must produce identical amounts.
- [ ] **T-11: Inventory restore vertical awareness test** — FT fulfilled = no restore, FM = restore.
- [ ] **T-3: Tip split protective test** — Confirmed correct, needs protection from accidental changes.

### Business Rules to Document
- [x] **BR-5: Market box missed pickup = no refund** — DONE Session 62. In decisions.md.
- [x] **BR-6: Trial tier = 'free'** — DONE Session 62. In decisions.md.
- [x] **BR-11: FT fulfilled items don't restore inventory** — DONE Session 62. In decisions.md.
- [ ] **BR-4: Event approval prerequisites** — What criteria grants event_approved? Is COI required?
- [ ] **BR-7: Cancellation fee allocation** — No documented percentage for vendor's share.
- [ ] **BR-8: Event headcount range (10-5000)** — Hardcoded, no justification documented.
- [x] **BR-9: Cross-vertical cart isolation** — DONE Session 62. Validation added to add-to-cart API.
- [ ] **BR-10: Radius persistence behavior** — Cookie-only vs profile.

### Investigation Needed
- [x] **E-8/E-9: Cart cross-vertical isolation** — DONE Session 62. Vertical validation added to listing + market box add-to-cart.
- [ ] **E-21: Timezone centralization** — zip_codes table has timezone column. Design centralized utility.
- [x] **E-22: Geocode/browse** — INVESTIGATED Session 62. zip_codes table populated on all 3 envs (33,793 rows). DB lookup should work. Silent fallback is documented in code.
- [ ] **Where-today schedule mismatch** — Need specific example from user to diagnose.

### Small Fixes
- [x] **E-25: UserRole type dedup** — DONE Session 62.
- [x] **E-19: Cart remove endpoint stub** — DONE Session 62. Deleted.

## Priority 1 — From Session 61 (Carried Forward)

### Buyer Premium Upgrade Page
- [ ] **Rewrite premium buyer value proposition** — Remove market box claims, remove "premium support" claim. Focus on early access, premium badge visibility to vendors.

### Vendor Profile (FM)
- [x] **"View Menu" → "View Products"** — ALREADY DONE (prior session).
- [x] **Hide "Free" tier badge** — ALREADY DONE (prior session).
- [x] **Show tier badge on FM vendor cards** — ALREADY DONE (prior session).
- [x] **Resize social buttons on vendor profile** — DONE Session 62. Reduced ~10%, 3-line desktop layout.

### Notification Click Behavior
- [ ] **Notification click routing review** — Each notification type's actionUrl needs review. Most point to orders list; some should point to dashboard, settings, etc. Tedious but mechanical.

### Translation Gaps
- [ ] **Page-by-page translation audit** — Many items not translated to Spanish.

### Order Lifecycle Monitoring
- [x] **Fix "active orders" count on dashboard** — DONE Session 62.
- [x] **Admin dashboard: stuck orders card** — DONE Session 62. Shows count + open issues link.
- [ ] **Integration test: full order lifecycle** — Test order transitions pending → paid → confirmed → ready → completed.
- [x] **Backfill stuck orders** — DONE Session 62. One-time SQL cleanup applied to all 3 envs.

### Event System
- [x] **Event Phase 1 completion** — DONE Session 62. Per-event vendor menus (event_vendor_listings table, vendor picker on accept, 5-item limit). Event lifecycle statuses (approved → ready → active → review → completed). Migration 094 applied all 3 envs.
- [x] **Event Phase 3: Attendee feedback** — DONE Session 62. EventFeedbackForm component on event page during active/review status.
- [x] **Event Phase 3: Vendor prep reminder** — DONE Session 62. Cron Phase 11 sends 24h-before notification.
- [x] **Event Phase 3: Settlement notification** — DONE Session 62. event_settlement_summary type created.
- [x] **Event Phase 4: Revenue estimate** — DONE Session 62. Shows on vendor invitation page.
- [ ] **Event Phase 2: Wave-based ordering** — Time slots with capacity limits, wave-aware checkout. Significant build.
- [ ] **Event Phase 3 remaining: Settlement email trigger** — Send settlement notification to vendors when admin marks event completed. Notification type exists, needs to be called from the admin status transition.
- [ ] **Stripe payouts_enabled flag sync** — Investigate why DB flags don't stay current after vendor completes Stripe setup.

### Stripe Cleanup
- [x] **Delete old pebble02 webhook endpoint** — DONE by user Session 62.

## Priority 2 — Soon

- [x] **Browse page: consolidate filters** — DONE (prior session).
- [ ] **Playwright automated smoke tests** — See detailed plan in archive section.
- [ ] **Test push notifications on staging** — Verify web push end-to-end.
- [ ] **Stripe live mode activation** — Switch from test to live keys when ready.
- [ ] **Prod zip_codes seeded** — DONE Session 62. 33,793 rows via CSV import.

## Priority 2.5 — Session 62 Audit Opportunities

- [ ] **Opportunity 1: Buyer Interest Geographic Intelligence Dashboard** — buyer_interests table has data. Admin page showing interests by zip/count/date + CSV export.
- [ ] **Opportunity 2: Vendor Quality System Activation** — Nightly cron generates findings. Zero UI. Vendor dashboard card + admin findings page.
- [ ] **Opportunity 3: Trial-to-Paid Conversion Funnel** — Dashboard banner "Day X of 90", upgrade page context, 7-day pre-expiry notification.
- [ ] **Opportunity 4: Vendor Leads Management UI** — Admin leads page with status tracking, follow-up, demo scheduling.

## Priority 2.6 — Documentation Deep Dives
- [ ] **Area-specific deep dive series** — Internal reference docs across full stack. Topics: Statuses, Dates/Times, Locations, Hours/Schedules, Tiers/Limits, Financial Flows, Auth/Access, Device/Browser.

## Priority 2.7 — Performance & Infrastructure
- [ ] **AC-4: Optimize heavy RLS policies on markets table** — 2 nested EXISTS subqueries per row.
- [ ] **L4: Zod input validation on API routes** — Gradually add Zod schemas.
- [ ] **L6: SMS send logic when push enabled** — Blocked by A2P 10DLC carrier approval.
- [ ] **L2: External cron monitoring** — Deferred post-launch.

## Priority 3 — When Time Allows
- [ ] **Geographic intelligence feature** — Plan at `.claude/geographic_intelligence_plan.md`
- [ ] **A2P 10DLC SMS approval** — Waiting on carrier

## Post-Launch — Growth & Expansion
- [ ] **Ecosystem Partner Platform** — Full design at `docs/CC_reference_data/Ecosystem_Partner_Platform_Design.md`
- [ ] **Growth Ambassador Program** — Design at `docs/CC_reference_data/Growth_Partner_System_Design.md`
- [ ] **Geographic Expansion Planning** — Workbook at `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx`

## Icebox
- [ ] **Events feature Phase 5+** — Ticketing, capacity management, recurring events
- [ ] **Advanced vendor analytics** — Sales trends, customer demographics, peak hours

---

## Completed (Archive)

| Date | Item |
|------|------|
| 2026-03-20 | Active orders count fix (migration 092 + trigger 093 + data cleanup) |
| 2026-03-20 | Admin approval tier names (was basic/standard, now free) |
| 2026-03-20 | Admin vendor/listing table tier filter + badge colors |
| 2026-03-20 | Event invite event_approved check |
| 2026-03-20 | Event request past date validation |
| 2026-03-20 | JSONB race condition on doc upload |
| 2026-03-20 | Where-today rate limit |
| 2026-03-20 | Resolve-issue refund math (now includes buyer fees) |
| 2026-03-20 | Inventory restore vertical awareness (FT fulfilled = no restore) |
| 2026-03-20 | Migration 085 applied (lazy profile + role enums) |
| 2026-03-20 | External payment safety net (buyer cancel + vendor non-payment) |
| 2026-03-20 | Vendor resolve-issue UI on orders page |
| 2026-03-20 | Admin order issues page |
| 2026-03-20 | Listing edit no longer demotes published to draft |
| 2026-03-20 | Where-today FM text (header, subtitle, count labels) |
| 2026-03-20 | Where-today zip persistence (reads from API, not cookie) |
| 2026-03-20 | Cancelled order banner — no refund text for external payments |
| 2026-03-20 | Cancel-nonpayment updates order-level status |
| 2026-03-20 | Resolve-issue updates order status when all items cancelled |
| 2026-03-20 | Migration 093: auto-cancel order trigger |
| 2026-03-20 | UserRole type dedup (import from roles.ts) |
| 2026-03-20 | Cart remove stub deleted |
| 2026-03-20 | BR-5, BR-6, BR-11 documented in decisions.md |
| 2026-03-20 | Vendor profile desktop layout (3 lines) + social button sizing |
| 2026-03-20 | Admin stuck orders + open issues cards on dashboard |
| 2026-03-20 | Notification deep-linking (all buyer notifications → specific order) |
| 2026-03-20 | Vendor expiration notification (cron Phase 1) |
| 2026-03-20 | Order confirmed notification includes handoff instructions |
| 2026-03-20 | Spanish translations for new notifications |
| 2026-03-20 | Cart cross-vertical validation (E-8/E-9) |
| 2026-03-20 | Order-ready notification includes pickup instructions + deep-link |
| 2026-03-20 | Prod zip_codes seeded (33,793 rows) |
| 2026-03-20 | Event Phase 1: per-event vendor menus (migration 094 + vendor picker) |
| 2026-03-20 | Event Phase 1: lifecycle statuses (ready/active/review) + admin transitions |
| 2026-03-20 | Event Phase 3: attendee feedback form on event page |
| 2026-03-20 | Event Phase 3: vendor prep reminder (cron Phase 11) |
| 2026-03-20 | Event Phase 3+4: settlement notification + revenue estimate |
| 2026-03-20 | External payment fee flow documented in decisions.md |
| 2026-03-04 | Upstash Redis rate limiting |
| 2026-03-04 | CI lint fixes (ESLint errors) |
| 2026-03-04 | Sentry setup (staging + production) |
| 2026-03-04 | Legal terms 3-tier system |
| 2026-03-04 | Production push (all infra) |
