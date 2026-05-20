# Decision Log

Structured record of business and architecture decisions. Check here before asking "what did we decide about X?"

| Date | Category | Decision | Rationale | Reversible? | Session |
|------|----------|----------|-----------|-------------|---------|
| 2026-05-19 | Process | **Schema Intent Gate** — before writing any DELETE or replace-all CRUD, run three checks: (1) soft-delete column present? `active`, `deleted_at`, etc. → use UPDATE not DELETE; (2) cascade FK present? `REFERENCES <t> ON DELETE CASCADE` → DELETE radiates data loss; (3) pattern reuse without diff? Force "what's different?" question. | Session 83 incident: built schedule editor with delete-and-replace pattern despite the `market_schedules.active` column AND a cascade FK on `vendor_market_schedules.schedule_id` both being visible in the same migration I had just read. Pattern was wrongly transferred from optin selections (which had no soft-delete column or cascade FK). User caught it before ship. Rule added to `verification-discipline.md` Rule 5. | No (rule, mechanical) | 83 |
| 2026-05-19 | Architecture | Market schedule editing = **soft-delete via `active` flag**, never DELETE. Manager toggles a day off → UPDATE row to active=false, times preserved. Existing trigger `handle_market_schedule_deactivation` (mig 20260128_001) cascades is_active=false to `vendor_market_schedules` automatically — vendor attendance deactivated, not destroyed. Re-enabling restores times instantly; vendors must re-opt in. | The table designer added the `active` column for exactly this purpose. Three FKs reference market_schedules (vendor_market_schedules CASCADE, cart_items SET NULL, order_items SET NULL) — DELETE would silently destroy vendor attendance + orphan cart/order references. | Yes (would require code change to revert; trigger stays) | 83 |
| 2026-05-19 | Business | **Booth rental cancellation: not implemented; future design TBD.** Platform does NOT issue refunds for schedule changes (locked, see next row). Vendor self-cancellation was discussed and the user said "no cancellations" mid-session, then later reverted the code changes — the *feature decision* is unresolved. Tasks #48 (vendor self-cancel) and #49 (manager-cancel stuck pending_payment) remain on the backlog. If cancellation IS built later, the 3-day-before-market cutoff was locked as the rule. | Multi-turn conversation in Session 83; final state is "no cancellation feature shipped, decision pending." | Yes (decision unresolved) | 83 |
| 2026-05-19 | Financial | **Booth rental math = base + 6.5% + $0.15 vendor-side flat fee.** Matches product-order pricing shape. Manager-side stays pure percentage (no flat-fee deduction). For $25 booth: vendor pays $26.78, manager receives $23.37, platform keeps $3.41. Free booths ($0): all sides return 0 (flat fee not applied). | Aligns booth rental pricing with the existing product order convention. The $0.15 covers the platform's per-transaction Stripe processing cost. User-locked 2026-05-18. | Yes (would require pricing.ts + tests + landing copy update + comms to managers) | 83 |
| 2026-05-19 | Architecture | **Booth rentals are Stripe-only — no offline-payment fallback.** If a manager hasn't completed Stripe Connect onboarding, the booking page shows "Online booking not available yet" instead of the form. Manager who wants to take cash does it outside the platform — they don't get the booking flow / agreement system / vendor onboarding. | User direction 2026-05-18. The earlier dual-mode design (auto-create pending_payment row + manager-coordinates-offline) was wrong — it created untracked liability and made the booking flow lie about what would happen next. | Yes (would require restoring the dual-mode code path) | 83 |
| 2026-05-19 | UX | Schedule changes require **manager acknowledgment dialog** with 4 bullets before save: (1) manager is responsible for direct vendor outreach; (2) vendors get automatic notification + may request refund; (3) platform does NOT issue refunds; (4) toggling a day off preserves hours (soft-delete) and vendor attendance is deactivated, not deleted. | Acknowledgment is required because schedule changes affect paid vendors. The 4th bullet was added in the soft-delete rebuild to accurately describe the new (non-destructive) behavior. | No (UX rule) | 83 |
| 2026-05-19 | UX | Booking form shows **one all-inclusive price** (e.g. $26.78), not a breakdown. Matches `calculateDisplayPrice` convention from `src/lib/constants.ts` and `CartDrawer.tsx:218` ("one number, no breakdown" — what the buyer sees). The booth booking page is the only pre-Stripe screen, so the all-in number with $0.15 included goes here; Stripe Checkout shows the same total on the next step. | User-locked 2026-05-19. Original Fix-2 build (Session 83) showed a breakdown of base + markup which violated this convention. Caught by user → redone. | No (UX rule mirrors codebase convention) | 83 |
| 2026-04-12 | Financial | Event fee structure: vendors always pay 6.5% + $0.15 (unless fee discount code applied). Buyers always pay 6.5% + $0.15 + small order fee. For full-service (non-self-serve) events: flat rate per vendor per tier of "engaged attendees" (total attendees × engagement rate). 3-4 tiers TBD — Tier 1 (small) ~$50/vendor, Tier 2 (larger) ~$75/vendor. Self-service events: no flat fee (standard platform fees only). This applies to all payment models (attendee-paid, company-paid). The flat per-vendor fee is the matchmaking fee for connecting organizers with vendors. | Clarified in Session 71 by user. Standard platform fees always apply regardless of payment model. The per-vendor flat fee is separate from per-order fees and covers the curation/coordination work. Tier pricing based on engaged attendees (not total headcount) because engagement rate varies widely (40-80% for corporate lunch vs 10-20% for a festival). | No (business decision) | 71 |
| 2026-04-10 | Architecture | Server components must NOT fetch their own API routes via HTTP. Extract shared logic to `src/lib/**` and call it directly. | Session 70: the market detail page used `fetch(${baseUrl}/api/markets/[id]/vendors-with-listings)` which was silently returning 0 vendors on staging. Confirmed via curl (HTTP 401 HTML login page): **Vercel Deployment Protection (SSO mode)** blocks any request to staging previews that doesn't have a valid `_vercel_sso_nonce` cookie. Server-to-server `fetch()` in Next.js doesn't forward browser cookies, so Vercel Auth returned a 401 with `Content-Type: text/html`, the page's `try { if (response.ok) }` check saw ok=false and silently continued with empty vendors. Fix: extracted query to `src/lib/markets/vendors-with-listings.ts`, page now calls it directly with the server Supabase client (bypasses the HTTP layer entirely). Also added `console.error` on failure paths so future silent failures show up in Vercel function logs. Pattern applies to ALL server components — never `fetch(${getAppUrl()}/api/...)`. | No (rule) | 70 |
| 2026-02-28 | Business | Vendor trial = 90 days, grace = 14 days | Industry standard, generous enough to prove value | Yes | 48 |
| 2026-02-28 | Business | Trial auto-grants Basic tier (FT) | Lowest paid tier gives real value without giving everything away | Yes | 48 |
| 2026-02-28 | Architecture | Market box payout at checkout, not per-pickup | Prepaid model — vendor should get paid when buyer pays | No (would require migration) | 48 |
| 2026-03-30 | Architecture | Event pages under `[vertical]` layout | CartProvider required for server-synced cart state. `/events/[token]/*` had disconnected local state causing 5 UX bugs. | No (URLs changed, backend refs updated) | 66 |
| 2026-03-30 | Architecture | Event order caps = per-vendor, not per-listing | Separate from inventory system. FM: total cap. FT: per-wave + total. Stored on `market_vendors`. | Yes | 66 |
| 2026-03-30 | Architecture | Event lifecycle auto-transitions via cron | ready→active on event_start_date, active→review after event_end_date. Admin can override. | Yes | 66 |
| 2026-03-30 | Process | Critical-path files require file-level approval | 13 files (cart, checkout, payments, pricing). Design approval ≠ file approval. Session 66 incident: cart broken in prod. | No (rule) | 66 |
| 2026-03-30 | Architecture | Event cap enforcement NOT in cart API | Attempted and broke cart. Must use separate validation endpoint. cart/items/route.ts is never modified for event logic. | No (rule) | 66 |
| 2026-03-05 | Business | FM Premium = $25/mo (was $24.99) | Clean number, user requested | Yes | 50 |
| 2026-03-05 | Business | FT Pro = $25/mo (was $30), matches FM Premium | Unified pricing across verticals | Yes | 50 |
| 2026-03-05 | Business | FT annual pricing = same as FM annual | Consistency: Basic $81.50/yr, Pro $208.15/yr, Boss $481.50/yr | Yes | 50 |
| 2026-03-05 | Business | FM Premium annual stays $208.15/yr (not rounded to $210) | User chose to keep existing amount despite $25 monthly | Yes | 50 |
| 2026-02-22 | Architecture | Vendor quality checks = nightly cron (Phase 8) | Don't slow down real-time operations with quality scoring | Yes | 42 |
| 2026-02-20 | Financial | Tip % applied to displaySubtotal (per-item rounded) | Matches Stripe line items, avoids penny discrepancies | No | 40 |
| 2026-02-20 | Financial | Platform fee tip tracked in `tip_on_platform_fee_cents` | Vendor gets tip on food only, platform fee tip is separate | No | 40 |
| 2026-02-20 | UX | `ConfirmDialog` replaces all `window.confirm/prompt/alert` | Mobile browsers block native dialogs | No (72 instances replaced) | 40 |
| 2026-03-04 | Architecture | Upstash Redis for rate limiting (sliding window) | Shared across Vercel instances, free tier 10K cmds/day | Yes | 49 |
| 2026-03-04 | Architecture | Sentry via `SentryInit.tsx` client component | v10 doesn't auto-load `sentry.client.config.ts` via webpack | Yes | 49 |
| 2026-03-04 | Security | Password policy: min 9, upper+lower+number+special | Set in Supabase Auth for all 3 environments | Yes (Supabase dashboard) | 49 |
| 2026-03-04 | Architecture | `checkRateLimit()` is async (returns Promise) | Required for Upstash Redis, falls back to in-memory sync | No (181 call sites changed) | 49 |
| 2026-03-04 | Legal | 3-tier legal terms system (VIIIXV LLC d/b/a 815 Enterprises) | Proper legal structure for multi-vertical platform | Yes | 49 |
| 2026-02-22 | UX | Location persists via httpOnly cookie (30-day TTL) | User shouldn't re-enter zip every page visit | Yes | 44 |
| 2026-02-22 | UX | Browse page: 50 items/page with pagination | Performance + usability balance | Yes | 44 |
| 2026-02-28 | Infrastructure | Resend email: `updates@mail.[domain]` (not noreply@) | Better deliverability, clearer branding | Yes | 47 |
| 2026-02-28 | Infrastructure | Per-vertical email FROM domains | FM → farmersmarketing.app, FT → foodtruckn.app | Yes | 47 |
| 2026-03-20 | Financial | External payment fee flow: vendor fees deferred, not upfront | External orders set `vendor_payout_cents = subtotal` at checkout (vendor gets full amount). 3.5% vendor fee is recorded to `vendor_fee_ledger` LATER when vendor confirms payment received (non-cash: at confirm-external-payment; cash: at fulfill). Buyer pays 6.5% (no $0.15 flat fee). This differs from Stripe intentionally — no processing cost on external payments. See detailed flow doc below. | No — 5 files coordinate | 62 |
| 2026-03-20 | Financial | External payment refund policy: buyer handles directly with vendor | Platform does not process refunds for external payments. Buyer sees disclaimer at checkout and when reporting issues. Vendor manages refund directly via Venmo/CashApp/PayPal/cash. | No | 62 |

