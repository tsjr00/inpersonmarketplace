# Comprehensive Logic Testing Round — Two-Pass Analysis
Started: 2026-07-19. Mode: Report (read-only). Approved by user.

## ★ CONSOLIDATED SUMMARY (2026-07-19) — read this first
Scope: 12 Codebase-Map slices (Pass A blind) → ledger diff (Pass B) → verification
of top findings against live code → RPC-layer map (5 money SQL fns). Regression check:
the July 7-day review's marked-fixed items ARE present in current code (no regressions).

**CONFIRMED-NEW, actionable (not in FINDINGS_LEDGER), ranked:**
- HIGH — **S2-2** resolve-issue double-refund (post-grace buyer-cancel → vendor
  issue_refund; different amounts = different Stripe keys = both fire; buyer-controllable).
  Fix: `.is('cancelled_at',null)` + rowcount guard on resolve-issue:155-167.
- MED — **S4-1** open redirect in auth/callback:74 (`next` unchecked). Fix: require next `^/[^/]`.
- MED — **S8-1** subscription tier-switch cancels old sub before new checkout →
  downgrade-on-abandon (subscriptions/checkout:190-233). Fix: create new before cancel old.
- MED — **S1-5** market-box-payout "payout processed" sent on FAILED/unattempted transfer
  (market-box-payout.ts:155-186). Fix: gate the send on success.
- MED — **S1-11+S5-1** full-refund stamps whole-order amount on EVERY item
  (webhooks.ts:1160-1165 ⚠PROTECTED) → platform-revenue.ts:80 over-counts refunds N×. Fix:
  per-item share.
- MED(PLAUSIBLE) — **S3-1** Phase-5 re-transfer after H-9 7-day flip
  (expire-orders:1580-1598) may double-pay; premise = Stripe key TTL ~24h (needs staging).
  Fix: check stripe_transfer_id before re-send.
- MED ⚠CONFLICT — **S2-1** partial-cancel tip-share retention (fulfill:261 ⚠PROTECTED +
  buyer-confirm). Fix A (fulfill divisor) may trip pricing-conservation.test.ts → decision
  point; Fix B (refund at cancel) avoids it.
- LOW — **S-RPC-1** standalone MB subscribe idempotency no-op on NULL order_id →
  concurrent-delivery false-refund (mig 124 + webhooks:516). Ties to MBX-1. UI-orphaned.

**Verified-SOLID at RPC layer:** atomic_decrement_inventory (mig 078, not 001),
atomic_complete_order_if_ready (092), claim_vendor_fee_deduction (197),
redeem_booth_credit (201). DB money layer is disciplined.

**Already-tracked (no new action):** S4-2=CMAP-1 (admin-lockdown build), S5-2=CMAP-1
step-2, S9-1=EVT-4 known limitation.

**Lower/defer (bundle → backlog):** S1-1/2/3/6/7/8/9/10/12, S2-3/4/5, S3-2/3, S4-3,
S5-3, S6-1 (RESOLVES map 13:60 — park credits never expire), S8-2, S12-2 (a QUERY, not code).

**Unmapped (deliberately stopped — low expected yield, test-guarded):** booking-atomic
RPCs (186/172/165), season RPCs (167), selling gate (199, pinned by guardrail-contracts F).

## Method
- **Pass A (blind):** per-slice fresh gap + threat analysis. NOT allowed to read
  `apps/web/.claude/review/FINDINGS_LEDGER.md` until all Pass A slices done.
  Codebase Map used for file inventory ONLY.
- **Pass B (sighted):** diff Pass A findings against FINDINGS_LEDGER; verify each
  "fixed" item's fix is present in code; flag anything Pass A missed.
- Every finding: `file:line` citation + severity + confidence (Confirmed/High/Medium/Low).
- After both passes: shrink user's staging test to what code can't verify.

## Slice order (blast-radius weighted)
- [x] 1. Checkout & Payments (10)
- [x] 2. Vendor Orders & Payouts (11)
- [x] 3. Crons (17)
- [x] 4. Auth / RLS / Verticals (16)
- [x] 5. Admin (19)
- [x] 6. Market Manager (12)
- [x] 7. FT Park (13)
- [x] 8. Market Boxes / Subs (15)
- [x] 9. Events (14)
- [x] 10. Notifications (18)
- [x] 11. Buyer / Public (20)
- [x] 12. Lib sweep (21)
- [x] Pass B: ledger diff

## Findings

### Slice 1 — Checkout & Payments — COMPLETE (Pass A)
Files read in full: pricing.ts, inventory.ts, inventory-rules.ts, tip-math.ts,
cancellation-fees.ts, checkout/session/route.ts, checkout/success/route.ts,
stripe/payments.ts, stripe/webhooks.ts (all 1907), webhooks/stripe/route.ts,
market-box-payout.ts, fee-capture.ts, webhook-utils.ts, cart/items/route.ts,
cart/items/[id]/route.ts, cart/validate/route.ts, TipSelector.tsx, checkout
page tip wiring (grep).

**S1-1 [Medium, Confirmed] Stale-tip session reuse — half-fixed CHK-2.**
`checkout/session/route.ts:232` reuse condition requires the NEW request's
`validTipAmount === 0` but never checks the PENDING ORDER's tip (`tip_amount`
not selected at :177-190). Scenario: FT buyer checks out with 20% tip → backs
out of Stripe → sets tip to "No tip" → checks out again with identical items →
itemsMatch, new tip=0 → old session REUSED → buyer pays the old tip anyway;
order row still records the old tip. The CHK-2 comment (:229-231) says "a
reused session carries a stale tip" — the guard only covers the new-tip>0
direction.

**S1-2 [Low, Confirmed] Per-item vs order-level rounding drift: Stripe charge
can differ from orders.total_cents by cents.** Stripe line items use
`round(price×1.065)` per item (:677, ×quantity at payments.ts:45-55), but
`orders.total_cents` uses `orderPricing.buyerTotalCents` = round applied to the
whole subtotal (:604, pricing.ts:161-163). Example: 3 × 7¢ items → Stripe
charges 21¢+15¢, total_cents records 22¢+15¢. `payments.amount_cents` stores
session.amount_total (actual charge, success:149), so orders.total_cents ≠
payments.amount_cents by ±cents on multi-item/multi-qty carts. Bookkeeping
drift only; refund math is per-item and independent.

