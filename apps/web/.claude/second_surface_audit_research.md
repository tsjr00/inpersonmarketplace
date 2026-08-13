# Retrospective Second-Surface Audit — working file (2026-08-13)

## STATUS: Rule 1 (pricing display) COMPLETE — findings FIXED 2026-08-13, uncommitted
- P-1 FIXED: listing page + market-box page JSON-LD now pass calculateDisplayPrice (comments cite the audit). P-2 FIXED: ShopClient computes cartDisplayTotalCents per-item (matches checkout math); raw summary total removed from render + unused destructure dropped.
- 3 new guards in flow-integrity.test.ts → "Display price integrity" (166 tests pass; tsc clean).
- P-3 RESOLVED as tentative owner decision → .claude/decisions.md "Company-Paid Events: Organizer Pays the Same 6.5%..." — dashboard + settlement stay base-cents until company-paid billing is designed; update both together then.
- Admin-surfaces-show-base: owner not yet asked to change; leave as is unless he says otherwise.
- NO registry entry added: helper is the collapsed single implementation; the guards pin the 3 known bypass sites. Lint-shaped full enforcement (no raw cents rendering on buyer surfaces) stays a future option.

Method per rule: (1) state rule → (2) enumerate surfaces via UNFILTERED reads → (3) collapse or register → (4) record clean.
Plan: backlog.md §2a. Registry mechanics: lib/paired-rules.ts.

---

## RULE 1: Pricing display (T-06/T-41 class) — IN PROGRESS

**Rule:** Vendors enter BASE price (`listings.price_cents`). Every non-vendor viewer sees FEE-INCLUSIVE: per-item = base × 1.065 (`calculateItemDisplayPrice`), order total adds $0.15 flat once (`calculateBuyerPrice`). Vendor-facing surfaces show base. (lib/pricing.ts:1-11,161-175)

**Prior coverage (do not redo):**
- 2026-08-11 sweep cat A: grep for hand-rolled `/100` maths → 1 find (listing OG metadata, FIXED). NOT a per-viewer enumeration.
- Collapsed, no registry entry per collapse-before-register.
- T-06 fixed the organizer surface (OrganizerEventDetails).

**Surfaces confirmed using display helpers** (grep for calculateItemDisplayPrice|formatDisplayPrice|calculateBuyerPrice|calculateOrderPricing — presence only, still need reads to confirm applied to the right fields):
browse/page.tsx · listing/[listingId]/page.tsx · vendor/[vendorId]/profile/page.tsx · market-box/[id]/page.tsx + MarketBoxDetailClient · events/[token]/page.tsx · events/[token]/select/page.tsx · events/[token]/shop/ShopClient.tsx · checkout/success/page.tsx · api/buyer/market-boxes/route.ts · api/checkout/session/route.ts · lib/stripe/payments.ts

**Candidate surfaces WITHOUT the helper import — must read unfiltered:**
- [ ] components/cart/CartDrawer.tsx
- [ ] lib/hooks/useCart.tsx
- [ ] api/cart/route.ts (server source of cart prices)
- [ ] checkout/page.tsx
- [ ] checkout/CheckoutListingItem.tsx
- [ ] checkout/CheckoutMarketBoxItem.tsx
- [ ] checkout/CrossSellSection.tsx
- [ ] checkout/external/page.tsx
- [ ] lib/marketing/json-ld.ts (public SEO prices)
- [ ] api/listings/suggestions/route.ts
- [ ] components/events/OrganizerEventDetails.tsx (verify T-06 fix state)
- [ ] event-manager/[id]/dashboard/page.tsx
- [ ] api/events/[token]/details/route.ts
- [ ] api/events/[token]/my-order/route.ts
- [ ] api/events/[token]/shop/route.ts + lib/events/shop-data.ts
- [ ] buyer/orders/[id]/page.tsx (stored order amounts — verify which fields)
- [ ] admin events settlement page + route (whose eyes?)
- [ ] lib/export-csv.ts (whose export?)
- [ ] notifications: grep lib/notifications for price rendering
- [ ] api/event-approved-vendors/route.ts

