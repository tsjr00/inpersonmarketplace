# Stress Test & Resilience Protocols

**Purpose:** Verify the app can handle real traffic, real money, and real failure scenarios before and after go-live. These protocols test what unit tests and staging verification cannot: concurrency, infrastructure limits, failure recovery, and behavior under load.

**When to run:** Before first production push with real transactions, and periodically after significant changes to payment or order flows.

**Environment:** Run on **staging** unless noted otherwise. Staging uses the same Vercel infrastructure and Supabase project tier as production.

---

## Protocol 1: Concurrent Checkout Stress Test

**What it tests:** Can two buyers checkout the same low-inventory item simultaneously without overselling?

**Why it matters:** `atomic_decrement_inventory` uses `FOR UPDATE` row locking (migration 078, confirmed at `src/app/api/checkout/session/route.ts:736-758`). This should serialize concurrent decrements, but we've never tested it under real concurrent load.

**How to run:**

### Setup
1. Create a test listing with `quantity = 2` on staging
2. Open the listing detail page in **3 separate browser windows** (different browsers or incognito tabs), each logged in as a different test buyer

### Test A: Serial (baseline)
1. Buyer 1 adds 1 to cart, completes checkout → should succeed, inventory = 1
2. Buyer 2 adds 1 to cart, completes checkout → should succeed, inventory = 0
3. Buyer 3 adds 1 to cart, attempts checkout → should fail with "insufficient stock"
4. **Verify:** listing auto-drafted (quantity hit 0), no overselling

### Test B: Simultaneous
1. Create another test listing with `quantity = 1`
2. Open in 2 browser windows, both add to cart
3. Both click "Place Order" within 2-3 seconds of each other
4. **Expected:** One succeeds, one fails with inventory error
5. **Verify:** Query `SELECT quantity FROM listings WHERE id = '<id>'` — must be 0, not negative
6. **Verify:** Only 1 order created, not 2