**S1-3 [Medium, Confirmed] Checkout trusts request-body items — cart
validations bypassable by direct API.** `checkout/session/route.ts:65` takes
`items` from the body, never from the cart; the cart is only consulted for
pickup info (:334-369). No check that listings belong to the request vertical
(cart POST has it, cart/items/route.ts:117-124; checkout doesn't — :262-299),
no re-validation of schedule/pickup_date validity (build_pickup_snapshot
failure is non-blocking :632-635), no FT time-slot requirement. A crafted POST
can create a cross-vertical order, an order with arbitrary pickup_date, or an
FT order with no time slot. Money math stays correct per item; integrity/
scoping damage only. (Cutoff + inventory ARE re-checked: :469-522.)

**S1-4 [Medium, Confirmed] Custom API tip with tipPercentage=0 routes 100% of
tip to platform.** `session/route.ts:614-617`: `vendorTipCents = 0` whenever
`validTipPercentage === 0`, even if `validTipAmount > 0` → whole tip becomes
`tipOnPlatformFeeCents`. UI always sends a percentage (TipSelector custom =
custom %, checkout page:526 derives amount from pct), so buyers can't hit it —
but a direct API call charges a "tip" the vendor never receives. Consider
rejecting tipAmount>0 with pct=0, or defaulting the split vendor-ward.

**S1-5 [Medium, Confirmed] market-box-payout sends 'payout_processed' to the
vendor even when the transfer FAILED or was never attempted.**
market-box-payout.ts:134-140 catches transferErr, marks the payout row
'failed'… then execution continues to the notification block at :155-186 which
unconditionally tells the vendor their payout of $X was processed. Same for the
`pending_stripe_setup` branch (:141-153) — no transfer yet, vendor still told
"payout processed". Misleading money communication; no money moves wrongly.

**S1-6 [Medium, Confirmed] cart/validate GET validates against the listing's
FIRST market, not the cart item's chosen market.** validate/route.ts:91
`listing.listing_markets[0].markets` — cart_items.market_id is never selected
(:28-47). A listing attached to multiple markets (e.g., traditional + event)
validates against an arbitrary one → mixed-type and same-market checks can
false-pass or false-block.

**S1-7 [Medium, High confidence] cart/validate GET has no vertical filter —
one vertical's cart can block the other vertical's checkout.** The cart_items
query (:28-47) has no cart/vertical scoping (RLS scopes to user only; users
hold one cart PER vertical — success/route.ts:513 comment). A user with an FM
cart (traditional market) + FT cart (private_pickup) gets marketTypes={2} →
"different pickup types… checkout separately", valid=false, on BOTH checkouts.
Unverified only in that I haven't confirmed FT items produce a different
market_type value in practice.

**S1-8 [Low, Confirmed] Cancellation small-order-fee proration uses
Math.round per item — refund total can drift ±N¢ from fee collected.**
cancellation-fees.ts:72 `Math.round((smallOrderFeeCents)/totalItems)` per item;
50¢ over 3 items refunds 17×3=51¢. The flat fee got the floor+remainder M12
fix (:69); the small-order fee didn't.

**S1-9 [Low, Confirmed] 8-week market-box term silently falls back to 4-week
price.** session/route.ts:543-545 & :693-695 `price_8week_cents ||
price_4week_cents`: cart POST rejects 8-week when unoffered
(cart/items/route.ts:378-380) but checkout body is not cart-bound (see S1-3),
so a direct API 8-week request on a 4-week-only offering charges the 4-week
price and creates an 8-week subscription — vendor obligated 8 weeks for 4-week
money (subscription term from metadata, success:279-283).

**S1-10 [Low, Confirmed] HANDLED_EVENT_TYPES is stale doc — missing
charge.dispute.created.** webhook-utils.ts:12-24 claims to be the canonical
handled list; webhooks.ts:103-105 handles disputes. List is only consumed by
its own test (grep-verified), so no functional impact — doc/test drift.

**S1-11 [Low, Confirmed] handleChargeRefunded stamps FULL refund amount on
EVERY item.** webhooks.ts:1160-1165: full-refund path sets each non-cancelled
order_item.refund_amount_cents = charge.amount_refunded (the whole order's
refund). Sum over items = N× actual. Bookkeeping only.

**S1-12 [Info] Full-refund via Stripe dashboard does not restore inventory or
reverse vendor transfers.** handleChargeRefunded (webhooks.ts:1127-1224) flips
statuses + notifies only. If admin refunds after payout, vendor keeps the
transfer. Possibly intended (admin manual-op), but nothing in the handler or
docs says so.

### Slice 2 — Vendor Orders & Payouts — COMPLETE (Pass A)
Files read in full: fulfill, reject, resolve-issue, buyer/orders/[id]/cancel,
buyer/orders/[id]/confirm, vendor-fees.ts, getVendorProfile.ts (+ map 11).

**S2-1 [Medium, Confirmed] Tip share divides by ALL order items incl.
cancelled — platform silently retains cancelled items' tip shares.**
fulfill/route.ts:261-267 & buyer confirm/route.ts:182-186 count order_items
with no cancelled filter; each fulfilled item gets vendorTip/N. Reject/cancel
refund the tip ONLY when the LAST item goes (reject:240-253, buyer
cancel:281-291). So on a 3-item FT order with 1 item rejected: buyer's full tip
stands, two vendor-fulfilled items each get tip/3, and tip/3 is never
distributed nor refunded — it stays with the platform. Buyer tipped "the
vendor"; a third evaporates. Fix options: count only non-cancelled items at
fulfill, or refund the cancelled item's tip share at cancel.

**S2-2 [High, High confidence] resolve-issue `issue_refund` is UNGUARDED
against an already-cancelled item — double-refund path.**
resolve-issue/route.ts:155-167: the cancel UPDATE has no
`.is('cancelled_at', null)` guard and no rowcount check (unlike reject:122-133
H3 and buyer-cancel:142-154). Scenario: buyer reports an issue on a 'ready'
item, then cancels it themselves after the grace window (75% refund, key
`refund-PI-item-<75%amt>`); the vendor later clicks "issue refund" →
item re-cancelled, second refund fires with key `refund-PI-item-<100%amt>` —
DIFFERENT amount → different idempotency key → Stripe issues BOTH refunds
(caps only at the total charge, which a multi-item order covers) → buyer
refunded up to 175% for the item at the platform's expense. Idempotency
accidentally saves the reject→resolve pairing (same amount → same key) but not
buyer-cancel→resolve. Remaining verification: confirm report-issue allows
reporting on a status the buyer can still cancel (ready) — checked in Pass B.

**S2-3 [Low, Confirmed] Protected-file lists name a nonexistent route.**
`src/app/api/vendor/payouts/route.ts` does not exist (glob-verified) but is
listed in `.claude/protected-paths.txt:43`, change-discipline.md Rule 3 table
(:149), and Codebase Map 11:168 Tier-1. Harmless (hook never fires) but the
"double-payout prevention lives here" claim points nowhere — actual prevention
lives in fulfill:291-306 / confirm:189-198. Map coverage test misses it (prose,
not claim block).

**S2-4 [Low, Confirmed] Dev-mode payout insert in fulfill uses the USER client
on a table with no INSERT policy.** fulfill/route.ts:445-451 inserts
vendor_payouts via `supabase` (user client) with error unchecked; buyer-confirm
:302 correctly uses serviceClient. Per VOR-3 comment (:191-192) the RLS
default-deny makes this silently fail → dev-mode payout rows never recorded.
Dev-only noise, but it's the exact silent-failure class VOR-3 fixed elsewhere.

**S2-5 [Low, Confirmed] Admin-notification queries disagree on where admin
role lives.** resolve-issue:118-123 queries `user_profiles.roles` array
(`contains('roles',['admin'])`), webhooks.ts:1265-1268 queries the scalar
`role` column (`or('role.eq.admin,role.eq.platform_admin')`). Post-mig-204
both should resolve, but one of these predates the hierarchy and they can
notify different admin sets. Cross-check in slice 5.

**S2-6 [Info] Partial-order small-order-fee asymmetry.** Reject/resolve refund
per-item = subtotal+6.5%+flat only; small-order fee returns only on FULL
cancellation. Buyer-cancel per-item DOES include a small-order-fee share
(cancellation-fees.ts:72). So who cancels determines whether the buyer gets
the fee share back on partial cancels. Deliberate? (VOR-5B covered full-kill
only.)

**Verified-solid (no finding):** VOR-1 paid gate on both payout paths
(fulfill:99-116, confirm:117-138); VOR-2 guarded flips + rowcount checks;
VOR-3/VOR-15 fatal on untracked payout insert; C2 double-payout check before
fee claim; mig-197 atomic fee claim on both paths; VOR-17/18 sourceTransaction
threading; H3 guarded cancels in reject + buyer-cancel; VOR-19 session-expire
before last-item order cancel; VOR-6B clawback (debit idempotent via mig-155
index, unpaid rows cancelled before retry cron); VOR-16 tip-only refund on
buyer last-item cancel (small fee already prorated per item); getVendorProfile
5-rule resolution.

### Slice 3 — Crons — COMPLETE (Pass A)
Read: expire-orders phases 1-5, 7, 16-21 in full + headers of the rest;
no-show.ts; map 17. (Phases 3.5-15.5 non-money — skimmed via phase index only.)

**S3-1 [Medium, High confidence] Phase-5 payout retry after 7-day
stale-processing flip can DOUBLE-PAY a vendor.** H-9 (expire-orders:1580-1598)
flips 'processing' payouts older than 7 days to 'failed'; Phase 5 then re-runs
`transferToVendor` with the same key `transfer-{orderId}-{orderItemId}`
(payments.ts:113). Stripe idempotency keys expire after ~24h (Stripe-documented
behavior — UNVERIFIED against current docs), so a 7-day-later retry creates a
SECOND real transfer. The scenario H-9 exists for — transfer initiated,
`transfer.created` webhook never processed — is exactly the one where the first
transfer DID succeed. The row even has `stripe_transfer_id` set; Phase 5 never
checks it. Fix shape: before retrying a failed payout with a non-null
stripe_transfer_id, retrieve the transfer from Stripe and reconcile instead of
re-sending. Same applies to the MB branch (`transfer-mb-sub-{id}`).

**S3-2 [Low, Confirmed] Cron payout paths never claim the vendor fee
deduction.** fulfill (:314-335) and buyer-confirm (:217-228) run
claimVendorFeeDeduction; Phase 4 no-show (expire-orders:836-893) and Phase 7
auto-fulfill (:1870-1940) pay `vendor_payout_cents + tip` with no claim. Fee
stays on the ledger for a future payout (deferred, not lost) — but a vendor
whose only payouts come through cron paths never has fees collected.

**S3-3 [Info, High confidence] Orders containing a no-show item can never
reach 'completed'.** Phase 4 flips the item to fulfilled without stamping
buyer/vendor_confirmed_at (:823-829) and never calls
atomic_complete_order_if_ready; the RPC requires both stamps on every
non-cancelled item (map 11:71 — RPC source not read). Reporting-only.

**S3-4 [Info] Phase 4/7 tip shares divide by ALL order items** (no-show.ts:27,
expire-orders:1876-1877) — same platform-retains-cancelled-shares behavior as
S2-1.

**Verified-solid:** CRN-1 paid gates in Phases 4+7; CRN-9 guarded flips w/
rowcount; CRN-2/5 expire-session-then-guarded-cancel in Phase 2/3; CRN-8
sourceTransaction in every retry branch; H-10/M-11 insert-before-transfer
everywhere; Phase 18 Stripe-as-source-of-truth with budget; Phase 19 RPC-
aggregate + loud skip; Phase 20 market-local end-date guard; timing-safe cron
auth; soft budget checkpoints; Phase 16 credit release with MGR-7 loud failure;
no-show FT local-time math (timezone-drift #3 fix).

### Slice 4 — Auth / RLS / Verticals — COMPLETE (Pass A)
Read: admin.ts, roles.ts, vertical-gate.ts, auth/callback/route.ts,
admin-accounts.ts, middleware.ts (+ map 16).

**S4-1 [Medium, High confidence] Open redirect in auth/callback via `next`
param.** callback/route.ts:19,28-29,74: `explicitNext` (raw query param) is
passed to `new URL(next, origin)` and used as a redirect target with no
same-origin/relative validation. A link
`…/api/auth/callback?code=<valid>&next=https://evil.com` (or `next=//evil.com`)
redirects the authenticated user to an attacker origin after a real login/
verify — a phishing/token-forwarding vector. Standard fix: reject `next` unless
it starts with a single `/` (not `//`). The error branch (:54-58) already only
uses `next` for a path segment, so it's the success path that's exposed.

**S4-2 [Confirmed] CMAP-1 (already tracked) — `hasPlatformAdminRole` accepts
plain 'admin', making verifyAdminScope's vertical check unreachable.**
admin.ts:134-140. This is the "next build — admin lockdown" work already
specced in current_task.md §3. Independently re-confirmed by fresh read: the
:207-224 `admin && requestedVerticalId` branch and the :226-253 fallback are
BOTH dead for any 'admin'-role user because :195 short-circuits. Noting so the
blind pass corroborates it; no new action.

**S4-3 [Low, Confirmed] `isRegionalAdmin`/`regional_admin` role is defined but
unenforced anywhere in scope-checking.** roles.ts:9,58-60 defines the role;
verifyAdminScope (admin.ts:170-259) and hasAdminRole never consult it. A
`regional_admin` user passes NO admin gate (hasAdminRole checks only
admin/platform_admin). Either dead role or a latent gap depending on the
regional-manager design (current_task.md §3 step 4). Flag for that design.

**S4-4 [Low, Confirmed] vertical-gate empty-verticals bypass + admin bypass are
broad.** vertical-gate.ts:36-38 (any hasAdminRole bypasses ALL vertical checks)
and :59-62 (empty verticals array → allowed through). Combined with S4-2, a
vertical admin bypasses page-level vertical isolation too. Page gate is not the
real boundary (map 16:67 says query filter is), so impact is limited to pages
that rely solely on this gate — worth a targeted check per protected page.
Documented in map as intentional; noting the interaction with CMAP-1.

**Verified-solid:** dual-column role reads everywhere (roles.ts pattern);
timing-safe nothing here but middleware domain-enforcement + allowlist 404 +
no-store on sensitive paths correct; admin-accounts integrity guard; callback
error-path vertical extraction safe.

### Slice 5 — Admin — COMPLETE (Pass A)
Read: admin.ts (slice 4), fee-override route, platform-revenue.ts,
events/[id]/settlement route (+ map 19). Admin domain dominated by CMAP-1
(=S4-2); focused on the money routes flagged UNVERIFIED in map 19:65.

**S5-1 [Medium, Confirmed] Full-refund reporting over-counts refunds N×,
understating platform net revenue.** Ties S1-11 to impact: handleChargeRefunded
(webhooks.ts:1160-1165) writes the FULL charge refund to EVERY non-cancelled
item's refund_amount_cents; platform-revenue.ts:80 sums per-item
refund_amount_cents into refundCents; net = gross − stripe − refundCents. On an
N-item order fully refunded via Stripe dashboard, refundCents = N × actual
refund → net platform revenue understated by (N−1)× the refund. Real reporting
defect on any multi-item dashboard refund.

**S5-2 [Low, Confirmed] fee-override route has NO vertical scoping — resolves
the map's UNVERIFIED concern.** fee-override/route.ts:36 gates on bare
hasAdminRole; the vendor lookup (:57-61) is `.eq('id', vendorId)` with no
vertical filter. Any admin (incl. a would-be vertical admin) can override the
platform fee of a vendor in ANY vertical. Currently zero exposure (all admins
platform-wide post-mig-204), but it does NOT compensate internally — so it's a
real gap the moment a scoped vertical admin exists. Feeds the CMAP-1 step-2
audit (money routes first).

**S5-3 [Low, Confirmed] Settlement report ignores vendor_fee_override_percent.**
settlement/route.ts:274 computes the vendor fee at flat FEES.vendorFeePercent
(6.5%); a grant/partner vendor with an override (3.6–6.5%) shows a settlement
netPayout that disagrees with the actual per-item vendor_payout_cents charged
at checkout (session:565-582 used getEffectiveVendorFeePercent). Reporting-only
inaccuracy for override vendors (CHK-15 sibling on the reporting side).

**Verified-solid:** platform-revenue decomposition (gross = total − payouts −
vendorTipShare; once-per-order; actual-fee override) is correct and matches the
checkout fee model; settlement per-order flat-fee counting via Sets is correct;
fee-override floor/ceiling validation correct.

### Slices 6+7 — Market Manager & FT Park — COMPLETE (Pass A)
Read: vendor/markets/[id]/book route, settlement-math.ts, cancel-credit.ts,
cancel-date-cascade.ts (header + park-credit insert), mig 198 body (schema
gate satisfied via SCHEMA read + migration file), maps 12+13. RPC-internal
logic (book_*_atomic, redeem_booth_credit, confirm_season_paid) NOT verifiable
from app code — flagged as a Pass-A limit; these are the highest-value staging
tests.

**S6-1 [Low, Confirmed — resolves map 13:60 UNVERIFIED] Park cancel credits
NEVER expire.** cancel-date-cascade.ts:455-461 inserts `park_date_cancel`
grants with NO `expires_at` (NULL). Mig 198's get_booth_credit_expiry_state
(:42-45) treats any positive grant row with `expires_at IS NULL` as a permanent
live grant → Phase 19 never zeroes a balance that includes a park grant. So a
truck's park cancel credit is effectively permanent, unlike FM season/vendor-
cancel credits which anchor to season-end+1 or last-week+7 (cancel-credit.ts
computeCreditExpiry). Migration comment calls NULL "generous v1" — so likely
intentional-for-now, but it means park credits accumulate forever with no
sweep. Confirm intent; if not, park grants need a computeCreditExpiry anchor.

**S6-2 [Info, Confirmed] Booth credit is redeemed (deducted) at booking time,
before payment.** book/route.ts:410-422 redeems credit then creates the Stripe
session; if the vendor abandons checkout the credit is locked until Phase 16
(30 min orphan / 24 h stale) releases it. Documented + release paths are
MGR-7-guarded (loud on failure). Not a defect — noting the pre-payment
reservation window because a vendor who books+abandons repeatedly sees their
balance "disappear" for up to 24 h.

**S6-3 [Info] Manager `book` route pre-checks stripe_charges_enabled from the
cached column** (book/route.ts:148) — a manager whose Stripe went disabled but
whose cached column is stale (webhook lag) could still start a booking that
then fails at the destination charge. account.updated webhook (MGR-5,
webhooks.ts:965-972) now syncs markets.stripe_charges_enabled, so the staleness
window is small. Noted, not actioned.

**Verified-solid:** book route gate order (vertical→stripe→profile→inventory→
week validation) correct; FT-park rejection guard (:137-142) prevents orphan
weekly_booth_rentals at parks; atomic RPC error → HTTP shape mapping complete;
Stripe-failure cleanup releases credit BEFORE deleting the row (FK SET-NULL
hazard handled, MGR-7); settlement-math per-day proration + clean-close gate
correct and pure; cancel-credit D5 net-receipts allocation correct; cascade
paths A-D vendor-reliability semantics (cancelled_by='market', park never
'expired') correct.

### Slice 8 — Market Boxes & Subscriptions — COMPLETE (Pass A)
Read: subscriptions/checkout, subscriptions/verify (+ map 15; MB checkout/
webhook/payout already fully covered in slice 1).

**S8-1 [Medium, Confirmed] Vendor tier-switch cancels the OLD subscription
before the new checkout is paid — abandonment leaves the vendor downgraded
mid-period with no refund.** subscriptions/checkout/route.ts:190-207 (FT) &
:217-233 (FM) call `stripe.subscriptions.cancel()` (immediate, not
at-period-end) BEFORE creating the new checkout session (:325). Cancel fires
`customer.subscription.deleted` → handleSubscriptionDeleted (webhooks.ts:697)
downgrades tier to 'free' + auto-pauses excess listings/boxes. If the vendor
then abandons the new Stripe checkout, they've lost the paid tier they already
paid for, with excess listings drafted, and no new subscription. Safe pattern:
create/confirm the new subscription first (or use Stripe subscription update
with proration) and cancel the old only after. Buyer path is NOT affected (it
blocks re-purchase, never cancels). Worth confirming against real Stripe
behavior before ranking — but the ordering is clearly cancel-then-checkout.

**S8-2 [Info] verify route 30-day fallback period.** subscriptions/verify:64-66
(and webhooks getSubscriptionPeriodEnd:55-56) fall back to now+30d when
current_period_end is unreadable. An annual subscriber hitting that fallback
gets tier_expires_at 30 days out; Phase 8 would then expire them ~11 months
early. Depends on Stripe API-version field placement (the code already handles
two shapes). Low likelihood, high-ish impact if it fires — worth a staging
check that annual subs get the right expiry.

**Verified-solid:** MBX-5 vertical guard on verify; C-3 auth + user-match on
verify; vertical-required on vendor checkout (prevents cross-profile
overwrite); idempotent fallback activation; getVendorProfileForVertical used
throughout; already-at-tier + already-premium guards.

### Slice 9 — Events — COMPLETE (Pass A)
Read: events/[token]/cancel route (+ map 14). Attendee-paid ordering = normal
checkout (slice 1). Company-paid path is a KNOWN dead package (map 14:81-90,
EVT ledger) — not re-analyzed; two breaks + Math.random access code +
reservation TOCTOU already tracked. NOT reading the wave/company-paid SQL RPCs.

**S9-1 [Low, Confirmed] Event-cancel skips refund for the WHOLE order if ANY
one item is fulfilled — buyer's unfulfilled items in that order go unrefunded
despite the "a refund will be processed" notice.** cancel/route.ts:171-173
builds fulfilledOrderIds at ORDER granularity; :199-202 skips auto-refund for
the entire order and only logs manual-review. On a mixed multi-vendor event
order (vendor A fulfilled, vendor B not), the buyer is told a refund is coming
(:152) but B's unfulfilled item is neither refunded nor separately handled — it
waits on manual review. Conservative-by-design (avoid clawing back handed-over
goods) but the granularity mismatch leaves a real buyer short + a promise
unmet. Consider per-item refund for the non-fulfilled items.

**S9-2 [Info] Event-cancel has no vendor-payout clawback.** Unlike resolve-
issue (VOR-6B), the event cancel refund path doesn't clawback or cancel
existing vendor_payouts. Low exposure because fulfilled orders (the only ones
with payouts, via normal fulfill or Phase-4 no-show) are skipped from refund
entirely — but a 'ready' item that got a Phase-4 no-show payout THEN the event
is cancelled would be in fulfilledOrderIds (status flipped to fulfilled), so
skipped. Net: the interaction is safe by the fulfilled-skip, but there's no
explicit clawback if that assumption ever breaks. Noting for completeness.

**Verified-solid:** organizer ownership check (user_id OR email fallback);
terminal-status guard; EVT-4 expire-session-before-cancel + race-paid skip;
guarded item/order cancels; free_wave cleanup; EVT-10 user_id resolution for
vendor notifications; deterministic refund key `{orderId}-event-cancel`
(idempotent on double-submit). Company-paid dead-path correctly quarantined.

### Slices 10+11+12 — Notifications, Buyer/Public, Lib — COMPLETE (Pass A)
Read: notifications/service.ts sendNotification body, map 18; map 20 +
listings/route.ts admin-conditional; vendor-limits.ts tier table + normalizeTier.
Location system is Session-59-protected (36-test suite) — honored as vault, not
re-analyzed. Non-money surfaces (browse, marketing, public forms) skimmed via map.

**S12-1 [Info, Confirmed] No realizable tier-gate-to-empty in notifications.**
service.ts:497-503 filters channels to the vendor tier's allowance for
non-critical sends; I checked whether a tier could filter OUT in_app (silent
no-op). vendor-limits.ts:66,80,90 — EVERY tier's notificationChannels includes
'in_app'. So the free bell always survives the gate. Confirmed non-issue.

**S12-2 [Info, Confirmed] Legacy-tier vendors get FREE limits.**
vendor-limits.ts:30-35 normalizeTier maps basic/standard/premium/featured →
'free'. Any vendor still holding a legacy tier string in vendor_profiles.tier
is served free-tier limits (20 listings, etc.) regardless of what they may have
paid historically. Documented transition ("preserved until migrated"); the
unified-pricing + new checkout write 'pro'/'boss', so new subs are fine. Worth
a one-time query of how many live rows still hold a legacy tier before relaunch
— if any active-subscription vendor still reads 'premium', they're under-served.

**Verified-solid:** sendNotification never-throws contract (NOT-4 guarded
templates, guarded dedup, guarded logger); NOT-1 reference-aware dedup; NOT-2
batch prefetch; NOT-5 email suppression (in_app still delivers); critical
bypass of tier gating; listings admin-conditional client (verifyAdminForApi
before service client — the pattern to copy); ?admin=true alone insufficient.

Note (Pass-A limit): the deferred/dead modules are unchanged and already
tracked — lib/tax/ (zero importers, build-or-delete), lib/orders/
status-transitions.ts (VOR-11, 51 tests / 0 prod imports), company-paid event
package (EVT ledger). Not re-analyzed.

**Verified-solid (slice 1 list):** CHK-1 3-way dead-order branch + shared
deterministic refund key (success:106-134 / webhooks:192-208); CHK-7 guarded
cancel-then-restore (inventory.ts:62-124) incl. decrement unwind
(session:824-875); idempotency keys all deterministic (payments.ts);
MBX-1/3/7 payout scoping; A3/CHK-8/9 subscription vertical scoping; B4
box-only tip block; F5/F2 tip caps; CHK-14 listing-only tip cap; CHK-15
override-aware platform fee; fail-closed cart validate on query error (:52-54).

---

## PASS B — Ledger diff + regression verification (read FINDINGS_LEDGER.md all 367 lines)

### Regression check (did the review's fixes actually land in code?)
Blind Pass A independently RE-CONFIRMED, by fresh read, that the ledger's marked-
fixed load-bearing items are present in current code: CHK-1 3-way dead-order branch
(webhooks + success), CHK-7 cancelOrderItemsAndRestoreGuarded + decrement unwind,
VOR-1 paid gates (fulfill + buyer-confirm), VOR-2/15 guarded flips + fatal untracked-
payout, VOR-3 serviceClient, mig-197 claimVendorFeeDeduction (all 3 payout routes),
VOR-17/18 sourceTransaction, MBX-1/3/7 payout base + scoping, CHK-14/15 tip/fee,
CRN-1/8/9 cron gates, MGR-1..10 + PRK-1..17 (route-level), EVT-4/5/6/10/14, ADM-1..8,
NOT-1..5, COMM-1..8. No regressions detected. The seven-day cycle's fixes are real.

### Classification of my 30 Pass-A findings vs the ledger

**GENUINELY NEW (not in ledger) — ranked:**
- **S2-2 [HIGH] resolve-issue double-refund** — ledger hardened fulfill/buyer-confirm/
  reject/buyer-cancel with cancelled_at guards + rowcount (VOR-2, H3), but resolve-
  issue's issue_refund cancel (route:155-167) was NEVER guarded. Reachable:
  buyer-cancel post-grace (75%) then vendor issue_refund (100%) = different amounts =
  different Stripe keys = both refunds fire. issue_status guard (:84) doesn't block it
  (buyer-cancel doesn't touch issue_status). NOT in ledger.
- **S4-1 [MED-security] auth/callback open redirect** — slice-7 AUT swept auth/callback
  and found only AUT-1 (rating IDOR); the `next`-param open redirect (callback:74) was
  missed. NEW.
- **S8-1 [MED] subscription tier-switch cancel-before-checkout** — slice-6 covered
  subscriptions/checkout but didn't flag that cancel() fires before the new session,
  so abandonment downgrades a paid vendor mid-period. NEW.
- **S1-11 + S5-1 [MED] full-refund stamps full amount on every item → reports
  over-count refunds N×** — handleChargeRefunded (webhooks:1160-1165) is upstream of
  ADM-2's platform-revenue.ts:80 refundCents sum. ADM-2 fixed fee SEMANTICS but not this
  refund-data over-count. NEW.
- **S3-1 [MED, pending Stripe-TTL confirm] Phase-5 re-transfer after H-9 7-day flip** —
  ledger says "Phase 5 EXISTS and works" but never flagged H-9 flipping a 'processing'
  row (with stripe_transfer_id set) to 'failed' → re-send on an expired idempotency key.
  NEW.
- **S1-5 [MED] market-box-payout misleading "payout processed" on failed/never-attempted
  transfer** — CHK-17 fixed the LOGGING of the failure, not the notification. NEW.
- **S2-1 / S3-4 [MED] tip-share retention on partial cancel** — VOR-5/16 fixed order-
  level tip refund on LAST-item kill; the per-item tip share of a cancelled item on a
  PARTIAL cancel is still divided-by-all-items and retained by the platform. VOR-20 is
  rounding-only, different. NEW.
- **S1-1 [MED] stale-tip session reuse (CHK-2 residual)** — CHK-2 guarded new-tip>0;
  the old-order-had-tip / new-tip=0 direction still reuses the tipped session
  (session:232 checks only the NEW request's validTipAmount===0). Residual, NEW.
- Lower: S1-2 (order-total vs Stripe-line rounding drift), S1-3 (checkout trusts
  body items, cart validations bypassable), S1-6 (validate GET uses first market),
  S1-7 (validate GET no vertical filter), S1-8 (cancel small-fee rounding), S1-9
  (8-week→4-week price via direct API), S1-10 (HANDLED_EVENT_TYPES stale), S1-12
  (dashboard refund no inventory/payout reversal), S2-4 (fulfill dev payout user
  client), S3-2 (cron paths skip fee claim), S3-3 (no-show never completes), S4-3
  (regional_admin unenforced), S5-3 (settlement ignores fee override), S6-1 (park
  credits never expire — RESOLVES map 13:60 UNVERIFIED), S8-2 (30-day period
  fallback), S12-2 (legacy-tier vendors get free limits).

**ALREADY KNOWN / TRACKED (my blind pass corroborated):**
- S4-2 = CMAP-1 (current_task.md §3 admin-lockdown build; map defect). Re-confirmed.
- S5-2 = fee-override no vertical scoping = part of CMAP-1 step-2's "39 unscoped
  hasAdminRole routes, money first". I verified it concretely (no internal
  compensation). Feeds that build.
- S2-3 = nonexistent vendor/payouts/route.ts in protected lists (doc drift).
- S2-5 / S4-3 relate to slice-10 minor-unfiled #1 (isPlatformAdminCheck dead; role
  vs roles column) — partially known.
- S2-6, S1-8 partial-cancel fee asymmetry ≈ VOR-16 "accepted" note.
- S9-1 = EVT-4's known limitation (fulfilled-item orders skip auto-refund by design);
  my refinement (buyer's OTHER unfulfilled items unrefunded) is the residual edge.
- S4-4 vertical-gate breadth = documented-intentional in map 16.

### What only the USER's staging test can catch (code can't)
- Env/config divergence: mig 184→204 actually applied on each env; Vercel env vars;
  Stripe webhook endpoint + secret; the Dev 039/040 drift (browse RPC).
- Third-party runtime: Stripe idempotency-key TTL (confirms/refutes S3-1); real
  checkout→webhook→fulfill→payout round-trip; email/SMS actually arriving; Stripe
  dashboard full-refund behavior (S1-11/S5-1).
- Real data states: legacy-tier vendors still holding 'premium' (S12-2 — a QUERY);
  park credits with NULL expires_at accumulating (S6-1).
- Mobile/UX: ConfirmDialog vs window.confirm; loading states; touch.
- Day-8 smoke items already listed in current_task.md:40.

### Suggested shrunk staging test (post this analysis)
1. Money round-trips (the only true validation of the payout/refund logic): one
   full FT tip order → fulfill → payout; one buyer cancel post-grace; one vendor
   reject; one MB purchase → payout.
2. The S2-2 scenario specifically: report issue → buyer-cancel → vendor issue_refund;
   watch for a double refund in Stripe.
3. One admin surface per env after mig 204 (V2=0 re-run on prod before lockdown).
4. Day-8 pricing/agreement/trial smoke (current_task.md:40).
5. One mobile pass of checkout + dashboard.

---

## VERIFICATION PASS (2026-07-19, pre-fix-planning) — moving NEW findings from lead → verdict

**S2-2 [CONFIRMED — HIGH]** resolve-issue double-refund. Reachable path proven:
report-issue requires status ∈ {ready, fulfilled} (report-issue:72); buyer-cancel
allows {pending, confirmed, ready} — OVERLAP = 'ready'. Sequence: item 'ready' →
buyer report-issue (issue_status='new', status stays ready) → buyer cancel
POST-grace + vendor-confirmed = 75% refund, key `refund-{PI}-{item}-{75amt}`,
status→refunded → vendor issue_refund: resolve-issue fetch has NO status guard,
issue_status guard (:84) only blocks resolved/closed (still 'new'), cancel UPDATE
(:155-167) unguarded → 100% refund, key `refund-{PI}-{item}-{100amt}`. DIFFERENT
amount → DIFFERENT key → Stripe processes BOTH → buyer nets ≤175%. SAFE sub-cases:
within-grace buyer-cancel (100%=100%, same key, idempotent) and vendor-reject→
resolve (100%=100%, same key). UNSAFE = post-grace buyer-cancel→resolve only.
Buyer-controllable. Fix: add `.is('cancelled_at', null)` + rowcount guard to the
resolve-issue cancel UPDATE (mirror reject:122-146/H3), skip refund on 0 rows.

**S4-1 [CONFIRMED — MED-security]** open redirect. callback:74 `new URL(next, origin)`
with next=explicitNext unchecked; NextResponse.redirect accepts absolute URLs.
Success path exposed; error path only uses next for a path segment. Fix: reject
next unless it starts with a single '/' (not '//').

**S8-1 [CONFIRMED — MED]** tier-switch cancel-before-checkout. subscriptions/
checkout:192/:219 `stripe.subscriptions.cancel()` (IMMEDIATE) before the new
session create (:325). Cancel → customer.subscription.deleted → handleSubscription
Deleted → tier='free' + auto-pause excess listings/boxes. Abandon new checkout =
downgraded, no refund. Fix: don't pre-cancel; create the new sub first (or Stripe
proration/update), cancel old only after confirmation — OR move cancel to the
subscription.created webhook once the new sub is active.

**S1-11 + S5-1 [CONFIRMED — MED, reporting]** handleChargeRefunded full-refund path
(webhooks:1151-1165) stamps charge.amount_refunded on EVERY non-cancelled item; a
full refund on an N-item order → each item.refund_amount_cents = whole-order refund;
platform-revenue.ts:80 sums them → refundCents = N×actual → net understated. NOTE:
our own PARTIAL refunds hit isFullRefund=false and skip the stamping (safe); only a
FULL refund with ≥2 live items triggers it. Bounded but real. Fix: stamp each item
its proportional/own refund share, not the order total.

**S3-1 [PLAUSIBLE — MED, needs Stripe-TTL confirm]** Phase-5 re-transfer. Code path
CONFIRMED: H-9 flips processing→failed at 7d (expire-orders:1580-1598) on rows that
have stripe_transfer_id set; Phase 5 re-sends failed with key transfer-{oid}-{iid}
(payments:113), never checking stripe_transfer_id. Exploitability depends on Stripe
idempotency-key TTL (~24h from KNOWLEDGE, not code — the 7d gap exceeds it → genuine
2nd transfer). Requires a transfer that succeeded but whose transfer.created webhook
was missed for 7d. Fix (defensive regardless of TTL): before re-sending a failed
payout with non-null stripe_transfer_id, retrieve the transfer from Stripe and
reconcile instead of blind re-send. Same for the MB branch. STAGING/Stripe-docs
confirms the TTL premise.

**S1-5 [CONFIRMED — MED, comms]** market-box-payout notification block (:155-186)
runs unconditionally after the transfer-failed (:134-140) and pending_stripe_setup
(:141-153) branches → vendor told "payout processed" when it failed / not attempted.
Fix: gate the 'payout_processed' send on a successful transfer (processing status);
send a different (or no) message on failed/pending.

**S2-1 [CONFIRMED — MED, money leak] ⚠ CONFLICT RISK** tip-share retention. fulfill:
261-267 + buyer-confirm:182-186 divide vendorTip by ALL order_items (incl. cancelled);
partial cancel → the cancelled item's tip/N share is never transferred (only N-1
fulfill) and never refunded (VOR-16 refunds order tip only on LAST-item kill) → stays
in platform balance. Fix option A: count only non-cancelled items at fulfill. Fix
option B: refund the cancelled item's tip share at cancel/reject. ⚠ Option A changes
the tip divisor — may interact with pricing-conservation.test.ts (VOR-20 tip-rounding
tripwire). That's a business-rule-test decision point → present before touching.

**Lower NEW (confirmed, defer or bundle):** S1-1 stale-tip reuse (session:232);
S1-2 rounding drift; S1-3 body-items scoping; S1-6/S1-7 validate-GET market/vertical;
S1-8 cancel small-fee rounding; S1-9 8-week→4-week; S1-10 doc; S1-12 dashboard refund;
S2-4 dev payout client; S3-2 cron fee-claim; S3-3 no-show completion; S4-3 regional_admin;
S5-3 settlement override; S6-1 park credits never expire (RESOLVES map 13:60); S8-2
period fallback; S12-2 legacy-tier limits (a QUERY, not code).

### Protected / money-file impact of the fix set (per-file approval + ?-gate applies)
- webhooks.ts (S1-11) — **Rule-3 PROTECTED** (hook denies first touch; needs exact
  before/after + file-named approval).
- fulfill/route.ts (S2-1 option A) — **Rule-3 PROTECTED**. Also buyer-confirm.
- market-box-payout.ts (S1-5), expire-orders (S3-1), subscriptions/checkout (S8-1),
  resolve-issue (S2-2) — money-touching, not in the hard hook list, treat with care.
- auth/callback (S4-1), platform-revenue.ts (S5-1) — non-money, simple.

---

## RPC-LAYER MAP (2026-07-19) — the SQL money/race functions the app only calls into
Schema gate satisfied by reading migration bodies + SCHEMA_SNAPSHOT (authoritative).
Read LATEST CREATE OR REPLACE of each (superseded versions ignored).

**atomic_decrement_inventory — SOLID (live = mig 078, NOT mig 001).** mig 001 was a
silent `GREATEST(0,…)` clamp; mig 078 rewrote it to `FOR UPDATE` lock + `RAISE P0003`
on insufficient + `RAISE P0002` on not-found/unlimited + auto-draft at 0. The checkout
guard (session:829-835 relying on decrementError) is therefore correct — no oversell.
(Lesson: reading only mig 001 would have mis-reported a P0 oversell; the schema gate's
"latest definition" discipline caught it.)

**atomic_complete_order_if_ready — SOLID (mig 092).** Guarded UPDATE: status!='completed'
AND no active item missing either confirmation AND ≥1 active item. Confirms **S3-3**: a
Phase-4 no-show item is flipped 'fulfilled' WITHOUT buyer_confirmed_at → the NOT EXISTS
finds it → order never reaches 'completed' (stays 'paid' forever). Vendor is paid; only
the order status is stuck. Low/status-only, as filed.

**claim_vendor_fee_deduction — SOLID (mig 197).** FOR UPDATE on vendor_fee_balance
serializes per-vendor; grants LEAST(balance,cap); replay-safe via
uq_vendor_fee_ledger_credit_item + ON CONFLICT DO NOTHING + lost-race re-read. VOR-8/9
genuinely closed at the DB layer.

**S-RPC-1 [NEW, Low, Confirmed — standalone MB only] subscribe_to_market_box_if_capacity
idempotency is a no-op when p_order_id IS NULL, and the payment-intent unique index then
fires the WRONG way.** mig 124:247-251 idempotency check = `WHERE order_id = p_order_id`;
the STANDALONE path passes p_order_id=NULL (webhooks.ts:551) → `order_id = NULL` never
matches → RPC never short-circuits for standalone subs. Backstop = UNIQUE
(stripe_payment_intent_id) WHERE NOT NULL (SCHEMA_SNAPSHOT:1932, mig 004). But the RPC's
INSERT has NO ON CONFLICT for that index → a *concurrent* second webhook delivery
(app-level existence check at webhooks:516 races past) hits 23505 → RPC raises → the
webhook's C-3 branch treats it as "RPC failed" and AUTO-REFUNDS the buyer (fee-inclusive)
— even though the FIRST delivery created the subscription and paid the vendor. Net:
sub exists + vendor paid + buyer refunded → platform eats it. Reachability LOW: standalone
route is UI-orphaned (MBX-1) AND requires truly concurrent (not sequential-retry — the
app check catches those) delivery of one event. UNIFIED (cart) path is SAFE: order_id is
set → RPC idempotency matches → returns already_existed. Fix options: (a) 410-stub the
orphaned standalone route (already floated in MBX-1), or (b) ON CONFLICT
(stripe_payment_intent_id) DO NOTHING + return already_existed in the RPC, or (c) NULL-safe
idempotency (also match on stripe_payment_intent_id). Ties to MBX-1's open recommendation.

**Still unmapped (RPC layer, if we continue):** book_weekly_booth_atomic (mig 186),
book_park_spot_atomic (mig 172), book_season_atomic (mig 165), redeem_booth_credit
(mig 201, the cap + advisory-lock math), confirm_season_paid / cancel_season_group
(mig 167), get_listings_accepting_status / get_available_pickup_dates (mig 199 selling
gate), atomic_restore_inventory (mig 078). These hold the booking-race + credit-spend +
cutoff logic; app-level callers already mapped clean, but their internals are unread.

---

## DISPOSITIONS (user decisions 2026-07-19)
**DEFER → focused MONEY-FIX session (own batch):** S2-1 (partial-cancel tip-share),
S2-2 (resolve-issue double-refund — HIGH; still the headline for that session).
**DEFER → TEST-FIRST list (verify on staging before deciding a fix):** S3-1 (Phase-5
re-transfer / Stripe idempotency-key TTL). Add to the money round-trip staging test:
force a payout to 'processing', simulate the transfer.created webhook never arriving,
let H-9 flip it at 7d (or manually), then observe whether Phase 5's re-send creates a
SECOND Stripe transfer (needs a stripe_transfer_id already on the row).
**BUILD NOW, ride the RELAUNCH / admin-lockdown train (not a standalone hotfix):**
S4-1 (open redirect), S1-5 (MB payout notification), S8-1 (sub tier-switch),
S1-11+S5-1 (refund over-count — PROTECTED webhooks.ts). Sequence: Batch 1 non-protected
(S4-1, S1-5, S8-1) each present→approve→build→gate→stop→ask commit→ask push; Batch 2
protected (S1-11) one file, exact diff, per-file approval, hook denies first touch.
**Lower/defer → backlog:** S-RPC-1 (+ MBX-1 410-stub decision), S1-1/2/3/6/7/8/9/10/12,
S2-3/4/5, S3-2/3, S4-3, S5-3, S6-1 (confirm intent), S8-2, S12-2 (query below).

---

# ★★ FIX-SESSION PLANNING MATRIX (2026-07-19) — the execution index
Every finding sorted for a future fix-focused session. Columns: ID · sev ·
file (⚠=protected/money) · fix shape · effort · dependency/conflict.
Full citations live in the per-slice sections above.

## CATEGORY A — CONFIRMED VIA CODE (fix shape known, no re-verify needed)
Ready to implement as-is. Grouped by which session should own them.

### A1 · BUILD-NOW / relaunch train (non-money-critical-path)
| ID | Sev | File | Fix shape | Effort |
|---|---|---|---|---|
| S4-1 | Med | auth/callback/route.ts | honor `next` only if `/^\/($|[^/\])/` | S |
| S1-5 | Med | market-box-payout.ts | gate 'payout_processed' send on transfer success (not failed/pending) | S |
| S8-1 | Med | subscriptions/checkout/route.ts | create/confirm new sub before cancelling old (or cancel in subscription.created webhook) | S-M |
| S1-11+S5-1 | Med | ⚠ webhooks.ts + platform-revenue.ts | stamp each item its own refund share, not the whole-order total | S |

### A2 · MONEY-FIX session (each edits a ⚠ protected money file — do together, file-by-file)
| ID | Sev | File | Fix shape | Effort | Note |
|---|---|---|---|---|---|
| S2-2 | HIGH | ⚠ resolve-issue | `.is('cancelled_at',null)` + rowcount guard on the issue_refund cancel; skip refund on 0 rows | S | ✅ DONE 2026-07-20 (allowlist entry removed, gate-green) |
| ~~S2-1~~ | — | — | ~~tip-share retention~~ | — | ❌ WONTFIX — INTENTIONAL (owner 2026-07-20): retained tip share = platform buffer vs refund charges. See decisions.md. D-1 moot. S3-4 same. |
| S1-1 | Med | ⚠ checkout/session | select pending order tip; block session reuse when old tip>0 | S | ✅ DONE 2026-07-20 |
| S1-4 | Med | ⚠ checkout/session | reject tipAmount>0 with pct=0 | S | ✅ DONE 2026-07-20 (chose Reject) |
| S1-6 | Med | ⚠ cart/validate | validate against cart_items.market_id, not listing_markets[0] | S | ✅ DONE 2026-07-20 |
| S1-7 | Med | ⚠ cart/validate | scope the GET to one vertical's cart (client passes ?vertical) | S | ✅ DONE 2026-07-20 |
| S5-3 | Low | admin/events/[id]/settlement | apply getEffectiveVendorFeePercent in the settlement recompute | S | ✅ DONE 2026-07-20 (owner: future-proof for grant/partner vendors; no override vendors today) |
| ~~S1-8~~ | Low | cancellation-fees.ts | small-order-fee rounding ≤1¢ | — | ⏸️ BACKLOG (owner 2026-07-20: sub-cent, not worth the spend) |
| ~~S2-4~~ | Low | ⚠ fulfill | dev-mode payout insert client | — | ⏸️ BACKLOG (dev-only, zero prod impact) |
| ~~S3-2~~ | Low | expire-orders | cron paths skip claimVendorFeeDeduction | — | ⏸️ BACKLOG (fee deferred-not-lost; self-heals on next manual payout) |

### A3 · Trivial / doc (fold into any batch)
| ID | Sev | File | Fix shape | Note |
|---|---|---|---|---|
| S1-10 | Low | webhook-utils.ts + its test | add 'charge.dispute.created' to HANDLED_EVENT_TYPES; bump test count 11→12 | transparent test-count bump |
| S2-3 | Low | protected-paths.txt + change-discipline.md + map 11 | remove the dead vendor/payouts/route.ts references | governance files — confirm first |

### A4 · Deferred by PRIOR DECISION (already routed elsewhere)
- Test-first list (verify on staging, then decide): **S3-1** (see Category C).
- Admin/CMAP-1 train: **S4-2** (CMAP-1), **S5-2** (fee-override vertical scope = step-2), **S4-3** (regional_admin → regional-manager design).

## CATEGORY B — NEEDS RE-VERIFICATION (code-checkable, do at fix time)
Only one remains — the rest were verified during this pass.
| ID | What to re-verify | How |
|---|---|---|
| S2-5 | Do resolve-issue (`roles` array contains 'admin') and webhooks (`role` scalar / platform_admin) actually resolve to DIFFERENT admin sets post-mig-204? | Query the live admin rows (not code) — data-dependent, run in the admin session |
| S1-11 (fix-time) | Confirm which callers reach handleChargeRefunded's isFullRefund branch with ≥2 live items (our own partial refunds don't) | grep createRefund callers + trace amounts |

