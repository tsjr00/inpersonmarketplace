# Alternative Payment Methods Spec

## Overview

Allow buyers to pay vendors directly via Venmo, Cash App, or PayPal using deep links, in addition to existing Stripe checkout. This supports vendors whose customers already use these apps.

**Key constraint:** These payment methods are for **single-vendor orders only** (multi-vendor carts must use Stripe).

---

## 1. Database Changes

### 1.1 New Columns on `vendor_profiles`

```sql
-- Migration: 20260131_add_vendor_payment_methods.sql

ALTER TABLE vendor_profiles
ADD COLUMN venmo_username TEXT,
ADD COLUMN cashapp_cashtag TEXT,
ADD COLUMN paypal_username TEXT,
ADD COLUMN accepts_cash_at_pickup BOOLEAN DEFAULT false;

COMMENT ON COLUMN vendor_profiles.venmo_username IS 'Venmo username for deep link payments (without @)';
COMMENT ON COLUMN vendor_profiles.cashapp_cashtag IS 'Cash App $cashtag (without $)';
COMMENT ON COLUMN vendor_profiles.paypal_username IS 'PayPal.me username';
COMMENT ON COLUMN vendor_profiles.accepts_cash_at_pickup IS 'Whether vendor accepts cash payment at pickup';
```

### 1.2 New Enum Value for Payment Method

```sql
-- Add payment method tracking to orders table
CREATE TYPE payment_method AS ENUM (
  'stripe',
  'venmo',
  'cashapp',
  'paypal',
  'cash'
);

ALTER TABLE orders
ADD COLUMN payment_method payment_method DEFAULT 'stripe',
ADD COLUMN external_payment_confirmed_at TIMESTAMPTZ,
ADD COLUMN external_payment_confirmed_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN orders.payment_method IS 'How the buyer paid for this order';
COMMENT ON COLUMN orders.external_payment_confirmed_at IS 'When vendor confirmed external payment received';
COMMENT ON COLUMN orders.external_payment_confirmed_by IS 'User who confirmed (vendor or buyer for cash)';
```

### 1.3 Platform Fee Tracking for External Payments

```sql
-- Track platform fees owed from external payment orders
CREATE TABLE vendor_fee_balance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  last_invoice_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_profile_id)
);

CREATE TABLE vendor_fee_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  amount_cents INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendor_fee_balance IS 'Running balance of platform fees owed by vendor';
COMMENT ON TABLE vendor_fee_ledger IS 'Ledger of fee transactions (debits from orders, credits from payments)';
```

---

## 2. Vendor Settings UI

### 2.1 New Section in Vendor Dashboard Settings

Location: `/{vertical}/vendor/dashboard` → Settings or new "Payment Methods" tab

**UI Fields:**

```
Payment Methods You Accept
─────────────────────────────────────────────

□ Credit/Debit Card (Stripe)
  [Already connected via Stripe Connect]

□ Venmo
  Username: [________________] @

□ Cash App
  $Cashtag: [________________] $

□ PayPal
  PayPal.me: [________________]

□ Cash at Pickup
  ⚠️ You'll need to handle change

─────────────────────────────────────────────
Note: External payments (Venmo, Cash App, PayPal, Cash)
incur a 3% platform fee invoiced weekly.
```

### 2.2 Validation Rules

- Venmo username: alphanumeric, dashes, underscores (strip leading @)
- Cash App: alphanumeric only (strip leading $)
- PayPal: alphanumeric only
- **Stripe must be connected** to enable any external payment method
- If vendor has unpaid fee balance > $50 or > 40 days old, disable external payments until paid

---

## 3. Checkout Flow Changes

### 3.1 Payment Method Selection

After cart review, before payment:

```
How would you like to pay?
─────────────────────────────────────────────

● Credit/Debit Card                    [Continue]
  Secure checkout via Stripe

○ Venmo                                [Pay $25.00]
  Opens Venmo app

○ Cash App                             [Pay $25.00]
  Opens Cash App

○ PayPal                               [Pay $25.00]
  Opens PayPal

○ Cash at Pickup                       [Place Order]
  Pay when you pick up

─────────────────────────────────────────────
```

