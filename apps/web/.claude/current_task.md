# Current Task: Market Box Checkout Integration

Started: 2026-02-11
Plan: `docs/Build_Instructions/Market_Box_Checkout_Integration_Plan.md`

## Status: IN PROGRESS — Phase 4 (Market Box Detail Page)

## Phase Checklist
- [x] **Phase 1**: Database migration — `20260211_001_cart_items_market_box_support.sql`
- [x] **Phase 2**: Cart API — POST/GET handlers accept market box items
- [x] **Phase 3**: Cart context + UI — useCart + CartDrawer support market box items
- [ ] **Phase 4**: Market box detail page — Subscribe → Add to Cart
- [ ] **Phase 5**: Checkout page — mixed cart display, payment method logic
- [ ] **Phase 6**: Checkout session API — handle mixed carts in Stripe session
- [ ] **Phase 7**: Payment success / webhook — process market box subscriptions after payment
- [ ] **Phase 8**: Success page — show market box confirmation

## Key Design Decisions
- **Single Stripe session** for mixed carts (listings + market boxes)
- **cart_items extended** with `item_type` discriminator, `offering_id`, `term_weeks`, `start_date`
- **One order, two record types**: regular → `order_items`, market box → `market_box_subscriptions` (linked by `order_id`)
- **Market boxes are Stripe-only** — mixed cart disables external payment
- **Existing `/api/buyer/market-boxes` endpoint** kept as fallback, removed later

## Current cart_items Schema (BEFORE migration)
| Column | Type | Nullable |
|--------|------|----------|
| id | uuid | NO (PK) |
| cart_id | uuid | NO (FK→carts) |
| listing_id | uuid | NO (FK→listings) |
| quantity | integer | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |
| market_id | uuid | YES (FK→markets) |
| schedule_id | uuid | YES (FK→market_schedules) |
| pickup_date | date | YES |

## market_box_offerings Key Columns
- `id`, `vendor_profile_id`, `vertical_id`, `name`, `description`, `image_urls`
- `price_4week_cents`, `price_8week_cents`
- `pickup_market_id`, `pickup_day_of_week`, `pickup_start_time`, `pickup_end_time`
- `max_subscribers`, `active`, `premium_window_ends_at`

## market_box_subscriptions Key Columns
- `id`, `offering_id` (FK), `buyer_user_id` (FK), `order_id` (FK→orders, nullable)
- `total_paid_cents`, `start_date`, `status`, `term_weeks`, `weeks_completed`
- `stripe_payment_intent_id`

## Files Modified So Far
- `supabase/migrations/20260211_001_cart_items_market_box_support.sql` (NEW) — Phase 1
- `src/app/api/cart/items/route.ts` — Phase 2: POST supports `type: 'market_box'`
- `src/app/api/cart/route.ts` — Phase 2: GET returns market box items with offering details
- `src/lib/hooks/useCart.tsx` — Phase 3: `addMarketBoxToCart()`, extended CartItem interface
- `src/components/cart/CartDrawer.tsx` — Phase 3: MarketBoxCartItemCard, mixed cart notice
- `src/app/[vertical]/checkout/page.tsx` — Phase 5 prep: CheckoutItem interface extended

## Commits
- (pending commit for Phases 1-3)

## Gotchas / Watch Out For
- `listing_id` on cart_items is currently NOT NULL — migration must ALTER to allow NULL
- `get_cart_summary` RPC may need updating for market box items (uses listing price_cents)
- Market box quantity is always 1, no qty selector
- DB trigger auto-creates pickup records on market_box_subscriptions INSERT
- Stripe idempotency keys must be DETERMINISTIC (never use Date.now())
