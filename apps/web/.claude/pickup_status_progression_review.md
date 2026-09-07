# E2E Review: Pickup & Order-Status Progression (owner-ordered, 2026-09-06)

Purpose: map the core machine BEFORE touching the buyer-dashboard handoff path for bundles.
Everything below read this session from live code.

## The per-item status machine
`pending → confirmed → ready → fulfilled` (+ `cancelled`/`refunded`); enum has no 'completed'.

| Transition | Actor / where | Money |
|---|---|---|
| pending → confirmed | vendor, `vendor/orders/[id]/confirm` | none |
| confirmed → ready | vendor, `vendor/orders/[id]/ready` | none |
| ready + buyer ack | buyer, `buyer/orders/[id]/confirm` normal branch (:333-380): sets `buyer_confirmed_at` + `confirmation_window_expires_at` (30s, `calculateWindowExpiry`), notifies vendor `pickup_confirmation_needed` | NONE |
| ready → fulfilled (ack fresh) | vendor, `fulfill` normal branch (:119-485): stale window resets ack + 409 (:125-138); guarded flip; **PAYS vendor** (fee claim → payout row → transfer :393) | vendor payout |
| ready/pending/confirmed → fulfilled (no ack) | vendor, `fulfill` edge branch (:486-523): flip only, "vendor gets paid at buyer-confirm" | none |
| fulfilled + buyer ack | buyer, `confirm` edge branch (:94-332): VOR-1 paid gate, sets both confirms, **PAYS vendor**, `atomic_complete_order_if_ready` | vendor payout |

Money ALWAYS moves on the SECOND act. `confirm-handoff` route = dormant strict-buyer-first
alternative, not in use (header comment).

## Cron backstops (expire-orders header :42-57)
- P1 expire unconfirmed items · P4 no-show: 'ready' past pickup → fulfilled + **pays** (:822-894)
- P4.5 stale confirmed (never readied) · P7 stale windows: buyer-acked, vendor never fulfilled →
  auto-fulfill + pays (:1917/1974). **No phase touches fulfilled+unacked** (edge waits on buyer).

## Buyer surfaces
- **Shopper dashboard** `[vertical]/dashboard/page.tsx`:
  - readyOrders (:102-137): items `status='ready'`, `buyer_confirmed_at IS NULL`, no
    cancel/issue → prominent ready-for-pickup section → links `/{v}/buyer/orders/{id}` (:399).
  - ordersNeedingConfirmation (:139-156): items `fulfilled` + unacked → "Action needed" badge.