| 2026-03-20 | Financial | Stripe refund fee absorption: platform absorbs Stripe processing fee on refunds | When a refund is issued via Stripe, Stripe keeps their processing fee (~2.9% + $0.30). Platform absorbs this cost — buyer gets full refund of what they paid. May revisit if refund volume becomes significant. | Yes | 62 |
| 2026-03-20 | Financial | Refund amount = full buyer-paid amount (subtotal + 6.5% + prorated $0.15) | All refund paths (reject, cancel, resolve-issue, cron-expire) must refund what the buyer actually paid, not just the base subtotal. Per-item: `subtotal + round(subtotal * 6.5%) + floor($0.15 / totalItemsInOrder)`. | No | 62 |
| 2026-03-21 | Infrastructure | Per-vertical Stripe products for vendor subscriptions | Each vertical has its own Stripe products (separate branding on receipts/statements). FM: prod_U5sVZr6rwkfgHr (Pro), prod_U5sXaUbbjuw4c0 (Boss). FT: prod_U5sAqiVY7EzueR (Pro), prod_U5sNbxPjwJLfbp (Boss). Buyer Premium: prod_U5sZyHKKnvsA0p (shared). Future verticals will have their own products with potentially different pricing. | No | 62 |
| 2026-03-20 | Financial | Market box missed pickup = no refund | Buyer makes a 4-week (or 8-week) prepaid commitment. Missed pickups are the buyer's responsibility. No refund, no credit. This differs from regular orders where no-shows trigger refunds. | No | 62 |
| 2026-03-20 | Business | Trial tier = 'free' for all verticals | When admin approves a new vendor, trial grants 'free' tier (90 days, 14-day grace). Previously set legacy names ('basic' for FT, 'standard' for FM) which didn't match the unified Free/Pro/Boss system. | No | 62 |
| 2026-03-20 | Business | FT fulfilled items do not restore inventory on refund | When a food truck order item is refunded after fulfillment (buyer picked up food), inventory is NOT restored — cooked food cannot be resold. FM fulfilled items DO restore inventory (produce/goods can potentially be resold). Non-fulfilled items always restore regardless of vertical. | No | 62 |
| 2026-03-23 | Business | Catering pre-order minimum = 10 items per vendor | Catering orders (advance_order_days > 0) require minimum 10 items per vendor. Separate from private event orders. Both require event-approved vendor status. | No | 63 |
| 2026-03-23 | Business | Catering advance notice tiers by size | 10-29 items: 1 day ahead. 30-49 items: 2 days ahead. 50+ items: 3 days ahead. More notice preferred. All require prepayment. | No | 63 |
| 2026-03-23 | Financial | Event per-truck fee = $75 | Charged per truck to event organizer. Due with 50% deposit when agreement is signed/uploaded. Separate from transaction fees. | No | 63 |
| 2026-03-23 | Financial | Event transaction fees = normal platform fees | Event orders use standard 6.5% buyer + 6.5% vendor fee structure. No separate event percentage — the 13% total already exceeds the 10% target. | No | 63 |
| 2026-03-23 | Business | Event approval gates advance ordering AND events | Intentional coupling: event-approved status is a quality gate ensuring vendors have systems/staff for multi-day advance orders. Also feeds the event pipeline ($75/truck + transaction fees). Incentivizes vendors to get event-ready. | No | 63 |
| 2026-03-24 | Tax | FT listings always taxable | Prepared food for immediate consumption is subject to TX sales tax. Sales tax checkbox forced on, greyed out for FT. Pre-packaged resale items blocked from publishing. | No | 63 |
| 2026-03-24 | Tax | FM category-based tax rules | Per TX Comptroller 151.314: Produce/Dairy/Pantry = exempt. Prepared Foods/Plants/Wellness/Art/Home = taxable. Meat & Baked Goods = depends on preparation (trigger question for immediate consumption). | No | 63 |
| 2026-03-24 | Tax | Platform is TX marketplace facilitator | Under TX Tax Code, platform collects, reports, and remits sales tax on all marketplace sales. Vendors don't collect tax on platform sales but still need their own TX sales tax permit. | No | 63 |
| 2026-03-24 | Tax | ~~Stripe Tax for tax calculation + collection~~ **SUPERSEDED by Session 72 decision below** | ~~Use Stripe Tax (automatic_tax with liability:'self')~~ | ~~No~~ | 63 |
| 2026-04-17 | Tax | TaxCloud replaces Stripe Tax as tax provider | TaxCloud (Certified Service Provider under SSUTA) handles: (1) rate calculation via API (free), (2) automated filing + remittance for SSUTA states AND non-SSUTA states including Texas (via ACH from linked bank account). TX is not an SSUTA member but TaxCloud files TX returns anyway — confirmed via TaxCloud support docs. Replaces Session 63 Stripe Tax decision ($0.50/txn → free). Platform responsibility: API integration, TIC code mapping to product categories, transaction reporting. TaxCloud handles the rest. Texas Comptroller registration in progress (taxpayer ID obtained, awaiting system processing). | No | 72 |
| 2026-03-24 | Tax | External payments hidden pending tax resolution | EXTERNAL_PAYMENTS_ENABLED = false. All external payment UI (Venmo/CashApp/PayPal/Cash) hidden. Backend preserved. Risk: platform facilitates transactions without full visibility into tax-relevant details. Will re-enable after tax treatment is resolved. | Yes | 63 |
| 2026-03-24 | Payments | Explicit payment methods: Card, Cash App, Amazon Pay, Link | Stripe checkout sessions list all methods explicitly so buyers see every option. Apple Pay + Google Pay come through 'card' automatically. All methods enabled in Stripe Dashboard for platform + connected accounts (on by default). | Yes | 63 |

