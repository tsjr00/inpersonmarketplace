# Stripe Payout Investigation — Session 73 (April 20-21, 2026)

## The Problem

Vendor "Chef Prep" fulfilled an order on April 17. Vendor was never paid. Platform received the full $1.86 (after Stripe processing) and it was swept to the bank on April 21.

## What We Know (Facts)

### Transaction Details
- Order: FA-2026-34315391
- Item price: $1.00, total charged to buyer: $2.22 (with fees)
- Buyer: chefprepparty@gmail.com (user_id: 15c3aa49...)
- Vendor: Chef Prep (jennifershea815@gmail.com), vendor_profile_id: 76769240...
- Vendor Stripe connected account: acct_1TEbQUA13asua6Qv (connected March 24)
- Payment: April 17, 3:20 AM → succeeded
- Fulfillment: April 17, 3:27 AM → buyer confirmed at 3:27:16, vendor at 3:27:23
- Transfer attempt: April 17, 3:27:24 AM → **FAILED: balance_insufficient**
- Payout to platform bank: April 21 ($1.86)
- Vendor owed: $0.78 (vendor_payout_cents from DB)

### Stripe API Log (verified)
```
POST /v1/transfers — 400 ERR
Time: Apr 17, 2026, 3:27:24 AM UTC
Error: "You have insufficient funds in your Stripe account."
Request body: { amount: 78, currency: usd, destination: acct_1TEbQUA13asua6Qv }
```

### Database State (verified)
- `order_items.status`: 'fulfilled' ✓
- `order_items.buyer_confirmed_at`: set ✓
- `order_items.vendor_confirmed_at`: set ✓
- `vendor_payouts` record: **NONE** (no record exists for this order item)
- `error_logs`: **NONE** (no error logged)
- `vendor_profiles.stripe_account_id`: acct_1TEbQUA13asua6Qv ✓
- `vendor_profiles.stripe_payouts_enabled`: true ✓

### Stripe Settings (verified)
- Platform payout schedule: **Daily, automatic**
- Payment settlement: funds available April 21 (4 days after payment on April 17)
- No prior transactions existed — available balance was $0 at transfer time

### RLS Policies on vendor_payouts (verified)
- RLS: enabled
- Policies: **SELECT only** (vendor_payouts_select)
- No INSERT policy
- No UPDATE policy
- No DELETE policy

### Code Paths (verified by reading)
- `src/app/api/vendor/orders/[id]/fulfill/route.ts` line 148: marks item 'fulfilled' FIRST
- Line 290: INSERT into vendor_payouts using `supabase` (authenticated client) → blocked by RLS
- Line 298-309: error caught but only logged as breadcrumb, code continues
- Line 311-317: `transferToVendor()` called anyway → Stripe returns 400
- Line 340-365: catch block logs to console.error, not error_logs
- Line 346: tries to update payout record to 'failed' → `payoutRecord` is null → skipped

### Other INSERT Calls to vendor_payouts (verified)
- `checkout/success/route.ts`: uses `serviceClient` ← WORKS
- `buyer/orders/[id]/cancel/route.ts`: uses `serviceClient` ← WORKS
- `vendor/orders/[id]/fulfill/route.ts`: uses `supabase` ← BLOCKED BY RLS
- `buyer/orders/[id]/confirm/route.ts`: uses `supabase` ← BLOCKED BY RLS
- `cron/expire-orders/route.ts`: uses `supabase` ← needs verification of which client
- `stripe/webhooks.ts`: uses `supabase` ← needs verification of which client

### Staging Verification (verified)
- `vendor_payouts` table on staging: **ZERO rows** (no payout has ever been recorded via fulfill route)
- Staging has same RLS policy (SELECT only)
- Staging payout of $20.51 was swept to bank — likely includes undelivered vendor portions

## Root Causes Identified

### Cause 1: No INSERT RLS policy on vendor_payouts
The fulfill route uses the vendor's authenticated client to INSERT. RLS blocks it. The insert error is caught but not treated as fatal — code continues without a record.

