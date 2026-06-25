# Backlog

Last updated: 2026-06-21 (sales-tax readiness + FT HB 2844 licensing direction added)

## Priority 1 — Sales tax: Stripe Tax (calc) + TaxCloud (filing) — readiness mapped, BUILD AFTER current features

Full readiness map + checklists + open questions: `apps/web/.claude/sales_tax_readiness.md`. **Priority once current in-flight features land.** Reframes the long-pending "sales tax module": Stripe Tax calculates/collects, TaxCloud files — we are NOT building a calculator.

- **We are the Merchant of Record (marketplace facilitator):** platform calculates/collects/remits using the PLATFORM's Stripe Tax registrations; vendors (connected accounts) don't collect or file.
- [ ] **⚠️ Critical-path:** withhold tax from vendor payouts — buyer pays subtotal + our fees + tax; the vendor's cut must EXCLUDE tax. Touches `pricing.ts`, checkout-session creators, `payments.ts`/`webhooks.ts`, payout/transfer math (all protected — per-file approval, record before/after).
- [ ] Enable `automatic_tax[enabled]=true` + `liability[type]=self` + `invoice issuer=self` on every Checkout Session creator; capture `total_details.amount_tax` in webhooks/orders.
- [ ] Product → Stripe tax-code classification (FM produce often exempt vs FT prepared food taxable — real over/under-charge risk).
- [ ] Account setup (no code): Stripe tax settings + per-nexus-state registrations; TaxCloud business profile (FEIN, origin, nexus states), TIC code, Link Stripe → Go Live.
- [ ] **Verify before building:** (1) does TaxCloud file off Stripe-collected tax or re-derive via TIC (reconciliation risk)? (2) does TaxCloud's Stripe integration support the Connect/platform-level model? (3) nexus/facilitator obligations per state (tax advisor); (4) correct tax codes per food category; (5) exact Stripe Tax + TaxCloud non-SST (Texas) pricing.

## Priority 1 — Vendor product categories: keep selling exclusive, capture booth revenue (Session 92, 2026-06-13)

Full concept + phased plan + locked decisions: `apps/web/.claude/vendor_product_categories_concept.md`. FUTURE build, not scheduled.

Principle (verified): selling and booth-renting are separate code paths — add a `sell_eligible` selling gate, leave booth-rent open. 4 categories: 1 Homemade/Handmade/Homegrown + 2 Hand-finished/Personalized = sell-eligible; 3 Personal-design/machine-produced + 4 Retail/Resale/Pre-owned = NOT sell-eligible (booth rent only). Strict cat 1&2; self-categorize at first interest before onboarding; no retro-classify existing vendors.

- [ ] **Phase 1 — Exclusivity gate (priority, ships alone):** signup front-step self-categorization (cat 3/4 blocked from selling, reinforced messaging); `vendor_profiles.production_category TEXT[]` + `sell_eligible` (1 mig); enforce `sell_eligible` at listing-publish + market-box-create (airtight — every selling entry point); opt-in clause "products must stay in supported categories / may be removed without notice"; manager-onboarding messaging (platform for cat 1&2; invite cat 3&4 for booth rent only — use judgment).
- [ ] **Phase 2 — Option C booth revenue:** manager attaches a booth-rent payment link to an off-platform `market_booth_placeholders` row → vendor pays no-login → webhook records. Reuses `calculateBoothRentalFees` + destination-charge pattern. ~1 mig + manager UI + no-auth payment page + webhook.
- [ ] **Phase 3 (later) — Option B:** lite self-serve booth accounts for cat 3/4 (`sell_eligible=false`, selling UI hidden, buyer-invisible, bookings-only dashboard). Re-decide COI then.
- To draft when picked up: exact cat-3/4 rejection copy; signup placement; whether event vendors are gated too.

## Priority 1 — Growth feature set: Regional-Manager / market-operations (Session 92 deep dive)

Full spec + user decisions: `apps/web/.claude/session92_events_mm_growth_research.md` §J (+ §H/§I for the RM model corrections). Composable-roles principle: roles stack, never merge. FUTURE build — user-approved direction, not yet scheduled.

- [ ] **Phase 1B (manager suspend/restore + history UI)** — already designed (`manager_export_and_lockout_plan.md`); PRIORITY BUMPED: it's the RM governance + future license-fee enforcement lever (`manager_status` = the off-switch). Includes mig 154 → Prod.
- [ ] **Build-now candidates** (small/low-risk, ~½-1 session each): manager visibility-gate transparency card; manager-net earnings card (calculateBoothRentalFees().managerReceivesCents over paid rentals); open-booth counts on vendor's CONNECTED markets only; market follows (mirror vendor_favorites) + market-day-morning + special-date notifications w/ audience-resolution helper; manager broadcast (one-way, rate-limited, existing rails — supersedes the Session 85 "broadcast to existing market vendors" item below).
- [ ] **Design-first**: (a) per-market rental granularity (weekly|daily|half-day) + SEASON PREPAY (user design 2026-06-12: manager-set prepay window, X-day refund cap, cancelled-day counter, season-end settlement menu: make-up days via date-overrides / rollover credit / booth upgrade / cross-market credit / cash last resort — vendor picks from manager's offers; ONE Stripe checkout, NO subscriptions — avoids destination-charge clawback exposure); (b) market_date_overrides (cancel-a-date + special dates; booth fees → credit, buyer product orders → existing refund machinery — user-accepted exception); (c) vendor check-ins: start/stop day, server timestamp, Geolocation API + distance-from-market, self-attestation primary; OPEN: FT-law jurisdiction requirements + whether manager counter-signature is needed.
- [ ] **Survey-proof pipeline** — cron already LIVE (vercel.json:17-19 hourly, verified Session 92); once real data accumulates: exportable stats (pairs w/ manager_export plan) + optional public market-profile badge (manager acquisition + non-profit funding numbers).
- [ ] **Deferred within this set**: VIP customer tagging (launch with flash sales, not before); market templates ("copy from my other market"); RM program pitch page + license fee model (user decision pending — geo/population-protected territory).

## Priority 2 — FT vertical: HB 2844 DSHS licensing (Texas) — direction set, BACKLOGGED (2026-06-21)

Full plan + authoritative statute (Health & Safety Code Ch. 437B) + info-gaps revisit checklist: `apps/web/.claude/ft_hb2844_licensing_plan.md`. **Deferred behind more urgent work (sales tax).**

- **Direction = Option C (Hybrid), decided 2026-06-21:** `texasfoodtrucklaw.com` (owned) = public SEO funnel + heavy/volatile truck-owner compliance tooling (the law, classification wizard, doc checklist, deadline countdown, license lookup); **the app** = a thin, durable compliance-*status* layer serving the **FT-park-manager "premium destination" thesis** (truck doc vault + renewal reminder, park-dashboard "X of Y trucks license-ready" signal reusing FM manager-views-vendor-docs, "DSHS-licensed" trust badge, auto-itinerary §437B.154 from existing schedule data). Principle: **app = source of truth for identity + status; TFTL = mostly public/stateless.** v1 coupling = TFTL→app deep-link handoff + pre-fill (no live sync); bidirectional sync + shared license-lookup = later. Do NOT put TFTL on core marketplace tables. Data weight is NOT the concern (all 5 features reuse existing doc + location data) — volatility/liability/audience are, and Option C pushes those onto the standalone domain.
- [ ] **When un-backlogged (cheap, no build):** (1) validate `texasfoodtrucklaw.com` search-volume thesis (checklist §C); (2) scope which thin app-side signals reuse existing FM-manager components 1:1; (3) re-pull DSHS adopted rules (Type I/II/III categories, fees, inspection cadence — due ~May 1 2026) + map the live Tyler/Online-Licensing portal screens. See the plan's "Information gaps — revisit checklist."

## Priority 1.5 — Session 92 fresh-review deferrals

- [ ] **F6: expire-orders cron Phase 1 N+1 batch prefetch** — 3 sequential per-item queries (count `expire-orders/route.ts:160-163`, remaining-items `:202-206`, payments `:219-224`) × limit(100) batch inside `maxDuration=60` (`:52`). Collapse to per-batch prefetch (one order_items fetch + one payments fetch for all order_ids, JS Maps). Per-item claim UPDATE/inventory RPC/notifications untouched. Structural metric: ~302 queries → ~2 per batch. Same minor shape in surveys cron (`surveys/route.ts:263-270`). Deferred from Session 92 (kept the fix batch surgical). Code-stability Rule 2.1 applies: record query-count before/after.

- [ ] **Admin notification on failed Stripe refunds** — follow-up to Session 92 F4 (failed refunds now logError ERR_REFUND_001 → visible in error-log review). v2: fire an admin notification (new template + registry entry + i18n keys) so failed refunds page someone instead of waiting for the next kickoff review. Also consider a cron retry sweep for refund failures (relates to F3 in `session92_fresh_review_research.md` — webhook auto-refund failures ERR_WEBHOOK_011 have no retry either).

## Priority 2 — Mig 153 (X1b): lock down ~28 trigger/utility SECURITY DEFINER functions (Session 87)

> **⚠️ READ FIRST when picking this up:** `validate_cart_item_schedule` was MISSED from mig 152's scope. It follows the same pattern as `validate_cart_item_inventory` and `validate_cart_item_market` (both covered by mig 152) but was overlooked when drafting. Include it in mig 153's REVOKE list — same DO-block pattern, REVOKE FROM PUBLIC + anon + authenticated. Confirmed via Session 87 Prod advisor: function still appears in the anon-callable list.

- [ ] **REVOKE EXECUTE FROM PUBLIC + anon + authenticated on ~28 trigger/utility functions** — Discovered during Session 87 Prod advisor re-check post mig 152. Mig 152 closed the X1a financial-RPC gap (confirmed by advisor — all 17 financial functions no longer flagged as anon-callable). Remaining ~186 advisor warnings split into 4 buckets:
  - **Bucket 1 (real concern, ~28 functions — this work):** Internal trigger/utility functions designed to be called by Postgres on table events or by service code, NOT by external API callers. They're SECURITY DEFINER + PUBLIC EXECUTE so they appear at `/rest/v1/rpc/<name>`. Functions: `auto_add_schedule_to_vendors`, `auto_cancel_order_if_all_items_cancelled`, `auto_create_vendor_schedules`, `auto_create_vendor_schedules_insert`, `auto_create_vendor_verification`, `check_vendor_schedule_conflict`, `check_subscription_completion`, `cleanup_cancelled_event`, `cleanup_cart_items_invalid_schedules`, `create_market_box_pickups`, `create_profile_for_user`, `enforce_listing_tier_limit`, `enforce_market_box_tier_limit`, `ensure_admin_premium_tier`, `ensure_user_profile`, `handle_market_schedule_deactivation`, `handle_new_user`, `notify_transaction_status_change`, `refresh_all_vendor_locations`, `refresh_vendor_location`, `scan_vendor_activity`, `set_listing_premium_window`, `set_market_box_premium_window`, `sync_verification_status`, `track_vendor_status_change`, `trg_refresh_vendor_location`, `trigger_cleanup_cart_on_schedule_change`, `update_vendor_activity_on_listing`, `update_vendor_activity_on_order`, `update_vendor_fee_balance`, `update_vendor_last_login`, `build_pickup_snapshot`, `calculate_order_item_expiration`, `find_next_available_wave`, `validate_cart_item_schedule` (missed from mig 152 — similar to the other `validate_cart_item_*`).
  - **Bucket 2 (auth helpers — bundle into mig 153 with REVOKE from anon only, keep authenticated EXECUTE):** `is_admin`, `is_admin_for_vertical`, `is_any_admin`, `is_platform_admin`, `is_regional_admin`, `is_verifier`, `is_vertical_admin`, `has_role` (2 overloads), `can_admin_market`, `can_admin_order`, `can_admin_vendor`, `can_delete_schedule`, `can_vendor_add_fixed_market`, `can_vendor_add_listing_to_market`, `can_vendor_publish`, `can_access_pickup`, `can_access_subscription`, `user_owns_vendor`, `user_is_subscription_buyer`, `user_is_subscription_vendor`, `user_buyer_order_ids`, `user_vendor_order_ids`, `user_vendor_profile_ids`, `get_buyer_order_ids`, `get_vendor_order_ids`, `get_user_admin_verticals`, `get_user_vendor_ids`, `get_vendor_fixed_market_count`, `get_vendor_fixed_market_limit`, `get_vendor_listing_count_at_market`, `get_schedule_active_order_count`, `is_order_buyer`, `vendor_has_active_schedules`, `vendor_skip_week`.
  - **Bucket 3 (accept — intentional public buyer browse):** `get_listings_within_radius`, `get_markets_within_radius`, `get_vendors_within_radius`, `get_nearby_zip_codes`, `get_region_zip_codes`, `get_zip_coordinates`, `get_listing_fields`, `get_vendor_fields`, `get_listing_markets_summary`, `get_listing_open_markets`, `get_listings_accepting_status`, `get_available_pickup_dates`, `get_vendor_next_pickup_date`, `is_listing_accepting_orders`, `get_event_waves_with_availability`, `get_vertical_config`, `st_estimatedextent` (3 PostGIS overloads). Per mig 149 file comments, these are confirmed-intentional. Long-term refactor option: convert each to SECURITY INVOKER + add RLS on underlying tables; for now, accept and document the advisor warnings.
  - **Bucket 4 (misc — bundle into mig 153 if convenient):** Add `SET search_path = public` to `check_subscription_completion` and `create_market_box_pickups` (the 2 mutable-search-path warnings). Verify `buyer_interests` RLS policy `WITH CHECK (true)` for INSERT is intentional (likely yes — public form). `listing-images` + `vendor-images` "Public can view" SELECT policies kept intentionally per mig 150 (for `<img src>` URLs) — accept. PostGIS extension in public schema — accept (Supabase default).
  - **Verified caller audit needed** before drafting mig 153 — same Explore-agent approach as mig 152. Especially scrutinize Bucket 1's `validate_cart_item_schedule` (likely auth-gated cart route only) and the trigger functions (should be zero RPC callers; if any exist in code that's a bug).
  - **Estimate:** ~1 hr to audit + draft mig 153, ~30 min to apply across all 3 envs (Dev → Staging → Prod). Apply mig 152 pattern: paste-and-verify on Dev, then Staging, smoke test, then Prod. Add a verification query at the bottom that confirms zero `=X/...` (PUBLIC) entries remain in `proacl` for the ~60 functions.
  - **Estimated impact on warnings:** drops the advisor count from ~186 to ~17 (only Bucket 3 + Bucket 4 minor warnings remain).