**Findings:**
- ✅ CLEAN — cart chain: api/cart returns raw base price_cents (route.ts:379) by design; useCart passes through untransformed; CartDrawer applies `calculateDisplayPrice` to items (:274), market boxes (:447), and total (:28, % only, flat added at checkout — matches rule). `calculateDisplayPrice` is a re-export alias of `calculateItemDisplayPrice` from pricing.ts (constants.ts:14-21) — alias, not duplicate math.
- Read done: api/cart/route.ts (full), useCart.tsx (full), CartDrawer.tsx (full), constants.ts (full).
- ✅ CLEAN — CheckoutListingItem.tsx (:119,122,290,293), CheckoutMarketBoxItem.tsx (:17,101), CrossSellSection.tsx (:108): every rendered price via calculateDisplayPrice.
- ✅ CLEAN — checkout/page.tsx (full read): displaySubtotal = per-item display prices (:562-567); tip on displayed subtotal (:570); small-order fee via pricing.ts (:573); flat fee once (:581); all summary lines render computed display values.
- ⚪ OUT OF SCOPE — checkout/external/page.tsx: renders API-provided totals; external payments INACTIVE (EXTERNAL_PAYMENTS_ENABLED=false, constants.ts:12; per project_external_payments_historical memory).

### 🔴 FINDING P-1 — JSON-LD product schema advertises BASE price (2 surfaces, same files as the fixed OG bug)
- `listing/[listingId]/page.tsx:220` — `priceCents: listing.price_cents || 0` into `listingJsonLd` → `json-ld.ts:76` renders it raw. The SAME file's OG title was fixed 2026-08-11 (:82-86, comment cites the sweep) and the on-page price uses formatDisplayPrice. This file now has THREE price surfaces: page ✅, OG ✅, JSON-LD ❌.
- `market-box/[id]/page.tsx:108→115` — base `price_4week_cents` into `marketBoxJsonLd` → `json-ld.ts:123` raw. OG in same file correct (:55).
- Consequence: Google Product rich results / any schema.org consumer shows a LOWER price than the page and checkout charge. Same class as T-06 and the 2026-08-11 OG find — the sweep fixed the OG surface and missed the JSON-LD surface sitting in the same files.
- Fix shape: pass `calculateItemDisplayPrice(...)` at both call sites (helpers already imported in both files via constants). NOT yet fixed — report first.

**More surfaces checked:**
- ✅ CLEAN — api/listings/suggestions/route.ts (full): serves base; consumer CrossSellSection marks up (:108). API-base/client-markup is the standing pattern.
- ❓ OWNER CALL — export-csv callers are all admin/manager tables (admin listings/users/vendors, settlement, survey export). Admin sees base prices in listings tables. Is platform-admin supposed to see base (plausible: it's Tracy's own view) or fee-inclusive? Not claiming a bug.
- ✅ CLEAN — api/events/[token]/my-order/route.ts (full): pick-ticket returns NO price fields at all (:139-146) — rule inapplicable.
- shop-data.ts (full): serves base price_cents (:222, zeroed when anonymous); consumer must mark up → verify ShopClient + shop page render next.

