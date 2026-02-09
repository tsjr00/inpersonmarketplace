# Fee Structure

Complete breakdown of all platform fees, how they're calculated, and when they're collected.

---

## Stripe Orders (Primary Payment Method)

### What the Buyer Pays

| Component | Rate | Example ($100 order) |
|---|---|---|
| Subtotal | Item prices | $100.00 |
| Buyer fee | 6.5% of subtotal | $6.50 |
| Flat fee | $0.15 per order | $0.15 |
| **Buyer total** | | **$106.65** |

The flat fee is applied once per order, not per item. Individual item prices on browse pages show the 6.5% markup only — the $0.15 is added at checkout.

### What the Vendor Receives

| Component | Rate | Example ($100 order) |
|---|---|---|
| Subtotal | Item prices | $100.00 |
| Vendor fee | −6.5% of subtotal | −$6.50 |
| Flat fee | −$0.15 per order | −$0.15 |
| **Vendor payout** | | **$93.35** |

Payout is transferred to the vendor's connected Stripe account after both buyer and vendor confirm the pickup handoff.

### Platform Revenue (Stripe Orders)

| Source | Rate | Example ($100 order) |
|---|---|---|
| Buyer fee | 6.5% + $0.15 | $6.65 |
| Vendor fee | 6.5% + $0.15 | $6.65 |
| **Platform total** | **13% + $0.30** | **$13.30** |

Stripe's processing fee (~2.9% + $0.30) is deducted separately by Stripe from the platform's account — it is not part of the 13% platform fee.

---

## External Payment Orders (Venmo, Cash App, PayPal, Cash)

For orders where the buyer pays the vendor directly outside Stripe.

### What the Buyer Pays

| Component | Rate | Example ($100 order) |
|---|---|---|
| Subtotal | Item prices | $100.00 |
| Buyer fee | 6.5% of subtotal | $6.50 |
| Flat fee | None | $0.00 |
| **Buyer total** | | **$106.50** |

No flat fee on external payments.

### What the Vendor Receives

The vendor receives the full buyer total directly (via Venmo/Cash/etc). The platform fee is tracked separately.

| Component | Rate | Example ($100 order) |
|---|---|---|
| Vendor receives | Full buyer total | $106.50 |
| Platform fee owed | 6.5% (buyer) + 3.5% (vendor) = 10% | $10.00 |

### How External Fees Are Collected

The 10% platform fee is tracked in the vendor's fee ledger and settled through one of two mechanisms:

1. **Auto-deduction from Stripe payouts** — When the vendor completes a Stripe order, up to 50% of their payout can be withheld to cover outstanding external payment fees.
2. **Invoice** — If the balance reaches $50 or is older than 40 days, the vendor must pay before using external payment methods again.

---

## Market Box Orders (Prepaid Multi-Week)

Market boxes use the same fee structure as Stripe orders, applied to the offering price.

| Component | Rate | Example ($50 box) |
|---|---|---|
| Offering price | 4-week or 8-week price | $50.00 |
| Buyer fee | 6.5% of price | $3.25 |
| Flat fee | $0.15 | $0.15 |
| **Buyer total** | | **$53.40** |

The `total_paid_cents` stored on the subscription already includes the buyer fee — it is never recalculated.

---

## Minimum Order

$10.00 subtotal minimum (before fees). Orders below this threshold are blocked at checkout.

---

## Tier-Based Fee Differences

There are **no fee discounts** based on vendor or buyer tier. All vendors pay the same percentage regardless of subscription level. Premium tiers unlock features (more listings, market box capacity, analytics) but do not reduce transaction fees.

---

## Source of Truth

All fee constants are defined in two files:

- **`src/lib/pricing.ts`** — Primary. Used for Stripe order calculations, display prices, and checkout.
- **`src/lib/payments/vendor-fees.ts`** — External payment fee calculations, fee ledger management, auto-deduction logic.

Never hardcode fee percentages elsewhere. Always import from these modules.

---

## Fee Flow Summary

```
STRIPE ORDER:
  Buyer pays → Stripe holds funds → Mutual pickup confirmation → Platform takes 13%+$0.30 → Vendor receives 87%-$0.30

EXTERNAL ORDER:
  Buyer pays vendor directly → Platform records 10% fee → Fee settled via auto-deduction or invoice

MARKET BOX:
  Buyer pays at purchase → Stripe holds funds → Weekly pickups confirmed → Vendor receives payout
```