## Priority 2 — Broadcast to existing market vendors (deferred from NEW-8 Commit 7)

- [ ] **Manager broadcast surface for already-affiliated vendors** — Session 85 design intent (2026-05-26): when a manager wants vendors who are ALREADY at their market to know about new platform capabilities (e.g., "you can now book booths week-by-week via the platform"), the invitation flow can't reach them — they're filtered out by spam protection that excludes any vendor with an existing `market_vendors` row at the market. A separate one-off announcement / broadcast surface is needed.
  - **Options to consider:** (a) in-app banner on `/[vertical]/vendor/markets` shown to vendors at managed markets ("Your market manager mentions: ..."), (b) one-shot manager-initiated email blast via existing notification template registry, (c) market-profile-page banner visible to anyone affiliated with the market.
  - **Out of scope for v1 NEW-8** — invitation flow is for NEW affiliations only; this is informational outreach to EXISTING affiliations.
  - **Estimate:** depends on approach; in-app banner ~30 min, email blast ~1.5hr with rate-limit safeguards.

## Priority 2 — Manager-initiated invitation revoke (deferred from NEW-8 Commit 5)

- [ ] **Allow manager to revoke a pending invitation they sent** — User's design intent (2026-05-25): "if a manager invites a vendor to the market they can uninvite them — but they cannot remove them from the market on the app. that is a separate issue." Captures the carve-out that should exist: managers MAY revoke an invitation while it's still in `response_status='invited' AND approved=false`, but MAY NOT remove an active vendor (any other state).
  - **Current blocker:** flow-integrity test at `src/lib/__tests__/flow-integrity.test.ts:340-397` enforces a blanket "no manager API endpoint deletes from market_vendors" rule. The rule was written before manager-initiated invitations existed and doesn't anticipate the pre-response-revoke carve-out.
  - **Two options at design time:**
    - **(A) Soft-revoke** — add `'revoked'` as a 4th `response_status` value. Manager PATCH sets it instead of DELETE. Row stays for audit (admin can see manager invited then revoked). Test passes unchanged. Manager re-inviting same vendor flips the revoked row back to `'invited'`. **Recommended.**
    - **(B) Hard-delete with rule refinement** — update flow-integrity test to allow DELETE only when `response_status='invited' AND approved=false`. Weakens the boundary slightly but reflects user's stated intent more directly.
  - **Without revoke (today's state):** vendors who never respond get auto-declined by cron Phase 17 after 30 days. Clutters the manager's pending-invitations view for up to 30 days but is self-cleaning.
  - **Estimate:** ~1hr for A, ~30 min for B.

## Priority 1 — COI upload button hidden for vendors with grandfathered placeholders (Session 87, 2026-06-02)

- [x] ~~**Vendors with grandfathered_coi placeholder rows can't see an Upload COI button**~~ — RESOLVED (verified 2026-06-24): Option A already implemented in `COIUpload.tsx:65-71` (`hasRealDoc` placeholder check → `showUploadButton = coiStatus !== 'approved' || !hasRealDoc`) + button label switches to `'+ Upload COI'` at `:170`. Backlog entry was stale (fixed in a prior session, never checked off). Original report kept for reference. Discovered during the Session 87 Prod smoke test. The vendor's `vendor_verifications.coi_documents` JSONB array contains rows where both `url` and `path` are null/empty (filenames like `grandfathered_coi`, `test_coi`, `coi_2026.pdf`) — placeholders inserted when admin approved the vendor without an actual file upload. `coiStatus` ends up `'approved'` (because the verification record is approved), and `COIUpload.tsx:146` hides the upload button entirely when `coiStatus === 'approved'`. New `VendorDocLink` (X3) correctly renders "Document unavailable" for the placeholder row, replacing the prior `<a href="">` no-op clickable link. Net effect: vendor can SEE that the doc is missing but has NO way to upload a real COI without admin intervention. On staging ~19 of 20 COI rows are placeholders; likely similar on Prod.
  - **Recommended fix (Option A from session 87 discussion):** relax `COIUpload.tsx:146` condition from `coiStatus !== 'approved'` to also show the upload button when every `coiDocuments[]` entry lacks both `path` AND a parseable `url` (i.e., all rows are placeholders). When the vendor uploads, status flips to `'pending'` and admin re-reviews the real file. Button label switches to `'+ Upload COI'` (not `'Replace COI'`) when only placeholders exist. **Estimate:** ~15 min, one-file frontend change.
  - **Alternative (Option B):** correct the status server-side at `/api/vendor/onboarding/status` — return `coiStatus='not_submitted'` when all docs are placeholders. Touches an API consumed by several callers. ~30 min.
  - **Independent of mig 151** — upload button visibility is purely client-side; signed-URL / private-bucket changes don't affect it.

## Priority 1 — Phase C Prod deploy + Session 83 follow-ups

- [x] ~~**Migrations 138/139/140/141/142/143 to Prod + push 23 commits to `origin/main`**~~ — Shipped Session 87 (2026-06-02). Actual scope ended up larger: migs 138-148 + 149 re-run + 152 (new — REVOKE FROM PUBLIC closing the X1a inheritance gap) applied to Prod; 52 commits pushed via `PUSH_WINDOW_OVERRIDE=hotfix`; mig 151 application + bookkeeping commit pending in same session.

- [x] ~~Notification: failed booth rental purchase~~ — Shipped in commit `e4c5206c` (Session 83). Fires `booth_rental_payment_failed_vendor` from cron Phase 16.

- [x] ~~Notification: vendor + manager when booth rental is PAID~~ — Shipped in commit `e4c5206c` (Session 83). Fires `booth_rental_paid_vendor` + `booth_rental_paid_manager` from webhook.

- [x] ~~**Booth-renter notification gap on schedule changes**~~ — RESOLVED (verified 2026-06-24): `schedules/route.ts:389-402` queries paid future-week renters (`.eq('status','paid').gte('week_start_date', thisWeekStartStr)`) and adds them to the deduped `recipientUserIds` Set alongside approved vendors. Backlog entry was stale. Original report below.

- [ ] **Refund policy notice on booking form** — Locked design: "Once you book and pay, the booth is yours for the selected week. If the market is closed or cancelled for that week, the market manager will either refund you or invite you to set up on a future market date — their call." Placement: below the price card, above the agreement block in `BookBoothForm.tsx`. The block was built then reverted mid-session — re-add when ready. **Estimate:** 15 LOC.

- [ ] **Stage 3 amount reconciliation** — Webhook handler currently trusts `session.amount_total` matches expected `vendor_pays_cents`. Add a defensive check that flags discrepancies via TracedError. Low priority — destination charge model guarantees consistency unless Stripe mid-flight changes our `transfer_data.amount`, which it doesn't.

- [ ] **Stage 3 `account.updated` webhook → markets.stripe_* sync** — Currently lazy-sync via the status route works fine. Webhook-driven sync would be marginally faster for status changes but adds complexity. Defer until real ops experience shows it's needed.

## Priority 1.5 — Booth allocation time-awareness (gap G13 from session83_mm_audit.md)

- [ ] **Off-platform booth placeholders aren't time-aware + same-week double-booking is possible** — Two connected problems:
  1. `market_booth_placeholders` is time-invariant. A placeholder for booth #5 reduces capacity EVERY week, even if the off-platform vendor only shows up some weeks. Schema change needed: add `week_start_date DATE NULL` to `market_booth_placeholders` (NULL = always-occupied today's default; specific date = that-week-only). Update the capacity check in `/api/vendor/markets/[id]/book` accordingly. Also update `market_booth_placeholders` UNIQUE constraint from `(market_id, booth_number)` to allow multiple rows for the same booth on different weeks. Tricky: needs `UNIQUE NULLS NOT DISTINCT` semantics or partial index.
  2. Manager assigns `booth_number` AFTER booking — two paid bookings for the same week + same size could both get the same booth_number with no system check. Add `UNIQUE (market_id, week_start_date, booth_number) WHERE booth_number IS NOT NULL` partial index on `weekly_booth_rentals`.
  Raised by user 2026-05-19. ~2 hr work. Session 83.

- [ ] **Two-vendors-share-a-booth edge case** (task #31 — see notes there). User has flagged this as a real case (e.g., two vendors splitting one booth on different days of a market week or rotating). Currently no system support — manager just assigns same booth_number to two vendors and the UI doesn't surface the share. Needs design pass before code. Session 83 noted.

- [ ] **Booth label range can drift from inventory total after initial save (mig 144 follow-up)** — The PUT /booth-labels validator enforces `range count === sum(market_booth_inventory.count)` at save time. But the booth-inventory routes (POST / PATCH / DELETE on `/api/market-manager/[marketId]/booth-inventory/...`) have NO equivalent check. Sequence that drifts the state: manager saves labels `"1"..."8"` when total inventory is 8 → later adds another size tier with 2 more booths → inventory total = 10 but range is still 1..8. At booking time the RPC raises `LABELS_EXHAUSTED` (P0004) once the 9th vendor tries to book, OR if either column is NULL the RPC silently falls back to defaults. Manager sees no warning until the failed booking surfaces in `error_logs`. Surfaced 2026-05-20 (Session 84) alongside mig 144 (`apps/web/.claude/booth_auto_assignment_plan.md` § Known edge cases).

  **Fix options (decide before code):**
  1. **Validate on inventory mutation** — booth-inventory POST/PATCH/DELETE routes check whether the new total matches the configured range. If not, return 409 telling the manager to re-save labels first, OR auto-clear labels with a returned warning. ~30 LOC.
  2. **Auto-extend on growth** — if inventory total grows and the prefix is purely numeric, auto-extend `booth_label_end` by the delta. Doesn't handle shrinks or non-numeric prefixes cleanly. ~20 LOC.
  3. **Dashboard warning banner** — surface "Booth labels are out of sync with your inventory (range covers 8 booths, you have 10)" on the manager dashboard. Doesn't fix the broken-booking failure mode but makes the inconsistency visible. ~25 LOC.

  Recommendation: ship option 1 (auto-clear with explanation) as the v1 fix — simple, deterministic, surfaces the problem at the moment the manager caused it.

- [ ] **Admin dashboard data disconnect — "9 orders stuck for 24+ hours" banner vs Vendor Activity page shows all zeros (Session 84, 2026-05-22)** — Bottom-of-admin-panel red banner reports "9 orders stuck for 24+ hours" but `/farmers_market/admin/vendor-activity` shows all category counts at 0. Two different queries against (likely) two different sources — banner uses one stale-order filter, the page uses category-grouped counts that filter differently. Need to: (1) trace both query sites, (2) align the filter definitions OR have the page show the same number(s) the banner uses, (3) verify both refresh on the same cadence. Unrelated to market-manager work — separate admin-dashboard investigation. Found during manager-intake testing pass.

- [ ] **Require booth-tier selection when adding off-platform + on-platform vendors (feedback item #4, Session 84)** — Surfaced from manager testing 2026-05-22. Currently:
  - `market_booth_placeholders.inventory_id` is OPTIONAL ("— No size —" in the dropdown); manager can save an off-platform placeholder without declaring which size tier it occupies. Capacity math correctly subtracts the placeholder from the relevant tier ONLY when `inventory_id` is set; un-tiered placeholders just reduce the total count without telling the system WHICH tier is full.
  - On-platform vendors via `market_vendors` have a `booth_number TEXT` but no link to a booth-inventory tier — manager has no way to declare "Smith Farm is in the 10×10 row." The auto-assignment / capacity check has no way to know which tier each existing vendor occupies, so the "how many of each tier remain" math is fuzzy.

  Fix (needs code review before changing):
  1. Make `inventory_id` REQUIRED on placeholders. UI: dropdown defaults to "— Select size tier —"; Save disabled until selected. API: route returns 400 if missing.
  2. Add a tier selector to on-platform vendor rows in `VendorBoothList`. Schema change needed: `market_vendors.inventory_id UUID NULL REFERENCES market_booth_inventory(id) ON DELETE SET NULL` + same-market integrity trigger (mirror mig 135 pattern).
  3. Existing rows: backfill to NULL initially; UI shows "tier not set" warning. Manager fills in over time.

  Estimate: ~1-2 hr work (schema migration + UI for both placeholders and vendors). Session 84.

- [ ] **Structured manager-verification docs upload (feedback item #6 follow-up, Session 84)** — When the intake form's fuzzy match flags a possible duplicate (same name + city as an existing market), admins are currently told to email the prospective manager and request ownership proof, COI, etc. manually. A v2 build would add a structured docs-upload UI on the manager dashboard (similar to the vendor 3-gate verification system at `src/app/[vertical]/vendor/onboarding/`) so the prospective manager can upload ownership docs + COI directly, admin reviews via a queue UI, and approval moves the market from `pending` → `active`. Scope when ready: new `manager_verification_docs` JSONB column on `markets` (or a separate table), upload UI, admin review queue, decline-with-reason flow. Until then, the email warning + admin detail-page banner cover v1. Session 84.

- [ ] **Existing-vendors step required in onboarding wizard (feedback item #5, Session 84)** — Surfaced from manager testing 2026-05-22. Currently the onboarding wizard's "vendors" step + "placeholders" step are both optional (manager can skip and reach Setup Complete without declaring any vendors). User wants:
  - Make both steps required to complete onboarding.
  - Add an explicit escape checkbox per step: "I don't have any existing vendors at my market yet" (placeholders) / "I don't have any of my market's vendors on the platform yet" (on-platform). Checking the box skips the step legitimately; not checking it means the manager must add at least one entry.

  Fix (needs code review before changing): touch `OnboardingChecklist`, `onboarding/[step]/page.tsx`, possibly `getOnboardingProgress` to add a "skip acknowledged" boolean per step. Probably a new column on markets — `onboarding_no_existing_vendors_ack BOOLEAN`, `onboarding_no_placeholders_ack BOOLEAN` — or store ack values in a JSONB column. Decide schema shape during code review.

  Estimate: ~1 hr work. Session 84.

## Priority 1.5 — Pre-existing reader gaps for `market_schedules.active`

Surfaced by Session 83 Agent A's comprehensive scan; all pre-existing, none made worse by the soft-delete redesign. None affect data integrity. File one ticket per fix; small.

- [x] ~~**R15 — vendor PATCH allows attendance on inactive schedule**~~ — RESOLVED (verified 2026-06-24): the PATCH guard already exists at `schedules/route.ts:455-465` (`.eq('active', true)` on the schedule lookup → 404 if inactive); documented comment `:446-454` cites the deactivation trigger. Backlog entry was stale. Original report below.

- [x] ~~**R7 — admin GET `/api/markets/[id]/schedules` returns inactive**~~ — Fixed Session 84 batch. Added `.eq('active', true)`.

- [x] ~~**R24 — `/api/market-boxes/[id]` returns inactive schedule rows**~~ — Fixed Session 84 batch. JS-side filter on the embedded array.

- [x] ~~**R25 — `/api/buyer/orders/[id]` returns inactive schedule rows in `display.schedules`**~~ — Fixed Session 84 batch. JS-side filter on the embedded array.

- [ ] **R29 / R30 — count selects include inactive** — `src/app/admin/markets/page.tsx:23` and `src/app/api/markets/route.ts:28` use `market_schedules(count)` without filter. Cosmetic. **Not fixed in Session 84 batch** because PostgREST embed-count can't return "all parent rows + filtered embed count" cleanly — would need either a separate query per market (N+1) or a denormalized `active_schedule_count` column. Defer to product decision.

- [x] ~~**R40 — `src/lib/events/shop-data.ts:142-147` event market schedule lookup ignores active**~~ — Fixed Session 84 batch. Added `.eq('active', true)`.

## Priority 1 — Market Manager v1 (FM only)

- [ ] **Market Manager dashboard + invite flow** — Pitch: free dashboard for FM market managers (vendor list with booth + attendance, aggregate market transactions, "invite a vendor" link, schedule view, support card) in exchange for them promoting the platform to their vendors and the public. Mirrors event organizer pattern (same human, different email; buyer dashboard card; admin-assigned via market admin UI). 1:1 manager:market for v1; FT park operator deferred. **Full plan + schema + 9-phase build order:** `apps/web/.claude/market_manager_v1_plan.md`. Awaiting user feedback from 1-2 friendly market managers (Amarillo / Canyon) before kickoff. Estimated 1-2 development sessions for end-to-end MVP. Drafted Session 78 (2026-05-05).

## Priority 1 — Market Manager v1 (FM only)

- [ ] **Market Manager dashboard + invite flow** — Pitch: free dashboard for FM market managers (vendor list with booth + attendance, aggregate market transactions, "invite a vendor" link, schedule view, support card) in exchange for them promoting the platform to their vendors and the public. Mirrors event organizer pattern (same human, different email; buyer dashboard card; admin-assigned via market admin UI). 1:1 manager:market for v1; FT park operator deferred. **Full plan + schema + 9-phase build order:** `apps/web/.claude/market_manager_v1_plan.md`. Awaiting user feedback from 1-2 friendly market managers (Amarillo / Canyon) before kickoff. Estimated 1-2 development sessions for end-to-end MVP. Drafted Session 78 (2026-05-05).

## Priority 0.5 — Dev environment catch-up (Session 78)

- [ ] **Dev is missing migrations 039 and 040 (event date columns) and possibly more** — Discovered 2026-05-04 while verifying migration 131 on Dev. The function `get_available_pickup_dates` errored at runtime with `column m.event_end_date does not exist`. `information_schema.columns` confirmed Dev's `markets` table is missing `event_start_date`, `event_end_date`, and `event_url` (Staging has all three). Per `CLAUDE_CONTEXT.md` Known Issues: "Dev out of sync: Migrations 039-041 on Staging+Prod. Dev needs these applied. Also 105 failed on dev (missing event columns — migration 039 never applied to dev)." This means `get_available_pickup_dates` has been silently broken on Dev for any caller — the browse page's `console.error` swallows it; listing detail returns empty, etc. Audit needed: query Dev's `information_schema` against the migration history (or against Staging) to identify ALL missing migrations, then apply them in order. Files to consider: 039, 040, 041, 110 (event_waves_schema adds more event columns), and any others. Don't apply blindly — some Dev-skipped migrations might have prerequisites that were also skipped. Until Dev is current, Dev cannot be reliably used to verify migration changes that touch event-related code. For migration 131's specific case, runtime verification was done on Staging only and that was sufficient because Staging is the env that mirrors Prod. **Not blocking** the Prod push of migration 131. Found 2026-05-04. Session 78.

## Priority 0 — Cross-Vertical Audit

- [ ] **FT vertical audit for market box changes (Session 74)** — Session 74's market box hardening focused on FM testing flows. Need to verify no FM-hardcoded terms or assumptions broke FT's market box UX. Review: vendor new/edit forms (`vendor/market-boxes/new/page.tsx` + `[id]/edit/page.tsx`), vendor list (`vendor/market-boxes/page.tsx`), vendor detail (`vendor/market-boxes/[id]/page.tsx`), cart drawer (`components/cart/CartDrawer.tsx`), checkout item (`checkout/CheckoutMarketBoxItem.tsx`), browse card (`browse/page.tsx`), subscription detail (`buyer/subscriptions/[id]/page.tsx`). Look for: hardcoded "farmers market" / "FM" terms, `term(vertical, ...)` calls that don't have FT mappings, vertical-conditional logic that may have been broken by display refactors. Particular risk areas: 8-week (2-month) option that's FM-only (`vertical !== 'food_trucks'`), pickup window UI (FT uses time slot, FM uses range). Found 2026-04-26.

## Priority 0 — TOP OF NEXT SESSION (Session 74 discoveries)

- [ ] **Pass platform order number/ID to Stripe metadata** — *PROMOTED FROM 0.5.* Currently Stripe checkout sessions, charges, and payment intents do NOT carry the platform's `order_number` or `order_id`. Looking at the actual Stripe event for Order #FA-2026-34616411, the only platform identifier was `client_reference_id: 295bb0bb-...` (the order UUID), which the user can't easily match to an order number. **Operational consequence:** vendors and admins cannot conclusively trace a Stripe transaction to an order without running DB queries. This blocks routine reconciliation and turns every "did we charge for the right thing?" question into an investigation. Add `order_number` AND `order_id` to the Stripe Checkout session `metadata` field at session creation. Touches `apps/web/src/app/api/checkout/session/route.ts` (CRITICAL-PATH — needs per-file approval with diff). For market box subscriptions, also include `market_box_subscription_id` (set after subscription creation, via Stripe's PaymentIntent metadata update — or wait until next charge cycle). Verify metadata appears on both the checkout session AND the resulting payment intent. Originally raised by user 2026-04-25; promoted to Priority 0 after the Order #FA-2026-34616411 investigation made the operational pain concrete.

- [ ] **`processMarketBoxPayout` catch-all eats errors silently** — `apps/web/src/lib/stripe/market-box-payout.ts:144-146`. The outer try/catch does only `console.error('[MARKET_BOX_PAYOUT] Error in processMarketBoxPayout:', err)` — never `logError`. ANY thrown error inside the helper vanishes from `error_logs` (only visible in Vercel logs which expire). **This is exactly why the constraint-violation bug took so long to find** — only the specific INSERT path uses `logError(ERR_PAYOUT_003)`, so we got one structured trace; if the throw had come from the vendor lookup, transfer call, or anywhere else, we'd have had zero diagnostic trail. Fix: change the catch-all to `await logError(new TracedError('ERR_PAYOUT_005', \`Unhandled error in processMarketBoxPayout: ${err}\`, { route: source === 'checkout-success' ? '/api/checkout/success' : '/webhooks/stripe', method: source === 'checkout-success' ? 'GET' : 'POST', subscriptionId, offeringId }))`. ~5-line change, dramatically improves debuggability of all future market box payout failures. Found Session 74.

- [x] **Schema snapshot is wrong about 4 columns on `orders` table — phantom columns may be referenced in code** — *RESOLVED 2026-04-26.* Audit results: `orders.vendor_payout_cents`, `orders.buyer_fee_cents`, `orders.service_fee_cents` are NOT referenced in any production code (the matches are all on `order_items` joins or in test fixtures using object literals). `orders.market_id` HAS 4 active references in event-cancellation flows (`events/[token]/cancel/route.ts:116-144` and `admin/events/[id]/route.ts:242-271`) — all 4 silently failed at runtime, breaking the entire event-cancellation buyer-notification + order-cancellation flow. Fixed by querying via `order_items.market_id` (the working pattern documented in `events_comprehensive_todo.md` T0-2 and used correctly elsewhere — e.g. `admin/events/[id]/route.ts:294-298` for the completion flow). Status filter also extended to preserve `'completed'` orders (don't mark already-completed orders as cancelled). **STILL TODO** (separate backlog item below): regenerate `SCHEMA_SNAPSHOT.md` from REFRESH_SCHEMA.sql to clear the 4 phantom columns from the snapshot.

- [x] ~~**Regenerate `SCHEMA_SNAPSHOT.md` to remove 4 phantom `orders` columns**~~ — DONE 2026-06-24: re-confirmed absent on live Staging via `information_schema.columns` (0 rows), removed the 4 rows from the `orders` section + added a Change Log entry. (Full structured-table regen via REFRESH_SCHEMA.sql still optional but the phantom columns are gone.) Original report below. Snapshot at lines 740-743 (approximate) lists `orders.vendor_payout_cents`, `buyer_fee_cents`, `service_fee_cents`, `market_id` which don't exist on live staging. Live verified 2026-04-26 via `information_schema.columns` query. The snapshot rebuild done 2026-04-05 was wrong about these 4 (likely a copy/parse error in the REFRESH_SCHEMA output processing). Action: ask user to run `supabase/REFRESH_SCHEMA.sql` and rebuild the structured tables in `SCHEMA_SNAPSHOT.md`. Until done, the new mechanical schema gate in CLAUDE.md (escalate to `information_schema.columns` when snapshot fails) covers this — but cleaning the snapshot is the proper fix. Found 2026-04-26.

- [ ] **T0-2 step 3: refund Stripe-paid event orders on event cancellation** — When an event is cancelled (organizer or admin), buyer orders are now correctly marked `cancelled` with a notification (Session 74 fix). However per design doc `events_comprehensive_todo.md` T0-2 step 3, Stripe-paid buyers should ALSO get an automatic refund (or be flagged for manual refund). Current implementation marks orders as cancelled but does not initiate refunds. Stripe-paid buyers see "cancelled" status in their dashboard but won't see money returned without separate action. Touches `lib/stripe/payments.ts` (CRITICAL-PATH) — needs per-file approval. Two paths: (a) auto-refund via Stripe API in the cancel routes, (b) flag the orders for manual admin review (intermediate step before full automation). Found 2026-04-26 while fixing the order-cancellation bug; this is the unfinished piece of the original T0-2 design.

- [x] **Audit other webhook handlers for the `if (!existingPayment)` anti-pattern** — *RESOLVED 2026-04-26.* Audited all 13 handlers in `webhooks.ts` + `resend/route.ts`. **No other handlers have the same bug shape.** Findings: (1) `handleMarketBoxCheckoutComplete` has an `if (existing) {...}` pattern at line 372 BUT correctly calls `processMarketBoxPayout` inside the existence branch before returning — this is the GOOD idempotent pattern. (2) All UPDATE-only handlers (`handlePaymentSuccess/Failed`, `handleAccountUpdated`, `handleInvoicePaymentSucceeded/Failed`, `handleSubscriptionCheckoutComplete`, `handleSubscriptionUpdated/Deleted`) are pure UPDATEs and idempotent by nature. (3) `handleTransferCreated/Failed` and `handleChargeRefunded` use `wasNotificationSent` dedup and apply state-based UPDATEs — safe on retry. (4) `handleChargeDisputeCreated` is notification-only with NO dedup — admins receive duplicate notifications on Stripe retry. Logged as a separate Priority 1 cleanup item below (low severity — notification noise only, no monetary risk). The original bug was unique to `handleCheckoutComplete`'s specific combination of payment-row idempotency + nested side effects.

## Priority 0.5 — Buyer Upgrade

- [ ] **Premium buyer upgrade returns "Not authenticated"** — Found 2026-04-26 by user testing. User tried to upgrade buyer to premium and received `Not authenticated` error from the upgrade endpoint. The user WAS authenticated (had to be to reach the upgrade page). Investigation: find the buyer premium upgrade endpoint (likely under `/api/buyer/premium/...` or `/api/buyer/upgrade/...`), check whether it uses `supabase.auth.getUser()` or session check correctly. May be missing the auth context cookie pass-through, or the endpoint may have an auth check that's looking for a `vendor` role when buyer doesn't have one. Cross-reference: this also surfaced the error-reporting form bug (C) — see Priority 0.5 — Market Box UX duplicate-subscription entry. Fix the auth bug AND the form bug together since they're paired in user experience.

## Priority 0 — Stripe Refund Cleanup for Market Box Subscriptions (A4 from Session 75)

- [ ] **Stripe Dashboard refund of a market box subscription doesn't cancel the subscription, future pickups, or reverse the vendor's payout** — `apps/web/src/lib/stripe/webhooks.ts:914-1009` (`handleChargeRefunded`). When admin refunds a charge via Stripe Dashboard, the handler currently:
  - ✅ Marks `orders.status = 'refunded'`
  - ✅ Marks `order_items.status = 'refunded'`
  - ✅ Marks `payments.status = 'refunded'`
  - ✅ Notifies buyer + vendors
  - ❌ Does NOT update `market_box_subscriptions` (status stays 'active')
  - ❌ Does NOT cancel future `market_box_pickups`
  - ❌ Does NOT reverse the vendor's Stripe transfer
  - ❌ Vendor was paid upfront via `processMarketBoxPayout` and keeps the money for boxes never delivered

  **Plan drafted in Session 75** (~50 LOC, scoped diff already prepared) but held for a separate session because of three caveats that need product decisions:

  1. **`vendor_payouts.status = 'reversed'` is a new status value** — schema may have a CHECK constraint or enum that doesn't allow it. Need to verify on staging via:
     ```sql
     SELECT pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conrelid = 'public.vendor_payouts'::regclass
       AND contype = 'c';
     ```
     Decision: (a) reuse existing `'cancelled'` status, (b) ship a small migration adding `'reversed'`, or (c) other. `'cancelled'` is probably fine — semantically the payout is no longer happening, regardless of why.

  2. **Mixed orders (listings + market box)** — full refund of a mixed order would cancel ALL market box subscriptions in that order under the simple `isFullRefund` check. If admin only meant to refund the damaged listing, the market box gets nuked too. May be acceptable for v1 (admin can re-create the market box manually) but worth deciding before shipping.

  3. **`payout_failed` notification template reuse** — the existing `payout_failed` template may have wording specific to "Stripe transfer was reversed by Stripe" that doesn't quite fit the "buyer was refunded by admin" case. Either tweak the template's `reason` parameter handling, or add a new `payout_reversed` notification type.

  **Operational interim:** until A4 ships, when admin refunds a market box charge via Stripe Dashboard they MUST also manually:
  - Cancel the subscription in Supabase (`UPDATE market_box_subscriptions SET status='cancelled', cancelled_at=now() WHERE stripe_payment_intent_id = ?`)
  - Cancel future pickups (`UPDATE market_box_pickups SET status='cancelled' WHERE subscription_id = ? AND status IN ('scheduled','ready')`)
  - Reverse the Stripe transfer manually if the vendor was already paid (Stripe Dashboard → Connect → Reverse Transfer)
  - This is exactly the kind of multi-step manual cleanup that A4 was designed to automate. Document the runbook for now.

  Found 2026-04-26 during Session 75 fresh code audit. Plan + diff captured in `apps/web/.claude/session75_fresh_audit.md`.

## Priority 0.5 — Market Box Wave-Anchor Mechanism (NEEDS DESIGN)

- [ ] **Biweekly market box subscribers can land on different pickup waves (C9 from Session 75 audit)** — Currently when a biweekly vendor accepts new subscribers, each subscriber's `start_date` is computed as "next occurrence of vendor's pickup_day_of_week" (`api/market-boxes/[id]/route.ts:142-152` and `api/cart/items/route.ts:417-427`). For weekly vendors this is fine — every subscriber lands on the same weekly cadence. For biweekly vendors, two subscribers who join in different weeks end up on opposite 2-week waves. Buyer A (joined Mon Jan 6) gets pickups Jan 7 / Jan 21 / Feb 4 / Feb 18. Buyer C (joined Thu Jan 23) gets pickups Jan 28 / Feb 11 / Feb 25. Vendor has to either prep every Tuesday (defeating "biweekly" promise) or have some buyers' pickups go undelivered (auto-marked `missed` by cron Phase 4.7, buyer charged for box not received because `weeks_completed` counts `missed` as resolved per migration 124's `check_subscription_completion` trigger).

  **Why this is on backlog and not a blocking fix:** the system has no concept of a vendor "wave" today. Vendors set a single pickup day-of-week (e.g., Tuesday) and a frequency flag (weekly or biweekly). There's no `anchor_date` — no way for the system to know which Tuesdays are "delivery weeks" and which are "off weeks." The biweekly assumption is implicit in the trigger that schedules pickups every 14 days starting from each subscriber's individual `start_date`. There may also be vendors who genuinely DON'T have a wave (each subscriber gets independent biweekly cadence is fine for them). Need design decision before writing code.

  **Proposed mechanism — vendor wave anchor (sketch):**

  1. **Add `vendors-set anchor` to the offering or vendor profile.** Two design choices:
     - (a) Per-vendor anchor on `vendor_profiles.market_box_wave_anchor_date DATE` — single anchor for all the vendor's biweekly offerings. Simpler; matches the per-vendor `market_box_frequency` setting.
     - (b) Per-offering anchor on `market_box_offerings.wave_anchor_date DATE` — vendor can run different offerings on different waves. More flexible; more complex.
     Recommend (a) for v1.

  2. **Add `wave_mode` to `vendor_profiles`** — `'aligned'` (all biweekly subs use the same wave) or `'independent'` (each sub gets its own 14-day cadence from their start_date — current behavior). Default `'independent'` so existing behavior preserved. Vendors who want aligned waves opt in.

  3. **Update `next_start_date` computation** in `api/market-boxes/[id]/route.ts` and `api/cart/items/route.ts`:
     - If `wave_mode === 'aligned'` AND vendor has `wave_anchor_date`: compute next valid wave date = `anchor_date + N*14` where N is smallest integer making the date >= today.
     - Else: current behavior (next pickup_day_of_week within 7 days).

  4. **Update vendor UI** — when vendor selects biweekly + aligned wave mode, prompt them to set the anchor date (or auto-derive from existing active subscribers).

  5. **Migration considerations:**
     - Existing biweekly subs (currently zero on prod per `current_task.md`) keep their independent cadences — no backfill needed.
     - New biweekly subscribers under aligned mode snap to the wave.
     - If vendor switches modes mid-stream while subs exist, document that existing subs keep their original cadence and only new subs use the new mode.

  6. **`subscribe_to_market_box_if_capacity` RPC update:** validate that for aligned-mode vendors, the supplied `p_start_date` matches a valid wave date. Reject otherwise (defense in depth — the API layer should already snap correctly).

  **Scope estimate:** 1 migration (2 columns + check constraint), 2-3 API routes touched, 1 vendor UI panel for anchor configuration, RPC update. Probably 3-4 hours implementation + testing. Worth scheduling for the next market-box-feature iteration; not urgent for this prod push because biweekly is freshly launched and there are zero biweekly subs in prod today (per `current_task.md`).

  **Stopgap shipped:** vendor UI on `/vendor/market-boxes` page now shows a warning when biweekly is selected explaining that each subscriber's wave starts independently. Vendors can decide whether to (a) accept the operational reality of per-subscriber waves, (b) coordinate manually via skip+extend on out-of-phase subscribers, or (c) wait for the wave-anchor mechanism. (Session 75 fix.)

  Found 2026-04-26 during Session 75 fresh code audit.

## Priority 0.5 — Notification Routing (NEEDS DESIGN DISCUSSION)

- [ ] **Notification deep-link routing for market box pickups is wrong for early/off-day pickups** — Found 2026-04-26 by user testing. When a buyer confirms a market box pickup, the vendor receives an in-app notification. Clicking it currently routes the vendor to **Pickup Mode** (`/[vertical]/vendor/pickup`), which is filtered to show only TODAY's `status='ready'` pickups (per the comment added in Commit C). If the buyer confirms pickup early (vendor marked ready before scheduled date), pickup mode page shows nothing — vendor can't find the pickup, the 30-second confirmation window expires, buyer gets a "vendor missed window" notification, and the cascade gets ugly.

  **Design options to discuss next session:**
  - (a) Always route to the market box manage page (`/[vertical]/vendor/market-boxes/[offering_id]` Pickups tab) — vendor gets full context regardless of date
  - (b) Route by date: today's pickup → pickup mode (current behavior), not-today → manage page
  - (c) Route by notification action type: "ready for pickup" notifications → pickup mode (vendor-initiated flow); "buyer confirmed" notifications → manage page (response to buyer action)
  - (d) Combine (b) + (c) — most complex but most context-sensitive

  Also affects timing/race-condition issues: in user's test, vendor was 30s late confirming because they couldn't find the pickup, system fired "vendor missed" to buyer, vendor confirmed late, buyer reconfirmed within 30s, system marked picked_up. Notification routing is upstream of all this.

- [ ] **Vendor not notified when new market box subscription created** — User created a new market box subscription on 2026-04-26 (Stripe `pi_3TQaLNAUXdXt3w5T28jdCxWJ`); buyer was notified immediately, vendor was not. The subscription DOES appear correctly in the vendor's `/vendor/market-boxes` Subscribers tab with the buyer's email — just no in-app notification fired. Need a `new_market_box_subscription` notification type (or reuse existing `new_paid_order` if the structure fits) sent to the vendor on subscription creation. Trigger point: in `processMarketBoxPayout` after subscription is confirmed, OR in the success route's market box block. Found 2026-04-26.

## Priority 0.5 — Vendor Dashboard

- [x] **Vendor analytics overview does not show today's sales** — *PARTIALLY RESOLVED 2026-04-26 — overview route fixed; 4 sibling routes still need same treatment.* Root cause: not a date-filter bug — analytics queries ONLY `order_items` and market box subscriptions live in `market_box_subscriptions` (separate table, never create order_items rows). Every market box sale was invisible to vendor analytics. Fixed in `api/vendor/analytics/overview/route.ts` by adding parallel SELECT on `market_box_subscriptions` filtered via `market_box_offerings.vendor_profile_id`, then aggregating subscription `total_paid_cents` into the existing revenue/order count buckets ('active' and 'completed' subs count as completedOrders + totalRevenue; 'cancelled' goes to cancelledOrders bucket). Math verified equivalent semantic: subscription `total_paid_cents` = vendor's stated price = same as `order_items.subtotal_cents` (gross before vendor fee).

  **2026-04-26 update:** trends + customers routes also fixed using the same pattern (commit forthcoming). Subscription counted as 1 customer encounter (buyer_user_id is on subscription row directly — no orders join needed). Period bucketing in trends uses an extracted `periodKeyFor` helper applied to both order_items and subscriptions for symmetry.

  **STILL TODO — 2 design-call routes:**
  - `api/vendor/analytics/top-products/route.ts` — currently groups by `listing_id` with title/image. Mixing market_box_offerings as "products" alongside listings would require either (a) adding offerings as separate rows (different "product" shape — name vs title, image_urls array vs listing_images join), or (b) keeping top-products as listings-only and adding a separate "Top Market Boxes" panel to the analytics UI. Recommend (b) — cleaner separation. Add UI section with offerings sorted by subscription count + revenue. UI/design discussion, then code.
  - `api/vendor/analytics/tax-summary/route.ts` — filters by `listings.is_taxable`. `market_box_offerings` doesn't have an `is_taxable` column. Subscriptions cover multiple pickups of varied items — needs a design call: (a) market boxes treated as a unit with vendor-set taxability flag (new column), (b) item-by-item taxability via the menu items in each pickup, (c) market boxes are non-taxable as a category, or (d) vendor-configurable per-offering. Defer until tax compliance work decides the model (TaxCloud vs Stripe Tax decision in Priority 0 Pre-Launch backlog).

- [ ] **Buyer orders progress bar shows "0 of 4 pickups" after pickup confirmed** — Found 2026-04-26 by user testing. After buyer confirmed receipt of pickup #1 on a market box subscription, the progress bar on `/[vertical]/buyer/orders` still shows "0 of 4 pickups." Likely date-triggered (waiting for `scheduled_date` to pass) instead of status-triggered (counting pickups with `status='picked_up'`). Investigation: find the `pickups_progress` rendering logic in `buyer/orders/page.tsx` and switch from a date-based count to a status-based count. Related to (but separate from) the `weeks_completed` trigger bug — this one is purely UI counting; the trigger bug is DB state.

- [ ] **Vendors cannot delete market boxes (only deactivate)** — Found 2026-04-26 by user testing. There's no delete action for market box offerings in the vendor UI. Vendors can deactivate via the active toggle, but a deactivated box still consumes a slot in their offering count and clutters their list. Need design + guardrails before implementing:
  - Hard delete vs soft delete (soft = `deleted_at` column, preserves audit trail and existing subscriptions)
  - Require zero active subscribers before delete (otherwise active subscribers lose their subscription record)
  - What happens to historical `vendor_payouts.market_box_subscription_id` references (use ON DELETE SET NULL or CASCADE? CASCADE would erase payout records — bad)
  - What happens to `market_box_pickups` rows — preserve for audit?
  - Confirm UI flow with double-confirm because it's destructive
  Recommendation: soft delete with `deleted_at` filter on all reads, FK `ON DELETE RESTRICT` on subscriptions, only deletable when zero active subs. Open design question.

- [ ] **Subscribers tab on vendor market box detail page should show order number** — Found 2026-04-26 by user testing. URL: `/[vertical]/vendor/market-boxes/[id]` Subscribers tab. Currently shows buyer email per row but no `order_number`. Vendor cannot see which buyer is associated with which order from the market box management screens. Add the order number column joined from `market_box_subscriptions.order_id → orders.order_number`. Investigation: `vendor/market-boxes/[id]/page.tsx` Subscribers tab render (around line 545 area where current `Subscriber` interface is rendered). Need to add `order_number` to the Subscriber type + the API response from `/api/vendor/market-boxes/[id]`. Found while testing market box flow on 2026-04-26.

- [ ] **`market_box_subscriptions.weeks_completed` not incrementing when pickup confirmed** — Subscription `c6acffda-b05a-42e0-b010-978695c2197b` has pickup #1 with `status='picked_up'`, both `vendor_confirmed_at` and `buyer_confirmed_at` populated, but `weeks_completed` on the parent subscription is still 0. The `check_subscription_completion` trigger (rewritten in migration 124 to count actual pickup rows instead of relying on `term_weeks`) appears to not be firing OR is not updating `weeks_completed`. Verify trigger is attached to `market_box_pickups` AFTER UPDATE, then check what it actually does — may only flip status to `completed`, not bump weeks_completed. Affects subscription lifecycle status, trial-to-paid conversion logic, vendor analytics, and completion notifications. Found 2026-04-26 while investigating Order #FA-2026-34616411.

## Priority 0.5 — Stripe operational improvement

- [ ] **Other 5 silent-return points in `processMarketBoxPayout` should log when triggered** — Beyond the catch-all (Priority 0 above), the helper at `apps/web/src/lib/stripe/market-box-payout.ts` has 5 more places that silently return without any error_logs entry: line 35 (`actualPaidCents <= 0`), line 49 (existing non-terminal payout — fine, but noise-free is OK), line 58 (offering not found), line 66 (vendor not found), line 86 (duplicate insert 23505). The "not found" cases especially should `logError` — if those fire it indicates data integrity issues that should be visible. ~10 lines added, gives observability for "shouldn't happen" cases that, when they DO happen, are critical. Found Session 74.

- [ ] **Yesterday's $16.01 vendor payout still 'processing' 24+ hours later** — Vendor `farmersmarketingapp+vegvendor1` payout `aa74cfda-37da-4a8c-8d32-d1677e9f04ee` (transfer `tr_3TPsV5AUXdXt3w5T15M6RAsF`, $16.01, regular order) has been in `vendor_payouts.status='processing'` since 2026-04-24 22:49 UTC. Either (a) Stripe test-mode transfers genuinely take days to settle (possible — verify in Stripe sandbox), or (b) there's no cron/webhook updating our `vendor_payouts.status` from Stripe's `transfer.paid` event. If (b), processing payouts may stay in that state indefinitely and the dashboard's "Pending Payouts" number will compound forever. **Investigation:** check if a Stripe `transfer.paid` or `payout.paid` webhook handler exists in `webhooks.ts` and whether it updates `vendor_payouts.status='paid'`. If not, this is a real gap. Found Session 74.

- [ ] **Investigate which migration added `vendor_payouts.market_box_subscription_id` without updating the constraint** — Migration 127 had to fix `vendor_payouts_has_reference` to accept the column. The column existed for some time before that (helper code referenced it). Means an earlier migration added the column and missed updating the CHECK constraint. **Worth knowing:** which migration, what else it changed, and whether any other constraints in the codebase have similar "added column / missed constraint update" gaps. Process-quality investigation. Found Session 74.

- [ ] **Order-side cron retry missing `source_transaction`** — `apps/web/src/app/api/cron/expire-orders/route.ts:1089-1094` calls `transferToVendor` without `source_transaction` in the order-side Phase 5 retry block. Commit `121b3d5e` fixed the inline `fulfill` route only — the cron retry path was not touched. Same `balance_insufficient` failure mode as the original Jennifer/Chef Prep incident applies here when funds haven't settled. One-line fix mirroring the order fulfill pattern: look up charge ID from `payments.stripe_payment_intent_id` for the payout's `order_item.order_id`, pass as `sourceTransaction`. Found while auditing the market box payout flow on 2026-04-24.

## Priority 1 — Webhook polish

- [ ] **`handleChargeDisputeCreated` doesn't dedup admin notifications** — `apps/web/src/lib/stripe/webhooks.ts:1015`. The handler notifies all admin users about a Stripe chargeback. If Stripe retries the webhook (which they do for any non-2xx response or sometimes spuriously), all admins get the dispute notification a second time. Other notification-emitting handlers in the same file (`handleTransferCreated`, `handleChargeRefunded`) use `wasNotificationSent(supabase, userId, type, refKey)` to dedup — apply the same pattern here using the dispute ID (`dispute.id`) as the dedup key. Severity: low (notification noise, no monetary risk). Found 2026-04-26 during the webhook anti-pattern audit (Priority 0 item now resolved).

## Priority 1 — Infrastructure / Process

- [ ] **Stripe webhook endpoint cleanup — one endpoint missing Protection Bypass** — Stripe sandbox has 2 webhook endpoints registered. One has Vercel Protection Bypass header set (works — delivers to staging), one doesn't (returns 401 on every delivery). The broken endpoint pollutes the Stripe Events log and could mask real failures. Either add the bypass header to the broken one OR delete it. Cosmetic but worth a 5-min cleanup. Found Session 74.

- [ ] **Pre-existing baseline lint error in `OrganizerEventDetails.tsx:110`** — `react-hooks/set-state-in-effect`. Slipping past pre-commit because lint-staged only checks staged files. Real React anti-pattern (cascading renders). Fix is probably wrapping the setState in `queueMicrotask()` or moving to a `useMemo`. ~1-line fix. Found Session 74 while running `npm run lint` on Batch 1 changes.

- [ ] **Verify `STRIPE_SECRET_KEY` on staging matches Stripe sandbox** — Stripe migrated from legacy "test mode" (orange bar) to "Sandboxes" (blue bar) for this account. If Stripe rotated keys during the migration, staging's `STRIPE_SECRET_KEY` env var could be pointing at the wrong sandbox or stale key. Symptom would be webhook events never delivering to staging at all (different from the Protection Bypass issue above). Quick verify: confirm the key prefix (e.g., `sk_test_51...`) matches what's shown in the active sandbox's Developers → API keys section. Found Session 74.

## Priority 0.5 — Market Box UX (early pickup notification)

- [ ] **Buyer notification when vendor marks pickup ready BEFORE scheduled date should include deep link to confirm-pickup page** — Today, market box pickups have a scheduled date and a face-to-face confirm flow. The two relevant pages are `/farmers_market/buyer/subscriptions/{subscription_id}?from=orders` (buyer side, includes confirm-pickup button) and `/farmers_market/vendor/market-boxes/{offering_id}` (vendor side, mark ready). If a vendor marks the box ready earlier than the scheduled day, the buyer's notification/email needs to (a) tell them the pickup is available now even though it's earlier than expected, and (b) include a direct link to their subscription page so they can navigate straight to confirm. First questions to answer in next session: does the existing notification system fire when vendor marks ready (regardless of date), or only on the scheduled day? Notification template type to update: probably the market_box ready-for-pickup notification. Need to add the deep link to the actionUrl + body. Found 2026-04-25.

## Priority 0.5 — Market Box UX

- [ ] **Market box duplicate-subscription flow has 3 stacked UX bugs** — Found 2026-04-26 by user testing on staging.

  **Repro:** Buyer who already has an active subscription to market box X tries to add box X to cart again (e.g., same vendor's biweekly box).

  **(A) Cart vs. checkout inconsistency:** Cart adds the duplicate item with only a soft warning; checkout then blocks with hard error "You already have an active subscription to this market box." Either both layers should block, or both should warn-and-allow with the duplicate handled at subscription creation. Investigation: grep `apps/web/src/app/api/cart/items/route.ts` for any `market_box_subscriptions` duplicate check; the gate may exist server-side at the RPC level (`subscribe_to_market_box_if_capacity`), and the cart route may not pre-check, OR the cart route checks but only warns.

  **(B) Error code missing from display:** The "active subscription" error UI doesn't show the error code that the system generated. Past convention (per CLAUDE.md error-resolution system) is to display the `ERR_XXX_NNN` code visibly so users can report it. This particular error path is missing that. Investigation: find the error-handling component that renders this, check whether the ErrorPage / ErrorBoundary / inline error component shows `error.code` / `error.errorCode` / `error.traceId`.

  **(C) Error reporting form requires `errorCode`/`traceId` but user never sees them:** Form validation error "Either errorCode or traceId is required" fires when the user submits without a code, but the user was never given a code (per #B). Even if #B is fixed, the form should auto-populate from the parent error's context (no need for the user to re-type a code that's already known to the page). Additionally, the form's validation error displays alongside the original error rather than replacing it — UI ends up showing two errors stacked, confusingly. Investigation: find the error-reporting endpoint (likely `/api/error-resolutions` or `/api/admin/error-resolutions` based on session memory) and the form component; the form should derive `errorCode` from the page's error context as a hidden field, not require user input.

  **Fix order should be:** (B) first — make error codes visible for this error type. (C) auto-populate the form so users don't have to re-enter known data. (A) last — decide cart vs checkout policy and align them.

  **2026-04-26 update:** Another instance of issue (C) confirmed via the buyer premium upgrade flow. User tried to upgrade buyer to premium → got `Not authenticated` error → reported it via the form → got the same `Either errorCode or traceId is required` validation error even when entering an email. Confirms the form validation bug is generic across all error sources (not specific to the duplicate-subscription path), which makes (C) higher priority — every "report this error" attempt is broken until it's fixed. Also see Priority 0.5 — Buyer Upgrade entry below for the underlying `Not authenticated` cause investigation.

- [ ] **Show current pickup frequency on the new-market-box form (read-only reminder)** — `apps/web/src/app/[vertical]/vendor/market-boxes/new/page.tsx`. Pickup frequency is set vendor-wide on the market-boxes list page (`/vendor/market-boxes`), not per box. When a vendor creates a new box, they should see a small read-only banner on the form like "This box will be **Bi-Weekly** — change at /vendor/market-boxes" so they're not surprised by the cadence the box launches with. Same treatment makes sense on the per-box edit form. Found 2026-04-24 by user testing the staging biweekly flow.

- [ ] **"Rate" button on buyer dashboard "Rate Your Recent Orders" card doesn't work** — buyer dashboard prompt offers a Rate button per fulfilled order (e.g., "Order #FA-2026-01646780 $19.30 · Valley Verde Farm"). Clicking the button does nothing — should open the rating flow / modal / link to the rating endpoint. Prompt copy is fine; just the action needs wiring. Found 2026-04-24 staging testing.

- [ ] **Improve traditional-market-cap error message on box activation** — `apps/web/src/app/api/vendor/market-boxes/[id]/route.ts:262`. Current message: "Market limit reached (3/3). Reactivating this box would bring you to 4 traditional markets. Remove a listing or box from another market first, or upgrade your plan." Better: list the vendor's current markets explicitly (e.g., "Your current markets are Amarillo, Canyon, Lubbock") and name the market the activation would add (e.g., "Activating this box would add Westgate Mall as a 4th market"). Helps the vendor decide which listing to drop without having to leave the page. Found 2026-04-24.

## Priority 1 — Documentation drift

- [ ] **`CLAUDE_CONTEXT.md` FM tier limits are stale** — doc says "Standard Traditional Markets: 1, Premium: 4" but `vendor-limits.ts:57,71,85` shows 3 / 5 / 8 (standard / premium / featured). Code is authoritative; doc should be updated. Found 2026-04-24 while investigating an activation enforcement question.

## Priority 0.5 — Market Box Edge Cases

- [ ] **Standalone market box checkout doesn't support biweekly vendors** — `apps/web/src/lib/stripe/webhooks.ts:367` (the `handleMarketBoxCheckoutComplete` function for direct-buy flow via `createMarketBoxCheckoutSession`) hardcodes `p_pickup_frequency: 'weekly'` because the standalone metadata format doesn't carry it. If a buyer ever uses the standalone purchase path on a biweekly vendor's box, the subscription will be created as weekly (4 pickups instead of 2) regardless of vendor settings. Currently MarketBoxDetailClient.tsx routes through the cart flow, so standalone path may be cold — but if it's reactivated or used by an admin, biweekly is broken. Fix: do a vendor_profile lookup in `handleMarketBoxCheckoutComplete` to read `market_box_frequency`, OR push frequency into standalone metadata at session-creation time in `apps/web/src/app/api/buyer/market-boxes/route.ts:309` (call to `createMarketBoxCheckoutSession`) and the corresponding metadata write in `payments.ts:163-201`. Found 2026-04-24 while fixing webhook RPC overload.

- [ ] **Refund on RPC failure can attempt the wrong amount** — `apps/web/src/lib/stripe/webhooks.ts:218,232` `createRefund(paymentIntentId, mbItem.priceCents)`. After today's fix, `mbItem.priceCents` is the food subtotal (pre-fee), not the actual Stripe charge. So a refund will succeed but only return the food portion, leaving the buyer-fee portion stuck. Better: refund the actual line-item charge (food + buyer percentage fee + proportional flat fee), or use Stripe's refund-charge-by-PI semantics that auto-pick the full amount. Low impact — refund only fires if the RPC fails, which after Fix A should be rare. Found 2026-04-24.

- [ ] **Test CashApp payment failure flow on staging** — user note 2026-04-25. Verify what the buyer sees if CashApp authorization fails at Stripe checkout: does the order go to a clean cancelled state? Does inventory get restored properly? Does the buyer get a clear retry path? Stripe test mode supports forcing payment-method failures.

- [ ] **Investigate possible market box term-selector state bug** — user reported choosing "1 Month" but ending up subscribed to a 2 Month term (term_weeks=8 in cart and on success page). May be downstream of cart `pickup_frequency` propagation bug fixed 2026-04-25 — retest first; if still happening, dig into MarketBoxDetailClient term selector state, particularly the `selectedTermWeeks` / `addMarketBoxToCart` handoff at the subscribe button. Found 2026-04-25.

## Priority 0.5 — Vendor Onboarding (Session 73)

- [ ] **Additive vendor categories with documentation gate** — Vendors should be able to add new product categories after signup (currently locked from signup form). When a vendor adds a category that requires documentation (e.g., adding Baked Goods to a Produce vendor), the system should: (1) allow the category to be added from their profile or listing form, (2) prompt for required documents per `category-requirements.ts`, (3) gate publishing of listings in the new category until docs are approved. Touches: listing form category selector, vendor_verifications.requested_categories, category document upload flow, OnboardingChecklist. Session 73 friction audit finding #14.

## Priority 0.5 — Event Rating Follow-ups (Session 71)

- [ ] **Admin moderation UI for `event_ratings`** — page at `/admin/event-ratings` with filters (pending/approved/hidden), approve / hide actions, ability to see the full event + user context. Until built, approve via SQL: `UPDATE event_ratings SET status='approved', moderated_at=now(), moderated_by=<admin_user_id> WHERE id='<id>';`
- [ ] **Organizer dashboard: event rating display** — on the organizer's event detail page, show approved `event_ratings` rows with rating + comment. RLS already allows organizers to read approved rows for events where `organizer_user_id = auth.uid()` — just needs the UI.
- [ ] **Magic-link re-auth for post-event rating** — logout friction fix. Post-event notification email includes a Supabase `admin.generateLink()` signed URL that auto-authenticates the attendee for a one-shot rating. Attach to the existing notification flow. User raised this concern in Session 71.
- [ ] **Aggregate stats on `catering_requests`** — `average_rating` + `rating_count` columns + trigger on `event_ratings` so we can show "4.6 ★ from 23 attendees" publicly (if user wants aggregated bragging). Currently deferred — individual ratings stay private.
- [ ] **Per-vendor "unrated event orders" nudge** — after event completes, notify buyers with an unrated completed order from the event so they rate via the dashboard (not just via the event page).

## Priority 0.5 — Quick Fixes

- [ ] **Browse availability RPC references phantom column `m.event_end_date`** — Surfaced 2026-05-01 during pre-push Playwright run for commit `eea40abd`. Each browse page slice load logs: `[browse] availability RPC failed (page slice): column m.event_end_date does not exist`. The page falls back gracefully (test still passed, no user-visible break), but every browse load fails its availability RPC and likely degrades sort/filter accuracy. Investigation: find the `get_available_pickup_dates()` (or related) function definition; the `m.event_end_date` reference must be either renamed (column was renamed?) or the function predates a column drop. Likely related to the schema phantom-columns issue (P1-8 — `orders.market_id` family). Adjacent question: does `markets.event_end_date` actually exist on the live DB? Schema snapshot shows `markets.event_allow_day_of_orders` and `wave_ordering_enabled` and `wave_duration_minutes` (migration 110) — `event_end_date` was added per migration 110 changelog but on `markets`, so the column should exist. Maybe the alias `m` doesn't bind to markets in that query context. Quick investigation, likely a 1-line fix in the RPC.

- [ ] **Locale switch fetch error unhandled** — `src/lib/locale/client.ts:24` `setClientLocale()` doesn't catch fetch failure. Sentry issue 7382469144.
- [ ] **Organizer cancel API** — new route `POST /api/events/[token]/cancel` with organizer_user_id auth. Current button shows "contact support".
- [ ] **Organizer pre-order detail** — expandable section on My Events card showing order breakdown per vendor.
- [ ] **Event order cap enforcement** — reimplementation via separate validation endpoint (NOT cart/items/route.ts). DB columns exist (migration 106).
- [ ] **Vendor guidance text** — capacity planning message on acceptance UI, pre-order count in prep reminders.
- [ ] **Organization type field** — add to event request form (company, church, school, community group, government). Use "event organizer" instead of "company" generically.

## Priority 0.5 — Event System (from Session 66)

### Event Capacity Safety
- [ ] **Event order volume alert for unlimited-inventory vendors** — When a vendor with `quantity = NULL` listings accumulates event orders exceeding their stated `max_headcount_per_wave × wave_count`, send a proactive notification warning them. The data is in `event_readiness` JSONB on vendor_profiles. Without this, a vendor could get 200 pre-orders with no system-level cap. Regular markets are less risky (daily cadence + vendor can refuse in real-time), but events batch all orders before event day.

### Event System Cleanup (non-blocking, from code review)
- [ ] **Admin PATCH duplicates approval logic** — `admin/events/[id]/route.ts` lines 112-173 duplicates `approveEventRequest()` from event-actions.ts. Should call the shared function instead.
- [ ] **Phase 11 cron hardcodes vertical** — Line 1993 sends `vertical: 'food_trucks'` for all event prep reminders. Should use event's actual vertical_id.
- [ ] **Phase 12 cron email uses FT language for FM** — Results email says "food trucks" regardless of vertical.
- [ ] **Public event page footer hardcodes "Food Truck'n"** — `events/[token]/page.tsx` line 316. Should be vertical-aware.
- [ ] **Public event page N+1 vendor queries** — Shop page already fixed with batch queries; event info page still loops per vendor.

## Priority 1 — Session 72 Findings

### H3: Event completion with unfulfilled order items — refund/reconciliation logic
- [ ] **COMPLEX — requires multi-scenario research + planning before code.**
  
  When admin marks an event 'completed', unfulfilled order items (pending/confirmed/ready) are logged but no refund or correction happens. The right behavior depends on the payment model:
  
  - **Company-paid (host pays for everything):** vendor should get a grace window to correct unconfirmed orders before completion finalizes. Unfulfilled items may represent vendor error (didn't confirm), not buyer no-show. Company already paid — refund goes back to company, not individual attendees.
  - **Attendee-paid (Stripe checkout):** unfulfilled items could be buyer no-show (no refund deserved), vendor no-show (full refund deserved), or handoff failure (partial refund?). Each case has different financial treatment.
  - **Hybrid (future):** combination of both — company portion refunded to company, attendee portion refunded to attendee. Most complex.
  
  **Work required:**
  1. Map every order_items status that could exist at completion time, per payment model
  2. Define the correct financial action for each (refund buyer, refund company, charge vendor, write off, etc.)
  3. Design admin UI: show unfulfilled breakdown, require admin to choose action per item or per vendor before finalizing
  4. Consider: vendor dispute window before completion (e.g., 24h after event to confirm any stragglers)
  5. Consider: auto-complete vs manual-complete distinction (cron auto-complete should be stricter than admin manual)
  
  **Cited code:** `api/admin/events/[id]/route.ts:290-327` — current implementation queries unfulfilled items, notifies vendors, logs warning, proceeds without blocking or refunding.

### Session 72 audit findings (backlog items)
- [ ] **H1: Notification placeholder data gaps** — 9+ notification call sites pass incomplete template data. Buyers see "A customer" and "your vendor" instead of real names. Largest impact: `new_paid_order` at `checkout/success/route.ts:335` (every Stripe order). Full report in Session 72 conversation.
- [ ] **H2: Duplicate organizer confirmation emails** — `admin/events/[id]/route.ts:204` (status→ready) and `events/[token]/select/route.ts:329` (vendor selection) both send nearly identical "X vendors ready" emails. Fix: add `selection_email_sent_at` column to gate duplicates.
- [ ] **C2: Turnstile graceful degradation** — if Cloudflare CDN fails, signup button stays permanently disabled with no error message. Need timeout + fallback (enable button after 10s if widget doesn't load).
- [ ] **M1: Cart isolation — move to DB trigger (Option C).** Current app-level check has race condition + silent bypass on query failure. Replace with BEFORE INSERT trigger on `cart_items` that enforces cross-event isolation atomically. Full risk analysis + implementation plan at `.claude/plans/cart-isolation-db-trigger-plan.md`. Deploy while volume is low — risk increases with scale.
- [ ] **M2: Vendor cancel notification uses wrong template** — `events/[token]/cancel/route.ts:104` sends `catering_vendor_responded` (accept/decline template) for cancellations. Vendor sees grammatically broken message. Needs dedicated `event_cancelled_vendor` notification type.
- [ ] **M4: Event-ratings admin optimistic UI count bug** — `admin/event-ratings/page.tsx:89` decrements wrong status count when moderating a rating while viewing a different one. Fix: capture oldStatus before update.
- [ ] **Admin panel: show user/vendor names not just emails** — user request from Session 72.
- [ ] **`column market_vendors.status does not exist`** — error in prod Postgres logs. Separate bug, not investigated.
- [ ] **`column v.business_name does not exist`** — error in prod Postgres logs. Separate bug, not investigated.
- [ ] **`/api/buyer/location` POST silently swallows profile-update errors** — cookie updates but profile doesn't. User's browse location stays stale.
- [ ] **`browse/page.tsx:531` ignores query errors on rawListings** — root cause of silent empty browse page when RLS errored. Should check error and log.

## Priority 0 — Next Session

### Sales Tax Implementation (UPDATED Session 72 — TaxCloud vs Stripe Tax decision pending)
- [x] **TX Comptroller registration** — DONE. Taxpayer ID obtained, awaiting system processing.
- [ ] **Tax provider decision** — TaxCloud Premium ($79/mo, free filing+audit) vs Stripe Tax (0.5%/txn, simpler integration). At <100 orders/mo Stripe Tax is cheaper. TaxCloud wins on compliance. See Session 72 cost analysis. USER DECISION.
- [ ] **Provider account setup** — Either TaxCloud (API ID + API Key + bank link) or Stripe Tax (add TX registration in dashboard). USER ACTION.
- [ ] **Code: Tax lookup at checkout** — API client skeleton at `src/lib/tax/taxcloud.ts` + TIC mapping at `src/lib/tax/tic-codes.ts` (ready for TaxCloud). Stripe Tax alternative: 2 lines in checkout config.
- [ ] **Code: Display tax line item** — Show tax to buyer before payment.
- [ ] **Code: Report transactions** — TaxCloud: call `captureTransaction()`. Stripe Tax: automatic.
- [ ] **Code: Report refunds** — TaxCloud: call `reportReturn()`. Stripe Tax: automatic.
- [ ] **Code: Withhold tax from vendor transfers** — Exclude tax from vendor_payout_cents.
- [ ] **Code: Track sales_tax_cents** — Add column to orders/order_items.

### Pre-Launch Business Items
- [ ] **Tax compliance consultation** — Partially done (Session 63 research). Remaining: confirm platform fee taxability, verify filing frequency, confirm marketplace facilitator registration process. CPA recommended.

### Catering Pre-Order System (Session 63 decisions)
- [ ] **Catering minimum order enforcement** — 10 items per vendor minimum for catering orders (`advance_order_days > 0`). Enforce at cart validation AND checkout. Show clear message: "Catering orders require a minimum of 10 items per vendor."
- [ ] **Catering advance notice tiers** — Size-based minimum lead time: 10-29 items = 1 day, 30-49 items = 2 days, 50+ items = 3 days. Enforce in SQL `get_available_pickup_dates()` — the advance window should expand/contract based on cart quantity per vendor. Also enforce at checkout validation.
- [ ] **Listing form advance ordering update** — Current dropdown offers fixed 2-7 days. Needs to reflect the new tier logic. The vendor sets their MAX advance window; the system enforces minimums based on order size. May need rethinking — vendor sets "I accept catering orders" (boolean) and the tiers are platform-enforced, not vendor-chosen.
- [ ] **Event $75 per-truck fee** — Due with 50% deposit when agreement signed/uploaded. Needs: fee calculation in event booking flow, payment capture mechanism, tracking in a fees table or on catering_requests.
- [ ] **Zip code visibility across geographic pages** — Research item from Session 63. All geo-search pages should show what zip they're keyed off of. Changing zip on one should change all. DO NOT change until implications understood (browse page has different fallback logic).

### Session 63 Completed
- [x] **Vendor configurable pickup lead time** — DONE. Migration 096, 15/30 toggle, dropdown UI.
- [x] **Password reset** — DONE. verifyOtp with token_hash, bypasses PKCE.
- [x] **Vendor hours display mismatch** — Was already done (Session 31).
- [x] **T-2, T-3, T-11 protective tests** — DONE. 32 new tests.
- [x] **Inventory restore safety** — DONE. shouldRestoreInventory() utility.
- [x] **Buyer premium page rewrite** — DONE. False claims removed.
- [x] **Time slot UX** — Dropdown replaces tiles. End time = valid arrival. 15-min slots for 15-min lead.
- [x] **Vendor profile reorder** — Menu → Chef boxes → Catering → Info at bottom.
- [x] **Cover photo** — Migration 097, upload with resize, 16:9 display.
- [x] **Favorites page** — Simple name+logo cards, no geo search.
- [x] **Landing page button** — "Where are trucks today?" navigates to where-today.
- [x] **Tutorial fix** — Missing notification_preferences column on prod.
- [x] **TypeScript build errors** — All resolved (events page types).
- [x] **Production push** — 49+ commits pushed to prod with revert tag.
- [x] **Stress test protocols** — 8 protocols documented.
- [x] **Cite-or-verify rule** — New absolute rule in CLAUDE.md + global rules.
- [x] **Vendor profile section reorder** — Menu → Chef boxes → Catering → Info at bottom.
- [x] **Cover photo** — Migration 097, upload with resize, 16:9 display.
- [x] **Favorites page** — Simple name+logo cards, no geo search.
- [x] **Catering badge on vendor profile** — Shows on listing cards + gold highlight button.
- [x] **Checkout mobile layout** — Items → tip → payment → Pay Now → cross-sell.
- [x] **Accounting reports (6)** — Transaction reconciliation, refund detail, external fee ledger, subscription revenue, tax summary, monthly P&L.
- [x] **Payment methods expanded** — Card + Cash App + Amazon Pay + Link explicitly listed.
- [x] **External payments hidden** — EXTERNAL_PAYMENTS_ENABLED flag, UI hidden, backend preserved.
- [x] **FT sales tax always-on** — Greyed out checkbox + pre-packaged food block.
- [x] **FM category-based tax rules** — Auto tax by category + trigger questions for Meat/Baked Goods.
- [x] **Signup tax guidance** — Tax notice on vendor signup success page per category.
- [x] **FM vendor_type expanded** — Migration 098, 11 categories matching listing categories.
- [x] **Catering cash restriction removed** — Premature; will rebuild with catering minimum system.
- [x] **Vendor outreach emails** — FT and FM templates written for vendor recruitment.

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
- [ ] **RLS: Consolidate multiple permissive policies** — Supabase linter flags 15 tables with multiple OR'd permissive SELECT policies. Consolidate into single comprehensive policies for performance.
- [ ] **RLS: Audit auth.uid() vs (SELECT auth.uid())** — Supabase flags auth RLS initialization plan warnings. Ensure all policies use `(SELECT auth.uid())` pattern.
- [ ] **RLS: Document buyer_interests INSERT policy** — `WITH CHECK (true)` is intentional (public lead capture). Add SQL comment or tighten to require valid email. Not a real vulnerability — API validates and rate-limits.
- [ ] **Auth: Investigate incognito/regular Chrome session conflict** — Admin in incognito got logged out when vendor logged in on regular Chrome (same domain, same Supabase project). Likely Supabase SSR cookie middleware or BroadcastChannel issue. Not blocking (different browsers work). Workaround: use Chrome + Edge for multi-role testing.
- [ ] **Migration 006: Apply to prod** — DONE Session 65. Remove this item.

## Priority 3 — When Time Allows
- [ ] **Geographic intelligence feature** — Plan at `.claude/geographic_intelligence_plan.md`
- [ ] **A2P 10DLC SMS approval** — Waiting on carrier

## Post-Launch — Growth & Expansion
- [ ] **Ecosystem Partner Platform** — Full design at `docs/CC_reference_data/Ecosystem_Partner_Platform_Design.md`
- [ ] **Growth Ambassador Program** — Design at `docs/CC_reference_data/Growth_Partner_System_Design.md`
- [ ] **Geographic Expansion Planning** — Workbook at `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx`
- [ ] **Property Broker (3-sided marketplace)** — Land/parking lot rentals for vendors. Concept + phased plan at `apps/web/.claude/property_broker_concept.md`. Phase 0 validation required before any build. Reuses ~70% of existing infrastructure (matching, Stripe Connect, onboarding gates, notifications). Closest analogue: Storefront (failed) — but we start with demand side already in place.

## Icebox
- [ ] **Events feature Phase 5+** — Ticketing, capacity management, recurring events
- [ ] **Advanced vendor analytics** — Sales trends, customer demographics, peak hours

## Housekeeping / Tech Debt
- [ ] **Clean up home_market_id remnants** — After Session 70's tier-cap fix, `home_market_id` is no longer used for listing permissions. It still exists for: (1) DB column on `vendor_profiles`, (2) `/api/vendor/home-market` GET/POST endpoint, (3) dashboard home market card display, (4) `vendor/markets/page.tsx` 🏠 badge + "Set as Home Market" button + home market card, (5) `markets/page.tsx:291` stale text "used as your primary position in geographic search results" (geographic search does NOT actually use this column — confirmed via grep in Session 70). Six helper functions in `vendor-limits.ts` (`getHomeMarket`, `setHomeMarket`, `canChangeHomeMarket`, `isHomeMarket`, and usage in `getVendorUsageSummary`). When cleaning up: decide whether home_market_id has any remaining meaningful purpose (maybe as a vendor-preferred display default?), and either (a) fully remove it including the column migration, or (b) repurpose it explicitly for something and update the UI text. DO NOT touch this until geographic search is stable — user's constraint in Session 70.
- [ ] **Retroactively fix misleading commit message on `dfd01923`** — Session 70 accidentally bundled migration folder cleanup (107-109 deletions + 110-113 moves to `applied/` + `ROLLBACK_109.sql` deletion) into the commit titled `docs: Protocol 8 — Error Log Review at every session kickoff`. The commit log doesn't reflect the migration work. **Fix when there's downtime:** either (a) note in decisions.md / session history that migration cleanup happened in `dfd01923`, or (b) if this section of history is ever rebased for another reason, split it cleanly. No functional impact — all work is committed and correct, just the message is incomplete. Caught in Session 70.
- [ ] **Dead code: delete `apps/web/src/components/vendor/CertificationsForm.tsx`** — Only its `Certification` TYPE is imported (by `vendor/edit/page.tsx`). The component itself is never rendered. Either inline the type into a types file or delete the component and keep the type-only export. Session 70.
- [ ] **Refactor events routes to use `getVendorProfileForVertical` for consistency** — 4 of 5 events routes (`route.ts`, `message`, `cancel`, `respond`) were fixed by commit `17fa16cc` with an inline pattern that works correctly but doesn't use the shared utility. Cosmetic refactor, zero behavior change. Session 70.

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
