# Current Task: Market Box Checkout Integration

Started: 2026-02-11
Plan: `docs/Build_Instructions/Market_Box_Checkout_Integration_Plan.md`

## Status: COMPLETE — All 8 Phases Done

## Phase Checklist
- [x] **Phase 1**: Database migration — `20260211_001_cart_items_market_box_support.sql`
- [x] **Phase 2**: Cart API — POST/GET handlers accept market box items
- [x] **Phase 3**: Cart context + UI — useCart + CartDrawer support market box items
- [x] **Phase 4**: Market box detail page — Subscribe → Add to Cart
- [x] **Phase 5**: Checkout page — mixed cart display, payment method logic
- [x] **Phase 6**: Checkout session API — handle mixed carts in Stripe session
- [x] **Phase 7**: Payment success / webhook — process market box subscriptions after payment
- [x] **Phase 8**: Success page — show market box confirmation

## Commits
- `299fdda` — Phases 1-3: cart_items migration, cart API, cart context+UI
- Phases 4-8 are UNCOMMITTED — ready to commit

## What Phase 8 Needs
The success page at `src/app/[vertical]/checkout/success/page.tsx` needs to:
1. Fetch `marketBoxSubscriptions` from the success API response (already returned by Phase 7)
2. Display market box subscription confirmations alongside regular order items
3. Show: offering name, term weeks, start date, pickup schedule, vendor name

The success API at `src/app/api/checkout/success/route.ts` ALREADY returns `marketBoxSubscriptions` in the response (added in Phase 7). The success page just needs to render them.

## All Files Modified (Phases 1-7)
- `supabase/migrations/20260211_001_cart_items_market_box_support.sql` (NEW) — Phase 1
- `src/app/api/cart/items/route.ts` — Phase 2: POST supports `type: 'market_box'`
- `src/app/api/cart/route.ts` — Phase 2: GET returns market box items with offering details
- `src/lib/hooks/useCart.tsx` — Phase 3: `addMarketBoxToCart()`, extended CartItem interface
- `src/components/cart/CartDrawer.tsx` — Phase 3: MarketBoxCartItemCard, mixed cart notice
- `src/app/[vertical]/checkout/page.tsx` — Phase 5: mixed cart display, market box cards, Stripe-only
- `src/app/[vertical]/market-box/[id]/MarketBoxDetailClient.tsx` — Phase 4: Subscribe → Add to Cart
- `src/app/api/checkout/session/route.ts` — Phase 6: market box items in Stripe session + metadata
- `src/lib/stripe/payments.ts` — Phase 6: `createCheckoutSession` accepts optional metadata
- `src/app/api/checkout/success/route.ts` — Phase 7: creates market_box_subscriptions, returns them
- `src/lib/stripe/webhooks.ts` — Phase 7: webhook backup creates subscriptions too

## Key Design Decisions
- **Single Stripe session** for mixed carts (listings + market boxes)
- **cart_items extended** with `item_type` discriminator, `offering_id`, `term_weeks`, `start_date`
- **One order, two record types**: regular → `order_items`, market box → `market_box_subscriptions` (linked by `order_id`)
- **Market boxes are Stripe-only** — mixed cart disables external payment
- **Stripe session metadata** stores `has_market_boxes` + `market_box_items` JSON
- **Both success route AND webhook** create subscriptions (idempotent via order_id check)
- **`createCheckoutSession`** now accepts optional `metadata` param (spread into session metadata)

## Phase 7 Summary (just completed)
- Success route (`/api/checkout/success`): After payment record creation, parses `market_box_items` from Stripe session metadata, creates `market_box_subscriptions` rows with `order_id` link. Idempotent check via `offering_id + buyer_user_id + order_id`.
- Webhook handler (`webhooks.ts`): Same logic as backup — creates subscriptions if success route didn't already.
- Success route returns `marketBoxSubscriptions` array in response for the success page.
- Market box subscriptions include: `offering_id`, `buyer_user_id`, `order_id`, `total_paid_cents`, `start_date`, `term_weeks`, `status: 'active'`, `weeks_completed: 0`, `stripe_payment_intent_id`.
- DB trigger auto-creates pickup records on `market_box_subscriptions` INSERT.

## TypeScript Status
- `npx tsc --noEmit` passes with ZERO errors after Phase 7

## Gotchas / Watch Out For
- Migration `20260211_001_cart_items_market_box_support.sql` NOT YET APPLIED to any DB
- `listing_id` on cart_items is currently NOT NULL — migration alters to allow NULL
- `get_cart_summary` RPC updated in migration 001 to handle both item types
- Market box quantity is always 1, no qty selector
- DB trigger auto-creates pickup records on market_box_subscriptions INSERT
- Stripe idempotency keys must be DETERMINISTIC (never use Date.now())
- Stripe metadata `market_box_items` is JSON string — parse carefully
- Checkout page disables external payment when hasMarketBoxItems is true
