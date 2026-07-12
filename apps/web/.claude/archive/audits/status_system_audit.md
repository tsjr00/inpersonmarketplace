# Order & Payment Status System — Comprehensive Audit

**Created:** 2026-03-10 (Session 55, triggered by F2 test integrity finding)
**Purpose:** Document the actual status transitions as implemented in code, organized by user action and workflow step. This is the reference for rewriting `status-transitions.ts` and its tests.

---

## DB Enums (all 3 environments confirmed identical)

| Enum | Values |
|------|--------|
| `order_status` | `pending, paid, confirmed, ready, completed, cancelled, refunded` |
| `order_item_status` | `pending, confirmed, ready, fulfilled, cancelled, refunded` |
| `payment_status` | `pending, processing, succeeded, failed, cancelled, refunded, partially_refunded` |

**Critical distinction:** `orders.status` and `order_items.status` use DIFFERENT enums with DIFFERENT values. Orders use `paid`/`completed`. Items use `confirmed`/`fulfilled`. Do not confuse them.

---

## WORKFLOW 1: Stripe Purchase + Order Lifecycle

### Step 1: Buyer initiates checkout
- **Action:** Buyer clicks "Place Order" with Stripe payment
- **Trigger:** `POST /api/checkout/session`
- **File:** `src/app/api/checkout/session/route.ts:683`
- **Status changes:**
  - `orders.status` → `'pending'` (new row)
  - `order_items.status` → `'pending'` (new rows, one per listing)
  - `payments` → no record yet
- **Inventory:** `atomic_decrement_inventory()` called per listing

### Step 2: Buyer completes Stripe payment
- **Action:** Stripe redirects buyer to success page after payment
- **Trigger:** `GET /api/checkout/success` (success page load)
- **File:** `src/app/api/checkout/success/route.ts:72`
- **Status changes:**
  - `orders.status` → `'paid'`
  - `order_items.status` → unchanged (still `'pending'`)
  - `payments` → new row with `status = 'succeeded'`
- **Idempotent with:** Stripe webhook `checkout.session.completed` does the same (`src/lib/stripe/webhooks.ts:117`)

### Step 3: Vendor confirms individual item
- **Action:** Vendor clicks "Confirm" on an item in their dashboard
- **Trigger:** `POST /api/vendor/orders/[id]/confirm`
- **File:** `src/app/api/vendor/orders/[id]/confirm/route.ts:83`
- **Guard:** `order_items.status` must be `'pending'`
- **Status changes:**
  - `orders.status` → unchanged (stays `'paid'`)
  - `order_items.status` → `'confirmed'`
  - `payments.status` → unchanged

### Step 4: Vendor marks item ready
- **Action:** Vendor clicks "Mark Ready" on confirmed item
- **Trigger:** `POST /api/vendor/orders/[id]/ready`
- **File:** `src/app/api/vendor/orders/[id]/ready/route.ts:82`
- **Guard:** `order_items.status` must be in `['pending', 'confirmed']` (can skip confirmed)
- **Status changes:**
  - `orders.status` → unchanged
  - `order_items.status` → `'ready'`
  - `payments.status` → unchanged

### Step 5a: Mutual pickup confirmation (happy path)
- **Action:** Buyer clicks "I received this" → starts 30-second window → vendor clicks "Fulfill"
- **Trigger (buyer):** `POST /api/buyer/orders/[id]/confirm`
- **File:** `src/app/api/buyer/orders/[id]/confirm/route.ts`
- **Buyer step changes:**
  - `order_items.buyer_confirmed_at` → `NOW()`
  - `order_items.confirmation_window_expires_at` → `NOW() + 30s`
  - No status change yet
- **Trigger (vendor):** `POST /api/vendor/orders/[id]/confirm-handoff`
- **File:** `src/app/api/vendor/orders/[id]/confirm-handoff/route.ts:117`
- **Vendor step changes:**
  - `order_items.status` → `'fulfilled'`
  - `order_items.vendor_confirmed_at` → `NOW()`
  - Vendor payout created (`vendor_payouts.status = 'pending'`)
  - Stripe transfer initiated

### Step 5b: Vendor fulfills directly (without buyer acknowledgment)
- **Action:** Vendor clicks "Fulfill" without buyer clicking first
- **Trigger:** `POST /api/vendor/orders/[id]/fulfill`
- **File:** `src/app/api/vendor/orders/[id]/fulfill/route.ts:138`
- **Guard:** item status must be `'confirmed'` or `'ready'`
- **Status changes:**
  - `order_items.status` → `'fulfilled'`
  - Vendor payout created + Stripe transfer initiated
