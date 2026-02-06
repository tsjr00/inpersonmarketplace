# Current Task: Unified Pricing Module Complete
Started: 2026-02-05
Last Updated: 2026-02-06 (Session 5)

## COMPLETED: Unified Pricing System

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

- [ ] Test the service fee display after latest deploy
- [ ] Checkout success screen - add feedback/review capture
- [ ] End-to-end testing

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
