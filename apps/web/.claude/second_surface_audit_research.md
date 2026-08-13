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

## Later rules (queue from §2a):
- Multi-market order comms (T-05 class) — confirmation email + other comms describing a cart as one market
- Notification template keys ↔ caller keys (T-08 class)
- Status-value maps (STAGE_FOR_STATUS ↔ DB statuses)
- "has applied" definition on two admin surfaces (collapse candidate)
- Per-viewer masking surfaces (T-75 class)
- Category G (RLS pairs) — LOCKED until owner runs pg_policies
