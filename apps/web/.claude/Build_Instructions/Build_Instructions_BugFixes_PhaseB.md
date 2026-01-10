# Build Instructions - Bug Fixes Phase B

**Date:** January 10, 2026  
**Priority:** High - User-facing pricing issue  
**Estimated Time:** 1 hour

**Prerequisite:** Complete Phase A first

---

## Overview

Platform fees are visible to buyers in cart and checkout. Business requirement is to hide the fee and build it into the displayed price.

---

## Part 1: Hide Platform Fee in Cart

**File:** `src/components/cart/CartDetail.tsx` (or similar cart component)

### Find the fee display section and remove/hide it:

```typescript
// REMOVE or comment out any section like:
<div>
  <span>Platform Fee</span>
  <span>${platformFee}</span>
</div>

// OR if fee is in a line items array, filter it out:
{lineItems
  .filter(item => item.type !== 'platform_fee')
  .map(item => (
    // render item
  ))
}
```

### Ensure subtotal already includes the fee:

```typescript
// The displayed total should be: itemsTotal + platformFee
// But shown to user as just "Total" without breakdown

// Example:
const displayTotal = subtotal + platformFee // Calculate internally
// Display only:
<div>
  <span>Total</span>
  <span>${formatPrice(displayTotal)}</span>
</div>
```

---

## Part 2: Hide Platform Fee in Checkout

**File:** `src/app/[vertical]/checkout/page.tsx` (or CheckoutPage component)

### Same approach - remove fee line item:

```typescript
// Find and REMOVE:
{platformFee > 0 && (
  <div className="flex justify-between">
    <span>Platform Fee</span>
    <span>${formatPrice(platformFee)}</span>
  </div>
)}

// Keep only:
<div className="flex justify-between font-bold">
  <span>Total</span>
  <span>${formatPrice(total)}</span>  {/* This already includes fee */}
</div>
```

---

## Part 3: Update Unauthorized Message

**File:** `src/app/[vertical]/listing/[id]/page.tsx` (or ProductDetail component)

### Find the add-to-cart handler and update error message:

```typescript
// Find something like:
if (!user) {
  setError('Unauthorized')
  return
}

// Change to:
if (!user) {
  setError('Please log in to make a purchase')
  return
}

// OR if using a toast/alert:
toast.error('Please log in to make a purchase')
```

### Better UX - Show login prompt instead of error:

```typescript
// Instead of error message, redirect to login:
if (!user) {
  // Store intended action for after login
  sessionStorage.setItem('pendingCartAdd', JSON.stringify({ listingId, quantity }))
  router.push(`/${vertical}/login?redirect=${encodeURIComponent(window.location.pathname)}`)
  return
}
```

---

## Part 4: Testing Checklist

### Test 1: Cart Fee Hidden
1. Log in as buyer
2. Add item to cart
3. Open cart
4. ✅ Should NOT see "Platform Fee" line
5. ✅ Total should be correct (includes hidden fee)

### Test 2: Checkout Fee Hidden
1. Proceed to checkout
2. Review order summary
3. ✅ Should NOT see "Platform Fee" line
4. ✅ Total should match cart total

### Test 3: Unauthorized Message
1. Log out
2. Go to a product page
3. Click "Add to Cart"
4. ✅ Should see "Please log in to make a purchase"
5. ✅ Should NOT see "Unauthorized"

---

## Commit

```bash
git add -A
git commit -m "Hide platform fee from cart/checkout, improve unauthorized message"
git push origin main
```

---

## Important Note

**The fee is still calculated and charged** - it's just not displayed as a separate line item. The Stripe integration should continue to:
1. Calculate platform fee (6.5% buyer + 6.5% vendor = 9.3% net)
2. Include buyer portion in checkout total
3. Deduct vendor portion from payout

This change is display-only, not business logic.
