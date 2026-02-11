# Market Box Checkout Integration Plan

## Goal
Add market box offerings to the regular cart/checkout flow so buyers can shop for both individual listings and market box subscriptions in a single checkout session, rather than market boxes going directly to Stripe.

## Current State
- Market boxes bypass the cart entirely: `Subscribe → POST /api/buyer/market-boxes → Stripe URL → redirect`
- Regular listings use cart: `Add to Cart → CartDrawer → Checkout page → Stripe/external`
- Both are one-time Stripe payments (mode: 'payment') with identical fee calculations
- The `market_box_subscriptions` table already has an `order_id` FK → `orders`, confirming the architectural intent for unified checkout
- Market box pickups are auto-created by a DB trigger when a subscription is inserted

## Key Design Decisions

### 1. Single Stripe Session for Mixed Carts
Both listing items and market box items go into one Stripe checkout session. This gives buyers a single payment for everything.

### 2. Cart Stores Both Types
The `cart_items` table and `CartItem` interface get extended with a `type` discriminator. Market box cart items store `offering_id` instead of `listing_id`.

### 3. One Order, Two Record Types
A single `orders` record is created per checkout. Regular items → `order_items`. Market box items → `market_box_subscriptions` (with `order_id` linking them back).

### 4. External Payments
Market boxes are Stripe-only (per Tracy's decision in `02092026 thoughts.txt`). If a mixed cart has market box + regular items, external payment methods are disabled. If cart only has regular items, external payments remain available.

---

## Implementation Phases

### Phase 1: Database Migration
**New columns on `cart_items`:**
```sql
ALTER TABLE cart_items
  ADD COLUMN item_type TEXT NOT NULL DEFAULT 'listing'
    CHECK (item_type IN ('listing', 'market_box')),
  ADD COLUMN offering_id UUID REFERENCES market_box_offerings(id),
  ADD COLUMN term_weeks INTEGER CHECK (term_weeks IN (4, 8)),
  ADD COLUMN start_date DATE,
  ALTER COLUMN listing_id DROP NOT NULL;

-- Constraint: listing items need listing_id, market box items need offering_id
ALTER TABLE cart_items ADD CONSTRAINT cart_items_type_check
  CHECK (
    (item_type = 'listing' AND listing_id IS NOT NULL) OR
    (item_type = 'market_box' AND offering_id IS NOT NULL AND term_weeks IS NOT NULL)
  );

-- Unique constraint: one market box offering per cart (can't subscribe twice)
CREATE UNIQUE INDEX idx_cart_items_market_box_unique
  ON cart_items(cart_id, offering_id) WHERE item_type = 'market_box';
```

**RLS:** Existing cart_items policies filter by cart ownership — no changes needed since the new columns don't affect row-level access.

### Phase 2: Cart API Changes
**File: `src/app/api/cart/items/route.ts`**

Update POST handler to accept market box items:
```typescript
// Current: { listingId, quantity, marketId?, scheduleId?, pickupDate? }
// New: also accepts { type: 'market_box', offeringId, termWeeks, startDate }
```

When `type === 'market_box'`:
- Validate offering exists, is active, has capacity
- Check buyer tier (premium required for market box access)
- Check for existing active subscription to same offering
- Insert with `item_type: 'market_box'`, `offering_id`, `term_weeks`, `start_date`
- `listing_id` = null, `quantity` = 1 (always), `market_id` from offering's `pickup_market_id`

Update GET handler to return market box details alongside listing details:
- Join on `market_box_offerings` when `item_type = 'market_box'`
- Return offering name, price, term, pickup schedule info

Update DELETE handler — no changes needed (deletes by cart_item ID).

### Phase 3: Cart Context / UI Changes
**File: `src/lib/hooks/useCart.tsx`**

Extend `CartItem` interface:
```typescript
interface CartItem {
  id: string
  itemType: 'listing' | 'market_box'  // NEW
  // Listing fields (when itemType === 'listing')
  listingId?: string
  quantity: number
  title?: string
  price_cents?: number
  vendor_name?: string
  // ... existing fields ...

  // Market box fields (when itemType === 'market_box')
  offeringId?: string        // NEW
  offeringName?: string      // NEW
  termWeeks?: number         // NEW
  startDate?: string         // NEW
  termPriceCents?: number    // NEW (total for the term, e.g. $260 for 4 weeks)
  pickupDayOfWeek?: number   // NEW
  pickupStartTime?: string   // NEW
  pickupEndTime?: string     // NEW
}
```

Add `addMarketBoxToCart()` method to context:
```typescript
addMarketBoxToCart: (offeringId: string, termWeeks: number, startDate: string) => Promise<void>
```

**File: `src/components/cart/CartDrawer.tsx`**

Render market box items differently from listing items:
- Show offering name, term ("4-week subscription"), start date
- No quantity selector (always 1)
- Show pickup schedule (e.g., "Saturdays 8 AM - 12 PM")
- Show term price, not per-unit price
- Remove button still works (same as listings)

### Phase 4: Market Box Detail Page
**File: `src/app/[vertical]/market-box/[id]/MarketBoxDetailClient.tsx`**

Change `handleSubscribe()`:
- Instead of `POST /api/buyer/market-boxes` → Stripe redirect
- Call `addMarketBoxToCart(offeringId, termWeeks, startDate)` → open CartDrawer
- Button label: "Subscribe" → "Add to Cart" (or keep "Subscribe" and open cart)

Keep the term selector (4 weeks / 8 weeks) and start date picker on the detail page — these values get passed to the cart.

### Phase 5: Checkout Page Changes
**File: `src/app/[vertical]/checkout/page.tsx`**

**Payment method logic:**
- If cart contains any market box items → hide external payment options (Stripe only)
- If cart only has listings → show all available payment methods (current behavior)
- Show a note: "Market Box subscriptions require card payment"

**Display:**
- Group items by type: "Items" section and "Market Box Subscriptions" section
- Market box items show: offering name, term, start date, weekly pickup info, term price
- Listing items show: current display (title, qty, price, pickup date)

**Checkout session creation:**
- Combine all items into one Stripe session
- Line items: listings get per-unit pricing, market boxes get term pricing
- Metadata needs to encode which items are market boxes:
  ```json
  {
    "order_id": "...",
    "order_number": "...",
    "market_box_items": "[{\"offering_id\":\"...\",\"term_weeks\":4,\"start_date\":\"2026-03-01\"}]"
  }
  ```

### Phase 6: Checkout Session API
**File: `src/app/api/checkout/session/route.ts`**

Extend to handle mixed carts:
1. Separate cart items into listings vs market boxes
2. For listings: existing flow (create order_items, decrement inventory)
3. For market boxes: validate offerings, calculate term prices
4. Create single order record with combined total
5. Create order_items for listings only
6. Store market box data in session metadata (processed after payment)
7. Create single Stripe session with all line items

### Phase 7: Payment Success / Webhook Handler
**File: `src/lib/stripe/webhooks.ts` + `src/app/api/checkout/success/route.ts`**

After successful payment for a mixed checkout:
1. Process regular order_items (existing logic — update status to 'paid')
2. Check metadata for `market_box_items`
3. For each market box item:
   - Insert `market_box_subscriptions` record with `order_id`, `term_weeks`, `start_date`
   - DB trigger auto-creates pickup records
   - Verify pickups were created
4. Send appropriate notifications for both types
5. Clear cart (existing logic)

**Idempotency:** The order_id is already deterministic. Market box subscriptions get the same `stripe_payment_intent_id` uniqueness check.

### Phase 8: Success Page
**File: `src/app/[vertical]/checkout/success/page.tsx`**

Add market box section to success display:
- Show subscription confirmation alongside regular items
- Display pickup schedule (first pickup date, weekly schedule)
- Link to subscription detail page

---

## Files Modified (Estimated ~12-15)

| File | Phase | Changes |
|------|-------|---------|
| New migration SQL | 1 | Add columns to cart_items |
| `src/app/api/cart/items/route.ts` | 2 | Handle market box add/get/delete |
| `src/lib/hooks/useCart.tsx` | 3 | Extend CartItem, add addMarketBoxToCart |
| `src/components/cart/CartDrawer.tsx` | 3 | Render market box cart items |
| `src/app/[vertical]/market-box/[id]/MarketBoxDetailClient.tsx` | 4 | Subscribe → Add to Cart |
| `src/app/[vertical]/checkout/page.tsx` | 5 | Mixed cart display, payment method logic |
| `src/app/api/checkout/session/route.ts` | 6 | Handle mixed cart in Stripe session |
| `src/app/api/checkout/success/route.ts` | 7 | Process market box subscriptions |
| `src/lib/stripe/webhooks.ts` | 7 | Handle mixed checkout completion |
| `src/lib/stripe/payments.ts` | 6 | Extend createCheckoutSession for mixed items |
| `src/app/[vertical]/checkout/success/page.tsx` | 8 | Show market box in success |
| `supabase/SCHEMA_SNAPSHOT.md` | 1 | Update with new columns |

## Edge Cases to Handle

1. **Cart with only market box items** — no regular items. Checkout should still work (Stripe only).
2. **Premium tier check** — market boxes require premium buyer tier. If non-premium buyer has a market box in cart, show upgrade prompt at checkout.
3. **Capacity limits** — if offering fills up between add-to-cart and checkout, show error at checkout time (not silently fail).
4. **Start date validation** — the start date selected on the detail page must still be valid at checkout time (not in the past).
5. **Existing subscription** — prevent duplicate subscriptions to the same offering (enforced by unique index on cart + validation at checkout).
6. **External payment + market box** — if buyer removes the market box from cart at checkout, re-enable external payment options dynamically.
7. **Cart persistence** — market box cart items persist in DB like regular items. If offering is deactivated between add-to-cart and checkout, show warning.

## What Does NOT Change

- Market box offering creation (vendor side) — unchanged
- Market box pickup management (vendor side) — unchanged
- Market box subscription detail page (buyer side) — unchanged
- Pickup confirmation flow — unchanged
- Fee structure — identical `calculateBuyerPrice()` for both types
- Existing `/api/buyer/market-boxes` subscribe endpoint — keep as fallback/deprecated, remove later

## Estimated Effort
This is a 2-3 session feature. Phases 1-4 (cart foundation) could be one session. Phases 5-8 (checkout integration) would be the second session. Testing and edge case cleanup in a third.

## Prerequisites
- Migration must be applied to Dev + Staging before Phase 2 code runs
- No other cart_items schema changes should be in flight
