# Phase L: External Checkout Fixes

**Date**: February 1, 2026
**Focus**: Fix external checkout page UI and create business rules reference

---

## Summary

Fixed the external checkout page to properly function as a "complete your payment" screen rather than a success/confirmation page. Also created a business rules reference document to prevent repeated mistakes around pricing, fees, and data structures.

---

## Changes Made

### 1. External Checkout Page Cleanup

**File**: `apps/web/src/app/[vertical]/checkout/external/page.tsx`

**Removed**:
- Subtotal line item display
- Service fee line item display (was showing "$0.65" etc.)
- "View My Orders" button
- "Continue Shopping" link

**Now shows**:
- Just the total amount to pay
- Vendor name
- Payment button/link for the selected method
- Instructions for completing payment

**Rationale**: This is a "complete your payment" screen, not a success page. Buyers need to focus on paying the vendor, not navigating away.

### 2. Business Rules Reference Document

**File**: `docs/BUSINESS_RULES.md`

Created a reference document capturing critical business rules:

- **Fees are built into prices**: Never show fee breakdowns, subtotals, or service fees to buyers
- **External checkout is not a success page**: Focus on payment completion, not navigation
- **Data structure notes**:
  - `profile_data` JSONB contains business_name/farm_name (not direct columns)
  - `platform_settings.value` is TEXT, not JSONB
- **Payment method requirements**: Stripe must be connected for external methods, single-vendor only

---

## Key Business Rule Reminder

**CRITICAL**: All prices shown to buyers include any platform fees. We never display:
- Subtotal + service fee
- Platform fee line items
- Fee percentages
- Fee breakdowns of any kind

Buyers see: Just the total price (e.g., "$10.65")

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/[vertical]/checkout/external/page.tsx` | Removed fee display and navigation buttons |
| `docs/BUSINESS_RULES.md` | New - business rules reference |
| `docs/Session_Summaries/Phase_L_External_Checkout_Fixes.md` | New - this summary |

---

## Testing Notes

1. Test external checkout flow with Venmo/Cash App/PayPal/Cash
2. Verify only total amount is shown (no fee breakdown)
3. Verify no navigation buttons appear on the payment page
4. After payment, buyers can manually navigate to orders page

---

## Next Steps

- Continue with social media sharing feature (from plan)
- Test all payment flows end-to-end
