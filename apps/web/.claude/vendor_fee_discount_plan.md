# Vendor Fee Discount System — Approved Design
Created: 2026-04-07 (Session 68)
Status: Ready to build

## Business Purpose

Allow selective reduction of vendor platform fees on a per-vendor basis for grant recipients, partners, and promotional relationships. The discount is code-verified and admin-approved. The platform never loses money — the floor covers Stripe processing costs.

## How It Works

1. Vendor enters a partner/grant code on their settings page
2. Admin sees the code on the vendor management page, verifies legitimacy
3. Admin sets the actual vendor fee rate (between 3.6% and 6.5%)
4. The reduced fee applies to all future orders for that vendor

## Financial Model

**Standard (no discount) — $10 item:**
| Who | What | Amount |
|-----|------|--------|
| Buyer pays | $10.00 + 6.5% + $0.15 | $10.80 |
| Vendor receives | $10.00 - 6.5% - $0.15 | $9.20 |
| Platform collects | $0.65 + $0.15 + $0.65 + $0.15 | $1.60 |
| Stripe takes | ~2.9% of $10.80 + $0.30 | $0.61 |
| Platform net profit | | $0.99 |

**Max discount (3.6%) — $10 item:**
| Who | What | Amount |
|-----|------|--------|
| Buyer pays | unchanged | $10.80 |
| Vendor receives | $10.00 - 3.6% - $0.15 | $9.49 |
| Platform collects | $0.65 + $0.15 + $0.36 + $0.15 | $1.31 |
| Stripe takes | unchanged | $0.61 |
| Platform net profit | | $0.70 |

## Rules

1. **Buyer fees NEVER change** — 6.5% + $0.15, always
2. **Display prices NEVER change** — buyer sees the same price
3. **Vendor flat fee ($0.15) NEVER changes** — covers half of Stripe's $0.30
4. **Only the vendor percentage fee changes** — from 6.5% down to floor of 3.6%
5. **Floor is 3.6%** — at this rate, the vendor's percentage covers Stripe's ~2.9% processing fee plus a small buffer. Combined with the $0.15 flat (covering Stripe's $0.30 half), the vendor side fully covers Stripe costs. Platform makes $0 profit on vendor side.
6. **Buyer-side fees alone are platform profit** at max discount

## Why the floor is 3.6%

- Stripe charges ~2.9% of the total charge + $0.30 per transaction
- The $0.30 is covered by $0.15 buyer flat + $0.15 vendor flat
- The ~2.9% of total charge needs to come from somewhere
- At 3.6% vendor fee on base price, the vendor covers the Stripe percentage
- The buyer's 6.5% is pure platform revenue at this level

## Database Changes (Migration)

```sql
ALTER TABLE vendor_profiles
  ADD COLUMN vendor_fee_override_percent NUMERIC,
  ADD COLUMN fee_discount_code TEXT,
  ADD COLUMN fee_discount_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN fee_discount_approved_at TIMESTAMPTZ;

-- Floor constraint: if set, must be >= 3.6
ALTER TABLE vendor_profiles
  ADD CONSTRAINT ck_vendor_fee_override_floor
  CHECK (vendor_fee_override_percent IS NULL OR 
         (vendor_fee_override_percent >= 3.6 AND vendor_fee_override_percent <= 6.5));
```

- `vendor_fee_override_percent` — NULL = standard 6.5%. When set, this IS the vendor fee rate (not a discount amount).
- `fee_discount_code` — free text entered by vendor. Admin reads it to verify source.
- `fee_discount_approved_by` — which admin approved the discount
- `fee_discount_approved_at` — when it was approved

## Code Changes

### 1. pricing.ts (CRITICAL PATH — vault check required)
Add function:
```typescript
export function getEffectiveVendorFeePercent(overridePercent: number | null): number {
  if (overridePercent === null || overridePercent === undefined) return FEES.vendorFeePercent // 6.5
  return Math.max(VENDOR_FEE_FLOOR, Math.min(overridePercent, FEES.vendorFeePercent))
}

export const VENDOR_FEE_FLOOR = 3.6 // Covers Stripe processing — no platform profit below this
```

### 2. Checkout route (CRITICAL PATH)
When calculating `vendor_payout_cents`, look up vendor's `vendor_fee_override_percent` and use `getEffectiveVendorFeePercent()` instead of the constant `FEES.vendorFeePercent`.

### 3. Vendor settings page
Add "Partner/Grant Code" text input field. Saves to `fee_discount_code`.

### 4. Admin vendor management page
Show the code (if present) with indicator. Add dropdown/input for `vendor_fee_override_percent` (3.6% to 6.5%). Save with `fee_discount_approved_by` and `fee_discount_approved_at`.

### 5. Settlement/reports
Already reads `vendor_payout_cents` and `platform_fee_cents` from order items — no changes needed. The reduced fee is baked into the order at checkout time.

### 6. Fulfill/payout route
Already uses stored `vendor_payout_cents` — no changes needed.

## What Does NOT Change

- `FEES.vendorFeePercent` constant (6.5%) — stays as the default
- `FEES.buyerFeePercent` constant (6.5%) — never touched
- `FEES.vendorFlatFeeCents` ($0.15) — never touched
- `FEES.buyerFlatFeeCents` ($0.15) — never touched
- Stripe checkout session creation — buyer pays the same
- Display price calculations — unchanged
- Fulfillment route — uses stored values
- Settlement report — reads stored values

## Testing Strategy

1. **Business rule test:** verify `getEffectiveVendorFeePercent()` clamps correctly (null→6.5, 5.0→5.0, 2.0→3.6, 7.0→6.5)
2. **Cross-file test:** verify checkout reads `vendor_fee_override_percent` from vendor profile and uses it in payout calculation
3. **Flow integrity test:** verify the override flows from DB → checkout → order_items.vendor_payout_cents → settlement
