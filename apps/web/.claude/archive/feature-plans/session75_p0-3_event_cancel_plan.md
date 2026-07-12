# P0-3: Event Cancellation Refund + Cleanup System — Comprehensive Plan

**Status:** Designed, ready to implement next session
**Mode at draft time:** Report — no code edits made
**Companion docs:** `session75_codebase_audit.md`, `session75_fix_proposals.md` (P0-3 section is superseded by this plan)

---

## What this fixes

P0-3 as originally framed was "events/[token]/cancel and admin/events/[id] mark orders cancelled but never call Stripe refund — buyers told a refund is coming, never get one."

After deeper code review, the real scope is broader: the cancellation cleanup is a **6-action sequence** that's currently spread across two routes inconsistently, with **4 actions missing from the admin route**, **2 actions missing from both routes**, and a **separate gap in buyer-self-cancel**. We need to consolidate into one shared helper called from 4 places, plus a new endpoint for admin intervention on already-completed events.

---

## Verified system understanding

### Event status lifecycle
**Cite:** `src/app/api/admin/events/[id]/route.ts:23-33,73-83`

```
new → reviewing → approved → ready → active → review → completed
                ↓
                declined / cancelled  (terminal-ish)
```

| Transition | How |
|---|---|
| any → approved | admin PATCH (creates market + token + waves if applicable) |
| approved → ready | admin PATCH (auto-generates waves for company_paid or wave_ordering_enabled) |
| **ready → active** | **Phase 14 cron** at `expire-orders/route.ts:2256-2284` (daily, market timezone) |
| **active → review** | **Phase 15 cron** at `expire-orders/route.ts:2286-2315` (daily, after event_end_date) |
| review → completed | **admin PATCH only** — no auto-transition |
| any → cancelled / declined | admin PATCH OR organizer cancel route |

Validator at `admin/events/[id]/route.ts:84-89` only checks "is the new value in the list" — does NOT block backward transitions. Admin can PATCH `completed` → `cancelled`. Per user direction: don't introduce new statuses; "completed" stays "completed". For post-completion intervention, use the new `/refund-unfulfilled` endpoint.

### Two payment dimensions (independent)
- `payment_method`: stripe / cash / venmo / cashapp / paypal — the latter 4 are turned off via `EXTERNAL_PAYMENTS_ENABLED` flag in `src/lib/constants.ts` (UI gate only; backend code preserved)
- `payment_model`: attendee_paid / company_paid / hybrid — hybrid disabled per backlog
- For `payment_model='company_paid'`: no Stripe payment exists for buyer; company paid via `event_company_payments` table
- Vendor payout for company-paid orders does NOT happen at fulfill time (`fulfill/route.ts:158-178` skips Stripe transfer) — separate manual/missing process tracked as backlog item Session 71 T1-4

### The 6 cleanup actions and where they currently live

| Cleanup action | Organizer cancel route | Admin cancel route |
|---|---|---|
| Set `catering_requests.status` | ✅ line 64-72 | ✅ line 137-142 |
| Delete `listing_markets` rows | ✅ lines 75-88 | ✅ lines 228-239 |
| `markets.active = false` | ✅ lines 91-94 | **❌ MISSING** |
| Notify accepted vendors | ✅ lines 96-113 | **❌ MISSING** |
| Mark order_items + orders cancelled | ✅ lines 153-157 | ✅ lines 281-285 |
| Notify buyers | ✅ lines 137-150 | ✅ lines 261-278 |
| **Free wave reservations** | ✅ lines 159-165 | **❌ MISSING** |
| Notify organizer (email) | ✅ lines 169-196 | ✅ lines 288-302 |
| **Restore inventory** | **❌ MISSING** | **❌ MISSING** |
| **Issue Stripe refunds** | **❌ MISSING (P0-3)** | **❌ MISSING (P0-3)** |

### Other gaps surfaced by this review

- **Buyer self-cancel of event order doesn't free wave** — `buyer/orders/[id]/cancel/route.ts` does inventory + refund + cancellation fee, but does NOT call `free_wave_on_order_cancel`. Confirmed via grep — only 2 callers exist (`vendor/orders/[id]/reject:199` and `events/[token]/cancel:161`). Wave slot stays held until 10-min `expires_at` (per migration 120) — fine for short-window cancels, problematic for hours-ahead cancels.
- **`pickup_confirmed_at` is the canonical "fulfilled" indicator** — `admin/events/[id]/settlement/route.ts:290,329,374` uses it; should be in the filter alongside `status IN ('fulfilled','completed')`
- **Admin can override status validator** — no transition rules enforced in code; admin discipline only

### `event_company_payments` already supports refunds
`admin/events/[id]/payments/route.ts:165` — admin can PATCH a payment to `status='refunded'` manually. Tracks the company-side reversal separately from the buyer-side flow. Out of scope for this fix (admin handles manually for now).

---

## Design decisions (locked in by user)

