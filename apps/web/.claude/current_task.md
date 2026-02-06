# Current Task: Inventory Management Complete
Started: 2026-02-05
Last Updated: 2026-02-06 (Session 6)

## COMPLETED: Full Inventory Management System

### What Was Built (Session 6)

1. **Inventory Decrement** - `checkout/success/route.ts`
2. **Vendor Notifications** - Out of stock + low stock alerts
3. **Stock Status Badges** - Vendor listings page
4. **Dashboard Warning** - Low/out of stock banner

---

## COMPLETED: Inventory Decrement on Purchase

### The Problem We Solved
Inventory count was NOT being decremented when items were purchased. A listing with quantity=10 would still show 10 after 5 were sold.

### The Solution: `src/app/api/checkout/success/route.ts`

Added idempotent inventory decrement after payment confirmation:

```typescript
// Inside the `!existingPayment` block (only runs once per order)

// Get order items and group by listing_id
const quantityByListing = new Map<string, number>()
for (const item of orderItems) {
  const current = quantityByListing.get(item.listing_id) || 0
  quantityByListing.set(item.listing_id, current + item.quantity)
}

// Decrement each listing (skip if quantity is null = unlimited)
for (const [listingId, quantityPurchased] of quantityByListing) {
  const { data: listing } = await serviceClient.from('listings').select('quantity').eq('id', listingId).single()
  if (listing && listing.quantity !== null) {
    const newQuantity = Math.max(0, listing.quantity - quantityPurchased)
    await serviceClient.from('listings').update({ quantity: newQuantity }).eq('id', listingId)
  }
}
```

### Key Design Decisions

1. **Where**: In `checkout/success/route.ts` after payment confirmation, not during order creation
2. **Idempotent**: Only decrements when `!existingPayment` (first processing)
3. **Null = Unlimited**: If `listing.quantity` is null, don't decrement (unlimited stock)
4. **Floor at 0**: `Math.max(0, ...)` prevents negative inventory
5. **Service Client**: Uses service client to bypass RLS (buyer can't update listings)

### Existing Inventory Checks (already working)

- `cart/add/route.ts:28` - Blocks add if `listing.quantity < quantity`
- `cart/validate/route.ts:201-202` - Uses `null ? 999 : quantity` for availability
- `checkout/page.tsx:697-709` - Disables + button at max quantity

---

## COMPLETED: Vendor Stock Notifications

### In-App Notifications (checkout/success/route.ts)

When inventory is updated after purchase, vendor receives notification:

| Condition | Notification Type | Message |
|-----------|------------------|---------|
| quantity = 0 | `inventory_out_of_stock` | "X is now out of stock. Update your listing..." |
| quantity <= 5 (crossed threshold) | `inventory_low_stock` | "X has only N left in stock." |

### Visual Stock Badges (vendor/listings/page.tsx)

| Condition | Badge |
|-----------|-------|
| quantity = 0 | **OUT OF STOCK** (red) |
| quantity <= 5 | **LOW STOCK (N)** (orange) |
| quantity > 5 or null | No badge |

### Dashboard Warning Banner (vendor/dashboard/page.tsx)

Shows if any listings are low or out of stock:
- Red banner for out of stock: "Buyers cannot order out-of-stock items"
- Orange banner for low stock: "Consider restocking soon"
- "Update Inventory" button links to listings page

---

## COMPLETED: Unified Pricing System (Session 5)

### The Problem We Solved
Prices were inconsistent across screens because flat fee ($0.15) was applied per-item instead of per-order in some places.

### The Solution: `src/lib/pricing.ts`

Single source of truth for all pricing:

```typescript
// Fee configuration
FEES = {
  buyerFeePercent: 6.5,
  vendorFeePercent: 6.5,
  buyerFlatFeeCents: 15,    // $0.15 service fee
  vendorFlatFeeCents: 15,
  minimumOrderCents: 1000,  // $10 minimum
}

// For ORDER TOTALS (includes flat fee once)
calculateBuyerPrice(subtotalCents) → total buyer pays

// For INDIVIDUAL ITEM display (percentage only, no flat fee)
calculateItemDisplayPrice(baseCents) → item display price

// For complete order breakdown
calculateOrderPricing(items) → { subtotalCents, buyerTotalCents, vendorPayoutCents, ... }
```

### How Prices Display Now

| Screen | Item Price | Shows Service Fee? | Total |
|--------|------------|-------------------|-------|
| Browse | $8.52 | No | - |
| Cart | $8.52 | No (in header) | $17.19 |
| Checkout | $8.52 | Yes ($0.15 line) | $17.19 |
| Stripe | $8.52 × 2 | Yes ($0.15 line) | $17.19 |
| Success | - | - | $17.19 |
| Orders List | $8.52 | Yes ($0.15 line) | $17.19 |

### Key Files

- `src/lib/pricing.ts` - THE source of truth
- `src/lib/constants.ts` - Re-exports for backwards compatibility
- `src/app/api/checkout/session/route.ts` - Uses calculateOrderPricing
- `src/app/api/checkout/success/route.ts` - Uses serviceClient for payment insert
- UI components import from constants.ts (which re-exports from pricing.ts)

### Other Fixes This Session

1. **Payment record not created** - Fixed by using serviceClient (buyers don't have RLS insert on payments)
2. **RLS error on success screen** - Same fix as above
3. **Cart flash** - Fixed (was related to pricing recalculation)

## What's Remaining

- [x] ~~Inventory decrement on purchase~~ (DONE - Session 6)
- [x] ~~Market box pricing fix~~ (DONE - Session 6)
- [ ] Test inventory decrement after deploy
- [ ] Test market box pricing after deploy
- [ ] Low inventory vendor notification (optional enhancement)
- [ ] Vendor dashboard - show low/out of stock badges (optional)
- [ ] Checkout success screen - add feedback/review capture
- [ ] End-to-end testing

## COMPLETED: Market Box Pricing Fix (Session 6)

### Problem
- Detail screen: $79.88 (base $75 + 6.5%)
- Stripe checkout: $75.00 (base only, missing fee)

### Solution
In `src/app/api/buyer/market-boxes/route.ts`:
```typescript
import { calculateBuyerPrice } from '@/lib/pricing'
// ...
const buyerTotalCents = calculateBuyerPrice(priceCents)
// Pass buyerTotalCents to createMarketBoxCheckoutSession
```

### Additional question (for later)
Should market boxes be addable to cart with other items? Currently skips cart entirely.

## Commits This Session

1. `24a271b` - Fix cart/checkout display totals
2. `3c0bf57` - Add unified pricing module
3. `d377275` - Show service fee as separate line in Stripe
4. `c690edb` - Fix empty description error
5. `98e647a` - Separate item display price from order total
6. `f3b88b2` - Add service fee breakdown to checkout and orders

## Key Context for Next Session

- `calculateDisplayPrice` = `calculateItemDisplayPrice` (percentage only, for items)
- `calculateBuyerPrice` = percentage + flat fee (for order totals)
- Service fee shows as separate $0.15 line in: checkout summary, Stripe, orders list
- Stripe line items: item prices (6.5% included) + "Service Fee" line