**Rules:**
- Only show options the vendor has configured
- For multi-vendor carts: Only show "Credit/Debit Card" (Stripe)
- Show vendor name if clarification needed

### 3.2 Deep Link Generation

```typescript
// lib/payments/external-links.ts

export function generateVenmoLink(
  vendorUsername: string,
  amount: number,
  orderId: string
): string {
  const note = encodeURIComponent(`Order ${orderId}`)
  return `https://venmo.com/${vendorUsername}?txn=pay&amount=${amount.toFixed(2)}&note=${note}`
}

export function generateCashAppLink(
  cashtag: string,
  amount: number
): string {
  // Cash App doesn't support notes in URL
  return `https://cash.app/$${cashtag}/${amount.toFixed(2)}`
}

export function generatePayPalLink(
  username: string,
  amount: number
): string {
  return `https://paypal.me/${username}/${amount.toFixed(2)}USD`
}
```

### 3.3 External Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Buyer selects "Pay with Venmo"                               │
│                                                                 │
│ 2. Create order with:                                           │
│    - status: 'pending'                                          │
│    - payment_method: 'venmo'                                    │
│                                                                 │
│ 3. Show confirmation page with:                                 │
│    - "Complete Payment" button (deep link)                      │
│    - Order details                                              │
│    - "I've completed payment" button                            │
│                                                                 │
│ 4. Buyer taps "Complete Payment"                                │
│    → Opens Venmo app with amount pre-filled                     │
│    → Buyer confirms in Venmo                                    │
│    → Returns to browser                                         │
│                                                                 │
│ 5. Buyer taps "I've completed payment"                          │
│    → Order status: 'pending' (awaiting vendor confirmation)     │
│    → Vendor notified                                            │
│                                                                 │
│ 6. Vendor confirms payment received                             │
│    → Order status: 'paid'                                       │
│    → external_payment_confirmed_at set                          │
│    → Platform fee added to vendor_fee_balance                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Cash at Pickup Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Buyer selects "Cash at Pickup"                               │
│                                                                 │
│ 2. Create order with:                                           │
│    - status: 'pending'                                          │
│    - payment_method: 'cash'                                     │
│                                                                 │
│ 3. Show order confirmation:                                     │
│    - "Bring $25.00 cash to pickup"                              │
│    - Pickup details                                             │
│                                                                 │
│ 4. At pickup, vendor confirms cash received                     │
│    → Uses existing fulfill flow                                 │
│    → Platform fee added to vendor_fee_balance                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. API Changes

### 4.1 New Endpoint: Create External Payment Order

```
POST /api/checkout/external
```

**Request:**
```json
{
  "payment_method": "venmo",
  "vertical_id": "farmers_market"
}
```

**Response:**
```json
{
  "order_id": "uuid",
  "order_number": "FM-2026-00042",
  "payment_link": "https://venmo.com/BreadCellar?txn=pay&amount=26.78&note=Order+FM-2026-00042",
  "subtotal_cents": 2500,
  "buyer_fee_cents": 178,
  "total_cents": 2678,
  "vendor_name": "Bread Cellar"
}
```

**Logic:**
1. Validate cart has items
2. Validate single vendor (reject multi-vendor)
3. Validate vendor accepts this payment method
4. Calculate buyer fee (6.5% + $0.15)
5. Create order with `payment_method` set, include buyer fee in total
6. Generate deep link with total amount (subtotal + buyer fee)
7. Return order + link

**Note:** The deep link amount includes the buyer fee. Buyer pays vendor $26.78 via Venmo. Vendor owes platform $2.66 (buyer fee $1.78 + seller fee $0.88), invoiced weekly.

### 4.2 New Endpoint: Confirm External Payment

```
POST /api/vendor/orders/{id}/confirm-external-payment
```

**Request:**
```json
{
  "confirmed": true
}
```

**Logic:**
1. Verify caller is vendor for this order
2. Verify order.payment_method is external (not stripe)
3. Set `external_payment_confirmed_at`
4. Update order status to 'paid'
5. Add platform fee to `vendor_fee_balance`
6. Clear buyer's cart

### 4.3 Update: Vendor Profile API

```
PATCH /api/vendor/profile
```

Add fields:
```json
{
  "venmo_username": "BreadCellar",
  "cashapp_cashtag": "BreadCellar",
  "paypal_username": "BreadCellar",
  "accepts_cash_at_pickup": true
}
```

**Validation:** Reject if vendor doesn't have Stripe connected.

### 4.4 New Endpoint: Get Fee Balance

```
GET /api/vendor/fees
```

**Response:**
```json
{
  "balance_cents": 842,
  "oldest_unpaid_at": "2026-01-15T10:30:00Z",
  "requires_payment": false,
  "ledger": [
    { "date": "2026-01-28", "order_number": "FM-2026-00042", "amount_cents": 266, "type": "debit" },
    { "date": "2026-01-30", "order_number": "FM-2026-00045", "amount_cents": -150, "type": "credit", "note": "Auto-deducted from Stripe order" }
  ]
}
```

### 4.5 New Endpoint: Pay Fee Balance

```
POST /api/vendor/fees/pay
```

**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx..."
}
```