- **Order page** `buyer/orders/[id]/page.tsx`: `computeEffectiveStatus` (:471-501): per item —
  cancelled→cancelled · `buyer_confirmed_at`→'fulfilled' · status fulfilled (unacked)→'handed_off'
  · else raw. Order-level: all fulfilled→fulfilled; any handed_off→handed_off; any ready→ready…
  `isPickupReady = ['ready','handed_off'].includes(effectiveStatus)` (:529) → the GREEN
  pickup-presentation hero (big order #). Per-item confirm buttons drive `buyer/orders/[id]/confirm`.
- Orders list: no confirm actions; handed_off sorted first.

## Where BUNDLE orders deviate (all Confirmed)
1. **Pre-collection**: vendors mark items 'ready' → buyer dashboard section + green hero tell the
   BUYER "ready for pickup" — but for bundles the MANAGER collects. Wrong actor messaging.
2. **Post-collection**: manager collect-ack stamped `buyer_confirmed_at` → items effective
   'fulfilled' → order excluded from BOTH dashboard queries (:135, :153) AND from
   isPickupReady → no green hero, no dashboard entry point at the buyer's actual pickup moment.
   The bundle-ack card renders only on the plain order page.
3. Early-fulfill edge (vendor fulfills before manager tap): fulfilled+unacked → buyer dashboard
   "needs confirmation" badge appears (pre-existing) → buyer per-item confirm pays vendor. Works,
   but shows mid-cycle; bundle-ack sweep also covers it at pickup.

## Proposed changes (NOT built — all additive, keyed on `orders.bundle_id`, zero edits to
## the transitions or money branches above)
A. Dashboard: third query — bundle orders, every non-cancelled item fulfilled, margin unsettled →
   render in the same prominent section ("Your bundle is ready — pick up from the market manager")
   linking to the order page. Bundle-gate the readyOrders section copy (or exclude bundle orders
   from it) so pre-collection 'ready' never summons the buyer.
B. Order page: bundle orders get a 'bundle_pickup' effective state (all items collected, margin
   unsettled) that turns on the SAME green hero, with the bundle-ack card as the action; suppress
   per-vendor "awaiting confirmation from X" copy on bundle orders.
C. Flow-integrity pins: non-bundle queries/branches byte-identical; bundle branches only ever
   ADD a query/condition.

## Buyer-cancel policy (read for the cancel-bundle design; explain-first, owner to confirm)
`cancel/route.ts` + `cancellation-fees.ts`: eligibility pending/confirmed/ready only (:106-108).
Buyer-paid-per-item = subtotal + 6.5% + prorated flat fee + prorated small-order fee (:69-73).
Layer 1 grace (order-creation clock; FM 60min / FT 15min) → 100%. Layer 3 (past grace, vendor
NOT confirmed) → 100%. Layer 2 (past grace + vendor confirmed/ready) → 75% back; 25% fee split
platform/vendor (vendor share transferred :296-334). Tip refunds only on LAST live item
(:281-291). Inventory restored; vendor notified; last item → order cancelled + wave freed +
pending-session expired. NO bundle margin handling anywhere; slot release only on full-order
claim path (inventory.ts:96-117).

## Notification lifecycle audit (owner-ordered double-check, 2026-09-06 round 2)
Every send in the pickup/handoff lifecycle, read from code this session. Regular-order column
NEVER changes; bundle column = gated additions/suppressions only (gate = order.bundle_id).

| Moment | Regular order (verified) | Bundle today | Bundle proposed |
|---|---|---|---|
| Order placed | vendors notified per vendor+market (checkout/success); buyer sees success page | same + bundle_sold→mgr (hourly sweep) | NO CHANGE |
| Vendor confirms | buyer "confirmed" notice (owner OK'd for bundles) | same | NO CHANGE (owner: skip mgr notice on confirm) |
| Vendor marks ready | buyer order_ready (ready/route.ts:94) | same → the STORM leak #1 | suppress buyer send; ADD bundle_component_ready→mgr (new type, tripwire 130→131; ready route order embed :37 needs bundle_id — unprotected file) |
| Manager Receiving-now | n/a | vendor gets pickup_confirmation_needed (collect-ack) — vendor side identical to a buyer tap | NO CHANGE (separate UX gap: vendor screen doesn't name WHICH item's window opened — investigate) |
| Vendor fulfills (window) | buyer order_fulfilled ×3 sites: company-paid :213 · normal :252 · payout-failed :435 | same → STORM leak #2 ("order complete") | suppress all 3 for bundles — PROTECTED fulfill route: add bundle_id to embed select :53 + `if (!orderData?.bundle_id)` around each send. Nothing else changes; payouts/statuses untouched |
| Vendor fulfills early (edge :486-523) | NO buyer notification (verified) | same | NO CHANGE |
| Mgr "Ready — notify buyer" | n/a | bundle_ready→buyer (immediate) — THE one ready signal | ADD persistent "✓ Buyer notified" state (bundles GET reads notifications dedup; button label flips) |
| Buyer bundle-ack (+sweep) | n/a | no sends (confirm edge branch sends nothing — verified) | NO CHANGE |
| Mark handed off | n/a | response only; margin pays | NO CHANGE |
| Vendor rejects item | buyer order_cancelled_by_vendor | + bundle_component_removed→mgr (shipped) | NO CHANGE |
| Buyer cancels bundle | n/a | vendors order_cancelled_by_buyer + bundle_cancelled→mgr (shipped) | NO CHANGE |
| Cron P4 no-show (ready past pickup) | flips+pays vendor, buyer "missed pickup" | same — if the MANAGER no-shows a bundle, buyer copy would read wrong | FLAGGED only, no change (working cron; edge case) |

Disconnect hypothesis REVISED (owner challenge): original story had causality backwards
(presented ~settled, deserved ~55%). Fitting ALL observations (~75%, hypothesis): mgr acked
item A; vendor fulfilled item B (unacked → edge, unpaid); A showed "⏱ acknowledged" (no
button), B "✓ collected" → both buttons gone; vendor's second Fulfill = A (paid). Buyer's
later ack-sweep paid B. Ground truth = timestamps (SQL offered post-fix). UX gap either way:
vendor can't see WHICH item the 30s window is open for.