- **Revert on failure:** If Stripe transfer fails → `order_items.status` reverts to `'ready'` (line 287-288)

### Step 6: Order completion
- **Action:** Automatic — triggered when all items reach terminal states
- **Trigger:** `atomic_complete_order_if_ready()` RPC
- **File:** `supabase/migrations/applied/20260210_011_atomic_complete_order.sql`
- **Condition:** All non-cancelled items have BOTH `buyer_confirmed_at` AND `vendor_confirmed_at` set
- **Status changes:**
  - `orders.status` → `'completed'`

### Display labels for buyers
| DB status (`order_items`) | Buyer sees |
|---------------------------|-----------|
| `pending` | "Pending" |
| `confirmed` | "Preparing" |
| `ready` | "Ready for Pickup" |
| `fulfilled` (vendor done, buyer hasn't confirmed) | "Vendor Handed Off" |
| `fulfilled` (both confirmed) | "Picked Up" |
| `cancelled` | "Cancelled" |

| DB status (`orders`) | Buyer sees |
|----------------------|-----------|
| `pending` | "Pending" |
| `paid` | "Pending" (mapped to pending for display) |
| `completed` | "Completed" |
| `cancelled` | "Cancelled" |

---

## WORKFLOW 2: External Payment Purchase + Order Lifecycle

### Step 1: Buyer initiates external checkout
- **Action:** Buyer chooses Venmo/CashApp/PayPal/Cash and places order
- **Trigger:** `POST /api/checkout/external`
- **File:** `src/app/api/checkout/external/route.ts:288`
- **Status changes:**
  - `orders.status` → `'pending'`
  - `orders.payment_method` → `'venmo'`/`'cashapp'`/`'paypal'`/`'cash'`
  - `order_items.status` → `'pending'`
  - NO `payments` table record created
- **Inventory:** decremented same as Stripe

### Step 2: Vendor confirms external payment received
- **Action:** Vendor clicks "Confirm Payment" after receiving Venmo/cash/etc.
- **Trigger:** `POST /api/vendor/orders/[id]/confirm-external-payment`
- **File:** `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts:130,145`
- **Status changes:**
  - `orders.status` → `'paid'`
  - `orders.external_payment_confirmed_at` → `NOW()`
  - ALL `order_items.status` → `'confirmed'` (bulk update, not one-by-one)
  - NO `payments` record

### Step 2 (alt): Cron auto-confirms digital external payments
- **Action:** Automatic — 24h after pickup date for digital externals (venmo/cashapp/paypal, NOT cash)
- **Trigger:** Cron Phase 3.6
- **File:** `src/app/api/cron/expire-orders/route.ts:546-557`
- **Status changes:** Same as vendor confirm above

### Steps 3-6: Same as Stripe workflow
After payment is confirmed, the item-level progression (confirmed → ready → fulfilled) and order completion work identically.

### Key differences from Stripe flow
1. **No payment record** — payment tracked via `orders.external_payment_confirmed_at` only
2. **Bulk item confirm** — external payment confirm sets ALL items to `'confirmed'` at once (Stripe flow: vendor confirms items individually)
3. **No Stripe refund** — cancellation adjusts vendor fee ledger, no Stripe API call
4. **Expiration timing** — external orders expire when pickup_date passes (Phase 3), not after 10 minutes

---

## WORKFLOW 3: Cancellation Flows

### 3a: Buyer cancels (pre-fulfillment)
- **Action:** Buyer clicks "Cancel" on an item
- **Trigger:** `POST /api/buyer/orders/[id]/cancel`
- **File:** `src/app/api/buyer/orders/[id]/cancel/route.ts`
- **Guard:** `order_items.status` must be in `['pending', 'confirmed', 'ready']`
- **Status changes:**
  - `order_items.status` → `'cancelled'`
  - Inventory restored
  - If Stripe + refund succeeds: `order_items.status` → `'refunded'` (line 217)
  - If ALL items cancelled: `orders.status` → `'cancelled'`
- **Fee logic:** 100% refund if within early cancel window OR pre-confirm. 75% refund + 25% fee if past window AND confirmed.

### 3b: Vendor rejects item
- **Action:** Vendor clicks "Reject" on a pending item
- **Trigger:** `POST /api/vendor/orders/[id]/reject`
- **File:** `src/app/api/vendor/orders/[id]/reject/route.ts:118,154,178`
- **Guard:** `order_items.status` must NOT be `'fulfilled'`
- **Status changes:**
  - `order_items.status` → `'cancelled'`
  - Inventory restored
  - Always 100% refund (vendor initiated)
  - If Stripe + refund succeeds: `order_items.status` → `'refunded'`
  - If ALL items rejected: `orders.status` → `'cancelled'`

### 3c: Buyer reports issue → vendor issues refund
- **Action:** Buyer reports problem → vendor resolves with refund
- **Trigger:** `POST /api/vendor/orders/[id]/resolve-issue`
- **File:** `src/app/api/vendor/orders/[id]/resolve-issue/route.ts:134,166`
- **Status changes:**
  - `order_items.status` → `'cancelled'`
  - If Stripe refund succeeds: `order_items.status` → `'refunded'`

### 3d: Stripe Dashboard refund (full)
- **Action:** Admin issues refund directly in Stripe Dashboard
- **Trigger:** `charge.refunded` webhook
- **File:** `src/lib/stripe/webhooks.ts:887-901`
- **Status changes:**
  - `orders.status` → `'refunded'`
  - ALL `order_items.status` → `'refunded'`
  - `payments.status` → `'refunded'` (full) or `'partially_refunded'` (partial)

---

## WORKFLOW 4: Cron Automated Transitions

### Phase 1: Expire unaccepted items
- **Condition:** `order_items.expires_at <= NOW()` AND `order_items.status = 'pending'`
- **File:** `expire-orders/route.ts:168,198`
- **Changes:** `order_items.status` → `'cancelled'`, inventory restored. If all items cancelled: `orders.status` → `'cancelled'`

### Phase 2: Cancel abandoned Stripe checkouts
- **Condition:** `orders.status = 'pending'` AND has `stripe_checkout_session_id` AND `created_at < NOW() - 10min`
- **File:** `expire-orders/route.ts:282-294`
- **Changes:** `orders.status` → `'cancelled'`, `order_items.status` → `'cancelled'`, inventory restored

### Phase 3: Cancel expired external payment orders
- **Condition:** `orders.status = 'pending'` AND `payment_method = 'external'` AND past pickup date
- **File:** `expire-orders/route.ts:363-375`
- **Changes:** Same as Phase 2

### Phase 3.5: External payment reminder (NO status change)
- **Condition:** External pending order past reminder threshold (FT: 15min, FM: 12hr)
- **File:** `expire-orders/route.ts`
- **Changes:** Notification only. NO status changes.

### Phase 3.6: Auto-confirm digital external payments
- **Condition:** Digital external (venmo/cashapp/paypal, NOT cash) AND 24h past pickup
- **File:** `expire-orders/route.ts:546-557`
- **Changes:** `orders.status` → `'paid'`, `order_items.status` → `'confirmed'`

### Phase 4: No-show buyer → auto-fulfill
- **Condition:** `order_items.status = 'ready'` AND past pickup (FM: next day, FT: 1hr after pickup time — FT time-based NOT YET IMPLEMENTED)
- **File:** `expire-orders/route.ts:645`
- **Changes:** `order_items.status` → `'fulfilled'`, vendor payout created

### Phase 5: Retry failed payouts
- **Condition:** `vendor_payouts.status = 'failed'` within 7-day window
- **File:** `expire-orders/route.ts`
- **Changes:** Retries Stripe transfer. Success → `vendor_payouts.status = 'completed'`. After 7 days → `'cancelled'` + admin alert.

### Phase 7: Auto-fulfill stale confirmation windows
- **Condition:** `buyer_confirmed_at IS NOT NULL` AND `vendor_confirmed_at IS NULL` AND window expired >5min
- **File:** `expire-orders/route.ts:1403`
- **Changes:** `order_items.status` → `'fulfilled'`, vendor payout created

---

## COMPLETE TRANSITION MAPS

### orders.status transitions (from code)

```
                    ┌──────────────┐
                    │   pending    │ (order created, no payment yet)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            │
         ┌────────┐   ┌────────┐       │
         │  paid  │   │cancelled│       │
         └───┬────┘   └────────┘       │
             │                         │
             ▼                         │
        ┌──────────┐                   │
        │completed │                   │
        └──────────┘                   │
                                       │
         ┌──────────┐                  │
         │ refunded │◄─────────────────┘
         └──────────┘   (from any state, via charge.refunded webhook)
```

**Valid transitions:**
| From | To | Trigger |
|------|-----|---------|
| `pending` | `paid` | Stripe success/webhook OR vendor confirms external payment OR Phase 3.6 auto-confirm |
| `pending` | `cancelled` | Phase 2 (Stripe timeout), Phase 3 (external expiry), all items cancelled |
| `paid` | `completed` | `atomic_complete_order_if_ready()` — all items done |
| `paid` | `cancelled` | All items cancelled by buyer/vendor |
| any | `cancelled` | All items reach cancelled state |
| any | `refunded` | `charge.refunded` webhook (Stripe Dashboard full refund) |

**Unused order statuses:** `confirmed` and `ready` exist in the DB enum but are NEVER set by any code path at the order level. They may have been added for future use or are vestigial.

### order_items.status transitions (from code)

```
         ┌──────────┐
         │ pending  │
         └────┬─────┘
              │
    ┌─────────┼──────────┐
    │         │          │
    ▼         ▼          ▼
┌─────────┐ ┌─────┐ ┌─────────┐
│confirmed│ │ready│ │cancelled│
└────┬────┘ └──┬──┘ └────┬────┘
     │         │         │
     ├────┐    │         ▼
     │    │    │    ┌────────┐
     │    ▼    │    │refunded│
     │  ┌─────┐◄───┘    └────────┘
     │  │ready│
     │  └──┬──┘
     │     │
     ▼     ▼
  ┌──────────┐
  │fulfilled │◄──── (can revert to 'ready' on failed Stripe transfer)
  └──────────┘
```

**Valid transitions:**
| From | To | Trigger |
|------|-----|---------|
| `pending` | `confirmed` | Vendor confirms item, OR vendor confirms external payment (bulk), OR Phase 3.6 auto-confirm |
| `pending` | `ready` | Vendor marks ready (skipping confirmed) |
| `pending` | `cancelled` | Phase 1 expiry, Phase 2/3 order cancellation, buyer cancel, vendor reject |
| `confirmed` | `ready` | Vendor marks ready |
| `confirmed` | `fulfilled` | Vendor fulfills directly, Phase 7 auto-fulfill |
| `confirmed` | `cancelled` | Buyer cancel, vendor reject |
| `ready` | `fulfilled` | Vendor fulfills, mutual pickup confirm, Phase 4 no-show, Phase 7 auto-fulfill |
| `ready` | `cancelled` | Buyer cancel, vendor reject |
| ~~`fulfilled`~~ | ~~`ready`~~ | ~~REVERT on failed Stripe transfer~~ — **DECIDED 2026-03-10: This is wrong. Fulfillment is physical, payout is financial. Item stays fulfilled; payout retried separately. Fix on backlog.** |
| `cancelled` | `refunded` | After successful Stripe refund |
| any non-cancelled | `refunded` | `charge.refunded` webhook (full refund from Stripe Dashboard) |

### payments.status transitions (from code)

| From | To | Trigger |
|------|-----|---------|
| (new) | `succeeded` | Checkout success page or `checkout.session.completed` webhook |
| any | `succeeded` | `payment_intent.succeeded` webhook |
| any | `failed` | `payment_intent.payment_failed` webhook |
| `succeeded` | `refunded` | `charge.refunded` webhook (full) |
| `succeeded` | `partially_refunded` | `charge.refunded` webhook (partial) |

**Note:** External payment orders have NO `payments` table record. Payment is tracked only via `orders.external_payment_confirmed_at`.

---

## WHAT `status-transitions.ts` MUST BE CORRECTED TO

### Current (WRONG):
```typescript
ORDER_STATUSES = ['pending', 'confirmed', 'fulfilled', 'cancelled', 'refunded']
// Transition map treats orders like items — completely wrong
```

### Problems identified:
1. Uses `confirmed` and `fulfilled` — these are item-level statuses, never set on orders
2. Missing `paid` — the most common order state
3. Missing `completed` — the happy-path terminal state
4. Missing `ready` — exists in enum but unused at order level (document as unused)
5. Transition map is a copy of item logic applied to order level
6. Item transitions missing: `pending→ready` (skip), `fulfilled→ready` (revert)

### What the correct module should contain:
- Separate, clearly labeled state machines for orders vs items
- Order transitions matching the actual code paths documented above
- Item transitions including the skip and revert cases
- Comments noting which enum values are unused at each level
- NO confusion between order-level and item-level statuses

---

## SOURCE FILES REFERENCED

| File | What it does |
|------|-------------|
| `src/app/api/checkout/session/route.ts` | Creates order + items (Stripe) |
| `src/app/api/checkout/external/route.ts` | Creates order + items (external) |
| `src/app/api/checkout/success/route.ts` | Handles Stripe success → `paid` |
| `src/lib/stripe/webhooks.ts` | Stripe webhooks (payment, refund) |
| `src/app/api/vendor/orders/[id]/confirm/route.ts` | Vendor confirms item |
| `src/app/api/vendor/orders/[id]/ready/route.ts` | Vendor marks ready |
| `src/app/api/vendor/orders/[id]/fulfill/route.ts` | Vendor fulfills |
| `src/app/api/vendor/orders/[id]/confirm-handoff/route.ts` | Vendor confirms handoff |
| `src/app/api/vendor/orders/[id]/reject/route.ts` | Vendor rejects |
| `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts` | Vendor confirms external payment |
| `src/app/api/vendor/orders/[id]/resolve-issue/route.ts` | Vendor resolves buyer issue |
| `src/app/api/buyer/orders/[id]/cancel/route.ts` | Buyer cancels |
| `src/app/api/buyer/orders/[id]/confirm/route.ts` | Buyer confirms pickup |
| `src/app/api/cron/expire-orders/route.ts` | All cron phases |
| `supabase/migrations/applied/20260210_011_atomic_complete_order.sql` | Order completion RPC |
| `src/components/vendor/OrderStatusBadge.tsx` | Vendor display labels |
| `src/app/[vertical]/buyer/orders/[id]/page.tsx` | Buyer display labels + computeEffectiveStatus |
| `src/components/buyer/OrderTimeline.tsx` | Buyer timeline display |

---

## USER DECISIONS (2026-03-10)

### Q1: `confirmed` and `ready` in order_status enum
**Decision:** Document as "present in enum, unused at order level." Not urgent to remove.
**Context:** User was unfamiliar with the term "order enum" — these are DB-level allowed values, not user-facing. No code ever sets `orders.status` to `confirmed` or `ready`.

### Q2: Refunded vs Cancelled
**Decision:** Refunded and cancelled are distinct concepts.
- `refunded` = Stripe refund processed (only possible for Stripe payments)
- `cancelled` = order/items stopped (can happen with any payment method)
- External payments can be cancelled but never refunded (from our system's perspective)
- Current code is CORRECT: `orders.status = 'cancelled'` on cancel, `orders.status = 'refunded'` only from `charge.refunded` webhook

**OPEN QUESTION — Item-level cancellation:**
User said: "I don't think we want to get into item cancellations — too easy to miss something and cause a problem."
**However:** The code currently DOES allow individual item cancellation. A buyer can cancel 1 of 3 items; the order stays active with 2 remaining items. Order only becomes `cancelled` when ALL items are cancelled.
**User needs to decide:** Is item-level cancellation intended (useful for multi-vendor orders) or should it be all-or-nothing? This affects the cancel route logic.

### Q3: Item `fulfilled → ready` revert on failed Stripe transfer
**Decision:** User says NO — fulfillment is physical, payout is financial. They are separate concerns. A payment failure should not rewrite physical reality.
**Current behavior (WRONG):** `fulfill/route.ts:283-302` reverts item to `ready` + clears `vendor_confirmed_at` + `pickup_confirmed_at` when Stripe transfer fails. Buyer sees "Ready for Pickup" after they already have the item.
**Correct behavior:** Keep item as `fulfilled`. Create `vendor_payouts` record with `status = 'failed'`. Phase 5 cron already retries failed payouts for 7 days. Vendor still gets `payout_failed` notification. Admin alerted if retries exhaust.
**Action needed:** Fix `src/app/api/vendor/orders/[id]/fulfill/route.ts:282-303` — on transfer failure, insert payout with `status = 'failed'` instead of reverting item status. Added to backlog.
**Impact on status module:** Remove `fulfilled → ready` from valid item transitions. `fulfilled` is a true terminal state (no exits).

### Prefixed status names (order-pending vs item-pending)
**Decision:** Not doing this. The confusion was in Claude's understanding, not in the codebase. The codebase already uses separate columns (`orders.status` vs `order_items.status`) with separate enums. Better solution: use distinct TypeScript types (`OrderStatus` vs `ItemStatus`) in the status-transitions module to prevent compile-time confusion.

### Item-level cancellation
**Decision (2026-03-10):** KEEP item-level cancellation. A buyer can cancel individual items while other items in the same order remain active. "A small order is better than no order." The order only becomes `cancelled` when ALL items are cancelled.
