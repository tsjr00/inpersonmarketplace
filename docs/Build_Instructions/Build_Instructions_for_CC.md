# Build Instructions for CC - Stripe & Pickup Confirmation

**Date:** January 27, 2026  
**From:** Chet  
**Priority Order:** Bugs → Fees → Pickup Flow → Documentation

---

## 🔴 PRIORITY 1: FIX CRITICAL BUGS FIRST

You already identified these issues. Fix them before building new features:

1. **Refund execution** - Wire up the `createRefund()` function
2. **Duplicate payment records** - Add idempotency check

No specs needed - you know the code.

---

## 🟡 PRIORITY 2: FEE STRUCTURE UPDATE

### New Fee Calculation

**Formula:**
- Buyer pays: `base_price * 1.065 + 0.15`
- Vendor receives: `base_price * 0.935 - 0.15`
- Platform gross: `(base_price * 0.13) + 0.30`

**Minimum order:** $10.00 (cart total, not per vendor)

### Implementation

**Code changes:**
- Update `calculateFees()` in `/lib/stripe/payments.ts`
- Add flat fee: `PLATFORM_FLAT_FEE_CENTS = 15`
- Buyer fee: `Math.round(basePrice * 0.065) + 15`
- Vendor fee: `Math.round(basePrice * 0.065) + 15`

**Checkout validation:**
- Check cart total >= 1000 cents (before fees)
- Block API if under minimum
- UI: Disable checkout button, show "Add $X.XX more"

**Edge cases:**
- Multi-vendor orders: Combined total check
- Discounts: Apply before minimum check
- Market Boxes: Exempt from minimum (or enforce - Tracy can decide)

---

## 🟢 PRIORITY 3: CANCELLATION FEE SYSTEM

### Business Rules

**Grace period:** 1 hour from order confirmation
- Within 1 hour: Free cancellation, full refund
- After 1 hour: 25% cancellation fee applies

**Fee calculation on $50 order (after grace period):**
```
Cancellation fee: $50 * 0.25 = $12.50
Apply normal platform fees to $12.50:
  Buyer-side: 6.5% + $0.15 = $0.96
  Vendor-side: 6.5% + $0.15 = $0.90
Platform keeps: $1.86
Vendor receives: $10.64
Buyer refunded: $37.50
```

### Implementation

**Database:**
- Add `grace_period_ends_at` to orders (confirmation timestamp + 1 hour)
- Track `cancelled_at`, `cancellation_fee_cents`, `refund_amount_cents`

**Cancellation flow:**
1. Check if within grace period
2. If yes: Full refund, no fee
3. If no: Show warning "25% cancellation fee will apply. Continue?"
4. Calculate fees on 25% of order
5. Create Stripe refund for 75%
6. Create payout record for vendor's portion
7. Keep platform's portion

**API:**
- Add grace period check to cancellation endpoint
- Execute Stripe refund
- Create vendor payout for their share

---

## 🔵 PRIORITY 4: PICKUP CONFIRMATION FLOW

### Overview

Both buyer and vendor must confirm face-to-face pickup before money transfers to vendor. 30-second window with soft lockdown if one party doesn't confirm.

### Database Schema

**New columns on `order_items`:**
```sql
buyer_pickup_initiated_at TIMESTAMPTZ
vendor_confirmed_at TIMESTAMPTZ  
buyer_confirmed_at TIMESTAMPTZ
confirmation_window_expires_at TIMESTAMPTZ
lockdown_active BOOLEAN DEFAULT false
lockdown_initiated_at TIMESTAMPTZ
```

### The Flow

**Step 1: Buyer arrives at vendor booth**
- Buyer taps "I'm Here to Pick Up"
- Sets `buyer_pickup_initiated_at`
- Screen shows order number prominently

**Step 2: Buyer confirms receipt first**
- Buyer taps "Yes, I Received Everything"
- Sets `buyer_confirmed_at`
- Sets `confirmation_window_expires_at` = now + 30 seconds
- Vendor's app gets real-time notification
- Buyer sees timer counting down

**Step 3A: Vendor confirms within 30 seconds (Happy Path)**
- Vendor taps "Yes, I Handed It Off"
- Sets `vendor_confirmed_at`
- Both see green success screen
- Money transfers to vendor (call `transferToVendor()`)
- Order status → `fulfilled`

**Step 3B: Timer expires without vendor confirmation**
- `lockdown_active` = true
- Vendor's screen shows urgent modal:
  - "Buyer confirmed receipt. Did you hand off this order?"
  - Two buttons: "Yes, I Handed It Off" | "No, Report Issue"
  - Cannot dismiss easily
