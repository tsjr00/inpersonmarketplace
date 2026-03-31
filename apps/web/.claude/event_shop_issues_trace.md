# Event Shop Page — Issue Trace

## Architecture Difference: Regular Flow vs Event Shop

**Regular flow** (`/[vertical]/listing/[id]` → AddToCartButton):
- Uses `useCart()` context from CartProvider in `[vertical]/layout.tsx`
- CartProvider wraps all `[vertical]/*` pages
- After adding to cart, `useCart.addToCart()` calls the API then runs `refreshCart()` — re-fetches server-side cart state
- Cart badge in header shows live count
- "View Cart" or cart icon navigates within the `[vertical]` layout where CartProvider exists

**Event shop** (`/events/[token]/shop`):
- Lives OUTSIDE `[vertical]/layout.tsx` (under `/events/`, not `/[vertical]/`)
- No CartProvider, no useCart() context
- Manages its own local `quantities` state (React useState)
- Calls `fetch('/api/cart/items')` directly — no refreshCart after
- Sticky bar counts from local `quantities` state, not server cart
- "View Cart" links to `/${event.vertical_id}/checkout` — crosses into [vertical] layout

## Issue-by-Issue Trace

### Issue 1: View Cart button disappears after adding
**Origin:** My Session 66 code (shop page `addVendorToCart` function)
**Root cause:** Lines 221-226 — after successful API call, `setQuantities` deletes the vendor's listing keys. Since `cartItems` is computed from `quantities`, it becomes empty. The sticky bar condition `cartItems.length > 0` fails, bar disappears.
**The vendorsAdded green message** (my Session 66 addition) appears per-vendor, but the sticky bar still disappears because it depends on `cartItems` (local quantities), not on what's actually in the server cart.

### Issue 2: Quantity resets to 0 — can't see what you added
**Origin:** My Session 66 code (same `addVendorToCart` function, same lines 221-226)
**Root cause:** Same as issue 1. The quantity clearing was intentional to prevent double-adding, but it removes all visual feedback of what's in the cart. In the regular flow, `useCart` would refresh from the server and show the real cart state. Here there's no server refresh.

### Issue 3: Adding 2 of same item shows "1 item" in cart total
**Origin:** My Session 65/66 code (shop page `cartItems` computation + sticky bar display)
**Root cause:** Line 606: `{cartItems.length} item{cartItems.length > 1 ? 's' : ''}` — counts LINE ITEMS not total quantity. 2× of the same item = 1 line item with qty=2. Should sum quantities: `cartItems.reduce((sum, i) => sum + i.qty, 0)`.

### Issue 4: "View Cart" goes straight to checkout
**Origin:** My Session 65/66 code (shop page sticky bar)
**Root cause:** Line 617: `<Link href={\`/${event.vertical_id}/checkout\`}>View Cart</Link>` — there IS no separate cart page in the app. Regular flow also goes to checkout, but the checkout page shows cart items with edit ability. The "View Cart" label is misleading — it IS the cart+checkout combined page. Not a bug per se, but the label should say "Checkout" not "View Cart."
**However:** The checkout page uses `useCart()` which requires CartProvider. The event shop page navigates INTO the [vertical] layout (checkout is under /[vertical]/checkout), so CartProvider IS available on the checkout page. The checkout page should load the cart correctly IF the items were saved to cart_items.

### Issue 5: Checkout shows 1 item qty=1 when 4 were added
**Origin:** My Session 66 cart API modification (NOW REVERTED)
**Root cause:** The 60 lines of cap enforcement code I added to `cart/items/route.ts` broke the cart add. Items were not being saved to `cart_items`. The user saw success messages (the API didn't return an error) but no data was persisted. After the revert, this issue should be resolved — the cart API is back to its pre-session state.
**To verify:** User should test adding items again now that the revert is deployed.

## Summary

| Issue | Origin | Pre-existing? | Fix Location |
|-------|--------|---------------|-------------|
| 1. Sticky bar disappears | Shop page local state management | No — my code (Session 66) | Shop page |
| 2. Qty resets to 0 | Shop page clears quantities after add | No — my code (Session 65/66) | Shop page |
| 3. "1 item" count wrong | Shop page counts line items not qty | No — my code (Session 65) | Shop page |
| 4. "View Cart" → checkout | No separate cart page exists, label misleading | No — my code (Session 65) | Shop page label |
| 5. Checkout shows wrong items | Cart API broken by cap enforcement code | No — my code (Session 66, now REVERTED) | Already fixed |

## Root Cause

All 5 issues trace back to the event shop page being built OUTSIDE the CartProvider context. The regular add-to-cart flow uses `useCart()` which manages server-synced state. The event shop page rolls its own local state that doesn't sync with the server cart.

## Fix Approach

The shop page needs to either:
**A.** Use the existing `useCart` system — but this requires CartProvider, which requires being inside the `[vertical]` layout
**B.** After each successful add-to-cart call, fetch the server cart state (call `GET /api/cart?vertical=X`) and maintain a local mirror of what's in the real cart — showing accurate counts and keeping the sticky bar visible