### 🔴 FINDING P-2 — Event shop sticky cart bar shows BASE total
- `events/[token]/shop/ShopClient.tsx:1276` — renders `formatPrice(summary.total_cents)` where summary comes from useCart → `get_cart_summary` RPC, whose total_cents = SUM of raw base `l.price_cents * quantity` (mig 20260211_001:66-76; migs 149/152 only REVOKE, don't redefine).
- Same file is correct everywhere else: per-item :1120→:1156, per-vendor add total :1070-71 (both calculateItemDisplayPrice).
- CartDrawer PROVES the drift is known-about: it deliberately ignores summary.total_cents and recomputes display total client-side (:22-28 with comment). ShopClient took the raw field. Buyer sees e.g. "$24.00" in the bar, then "$25.71" at checkout.
- Fix shape (option A): compute display total in ShopClient from cart items like CartDrawer does. (Option B): mark up summary total. A matches the existing pattern.

**Order-column semantics verified (buyer/vendor order surfaces CLEAN):**
- orders.total_cents = charged fee-inclusive total (checkout/session:922, external:301 write `totalCents`); order_items.unit_price_cents + subtotal_cents = BASE (session:596-597).
- buyer/orders/[id]/page.tsx:1085 marks up base per item ✅, renders total_cents raw ✅ (it IS the charged amount). buyer/orders/page.tsx:885 + ReviewPromptCard:133 raw total_cents ✅.
- Vendor surfaces (OrderCard:534, pickup:1050, prep:632) show base subtotal_cents — correct, vendor sees base.
- Admin reports/order-issues show base — admin bucket (owner call, same as CSV).

**Organizer surfaces:**
- ✅ CLEAN — OrganizerEventDetails.tsx (full read): only renders organizer's OWN budget fields + access-code cap (:437) — no vendor listing prices; rule inapplicable.
- ❓ OWNER QUESTION P-3 — event-manager/[id]/dashboard/page.tsx:309 "Total order value" = SUM base subtotal_cents (:167-169). BUT settlement route bills the company against the SAME base subtotals (settlement route :356 companyPaidCents, :454 companyPaymentBalance = payments − base), while ALSO computing buyer fees on every item (:271) that appear in summary. So: is the company owed base or base+fees for company-paid orders? Dashboard is CONSISTENT with settlement balance math today. If company owes base+fees, BOTH surfaces understate. Business-rule question, not a claimed bug. (Also: settlement reads by admin only — hasAdminRole :47.)

---

**Final pricing checks:**
- ✅ CLEAN — events/[token]/select/page.tsx (full read): THE T-06 fix site; avg meal price :292 + menu chips :337 both use display helpers; T-06 comment at :6-11.
- ✅ CLEAN — notifications: order_refunded callers pass real Stripe amounts (webhooks.ts:201 session.amount_total; :1248→1257 charge.amount_refunded); order_expired buyer notice passes buyerPaidForItem = base + % fee + prorated flat (expire-orders:209-211, H20 fix); expire-orders:1099 order_expired omits amount (template then omits the sentence). Booth receipt uses session.amount_total (webhooks:1945, prior tester finding). MESSAGE_TEMPLATES.md:560 "from subtotal_cents" is STALE DOC, not code.
- ⚠ NOT individually read (helper-import present, sweep-A grepped, no unfiltered read this session): browse/page.tsx, vendor/[vendorId]/profile/page.tsx, MarketBoxDetailClient.tsx, checkout/success/page.tsx, events/[token]/page.tsx, CheckoutPickupGroup.tsx. Medium confidence clean.

**Rule 1 disposition (pending owner):** the helper IS the collapsed single implementation; what breaks is call sites that bypass it (JSON-LD, sticky bar — both "renders a stored cents field raw"). Options: (a) fix the 2 bugs + add flow-integrity guards pinning those sites; (b) also register a `display-price` paired rule. Sweep 2026-08-11 called this "a lint-shaped rule: no manual price maths on buyer-facing surfaces."

---

## RULE 2: Multi-market order comms (T-05 class) — COMPLETE 2026-08-13

**Rule:** an order can span multiple vendors AND multiple markets; every surface describing an order must enumerate ALL items/pickup locations, never first-wins.

**Surfaces checked:**
- ✅ order_placed template + caller — THE T-05 fix (checkout/success/route.ts:476-548 builds pickups from all items; template branches on pickups; pinned by order-placed-message.test.ts, 5 tests incl. Spanish).
- ✅ checkout/success PAGE — per-item pickup lines (:310-328) + multi-location summary card keyed on distinct market_id (:415-453).
- ✅ buyer/orders/[id] — items grouped BY MARKET (:466-467), market named per group (:1030).
- ✅ buyer/orders list — location rendered PER ITEM (:588-591).
- ✅ events/[token]/order route new_paid_order (:112) — single-item company-paid order, single market by construction.
- ⚪ No buyer pickup-reminder cron exists (only vendor external-payment, park check-in, follower market-day reminders) — no surface to drift.
- ⚪ external checkout order_placed (:386) — external payments inactive.

### 🟠 FINDING M-1 — vendor new_paid_order keeps only the FIRST market (first-wins, the exact T-05 shape)
- checkout/success/route.ts:401-418: notifications grouped per vendorUserId; `marketName` set only in the else-branch on first insertion (:415); later items push titles only (:410). A vendor with items at TWO markets in one order is told "N items · Market A".
- Reachable: multi-market carts span markets; one vendor can sell at both.
- Sits ~70 lines ABOVE the T-05 fix in the same file — the fix repaired the buyer half and never asked about the vendor half.
- Fix options: (a) group key vendor|market → one accurate notice per vendor per market (no template change, additive) — RECOMMENDED; (b) single notice listing all markets (template + caller change).
- Minor note (not claimed as bug): success page location summary dedupes by market_id keeping first item's date/time per market (:416-420); per-item lines show each item's own date, so info is still complete on-page.

**M-1 FIXED (owner file-level approved):** checkout/success/route.ts vendor notifications now keyed `vendorUserId|marketName` — one accurate notice per vendor per market; send loop uses info.userId. Idempotency guard is per-order all-or-nothing (:382-388) so re-runs stay safe. Guard added: flow-integrity "Multi-market vendor notification" (167 pass, tsc clean). UNCOMMITTED at write time.

---

## RULE 3: Notification template keys ↔ caller keys (T-08 class) — COMPLETE 2026-08-13

**Method:** scripted cross-check (scratchpad notif-key-audit.js): parsed 105 templates' `d.xxx` reads vs 125 sendNotification call payloads; 11 UNGUARDED flags; every flag then verified by reading the real code.

**Result: NO live mismatches.** All 11 flags were parser blind spots or already-fixed:
- Conditional spreads `...(x ? { key } : {})` — buyer cancel :235-237, events order :115-116, payout_failed webhooks:1148. Keys ARE passed.
- Conditional template reads (`if (d.pickups && ...)` :402, `d.paymentMethod &&` :386, `d.sourceType === ...` :1416) — absent key = intended branch, not blank text.
- admin invite marketId — passed at :187 with a Session 78 P1 fix comment (this class's previous catch).
- T-08 itself carries a warning comment on the template (types.ts:1617-1621).

**Low-severity note (not fixed):** the rich market-box payout message (`New subscription to "X" from Y`) only fires from market-box-payout.ts:187 — the ONLY caller passing sourceType/offeringName. The webhook heal paths (webhooks:1038, :1074) and cron retry paths (expire-orders:1296, :1516) send the generic "a payout has been sent" for the same event class. Correct but less informative on recovery paths. Left as-is.

**Class disposition:** no registry entry — the class-deleter remains TYPED per-notification payloads (already backlogged). 125 untyped call sites is the exposure; today's defense is per-template warning comments + this audit.

---

## RULE 4: Status-value maps ↔ DB status sets — COMPLETE 2026-08-13

**Authoritative catering_requests set (mig 190, newest — its own header documents mig 094 dropping 'cancelled', the class's prior instance):** new, reviewing, approved, declined, ready, active, review, completed, cancelled (9).

**Maps checked:**
- ✅ event-manager dashboard STATUS_LABELS — all 9 (page.tsx:48-58).
- ✅ OrganizerProgress STAGE_FOR_STATUS — all 7 non-terminal (:60-68); cancelled/declined via terminal early-return (:83); unknown → stage 1 with explicit warning comment (:34-35).
- ✅ admin events LIFECYCLE_STEPS — all 7 non-terminal (:76-84) with full doc comment (:64-75).
- ✅ EDITABLE_STATUSES (component :72 + api details route :148) — intentional subsets, identical pair (already tagged? they match today; small pre-existing pair, hand-kept in 2 files).
- ✅ shop-data/event pages `.in('status', [...])` gates — intentional subsets.
- ✅ orders/order_items status maps — covered by existing status-transitions.test.ts + status-transitions-functional.test.ts (105 tests); not re-audited.

### 🟡 FINDING S-1 — admin events status FILTER list drifted (minor, can't-narrow not invisibility)
- `[vertical]/admin/events/page.tsx:571` hand-types `['all','new','reviewing','approved','declined','completed']` — missing ready/active/review/cancelled. Page fetches ALL statuses (:218, API :75-76 filters only when param present) and defaults to 'all' (:429-431), so mid-lifecycle events are visible but can't be narrowed to and have no count chip. ready/active are exactly the ones needing event-day attention.
- Fix = COLLAPSE: derive chips from LIFECYCLE_STEPS (complete, same file) + terminal statuses; delete the second hand-typed list. NOT yet fixed — report first.

---

## RULE 5: "Has applied" definition (collapse candidate) — COMPLETE 2026-08-13

**THREE hand-kept copies, agreeing today:**
1. Queue API `api/admin/vendors/pending-event-applications/route.ts:35-49` — `event_approved=false` + vendor `status='approved'` + `event_readiness.application_status==='pending_review'`.
2. `[vertical]/admin/vendors/[vendorId]/page.tsx:197,213-217` — badge `!eventApproved && application_status==='pending_review'`; hasApplied = status present && ≠'not_applied'.
3. `admin/vendors/[vendorId]/page.tsx:141,170-171` — the root (non-vertical) twin page, same logic hand-copied.
Writers: `api/vendor/event-readiness/route.ts:69` (sets pending_review), `api/admin/vendors/[id]/event-approval/route.ts:113` (syncs approved/rejected).

**Asymmetry (possibly intentional):** queue requires vendor status='approved'; detail-page badges don't — a pending application from a not-yet-approved vendor badges on the detail page but never appears in the queue. Surface to owner.

**Disposition:** collapse candidate confirmed — extract one `getEventApplicationState(profileData, event_approved)` helper used by all 3 readers. Code change → owner approval needed.

---

## RULE 6: Per-viewer masking (T-75 class) — COMPLETE 2026-08-13

Registry already pins organizer-identity across 4 sites (paired-rules.ts). Enumerated remaining vendor-facing event surfaces:
- ✅ prep route `api/vendor/events/[marketId]/prep/route.ts` — 403 on response_status!=='accepted' (:62) BEFORE identity fields (:165,:170). Accepted vendors get identity per the rule.
- ✅ admin manual-invite notification masks (`companyName: 'Private Event'`, city/state only — invite route :177-181).
- ✅ vendor/events/[marketId] (masked, T-75), vendor/markets (masked, T-67), market-stats (T-09) — this week's fixes, registry-tagged.
No new surfaces found.

---

## AUDIT STATUS: §2a queue COMPLETE except category G (RLS pairs — locked on owner's pg_policies query)

**Score: 4 confirmed bugs found+fixed (P-1×2 files, P-2, M-1), 1 minor drift found not yet fixed (S-1), 1 collapse candidate (has-applied ×3), 2 owner decisions recorded (company-paid fee, admin-sees-base), 0 live T-08 instances, ~40 surfaces verified clean.**

Pending owner: commit M-1 (built+gated), S-1 fix approval, has-applied collapse approval, staging push after test pass, pg_policies for category G.
