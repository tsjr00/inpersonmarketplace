# Development Summary for Chet
**Period: January 23-24, 2026**

---

## Major Feature: Pickup Location Selection

Buyers must now select where they'll pick up each item when adding to cart. This was a critical gap - previously items could be added without specifying pickup location.

### What Changed:

**Database**
- Added `market_id` column to `cart_items` table (tracks buyer's selected pickup location)
- Added `market_id` column to `order_items` table (persists selection to orders)
- New migrations: `20260124_007` and `20260124_008`

**Buyer Experience**
- When viewing a listing, buyers see available pickup locations with:
  - Market name and location
  - Market type icon (🏪 traditional / 📦 private pickup)
  - Next pickup date
  - Whether orders are being accepted
- If multiple locations available → must select one before adding to cart
- If only one location → auto-selected
- If no locations accepting orders → "Orders Closed" message

**Checkout Flow**
- Each cart item now shows its pickup location
- **Multi-location warning**: If buying from multiple pickup locations, a prominent yellow notice appears requiring acknowledgment before checkout
- Buyer must check "I understand I will visit multiple locations for pickup" to proceed

**Order Confirmation & Receipts**
- Pickup location shown for each item
- Summary section lists all pickup locations
- Multiple locations highlighted with warning styling

---

## Market Box Improvements

### Image Upload on Edit Form
- Vendors can now add/change photos when editing existing market boxes
- Previously only available on create form

### Traditional Market Pickup Time Fix
- **Bug**: Vendors could freely select any day/time for market boxes at traditional markets
- **Fix**: If pickup location is a traditional market, vendors must select from that market's operating schedule (dropdown)
- Private pickup locations still allow custom day/time selection

### Image Display Fixes
- Market box images now display on:
  - Market box listing cards
  - Vendor profile page (new "Market Box Subscriptions" section)
  - Market box detail page
  - Browse page cards

### Vendor Profile Link
- Market box detail page now includes:
  - Clickable vendor name near title
  - "Sold by" section with vendor image, description, and "View Vendor Profile" button

---

## Technical Fixes

### Supabase Query Fix
- Internal server errors after migrations were caused by Supabase needing explicit foreign key hints
- Changed `markets (...)` to `markets!market_id (...)` in queries
- Affected APIs: cart, buyer orders, checkout

### Route Naming Fix
- Created API folder as `[listingId]` but existing routes used `[id]`
- Next.js requires consistent slug names → renamed to `[id]`

---

## Files Modified/Created

### New Files
- `supabase/migrations/20260124_007_cart_item_market_selection.sql`
- `supabase/migrations/20260124_008_order_item_market_id.sql`
- `apps/web/src/app/api/listings/[id]/markets/route.ts`

### Modified Files
- `apps/web/src/components/cart/AddToCartButton.tsx` (major rewrite)
- `apps/web/src/components/listings/ListingPurchaseSection.tsx`
- `apps/web/src/lib/hooks/useCart.tsx`
- `apps/web/src/app/api/cart/route.ts`
- `apps/web/src/app/api/cart/items/route.ts`
- `apps/web/src/app/api/checkout/session/route.ts`
- `apps/web/src/app/api/buyer/orders/route.ts`
- `apps/web/src/app/api/buyer/orders/[id]/route.ts`
- `apps/web/src/app/[vertical]/checkout/page.tsx`
- `apps/web/src/app/[vertical]/checkout/success/page.tsx`
- `apps/web/src/app/[vertical]/vendor/[vendorId]/profile/page.tsx`
- `apps/web/src/app/[vertical]/vendor/market-boxes/new/page.tsx`
- `apps/web/src/app/[vertical]/vendor/market-boxes/[id]/edit/page.tsx`
- `apps/web/src/app/[vertical]/market-box/[id]/page.tsx`

---

## Status
- ✅ Migrations applied to dev & staging
- ✅ Code deployed to dev & staging
- ✅ Build passing
- 🧪 Ready for testing

---

## Testing Checklist

**Pickup Location Selection**
- [ ] Add item from listing with multiple markets → shows selection UI
- [ ] Add item from listing with one market → auto-selects
- [ ] Add item when market closed → shows "Orders Closed"
- [ ] Checkout with items from multiple locations → acknowledgment required
- [ ] Order confirmation shows pickup locations

**Market Boxes**
- [ ] Edit market box → can upload/change image
- [ ] Create market box with traditional market → only market's schedules available
- [ ] Create market box with private pickup → can set any day/time
- [ ] Market box images appear on cards and detail pages
- [ ] Vendor profile shows market boxes section