### Sales Tax Implementation Plan (Updated Session 72 — TaxCloud)

**Status: PENDING — TX Comptroller registration in progress, TaxCloud account needed.**

**Prerequisites (user action required):**
1. ✅ Register with Texas Comptroller as marketplace facilitator → taxpayer ID obtained, awaiting processing
2. ❌ Create TaxCloud account → get API ID + API Key
3. ❌ Link bank account in TaxCloud for TX tax remittance (ACH)
4. ❌ Register TX in TaxCloud dashboard

**Code changes (after prerequisites):**
1. Create `src/lib/tax/taxcloud.ts` — API client (Lookup, Captured, AuthorizedWithCapture, Returned)
2. Map product categories to TIC codes (prepared food, food ingredients, non-food items, plants, etc.)
3. At checkout: call TaxCloud Lookup with item TICs + pickup market address → get tax per item
4. Display tax line item on checkout page
5. Include tax in Stripe charge total (but NOT in vendor transfer — platform remits tax via TaxCloud)
6. After successful checkout: call TaxCloud Captured to report the transaction
7. On refund: call TaxCloud Returned to report the reversal
8. Add `sales_tax_cents` column to orders/order_items for internal tracking
9. Withhold tax amount from vendor transfers (exclude tax from vendor_payout_cents)
6. Update accounting reports to include Stripe Tax data

