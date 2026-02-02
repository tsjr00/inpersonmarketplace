# Business Rules Reference

This document captures key business rules that must be followed across the application. Reference this before making changes to pricing, checkout, or payment-related features.

---

## Pricing & Fees

### Rule: Fees Are Built Into Prices - Never Show Fee Breakdowns

**CRITICAL**: All prices shown to buyers include any platform fees. We never display:
- Subtotal + service fee
- Platform fee line items
- Fee percentages
- Fee breakdowns of any kind

**What buyers see**: Just the total price (e.g., "$10.65")

**What happens behind the scenes**: The platform calculates and tracks fees internally for vendor payouts and invoicing, but these are never exposed to buyers.

### Fee Structure (Internal Reference Only)

These are for internal tracking/vendor invoicing - never display to buyers:

| Payment Method | Buyer Fee | Seller Fee |
|---------------|-----------|------------|
| Stripe (Card) | 6.5% + $0.15 | 0% |
| External (Venmo, Cash App, PayPal, Cash) | 6.5% flat | 3.5% (invoiced later) |

---

## Checkout Flow

### External Payment Page Is NOT a Success Page

The external checkout page (`/[vertical]/checkout/external`) is a **"complete your payment"** screen, not a confirmation/success page.

**Purpose**: Direct the buyer to pay the vendor via their chosen method (Venmo, Cash App, PayPal, or Cash).

**What to show**:
- Order number
- Total amount to pay
- Vendor name
- Payment button/link (for app-based methods)
- Instructions for completing payment

**What NOT to show**:
- "View My Orders" button
- "Continue Shopping" link
- Success messaging (except for Cash orders which are immediately placed)
- Fee breakdowns

**After payment**: The vendor confirms receipt and updates order status. Buyer can check order status from their orders page when ready.

---

## Data Structure Notes

### Vendor Profile Data

Business names are stored in `profile_data` JSONB column, not as direct columns:

```typescript
// CORRECT
const vendorName = profile_data?.business_name || profile_data?.farm_name || 'Vendor'

// WRONG - these columns don't exist
const vendorName = vendor.business_name // ERROR
```

### Platform Settings

The `platform_settings.value` column is TEXT, not JSONB:

```sql
-- CORRECT
value::INTEGER

-- WRONG - will throw "operator does not exist: text ->> unknown"
value->>'hours'
```

---

## UI Patterns

### When to Show Loading States

- Always show loading indicator during async operations
- Disable buttons during form submissions
- Show skeleton loaders for data that takes time to fetch

### Error Messages

- Use user-friendly error messages, not error codes
- Log detailed errors to error tracking, show simple messages to users

---

## Payment Methods

### External Payment Methods Require Stripe

Vendors must have Stripe connected before they can enable external payment methods (Venmo, Cash App, PayPal, Cash). This ensures the platform can auto-deduct seller fees from their card sales.

### Single-Vendor Limitation

External payment methods only work for single-vendor carts. If a buyer has items from multiple vendors, they must use card payment (Stripe) which handles split payments automatically.
