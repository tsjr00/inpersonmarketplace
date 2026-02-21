# Current Task: Stripe Statement Descriptor Suffix — Per-Vertical

Started: 2026-02-22

## Goal
Add `statement_descriptor_suffix` to all 4 Stripe checkout creation points so buyer bank statements show the vertical brand name after "815ENTERPRISES".

## Key Decisions Made
- Platform descriptor: "815ENTERPRISES" (set in Stripe Dashboard, not code)
- Suffix per vertical: `FARMERS MARKETING`, `FOOD TRUCKN`, `FIREWORKS`, fallback `MARKETPLACE`
- User corrected: FM suffix is "FARMERS MARKETING" not "FRESH MARKET"

## What's Been Completed
- [x] Added `getStatementSuffix()` helper to `src/lib/stripe/payments.ts`
- [x] Updated `createCheckoutSession()` — added `vertical` param + `payment_intent_data.statement_descriptor_suffix`
- [x] Updated `createMarketBoxCheckoutSession()` — added `vertical` param + `payment_intent_data.statement_descriptor_suffix`

## What's Remaining — 4 callers + 2 checkout creation points
1. **Pass `vertical` at call site** in `src/app/api/checkout/session/route.ts` line ~643:
   - `createCheckoutSession({ ..., vertical })` — `vertical` already available from request body (line 61)

2. **Pass `vertical` at call site** for market box checkout:
   - Find where `createMarketBoxCheckoutSession()` is called
   - Pass `vertical` from context

3. **Subscription checkout** — `src/app/api/subscriptions/checkout/route.ts` line ~253:
   - Add `payment_intent_data: { statement_descriptor_suffix: getStatementSuffix(vertical) }` inside `subscription_data`
   - Actually for subscription mode: use `payment_settings: { payment_method_options: { card: { request_three_d_secure: 'automatic' } } }` or just add to the session-level. Need to check Stripe API.
   - For subscriptions, the field is on the invoice, not payment_intent. Use `subscription_data.payment_settings` or `payment_intent_data.statement_descriptor_suffix` at session level.
   - **Simpler approach**: Stripe checkout session in `subscription` mode does NOT support `payment_intent_data`. Instead set `subscription_data.description` or handle via Stripe Dashboard default.
   - **ACTUALLY**: For subscription mode, Stripe supports `payment_intent_data` at the session level only in `payment` mode. For `subscription` mode, statement descriptors are set on the **Product** in Stripe Dashboard or via the `statement_descriptor` on the subscription's invoice. So we may need to just rely on the Stripe Dashboard product setting for subscriptions.

4. **Vendor fee payment** — `src/app/api/vendor/fees/pay/route.ts` line ~66:
   - Add `payment_intent_data: { statement_descriptor_suffix: getStatementSuffix(vertical_id) }`
   - `vertical_id` already available (line 29)

## Files Modified So Far
- `src/lib/stripe/payments.ts` — getStatementSuffix() + vertical param on both functions

## Files Still Need Changes
- `src/app/api/checkout/session/route.ts` — pass `vertical` to `createCheckoutSession()`
- `src/app/api/vendor/fees/pay/route.ts` — add `payment_intent_data` with suffix
- `src/app/api/subscriptions/checkout/route.ts` — research subscription mode descriptor approach
- Wherever `createMarketBoxCheckoutSession()` is called — pass `vertical`

## Important Notes
- `payment_intent_data.statement_descriptor_suffix` only works in `mode: 'payment'`
- For `mode: 'subscription'`, statement descriptors come from the Stripe Product or invoice settings
- Max 22 chars for suffix
- Stripe auto-uppercases