## CATEGORY C — NEEDS STAGING / RUNTIME CONFIRMATION (can't confirm from code)
| ID | Premise to confirm | Test |
|---|---|---|
| S3-1 | Stripe idempotency-key TTL (~24h) → a 7-day-later re-send is a NEW transfer | Force a payout to 'processing', drop the transfer.created webhook, let H-9 flip it at 7d (or manually), watch for a 2nd Stripe transfer (row must already carry stripe_transfer_id) |
| S8-2 | Does the now+30d period fallback ever fire for annual subs (would expire them ~11mo early)? | Create an annual sub on staging; confirm tier_expires_at ≈ +1y, not +30d |
| (all money) | The end-to-end money paths behave as the code implies | checkout→webhook→fulfill→payout; buyer-cancel; reject; MB purchase |

## CATEGORY D — NEEDS USER DECISION (policy / design / architecture — not code yet)
| ID | Decision |
|---|---|
| D-1 (S2-1) | Fix A (fulfill divisor, trips a business-rule test) vs Fix B (refund at cancel). → chosen: money session |
| S1-2 | Accept the order.total_cents vs Stripe-charge rounding drift (bookkeeping only), or align total_cents to the per-item sum? |
| S1-3 / S1-9 | Bind checkout to the server cart (vs trusting request-body items)? Architecture change — scope before building |
| S1-12 | Is "Stripe-dashboard full refund does NOT restore inventory / reverse payouts" intended (admin manual op), or should it? |
| S3-3 | Should a no-show order ever reach 'completed' (it can't today — no buyer_confirmed_at), or is 'paid'-forever acceptable? |
| S6-1 | Are park cancel-credits meant to NEVER expire (NULL expires_at → permanent live grant), or need an anchor like FM credits? |
| S-RPC-1 / MBX-1 | 410-stub the UI-orphaned standalone MB route (kills S-RPC-1 + MBX-1's residual), or harden the RPC idempotency (ON CONFLICT / NULL-safe)? |
| S9-1 | Event-cancel: refund a buyer's UNFULFILLED items when the order also has a fulfilled item (today the whole order skips auto-refund)? |

## CATEGORY E — ALREADY TRACKED IN FINDINGS_LEDGER (no new action)
S4-2 = CMAP-1 · S5-2 = CMAP-1 step-2 · S9-1 = EVT-4's documented fulfilled-item limitation ·
S2-6 ≈ VOR-16 accepted note · S4-4 = documented-intentional vertical-gate breadth.

## CATEGORY F — VERIFIED-SOLID (no fix — reassurance for the fix session)
- RPC money layer: atomic_decrement_inventory (mig 078), atomic_complete_order_if_ready
  (092), claim_vendor_fee_deduction (197), redeem_booth_credit (201).
- The July review's marked-fixed items (CHK-1/7, VOR-1/2/3/15, MBX-3/7, CRN-1/8/9,
  MGR/PRK route-level, EVT-4/5/6, ADM/NOT/COMM) are all present in current code.
- Per-slice "verified-solid" lists in the slice sections above.

## CATEGORY G — DROPPED
S12-2 (legacy-tier limits) — user: legacy users cleared before relaunch → moot.
S12-1 (notif tier-gate to empty) — not realizable (every tier includes in_app).

## CATEGORY H — UNMAPPED (optional future deepening; low expected yield)
booking-atomic RPCs (mig 186/172/165), season RPCs (167), selling gate
(get_available_pickup_dates mig 199 — pinned by guardrail-contracts.test.ts Rule F).
Their app-level callers already mapped clean.

## RECOMMENDED FIX-SESSION ORDER (when authorized)
1. **Build-now batch (A1)** — 4 items, ride the relaunch/admin train. Non-money-path
   first (S4-1, S1-5, S8-1), then the one protected file (S1-11).
2. **Money-fix session (A2)** — open with S2-2 (HIGH), then the checkout/validate/
   tip cluster, file-by-file with exact diffs. Resolve D-1 (S2-1 A-vs-B) up front.
3. **Admin/CMAP-1 train** — S4-2/S5-2/S4-3/S2-5 alongside the admin-lockdown build.
4. **After staging (C)** — decide S3-1, S8-2 from observed behavior.
5. **Decisions (D)** — batch the design calls; some may become no-ops.