Creates a Stripe Checkout session for the vendor to pay their balance. On success, webhook credits the `vendor_fee_ledger`.

---

## 5. Vendor Dashboard Changes

### 5.1 Orders List - Payment Method Badge

Show payment method on each order:

```
Order #FM-2026-00042          [Venmo] [Awaiting Payment]
Sourdough Loaf × 1
$12.50
─────────────────────────────────────────────
[Confirm Payment Received]  [Cancel Order]
```

### 5.2 Pending External Payments Alert

At top of dashboard when there are unconfirmed external payment orders:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ 2 orders awaiting payment confirmation                       │
│    Check your Venmo/Cash App and confirm when payment received  │
│                                               [View Orders →]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Platform Fee Collection

### 6.1 Fee Structure

**Stripe Payments (existing):**
- Buyer pays: 6.5% + $0.15 → collected by Stripe, platform keeps it
- Seller pays: Platform fee → deducted from Stripe payout
- Stripe takes: ~2.9% + $0.30

**External Payments (Venmo, Cash App, PayPal, Cash):**

Since buyer pays vendor directly, vendor receives the FULL amount (including buyer fee), then owes platform:

| On $25.00 order | Amount |
|-----------------|--------|
| Buyer fee (6.5% + $0.15) | $1.78 |
| Seller fee (3.5%) | $0.88 |
| **Total vendor owes platform** | **$2.66** |

The vendor collects $26.78 from buyer, keeps $24.12, owes platform $2.66.

This matches the Stripe flow economically - same buyer fee, similar seller fee (3.5% vs Stripe processing).

### 6.2 Fee Collection Rules

**Requirement:** Vendor must have Stripe connected to enable external payment methods. This ensures we always have a way to collect fees.

**Auto-deduction from Stripe transactions:**
- Track `vendor_fee_balance` (running total owed)
- On each Stripe transaction, add owed balance to `application_fee_amount`
- Cap deduction at 50% of that transaction's vendor payout (never take more than half)
- Remaining balance carries forward to next transaction

**Example:**
```
Vendor owes $12.00 from external orders
New Stripe order: $30 subtotal, normal fee $3.50, vendor payout $26.50
Max we can add: 50% of $26.50 = $13.25
We charge: $3.50 + $12.00 = $15.50 (under cap)
Vendor receives: $14.50
Balance cleared: $0
```

**Invoicing triggers (if auto-deduct not clearing balance):**
- Balance exceeds $50, OR
- Oldest unpaid fee > 40 days

**Invoice payment:** Vendor can pay balance via simple Stripe Checkout link from their dashboard.

### 6.3 Vendor Dashboard - Fee Balance

Show current balance and payment option:

```
┌─────────────────────────────────────────────────────────────────┐
│ Platform Fees                                                   │
│                                                                 │
│ Current balance: $8.42                                          │
│ (Auto-deducted from your next Stripe sale)                      │
│                                                                 │
│ Prefer to pay now?  [Pay $8.42]                                │
└─────────────────────────────────────────────────────────────────┘
```

When balance exceeds threshold:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ Platform Fees Due                                            │
│                                                                 │
│ Current balance: $52.18                                         │
│ Please pay to continue accepting external payments.             │
│                                                                 │
│                                          [Pay $52.18]           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Order Status Display

### 7.1 Buyer Order Page

For external payment orders:

```
Order #FM-2026-00042
Status: Awaiting Payment Confirmation

You paid via Venmo. The vendor will confirm
receipt and your order will be ready for pickup.

[Pay Again if Needed]  ← Re-opens deep link
```

### 7.2 Status Flow

```
                    ┌─────────────────┐
                    │    pending      │
                    │ (order created) │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     Stripe checkout              External payment
              │                             │
              ▼                             ▼
    ┌─────────────────┐          ┌─────────────────┐
    │      paid       │          │    pending      │
    │ (auto on hook)  │          │ (awaiting conf) │
    └────────┬────────┘          └────────┬────────┘
              │                             │
              │                   Vendor confirms
              │                             │
              │                             ▼
              │                  ┌─────────────────┐
              │                  │      paid       │
              │                  │ (manual conf)   │
              │                  └────────┬────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   confirmed     │
                    │ (vendor accept) │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     ready       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   completed     │
                    └─────────────────┘
```

---

## 8. Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260131_add_vendor_payment_methods.sql` | Database changes |
| `src/lib/payments/external-links.ts` | Deep link generation |
| `src/lib/payments/vendor-fees.ts` | Fee calculation and auto-deduction logic |
| `src/app/api/checkout/external/route.ts` | Create external payment order |
| `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts` | Vendor confirms payment |
| `src/app/api/vendor/fees/route.ts` | GET fee balance |
| `src/app/api/vendor/fees/pay/route.ts` | Create Stripe checkout for fee payment |
| `src/app/[vertical]/checkout/external/page.tsx` | External payment confirmation page |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/api/vendor/profile/route.ts` | Add payment method fields, require Stripe |
| `src/app/api/checkout/session/route.ts` | Add fee auto-deduction to application_fee |
| `src/app/[vertical]/vendor/dashboard/page.tsx` | Payment settings section, fee balance display |
| `src/app/[vertical]/checkout/page.tsx` | Payment method selection |
| `src/app/[vertical]/vendor/orders/page.tsx` | Payment method badge, confirm button |
| `src/app/[vertical]/buyer/orders/page.tsx` | External payment status display |
| `src/lib/stripe/payments.ts` | Add fee deduction logic to checkout |

---

## 9. Implementation Order

1. **Database migration** - Add columns and tables
2. **Vendor settings UI** - Let vendors enter payment usernames
3. **Deep link utility** - Generate payment URLs
4. **Checkout flow** - Payment method selection + external order creation
5. **External payment page** - Show deep link, "I've paid" button
6. **Vendor confirmation** - Confirm payment received API + UI
7. **Fee tracking** - Record fees owed for external payments
8. **Testing** - Full flow with real Venmo/Cash App

---

## 10. Security Considerations

1. **No payment verification** - We cannot verify external payments actually happened. Vendor must confirm manually. This is acceptable because:
   - Local pickup = buyer and vendor meet in person
   - Vendor can refuse to hand over items if not paid
   - Low fraud risk for this use case

2. **Rate limiting** - Limit order creation to prevent spam

3. **Vendor liability** - Terms of service should clarify vendor is responsible for verifying payment before fulfilling

4. **Fee collection** - If vendor doesn't pay fees, disable their external payment options (not their Stripe)

---

## 11. Future Enhancements

- **QR code display** - For desktop users, show QR encoding the deep link
- **Payment reminders** - Notify buyer if order pending > 30 min
- **Auto-cancel** - Cancel unpaid external orders after 24 hours
- **Email notifications** - Notify vendor when approaching fee threshold