### Cause 2: Transfer from available balance (empty)
`transferToVendor()` doesn't pass `source_transaction` (charge ID). Stripe tries to pull from available balance, which is $0 because:
- First/only transaction — no prior balance
- Daily automatic payouts sweep available to bank
- Payment settlement takes ~4 days (this account)

Without `source_transaction`, transfer is disconnected from the payment that created the funds.

## Fix Applied (commit 121b3d5e, on staging)

### Fix 1: Service client for vendor_payouts
Changed `supabase.from('vendor_payouts').insert(...)` to `serviceClient.from('vendor_payouts').insert(...)` in the fulfill route. Also changed the UPDATE calls (success and failure paths).

### Fix 2: source_transaction on transfers
- Added `getChargeIdFromPaymentIntent()` to `src/lib/stripe/payments.ts`
- Fulfill route looks up charge ID from `payments` table → retrieves via Stripe API
- Passes `source_transaction` to `stripe.transfers.create()`
- Stripe queues the transfer until the charge settles — no balance dependency

## What We Think But Haven't Proven

- **Settlement timing**: We observed 4 days between payment (Apr 17) and availability (Apr 21). We don't know if this is always 4 days or varies. Standard Stripe US is ~2 business days.
- **Other routes affected**: `buyer/orders/[id]/confirm/route.ts` and `cron/expire-orders/route.ts` also INSERT into vendor_payouts with authenticated clients. These likely have the same RLS failure. Not yet fixed.
- **Webhooks client**: `src/lib/stripe/webhooks.ts` inserts into vendor_payouts — needs verification of whether it uses a service-role client or authenticated client.
- **Phase 5 cron retry**: The retry mechanism queries vendor_payouts with `status = 'failed'`. Since no records are created, it has nothing to retry. Even after the fix, transfers with `source_transaction` shouldn't need retry — but if they do fail for another reason, the record will now exist for Phase 5 to find.

## What Could Still Go Wrong (Unknown Risks)

1. **Stripe rejecting source_transaction**: If the charge ID is invalid, already fully transferred, or from a different account, Stripe may reject it with a different error.
2. **getChargeIdFromPaymentIntent() failing**: If the Stripe API call to retrieve the payment intent fails (timeout, rate limit), `chargeId` will be `undefined` and the transfer falls back to no `source_transaction` — same failure as before.
3. **Partial settlement**: If Stripe has holds or disputes on the charge, `source_transaction` may not have enough funds to cover the transfer.
4. **Multiple items per order**: If an order has multiple items from the same charge, the total transfers from that charge can't exceed the charge amount. Need to verify this isn't a problem.
5. **The buyer/confirm edge case**: When vendor fulfills first and buyer confirms second, the payout happens in `buyer/orders/[id]/confirm/route.ts` — this still uses `supabase` (not fixed yet).
6. **WIX.com webhook**: A webhook delivery to WIX.com was noted in the Stripe event log for this transaction. No active WIX integration exists. Could be a leftover endpoint consuming events.

## Immediate Action Items

- [ ] Vendor (Chef Prep) is owed $0.78 — needs manual transfer once balance allows
- [ ] Push fix to prod (currently on staging only)
- [ ] Fix `buyer/orders/[id]/confirm/route.ts` payout inserts (same RLS issue)
- [ ] Verify `cron/expire-orders/route.ts` and `webhooks.ts` client types
- [ ] Investigate/remove WIX.com webhook endpoint in Stripe dashboard
- [ ] Consider adding `customer_email` to checkout session (Stripe shows wrong email)
- [ ] Test the fix on staging with a real purchase flow

## Additional Context: Wrong Customer Email

Stripe shows `jennifershea815@gmail.com` (vendor) as the customer on this transaction. Our code (`src/lib/stripe/payments.ts` line 57-79) does NOT set `customer_email` on the checkout session. Stripe captures whatever email the buyer types on the payment form. In this case, Jennifer (vendor) was testing from a buyer account on her device — her saved Stripe payment method auto-filled her email.

Fix: pass authenticated buyer's email as `customer_email` in `createCheckoutSession()`.