1. **Unified notification text** for both organizer-cancel and admin-cancel scenarios:
   - Stripe-paid (attendee_paid): *"Your order for {event name} has been cancelled. Your refund of $X.XX has been issued — it will appear in your account within 5–10 business days."*
   - Company-paid: *"Your order for {event name} has been cancelled."* (no refund text — buyer didn't pay)
2. **Filter fulfilled items** — refund only the `not status in ('fulfilled','cancelled','refunded')` set
3. **No vendor payout reversal** — fulfilled items have payouts; non-fulfilled items don't, so nothing to reverse
4. **No external payment branch in new code** — UI gate prevents new external orders; legacy rows handled by existing `payment_method !== 'stripe'` skip in adjacent routes
5. **No company-paid Stripe refund** — buyer never paid via Stripe; admin reverses `event_company_payments` separately
6. **Idempotency check** before `createRefund` — DB first (`payment.status='refunded'`), Stripe API as fallback
7. **Per-vendor admin UI** for granular refund control — deferred to v2 backlog
8. **Inventory restore** — call `restoreInventory` always; RPC handles NULL/unlimited via PGRST116 = success
9. **Completed events** — keep `status='completed'`, don't introduce new status; use new `/refund-unfulfilled` endpoint for post-completion cleanup
10. **No initiator-specific notification text** — same wording whether organizer or admin pulled the trigger
11. **v1 blanket refund unfulfilled** — admin chooses which event to clean up; no per-vendor or per-item admin granularity yet

---

## Implementation plan

### File 1: `src/lib/events/cleanup-event-orders.ts` (NEW)

Shared helper that handles per-order cleanup. Single function:

```ts
export interface CleanupOptions {
  serviceClient: SupabaseClient
  marketId: string
  reason: 'organizer_cancel' | 'admin_cancel' | 'admin_decline' | 'admin_post_completion_intervention'
}

export interface CleanupResult {
  itemsCancelled: number
  itemsRefunded: number
  ordersAffected: number
  refundFailures: Array<{ orderId: string; orderItemId: string; error: string }>
  buyerNotifications: Array<{
    buyerUserId: string
    orderNumber: string
    orderId: string
    paymentModel: 'attendee_paid' | 'company_paid' | 'hybrid' | null
    refundAmountCents: number  // 0 for company_paid
    refundIssued: boolean
  }>
}

export async function cleanupEventOrders(opts: CleanupOptions): Promise<CleanupResult>
```

Behavior per item:
1. Filter: `not status in ('fulfilled','cancelled','refunded')` AND `pickup_confirmed_at is null`
2. Mark `order_items.status = 'cancelled'`
3. Restore inventory via `restoreInventory(serviceClient, listingId, qty)`
4. Determine refund amount: `priceCents + Math.round(priceCents * 0.065) + Math.floor(15 / totalItemsInOrder)` (per-item gross including buyer fee + prorated flat)
5. Branch on `payment_model`:
   - `company_paid`: skip refund, `refundAmountCents=0`, `refundIssued=true` (treat as "no refund needed, success")
   - else: look up payment by order_id where status='succeeded'; idempotency check (DB first, Stripe API fallback if API rejects); `createRefund(payment_intent, refundAmountCents)`; on success mark `order_items.status='refunded'`; on failure log `ERR_EVENT_CANCEL_REFUND_FAILED` and accumulate to `refundFailures`

Behavior per affected order:
- Free wave reservation via `free_wave_on_order_cancel(order_id)`
- Mark `orders.status='cancelled'` if all items cancelled

Returns the `CleanupResult` so callers can send notifications with refund details.

**Helper does NOT:**
- Change event status
- Touch listing_markets
- Deactivate market
- Notify vendors
- Notify organizer
- Send buyer notifications (returns the data so caller does it with context-appropriate text)

### File 2: `src/app/api/events/[token]/cancel/route.ts` (refactor)

Keep event-level cleanup (delete listing_markets, deactivate market, notify vendors, status flip, organizer email).

Replace per-buyer block (lines 115-166) with:
```ts
const cleanupResult = await cleanupEventOrders({ serviceClient, marketId: event.market_id, reason: 'organizer_cancel' })

for (const notif of cleanupResult.buyerNotifications) {
  await sendNotification(notif.buyerUserId, 'order_cancelled_by_vendor', {
    vendorName: event.company_name,
    companyName: event.company_name,
    eventDate: event.event_date,
    reason: notif.paymentModel === 'company_paid'
      ? `Your order for ${event.company_name} has been cancelled.`
      : `Your order for ${event.company_name} has been cancelled. Your refund of $${(notif.refundAmountCents/100).toFixed(2)} has been issued — it will appear in your account within 5–10 business days.`,
    orderNumber: notif.orderNumber,
    orderId: notif.orderId,
  }, { vertical: event.vertical_id })
}

if (cleanupResult.refundFailures.length > 0) {
  // Log + admin notification for manual intervention
}
```

### File 3: `src/app/api/admin/events/[id]/route.ts` (refactor + add missing event-level actions)

Add the 4 missing event-level actions for the cancel/decline branch:
- `markets.active = false`
- Notify accepted vendors (`event_cancelled_vendor`)
- (free waves is now handled by the helper)
- Already has organizer email

Replace per-buyer block (lines 246-285) with the same `cleanupEventOrders()` call, mapped to `reason: 'admin_cancel'` or `'admin_decline'`.

### File 4: `src/app/api/admin/events/[id]/refund-unfulfilled/route.ts` (NEW)

```
POST /api/admin/events/[id]/refund-unfulfilled
Auth: admin only
Body: { reason?: string } // optional admin-typed reason for the audit log
```

- Verify event exists, is in any status
- Call `cleanupEventOrders({ ..., reason: 'admin_post_completion_intervention' })`
- Send buyer notifications (same unified text)
- Log admin action with reason text
- **Does NOT change `catering_requests.status`** — event stays `completed` (or whatever it was)
- Returns the cleanup summary

### File 5: `src/app/api/buyer/orders/[id]/cancel/route.ts` (small addition — CRITICAL-PATH)

After the existing inventory + refund block, add:
```ts
// Free wave reservation if this order had one (no-op for non-event orders)
const { error: waveErr } = await cancelServiceClient.rpc('free_wave_on_order_cancel', {
  p_order_id: orderId,
})
if (waveErr) console.error('[buyer-cancel] free_wave error:', waveErr.message)
```

This needs explicit per-file approval as `buyer/orders/[id]/cancel/route.ts` is on the critical-path list. Could ship as a separate small fix if scope creep is a concern.

---

## Notifications used

- Existing `order_cancelled_by_vendor` template — already used by both cancel routes; we just enrich the `reason` field with refund-specific text
- No new notification types required

---

## Pre-shipping verifications

1. Verify `pickup_confirmed_at` and `status='fulfilled'` agree in 100% of fulfilled orders — if not, use both in the filter
2. Verify `free_wave_on_order_cancel(order_id)` is safe to call for orders without a wave reservation (no-op)
3. Confirm `restoreInventory` is safe for event-only listings (RPC handles unlimited; verify behavior for soft-deleted listings)
4. Decide whether `refundAmountCents` calculation needs `refund_application_fee: true` on the Stripe Refund call (open question from P1-5 — also needed for P0-3 to reverse platform fees on refunded items)
5. Test in Stripe sandbox: organizer-cancel a paid event order → confirm refund hits sandbox

---

## Risk + rollback

- **Risk: HIGH.** Real money flows out via Stripe refunds. Helper handles all 4 cancel paths after refactor — a bug in the helper affects all 4.
- **Mitigation:** Ship the new helper in a way that's testable in isolation BEFORE refactoring callers. Write integration tests for `cleanupEventOrders` covering attendee-paid, company-paid, mixed, no-payment, refund-failure, and idempotency-rerun cases. Land tests + helper first, then refactor callers in a separate commit.
- **Rollback:** revert refactor commit (callers go back to current behavior). Helper file can stay unused.

---

## Test coverage to add

1. `cleanup-event-orders.test.ts` — unit tests for the helper covering:
   - Attendee-paid: refund issued, item.status='refunded', wave freed
   - Company-paid: no refund, item.status='cancelled', wave freed
   - Already-refunded payment: idempotency check skips
   - Stripe API fails: item stays 'cancelled', refundFailures populated
   - Mixed-cart order (some fulfilled, some not): only non-fulfilled refunded
   - Order with no wave reservation: free_wave is no-op, no error
2. `event-cancel-organizer.test.ts` — end-to-end: organizer cancel → all 6 actions fired
3. `event-cancel-admin.test.ts` — end-to-end: admin cancel → all 6 actions fired (+ verify the 4 previously-missing actions are now present)
4. `event-refund-unfulfilled.test.ts` — admin intervention on completed event: status stays 'completed', cleanup actions fire
5. `buyer-cancel-frees-wave.test.ts` — buyer self-cancel of event order frees wave slot

---

## Suggested ship sequence (next session)

1. Write helper + unit tests (no callers using it yet — safe)
2. Run vitest, confirm tests pass
3. Refactor `events/[token]/cancel/route.ts` to use helper — present diff for approval
4. Refactor `admin/events/[id]/route.ts` to use helper + add 4 missing event-level actions — present diff for approval (CRITICAL-PATH-adjacent)
5. Add new `/refund-unfulfilled` endpoint
6. Add `free_wave_on_order_cancel` to buyer/orders/[id]/cancel/route.ts — present diff for approval (CRITICAL-PATH file)
7. Run full vitest + lint
8. Commit batch (likely 2 commits: helper+tests, then routes)
9. Push to staging via explicit chain
10. Tier 1 smoke: organizer-cancel a paid Stripe sandbox event → buyer sees refund

---

## Open questions still pending user answer

1. **Buyer-cancel free-wave fix** — bundle with P0-3 batch, or separate small fix?
2. **`/refund-unfulfilled` endpoint name** — keep as proposed, or alternative (`/cleanup-unfulfilled`, `/intervention/refund-unfulfilled`, button on settlement page)?
3. **Notification text variant for "completed event admin intervention"** — same unified text, or different (e.g., *"Your unfulfilled order has been cancelled and refunded due to platform action."*)?
4. **Stripe `refund_application_fee: true`** — should refund of unfulfilled items also reverse the platform's fee share? (Same open question applies to P1-5.)