- Block vendor from:
  - Confirming other pickups
  - Marking items ready
  - Creating/editing listings
- Dashboard shows urgent banner
- After 24 hours: Admin notification

**Alternative: Vendor confirms first**
- Same flow, but buyer is the one who needs to confirm within 30 seconds
- Lockdown applies to buyer if they don't confirm

### UI Components Needed

**Buyer side:**
- `PickupModeButton.tsx` - Entry point to pickup flow
- `PickupConfirmationScreen.tsx` - Show order number, confirm button
- `PickupWaitingScreen.tsx` - 30-second timer display
- `PickupLockedScreen.tsx` - If timer expires without vendor confirm

**Vendor side:**
- `PickupModeScreen.tsx` - List of ready orders at this market
- `PickupConfirmationModal.tsx` - Urgent prompt when buyer confirms
- `VendorLockedOverlay.tsx` - Blocks all actions until resolved

**Admin:**
- `PendingPickupConfirmations.tsx` - Dashboard view of stuck confirmations (>24hrs)
- Ability to manually resolve

### API Endpoints

**New endpoints needed:**
- `POST /api/buyer/orders/[id]/initiate-pickup` - Buyer taps "I'm here"
- `POST /api/buyer/orders/[id]/confirm-receipt` - Buyer confirms received
- `POST /api/vendor/orders/[id]/confirm-handoff` - Vendor confirms handed off
- `GET /api/vendor/markets/[id]/pickup-mode` - List of ready orders for this market
- `POST /api/admin/orders/[id]/resolve-confirmation` - Admin manually resolves

### Real-Time Updates

Use polling every 5 seconds (or WebSocket if available):
- When buyer confirms → Vendor's screen updates immediately
- When vendor confirms → Buyer's screen updates immediately
- Timer countdown updates in real-time

### Lockdown Mechanism

**What gets blocked for vendor:**
```typescript
// Check before any vendor action
if (vendor has unresolved confirmations) {
  return 403 "You must resolve pending pickup confirmations first"
}
```

**Apply to:**
- `/api/vendor/orders/[id]/fulfill` - Block if other confirmations pending
- `/api/vendor/listings/*` - Block create/edit
- `/api/vendor/orders/[id]/ready` - Block marking items ready

**Admin escalation:**
- Cron job checks for confirmations pending >24 hours
- Creates admin notification
- Admin can review and manually confirm either direction

### Edge Cases

**Phone dies:**
- When they log back in, see urgent screen first
- Can still confirm

**Forgot to confirm:**
- Lockdown kicks in after 30 seconds
- Forces them to deal with it

**Legitimate dispute:**
- Either party can tap "Report Issue"
- Opens dispute flow (admin review)

**Network issues:**
- Grace period for confirmation (allow up to 2 minutes total)
- If network delays cause timer to expire, don't lock immediately
- Give 30-second buffer after timer

---

## 📄 PRIORITY 5: "HOW IT WORKS" DOCUMENTATION PAGE

Create new page: `/[vertical]/how-it-works`

### Content Sections Needed

Tracy wants documentation that sets expectations for both buyers and vendors so they follow the pickup confirmation process correctly.

### Section 1: For Buyers - How Pickup Works

**Content suggestions:**

**"Ordering & Pickup Process"**
- Browse products from local vendors
- Add items to cart (minimum $10 order)
- Complete checkout with secure payment
- Vendor confirms your order and prepares items
- You receive notification when items are ready for pickup
- Visit the market on pickup day
- Find the vendor's booth
- Show your order number (or have app open)
- Vendor hands you your items
- **IMPORTANT:** Both you and vendor confirm pickup in the app before you leave the booth

**"The Pickup Confirmation Step"**
- After vendor hands you items, you'll tap "I Received Everything" in your app
- Vendor confirms on their end within 30 seconds
- Both see green confirmation screen
- Money transfers to vendor at this point
- This protects both you and the vendor

**"Why We Do This"**
- Ensures you actually received your items
- Prevents disputes about "who got what"
- Vendor gets paid only after confirmed handoff
- Creates accountability on both sides

**"What If Something Goes Wrong?"**
- Items missing? Tap "Report Issue" instead of confirming
- Wrong items? Work it out with vendor or report issue
- Vendor not at market? Contact support immediately
- Technical issues? You have 24 hours to resolve with platform support

**"Cancellation Policy"**
- Free cancellation within 1 hour of placing order
- After 1 hour: 25% cancellation fee applies
- This compensates vendor for prep time and reserved items
- Cancel as early as possible if plans change

---

### Section 2: For Vendors - How Pickup Works

**Content suggestions:**