### Test C: Rapid cart-add
1. Create listing with `quantity = 3`
2. Same buyer opens 3 tabs, rapidly adds 1 to cart in each
3. **Expected:** Cart should have 3 items (cart doesn't decrement inventory — checkout does)
4. Checkout with quantity 3 → should succeed
5. Try to add again → listing should be drafted or show 0 available

### What to check after each test
```sql
-- Verify no negative inventory
SELECT id, title, quantity FROM listings WHERE quantity < 0;

-- Verify order count matches successful checkouts
SELECT COUNT(*) FROM orders WHERE status != 'cancelled'
AND created_at > NOW() - INTERVAL '1 hour';

-- Verify payment records match orders
SELECT o.order_number, p.status FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE o.created_at > NOW() - INTERVAL '1 hour';
```

---

## Protocol 2: Webhook Resilience Test

**What it tests:** Does the system handle Stripe webhook retries, out-of-order events, and webhook + success-page race conditions?

**Why it matters:** Stripe retries webhooks up to 16 times. The success page (`/api/checkout/success`) and the `checkout.session.completed` webhook can both fire for the same payment. The payment record insert uses unique constraint (code `23505`) as the idempotency guard (`src/app/api/checkout/success/route.ts:81-109`).

**How to run:**

### Test A: Verify webhook is receiving events
1. Complete a test checkout on staging
2. Check Stripe Dashboard → Developers → Webhooks → select the staging endpoint
3. Verify the `checkout.session.completed` event shows as delivered (200 response)
4. **If not registered:** The webhook endpoint URL must be added in Stripe Dashboard for staging

### Test B: Webhook delivery failure simulation
1. In Stripe Dashboard → Webhooks → select the endpoint → "Send test webhook"
2. Send a `checkout.session.completed` test event
3. Check the response — should be 200 (received) or 500 (processing error, will retry)
4. **Never** 400 (signature failure) — that would mean the webhook secret is wrong

### Test C: Double-processing guard
1. Complete a checkout
2. Wait for both the success page redirect AND the webhook to fire
3. Query the database:
```sql
-- Should be exactly 1 payment record per order
SELECT order_id, COUNT(*) FROM payments
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY order_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows (no duplicates)

-- Should be exactly 1 notification per event per user
SELECT user_id, type, COUNT(*) FROM notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
AND type IN ('order_confirmed', 'payment_received')
GROUP BY user_id, type
HAVING COUNT(*) > 1;
-- Expected: 0 rows (dedup working)
```

### Test D: Webhook event types registered
Verify these events are registered in the Stripe webhook endpoint for **both staging and production**:
- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `account.updated`
- `transfer.created`
- `transfer.reversed`
- `charge.refunded`
- `charge.dispute.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Source: `src/lib/stripe/webhooks.ts:72-119`

---

## Protocol 3: Full Money Path Trace

**What it tests:** Every path money takes through the system — in and out — and verifies the amounts match.

**Why it matters:** A single rounding error, missing fee, or skipped payout means real financial loss.

**How to run:**

### Test A: Stripe checkout → vendor payout (happy path)
1. Create a listing priced at $7.33 (odd number to test rounding)
2. Buyer checks out via Stripe
3. Record every amount at each step:

| Step | What to check | Source |
|------|--------------|--------|
| Display price | $7.81 (7.33 × 1.065, rounded) | Listing card |
| Cart total | $7.81 + $0.15 flat fee = $7.96 | Cart/checkout page |
| Stripe charge | $7.96 | Stripe Dashboard → Payments |
| `orders.total_cents` | 796 | Database |
| `order_items.subtotal_cents` | 733 | Database |
| `order_items.platform_fee_cents` | 48 (round(733 × 6.5%)) | Database |
| `order_items.vendor_payout_cents` | 733 - 48 - 15 = 670 | Database |
| Stripe transfer to vendor | 670 | Stripe Dashboard → Transfers |
| `vendor_payouts.amount_cents` | 670 | Database |

4. **Verify:** `buyer paid` = `vendor received` + `platform fee` + `flat fees`

```sql
-- Full reconciliation for recent orders
SELECT
  o.order_number,
  o.total_cents as buyer_paid,
  oi.subtotal_cents as base_price,
  oi.platform_fee_cents,
  oi.vendor_payout_cents,
  vp.amount_cents as actual_payout,
  vp.status as payout_status
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN vendor_payouts vp ON vp.order_item_id = oi.id
WHERE o.created_at > NOW() - INTERVAL '1 hour'
ORDER BY o.created_at DESC;
```

### Test B: Stripe checkout with tip (FT only)
1. Same as Test A but add a 15% tip at checkout
2. Additional checks:

| Step | What to check | Expected |
|------|--------------|----------|
| `orders.tip_amount` | round(display_subtotal × 15%) | Database |
| `orders.tip_on_platform_fee_cents` | tip_amount - round(subtotal × 15%) | Database |
| Vendor transfer | vendor_payout + tip_share (excl platform fee tip) | Stripe |

### Test C: External payment → fee ledger
1. Buyer checks out with Venmo
2. Vendor confirms external payment received
3. Check:
```sql
-- Fee ledger entry should exist
SELECT * FROM vendor_fee_ledger
WHERE created_at > NOW() - INTERVAL '1 hour';
-- fee_cents should be round(subtotal × 3.5%)
```

### Test D: Buyer cancellation → refund
1. Complete a Stripe checkout
2. Buyer cancels (within grace period for full refund)
3. Check:
```sql
SELECT
  oi.status,
  oi.refund_amount_cents,
  oi.cancelled_at,
  oi.cancelled_by
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.created_at > NOW() - INTERVAL '1 hour'
AND oi.status IN ('cancelled', 'refunded');
```
4. **Verify:** Stripe Dashboard shows refund matching `refund_amount_cents`
5. **Verify:** Inventory restored (check listing quantity)

### Test E: Vendor reject → refund
1. Complete checkout
2. Vendor rejects the order item
3. Same verification as Test D
4. **Verify:** Refund = full buyer paid amount (no cancellation fee on reject)

---

## Protocol 4: Vercel Function Timeout Test

**What it tests:** Can critical API routes complete within Vercel's function timeout?

**Why it matters:** Vercel Hobby plan = 10s timeout, Pro plan = 60s. No `maxDuration` is set on any route (confirmed: no matches in `src/app/api/`). The cron job (`expire-orders`) runs 10+ phases sequentially with DB queries + Stripe calls in each. If it exceeds the timeout, later phases silently don't run.

**How to run:**

### Test A: Cron job completion
1. Trigger the cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging-url>/api/cron/expire-orders`
2. Check the response — does it return a complete JSON with all phase results?
3. Check the response time — under 10 seconds?
4. If it times out, phases after the timeout never execute

### Test B: Checkout under slow network
1. In browser DevTools → Network → throttle to "Slow 3G"
2. Complete a checkout
3. Does the success page load before the Stripe session expires?
4. Does the webhook fire even if the success page times out?

### What to check
- **Vercel plan:** Hobby (10s) or Pro (60s)? This determines your ceiling.
- **If Hobby:** Consider adding `export const maxDuration = 30` to checkout and cron routes (requires Pro plan)
- **If Pro:** 60s should be sufficient for current load, but monitor as order volume grows

---

## Protocol 5: Rate Limit Verification

**What it tests:** Do rate limits actually block excessive requests without blocking legitimate traffic?

**Why it matters:** Rate limiting uses Upstash Redis (`src/lib/rate-limit.ts:13-18`). Free tier = 10K commands/day, each check = 2 commands = 5K rate-limit checks/day. At scale, this could be exhausted.

**How to run:**

### Test A: Verify limits work
1. Open browser console on staging
2. Fire 6 rapid requests to the checkout endpoint:
```javascript
for (let i = 0; i < 6; i++) {
  fetch('/api/checkout/session', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' })
    .then(r => console.log(i, r.status))
}
```
3. **Expected:** First 5 return 401 (no auth) or 400 (validation). 6th returns 429 (rate limited).
4. Checkout limit is 5 req/60s per IP.

### Test B: Verify Redis budget
1. Check Upstash Dashboard → Usage → commands/day
2. Calculate: (expected daily users) × (avg API calls per session) × 2 commands = daily Redis usage
3. If projected usage > 8K commands/day, upgrade Upstash plan before launch

### Current rate limits (from code)
| Endpoint type | Limit | Window | Source |
|---------------|-------|--------|--------|
| Auth (login/signup) | 5 | 60s | `rateLimits.auth` |
| Checkout | 5 | 60s | `rateLimits.submit` |
| Vendor order actions | 30 | 60s | `rateLimits.admin` |
| General API | 60 | 60s | `rateLimits.api` |
| Account deletion | 3 | 3600s | `rateLimits.deletion` |
| Webhooks | 100 | 60s | `rateLimits.webhook` |

---

## Protocol 6: Stripe Connect Vendor Onboarding (Live Mode)

**What it tests:** Can a real vendor complete Stripe Connect onboarding with a live Stripe account?

**Why it matters:** All test vendors have fake `stripe_account_id` values or test-mode accounts. Live mode requires real identity verification, which has different flows and error cases.

**How to run:**

### Test
1. Create a new vendor account on staging
2. Complete the 3-gate onboarding (category verification, COI, prohibited items)
3. Admin approves the vendor
4. Vendor clicks "Connect Stripe" on settings page
5. Complete Stripe Express onboarding with real (or Stripe test) details
6. **Verify:** `vendor_profiles.stripe_charges_enabled = true`
7. **Verify:** `vendor_profiles.stripe_payouts_enabled = true`
8. Create a listing, buyer checks out, vendor fulfills
9. **Verify:** Transfer appears in vendor's Stripe dashboard

### What to check
```sql
SELECT
  stripe_account_id,
  stripe_charges_enabled,
  stripe_payouts_enabled,
  stripe_onboarding_complete
FROM vendor_profiles
WHERE user_id = '<vendor-user-id>';
```

### Known issue
Session 61 found `stripe_payouts_enabled` can desync (DB says false, Stripe says true). The fulfill route has self-healing at `src/app/api/vendor/orders/[id]/fulfill/route.ts:111-131`, but the catch block at line 127-130 silently continues on non-TracedError failures. Monitor this during onboarding.

---

## Protocol 7: Failure Recovery Checklist

**What it tests:** What happens when things go wrong — and whether the system recovers or loses money.

### Scenario A: Stripe is down during checkout
- Buyer clicks "Place Order" but Stripe API is unreachable
- **Expected:** Error message, no order created, no inventory decremented
- **Verify:** `createCheckoutSession()` throws → `checkout/session/route.ts` catches → returns error
- **Inventory safe:** Decrement happens AFTER Stripe session creation (`route.ts:738`), so if Stripe fails, decrement never runs

### Scenario B: DB is down during checkout success
- Stripe charges the buyer, redirects to success page, but Supabase is unreachable
- **Expected:** Success page shows error, but webhook will retry (up to 16 times over 72h)
- **Verify:** Payment eventually recorded when DB comes back via webhook retry
- **Risk window:** Buyer sees error but was charged. They may contact support.

### Scenario C: Stripe transfer fails during fulfill
- Vendor fulfills order, but Stripe transfer to vendor fails
- **Expected:** Payout record created with status `failed` (`fulfill/route.ts:320-360`)
- **Recovery:** Phase 5 of cron retries failed payouts daily for 14 days
- **Verify:** `vendor_payouts` table has `status = 'failed_will_retry'`

### Scenario D: Refund fails during buyer cancel
- Buyer cancels, item marked cancelled, but `createRefund()` throws
- **Expected:** Error logged as `[REFUND_FAILED]` (`cancel/route.ts:226-233`)
- **Recovery:** NONE currently. Manual intervention required. TODO at line 233.
- **Monitor:** Sentry alert for `[REFUND_FAILED]` log entries

### Scenario E: Cron doesn't run
- Vercel cron fails to trigger (infrastructure issue)
- **Impact:** Expired orders not cleaned up, failed payouts not retried, trial expirations not processed
- **Recovery:** Manual trigger via curl with CRON_SECRET
- **Monitor:** Check `orders` table for stale pending orders older than expected

### Verification queries for failure recovery
```sql
-- Failed payouts awaiting retry
SELECT * FROM vendor_payouts WHERE status IN ('failed', 'failed_will_retry')
ORDER BY created_at DESC;

-- Orders stuck in pending (should have been expired)
SELECT id, order_number, status, created_at, payment_method
FROM orders WHERE status = 'pending'
AND created_at < NOW() - INTERVAL '24 hours';

-- Cancelled items without refund (potential stuck refunds)
SELECT oi.id, oi.status, oi.refund_amount_cents, o.payment_method
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE oi.status = 'cancelled'
AND oi.refund_amount_cents > 0
AND o.payment_method = 'stripe'
AND NOT EXISTS (
  SELECT 1 FROM order_items oi2
  WHERE oi2.id = oi.id AND oi2.status = 'refunded'
);
```

---

## Protocol 8: Production Environment Verification

**What it tests:** Is the production environment correctly configured before the first real transaction?

**This is a one-time checklist, not a recurring test.**

### Stripe Configuration
- [ ] Stripe Dashboard is NOT in test mode (Settings → General → Test Data toggle OFF)
- [ ] Live webhook endpoint registered at `https://farmersmarketing.app/api/webhooks/stripe`
- [ ] All 12 event types from Protocol 2 Test D are selected
- [ ] Webhook signing secret matches `STRIPE_WEBHOOK_SECRET` in Vercel Production scope
- [ ] `STRIPE_SECRET_KEY` in Vercel Production scope is `sk_live_...` (not `sk_test_...`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is `pk_live_...`
- [ ] All 10 price IDs set (FM Pro/Boss monthly+annual, FT Pro/Boss monthly+annual, Buyer monthly+annual)

### Supabase Configuration
- [ ] Redirect URLs include `https://farmersmarketing.app/**` and `https://foodtruckn.app/**`
- [ ] Auth email hook (Send Email) pointing to production URL
- [ ] Auth hook secret matches `SEND_EMAIL_HOOK_SECRET` in Vercel Production scope

### Vercel Configuration
- [ ] Production environment variables are separate from Preview (confirm in Vercel Dashboard)
- [ ] `NEXT_PUBLIC_APP_URL` set for Production scope
- [ ] `CRON_SECRET` set for Production scope
- [ ] `ADMIN_ALERT_EMAIL` set to correct address for production alerts

### DNS / Domains
- [ ] `farmersmarketing.app` pointing to Vercel
- [ ] `foodtruckn.app` pointing to Vercel
- [ ] SSL certificates valid on both domains

### First Transaction Test
- [ ] Admin creates a real vendor account
- [ ] Vendor completes Stripe Connect onboarding (real or Stripe test data)
- [ ] Vendor creates a $1.00 test listing
- [ ] Buyer purchases it via Stripe
- [ ] Vendor fulfills the order
- [ ] Transfer appears in vendor's Stripe balance
- [ ] Buyer cancels a second test order → refund appears in Stripe

---

## How to Use This Document

1. **Before go-live:** Run Protocols 1-3 (critical path), 6 (vendor onboarding), and 8 (environment checklist)
2. **After go-live:** Run Protocol 7 queries daily for the first week
3. **Before scaling:** Run Protocols 4 and 5 to understand infrastructure limits
4. **After significant payment changes:** Re-run Protocol 3 (money path trace)

All SQL queries can be run in the Supabase SQL Editor for the relevant environment.