**Filing:**
- Option A: Use Stripe Tax location reports + file manually with TX Comptroller
- Option B: TaxJar AutoFile ($35/filing) — syncs from Stripe Tax, submits automatically

**Tax rate:** Determined automatically by Stripe Tax based on pickup location address. TX base 6.25% + local up to 2% = max 8.25%. No manual rate table needed.

**Cost:** 0.5% per transaction (e.g., $0.05 on a $10 order) on top of standard Stripe processing fees.

### External Payment Fee Flow — Protected Architecture (Session 62)

**DO NOT modify any of these files without understanding the full flow first.**

**Flow:**
1. **Checkout** (`api/checkout/external/route.ts`): Creates order with `vendor_payout_cents = subtotal` (full amount). Buyer charged `subtotal + 6.5%`. No vendor fee recorded yet — vendor hasn't received payment.
2. **Vendor confirms payment** (`api/vendor/orders/[id]/confirm-external-payment/route.ts:106-123`): For non-cash methods (Venmo/CashApp/PayPal), calls `recordExternalPaymentFee()` which writes 3.5% vendor fee to `vendor_fee_ledger`. Cash orders skip this — deferred to fulfill.
3. **Vendor fulfills** (`api/vendor/orders/[id]/fulfill/route.ts:153`): For cash orders, `recordExternalPaymentFee()` is called here.
4. **Fee accumulates** in `vendor_fee_balance` view. When balance >= $50 or oldest entry > 40 days, vendor must pay.
5. **Auto-deduction** (`vendor-fees.ts:186-196`): Platform can auto-deduct up to 50% of Stripe payouts to recover external payment fees.

**Key files:**
- `src/lib/payments/vendor-fees.ts` — Fee calculation functions + ledger operations
- `src/app/api/checkout/external/route.ts` — External order creation
- `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts` — Fee recording for non-cash
- `src/app/api/vendor/orders/[id]/fulfill/route.ts` — Fee recording for cash
- `src/lib/pricing.ts` — Stripe fee constants (6.5% + $0.15)

**Why fees differ:** No Stripe processing cost on external payments, so platform charges less (3.5% seller vs 6.5% Stripe). Buyer fee is same 6.5% but no $0.15 flat fee (no processing to cover).