**"Order Flow & Pickup Process"**
- Receive order notification
- Confirm you can fulfill the order
- Prepare items before market day
- Mark items as "Ready for Pickup" when prepared
- Buyer receives notification
- Buyer arrives at your booth on market day
- Verify order number matches
- Hand over all items
- **IMPORTANT:** Confirm the handoff in your app immediately while buyer is still at booth

**"The Pickup Confirmation Step"**
- When buyer confirms they received items, you'll get an urgent notification
- You have 30 seconds to tap "Yes, I Handed It Off"
- Don't let buyer walk away until both of you confirm
- This triggers payment transfer to your account
- Both see green confirmation screen when complete

**"Why This Matters"**
- Payment doesn't transfer until BOTH parties confirm
- If you don't confirm within 30 seconds, your account gets temporarily restricted
- You won't be able to fulfill other orders until you resolve the pending confirmation
- This protects both you and your customers from disputes

**"Best Practices"**
- Stay at your booth during market hours
- Have your phone charged and app open
- Confirm handoffs immediately (don't wait)
- Verify buyer's order number before handing over items
- If there's an issue, tap "Report Issue" instead of confirming

**"What Gets Locked If You Don't Confirm"**
- Can't confirm other pickups
- Can't mark new items as ready
- Can't create or edit listings
- Platform prioritizes resolving the pending confirmation
- Admin will review after 24 hours if unresolved

**"Payment Timing"**
- Payment transfers immediately after both parties confirm
- Usually reaches your account within 1-2 business days
- You can track payouts in your vendor dashboard

**"Handling Cancellations"**
- Buyers can cancel free within 1 hour
- After 1 hour: 25% cancellation fee (you receive most of it)
- Compensates you for prep time and reserved inventory
- You'll be notified immediately of any cancellations

---

### Section 3: Pickup Mode Instructions

**For Buyers:**
```
Using Pickup Mode:
1. Open your order in the app
2. Tap "I'm Here to Pick Up" when you arrive
3. Show your order number to the vendor
4. Verify you received all items
5. Tap "Yes, I Received Everything"
6. Wait for vendor to confirm (30 seconds)
7. See green screen = you're done!
8. Don't leave until you see the green screen
```

**For Vendors:**
```
Using Pickup Mode:
1. Tap "Pickup Mode" on your dashboard
2. See list of all orders ready for pickup today
3. When buyer arrives, verify order number
4. Hand over all items
5. Wait for buyer to confirm in their app
6. When you get notification, tap "Yes, I Handed It Off"
7. See green screen = payment is processing
8. Never let buyer leave without both confirming
```

---

### Visual Aids Recommendations

**Suggest adding:**
- Screenshot of buyer's order number screen
- Screenshot of vendor's pickup mode list
- Screenshot of confirmation timer
- Screenshot of green success screen
- Flowchart showing the confirmation process
- Video demo (optional but highly recommended)

---

### Tone & Messaging

**Keep it:**
- Clear and direct (not overly friendly)
- Action-oriented (tell them exactly what to do)
- Emphasize mutual protection (benefits both parties)
- Set firm expectations (this is how the system works)
- Address concerns proactively (what if X happens?)

**Avoid:**
- Apologetic language
- Over-explaining the reasoning
- Making it feel optional
- Corporate jargon

---

## 🎯 IMPLEMENTATION ORDER

**Week 1:**
1. Fix bugs (Day 1)
2. Update fee structure (Day 1-2)
3. Add cancellation grace period + fees (Day 2)
4. Start pickup confirmation flow (Day 3-5)

**Week 2:**
5. Complete pickup confirmation flow
6. Create "How It Works" page
7. Test everything thoroughly

---

## 📋 COMMIT STRATEGY

- Commit after each completed feature
- Push to GitHub after every 2-3 commits
- Always push at end of session

---

## 🧪 TESTING CHECKLIST

Include in session summary:
- [ ] Bugs fixed and verified
- [ ] Fee calculations correct at $10, $20, $50, $100
- [ ] $10 minimum enforced (single and multi-vendor)
- [ ] Cancellation within 1 hour = full refund
- [ ] Cancellation after 1 hour = 25% fee + correct refund
- [ ] Pickup confirmation flow works both directions (buyer first, vendor first)
- [ ] Timer expires correctly triggers lockdown
- [ ] Vendor lockdown blocks expected actions
- [ ] Admin can resolve stuck confirmations
- [ ] "How It Works" page displays correctly

---

## 📝 SESSION SUMMARY REQUIREMENTS

Include in your summary:
1. What you fixed/built
2. Any decisions you made (with reasoning)
3. Any blockers or issues
4. What's ready for Tracy to test
5. What's left to build

---

**Questions for Tracy while building? Ask in session summary.**
