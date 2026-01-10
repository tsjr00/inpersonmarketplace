# FastWrks BuildApp - Implementation Build Plan
## Strategic Phased Development for CC

**Created:** January 9, 2026  
**For:** Claude Code (CC) Implementation  
**Source Document:** FastWrks_Pricing_Features_v2.0.md

---

## Build Philosophy

### Core Principles:
1. **MVP First:** Get to working commerce quickly
2. **Test Early:** Each phase is testable end-to-end
3. **Dependencies:** Build foundation before features
4. **Incremental Value:** Each phase adds user-visible capability
5. **Migration Discipline:** Every database change = timestamped migration file

### Current State (Already Built):
- ✅ Multi-brand authentication (fastwrks.com, farmersmarket.app)
- ✅ User profiles and vendor profiles
- ✅ Basic database schema (users, vendors, listings, transactions)
- ✅ Supabase Auth + Session management
- ✅ Vendor signup + basic dashboard
- ✅ Migration tracking system
- ✅ Protected routes

### Goal State:
- Complete multi-tenant marketplace
- Pre-sales + Flash sales + Monthly Market Box
- Two market types (Fixed + Private Pickup)
- Free + Premium tiers (buyers and vendors)
- Stripe Connect payments
- VIP system + notifications
- Advanced analytics

---

## Implementation Phases Overview

| Phase | Name | Duration | Milestone |
|-------|------|----------|-----------|
| 3 | Core Commerce Engine | 16-20 hrs | Buyers can purchase pre-sale bundles, vendors get paid |
| 4 | Market Types System | 8-10 hrs | Fixed + Private Pickup markets working |
| 5 | Tier Management | 10-12 hrs | Free/Premium tiers enforced, Stripe subscriptions |
| 6 | Flash Sales System | 12-16 hrs | Real-time flash sales with timing/limits |
| 7 | VIP + Priority Notifications | 10-12 hrs | VIP system + head start notifications |
| 8 | Monthly Market Box | 8-10 hrs | 4-week prepaid boxes with capacity limits |
| 9 | Communication System | 6-8 hrs | Pre-scripted messages (email) |
| 10 | Advanced Analytics | 8-10 hrs | Premium vendor analytics dashboard |
| 11 | Data Retention | 4-6 hrs | Automated archival by tier |
| 12 | Polish + Testing | 8-10 hrs | UI refinement, edge cases, load testing |

**Total Estimated Time:** 90-114 hours (11-14 full work days)

---

## Phase 3: Core Commerce Engine (PRIORITY)

**Duration:** 16-20 hours  
**Status:** NEXT TO BUILD  
**Dependency:** Phases 1-2 already complete

### Objective
Enable complete buy-sell transaction flow: Buyer purchases pre-sale bundle → Vendor receives payment → Pickup coordination.

### What Users Can Do After This Phase:
- **Vendors:** Create bundles with pricing, manage inventory, see incoming orders, mark orders fulfilled
- **Buyers:** Browse bundles, add to cart, checkout with Stripe, confirm pickup
- **Platform:** Collect fees, distribute payouts via Stripe Connect

---

### 3.1 Database Schema - Orders & Payments

**Create Migration:** `YYYYMMDD_HHMMSS_001_orders_and_payments.sql`

**New Tables:**

```sql
-- Orders table (buyer's cart)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id),
  vertical_id TEXT NOT NULL REFERENCES verticals(id),
  order_number TEXT UNIQUE NOT NULL, -- human-readable: FW-2026-00001
  status order_status NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  stripe_checkout_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order status enum
CREATE TYPE order_status AS ENUM (
  'pending',      -- Created but not paid
  'paid',         -- Payment successful
  'confirmed',    -- Vendor confirmed
  'ready',        -- Ready for pickup
  'completed',    -- All items picked up
  'cancelled',    -- Buyer cancelled before payment
  'refunded'      -- Full refund processed
);

-- Order items table (links orders to bundles)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL, -- Price at time of purchase
  subtotal_cents INTEGER NOT NULL, -- quantity × unit_price
  platform_fee_cents INTEGER NOT NULL,
  vendor_payout_cents INTEGER NOT NULL,
  status order_item_status NOT NULL DEFAULT 'pending',
  pickup_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order item status enum
CREATE TYPE order_item_status AS ENUM (
  'pending',      -- Awaiting vendor confirmation
  'confirmed',    -- Vendor accepted
  'ready',        -- Vendor marked ready for pickup
  'fulfilled',    -- Buyer picked up
  'cancelled',    -- Vendor cancelled
  'refunded'      -- Refunded to buyer
);

-- Payments table (Stripe tracking)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_amount_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment status enum
CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded'
);

-- Vendor payouts table (Stripe Connect transfers)
CREATE TABLE vendor_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  amount_cents INTEGER NOT NULL,
  stripe_transfer_id TEXT UNIQUE,
  status payout_status NOT NULL DEFAULT 'pending',
  transferred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payout status enum
CREATE TYPE payout_status AS ENUM (
  'pending',      -- Awaiting transfer
  'processing',   -- Stripe processing
  'completed',    -- Successfully transferred
  'failed',       -- Transfer failed
  'cancelled'     -- Cancelled before transfer
);

-- Indexes for performance
CREATE INDEX idx_orders_buyer ON orders(buyer_user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_vendor ON order_items(vendor_profile_id);
CREATE INDEX idx_order_items_status ON order_items(status);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payouts_vendor ON vendor_payouts(vendor_profile_id);
CREATE INDEX idx_payouts_order_item ON vendor_payouts(order_item_id);
```

**Update Existing Tables:**

```sql
-- Add Stripe Connect fields to vendor_profiles
ALTER TABLE vendor_profiles ADD COLUMN stripe_account_id TEXT;
ALTER TABLE vendor_profiles ADD COLUMN stripe_onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE vendor_profiles ADD COLUMN stripe_charges_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE vendor_profiles ADD COLUMN stripe_payouts_enabled BOOLEAN DEFAULT FALSE;

-- Add listing_type to listings table
CREATE TYPE listing_type AS ENUM ('presale', 'flash', 'market_box');
ALTER TABLE listings ADD COLUMN listing_type listing_type DEFAULT 'presale';

-- Add fee structure to verticals (if not exists)
ALTER TABLE verticals ADD COLUMN IF NOT EXISTS buyer_fee_percent DECIMAL(4,2) DEFAULT 6.5;
ALTER TABLE verticals ADD COLUMN IF NOT EXISTS vendor_fee_percent DECIMAL(4,2) DEFAULT 6.5;
```

**RLS Policies:**

```sql
-- Orders: Buyers see their own, vendors see relevant items
CREATE POLICY orders_buyer_access ON orders
  FOR SELECT USING (auth.uid() = buyer_user_id);

CREATE POLICY orders_vendor_access ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN vendor_profiles vp ON oi.vendor_profile_id = vp.id
      WHERE oi.order_id = orders.id AND vp.user_id = auth.uid()
    )
  );

-- Order items: Buyers see items in their orders, vendors see their items
CREATE POLICY order_items_buyer_access ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  );

CREATE POLICY order_items_vendor_access ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );

-- Vendors can update their order items (status changes)
CREATE POLICY order_items_vendor_update ON order_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );
```

**Apply to:** Dev → Test → Staging

---

### 3.2 Stripe Connect Integration

**Files to Create:**

**`src/lib/stripe/connect.ts`** - Stripe Connect utilities
```typescript
// Vendor onboarding to Stripe Connect
// Account creation
// Account link generation for onboarding
// Account status checking
```

**`src/lib/stripe/payments.ts`** - Payment processing
```typescript
// Create checkout session
// Calculate fees (6.5% buyer + 6.5% vendor)
// Payment intent creation
// Transfer to vendor (Connect transfer)
// Refund processing
```

**`src/lib/stripe/webhooks.ts`** - Webhook handling
```typescript
// payment_intent.succeeded
// payment_intent.failed
// checkout.session.completed
// transfer.created
// transfer.failed
// account.updated (vendor onboarding)
```

**Environment Variables:**
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

### 3.3 API Endpoints

**Create these route handlers:**

**`/api/vendor/stripe/onboard`** - POST
- Check if vendor already has Stripe account
- Create Stripe Connect Express account
- Return account link for onboarding
- Update vendor_profile with stripe_account_id

**`/api/vendor/stripe/status`** - GET
- Check Stripe account status
- Return charges_enabled, payouts_enabled
- Update vendor_profile fields

**`/api/cart/add`** - POST
- Add bundle to buyer's session cart
- Validate quantity available
- Return updated cart

**`/api/cart/remove`** - POST
- Remove item from cart
- Return updated cart

**`/api/checkout/session`** - POST
- Validate cart items still available
- Calculate fees (6.5% buyer + 6.5% vendor)
- Create order record (status: pending)
- Create order_items records
- Create Stripe checkout session
- Return session ID

**`/api/checkout/success`** - GET
- Verify payment succeeded (check Stripe)
- Update order status to 'paid'
- Send confirmation emails
- Return order details

**`/api/webhooks/stripe`** - POST
- Verify webhook signature
- Handle payment events
- Update order/payment status
- Trigger vendor payouts

**`/api/vendor/orders`** - GET
- Return vendor's order items
- Filter by status, date range
- Paginated results

**`/api/vendor/orders/[id]/confirm`** - POST
- Update order item status to 'confirmed'
- Notify buyer

**`/api/vendor/orders/[id]/ready`** - POST
- Update order item status to 'ready'
- Notify buyer

**`/api/vendor/orders/[id]/fulfill`** - POST
- Update order item status to 'fulfilled'
- Trigger payout to vendor
- Update order status if all items fulfilled

**`/api/buyer/orders`** - GET
- Return buyer's orders
- Filter by status, date range
- Include all order items

---

### 3.4 UI Components

**Vendor:**

**`src/app/[vertical]/vendor/dashboard/onboard-stripe.tsx`**
- "Connect Bank Account" button
- Redirect to Stripe onboarding
- Display onboarding status
- Handle return from Stripe

**`src/app/[vertical]/vendor/dashboard/orders/page.tsx`**
- List incoming orders
- Filter by status (pending, confirmed, ready)
- Order details modal
- Actions: Confirm, Mark Ready, Mark Fulfilled
- Real-time updates (polling or webhooks)

**`src/app/[vertical]/vendor/dashboard/listings/[id]/edit.tsx`**
- Add quantity field
- Add pricing field
- Validate inventory levels

**Buyer:**

**`src/app/[vertical]/browse/page.tsx`**
- Browse all bundles (by vertical)
- Filter by vendor, category
- Search functionality
- "Add to Cart" button

**`src/app/[vertical]/bundle/[id]/page.tsx`**
- Bundle detail page
- Vendor info
- Pricing (includes platform fee, shown as single price)
- Quantity selector
- "Add to Cart" button
- Pickup location/time display

**`src/components/cart/CartDrawer.tsx`**
- Slide-out cart drawer
- List items in cart
- Show total (including fees)
- "Checkout" button
- Remove item functionality

**`src/app/[vertical]/checkout/page.tsx`**
- Review cart items
- Display total breakdown (optional: show subtotal vs fees)
- Stripe checkout button
- Embedded Stripe checkout form

**`src/app/[vertical]/checkout/success/page.tsx`**
- Order confirmation
- Order number
- Pickup instructions
- "View Orders" link

**`src/app/[vertical]/buyer/orders/page.tsx`**
- List buyer's orders
- Filter by status
- Order details (items, vendor, pickup location/time)
- Status updates

---

### 3.5 Fee Calculation Logic

**Server-side calculation (NEVER trust client):**

```typescript
function calculateFees(basePriceCents: number) {
  const BUYER_FEE_PERCENT = 6.5;
  const VENDOR_FEE_PERCENT = 6.5;
  
  const buyerFeeCents = Math.round(basePriceCents * (BUYER_FEE_PERCENT / 100));
  const vendorFeeCents = Math.round(basePriceCents * (VENDOR_FEE_PERCENT / 100));
  
  const buyerPaysCents = basePriceCents + buyerFeeCents;
  const vendorGetsCents = basePriceCents - vendorFeeCents;
  const platformFeeCents = buyerFeeCents + vendorFeeCents;
  
  return {
    basePriceCents,
    buyerFeeCents,
    vendorFeeCents,
    buyerPaysCents,
    vendorGetsCents,
    platformFeeCents
  };
}

// Example: $50 bundle
// Base: $50.00 (5000 cents)
// Buyer fee: $3.25 (325 cents)
// Vendor fee: $3.25 (325 cents)
// Buyer pays: $53.25 (5325 cents)
// Vendor gets: $46.75 (4675 cents)
// Platform: $6.50 (650 cents)
```

**Stripe application fee:**
- Create checkout session with line items
- Add `application_fee_amount` to payment intent
- Stripe automatically deducts from vendor payout
- Platform receives application fee, Stripe deducts their 2.9% + $0.30 from platform fee

---

### 3.6 Testing Checklist

**Vendor Flow:**
- [ ] Vendor connects Stripe account successfully
- [ ] Vendor creates bundle with price and quantity
- [ ] Vendor sees incoming order notification
- [ ] Vendor confirms order
- [ ] Vendor marks order ready
- [ ] Vendor marks order fulfilled
- [ ] Vendor receives payout 2 days later (Stripe test)

**Buyer Flow:**
- [ ] Buyer browses bundles
- [ ] Buyer adds bundle to cart
- [ ] Buyer sees correct total (with fees blind)
- [ ] Buyer checks out with test card
- [ ] Buyer receives order confirmation
- [ ] Buyer sees order in their dashboard
- [ ] Buyer can track status updates

**Edge Cases:**
- [ ] Out of stock: Buyer tries to purchase unavailable bundle
- [ ] Vendor cancels order before fulfillment
- [ ] Payment fails at checkout
- [ ] Multiple items in cart (single vendor)
- [ ] Vendor no-show (refund flow)

**Stripe Test Cards:**
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002
- Requires authentication: 4000 0025 0000 3155

---

### 3.7 Migration Log Update

**After applying migration, update `MIGRATION_LOG.md`:**

```markdown
| Migration File | Dev | Dev Date | Staging | Staging Date | Notes |
|----------------|-----|----------|---------|--------------|-------|
| YYYYMMDD_HHMMSS_001_orders_and_payments.sql | ✅ | YYYY-MM-DD HH:MM | ✅ | YYYY-MM-DD HH:MM | Phase 3: Core commerce tables |
```

---

### 3.8 Commit Strategy

**Commits during Phase 3:**
1. "Phase 3: Create orders and payments migration"
2. "Phase 3: Add Stripe Connect utilities"
3. "Phase 3: Add payment processing logic"
4. "Phase 3: Add webhook handlers"
5. "Phase 3: Add cart and checkout API endpoints"
6. "Phase 3: Add vendor orders API endpoints"
7. "Phase 3: Add vendor Stripe onboarding UI"
8. "Phase 3: Add vendor orders dashboard"
9. "Phase 3: Add buyer browse and cart UI"
10. "Phase 3: Add buyer checkout flow"
11. "Phase 3: Add buyer orders dashboard"
12. "Phase 3: Testing and bug fixes"

**Push to GitHub after every 2-3 commits, always at end of session.**

---

### 3.9 Phase 3 Completion Criteria

**Phase 3 is complete when:**
- ✅ Vendors can onboard with Stripe Connect
- ✅ Vendors can create bundles with pricing
- ✅ Buyers can browse bundles
- ✅ Buyers can add to cart and checkout
- ✅ Payment processes through Stripe
- ✅ Orders appear in vendor dashboard
- ✅ Vendors can mark order status changes
- ✅ Vendors receive payouts via Stripe Connect
- ✅ Buyers see order status updates
- ✅ All test cases pass

**After Phase 3:**
- You have a working marketplace ✅
- Real money can flow (in production)
- Ready to add market types (Phase 4)

---

## Phase 4: Market Types System

**Duration:** 8-10 hours  
**Dependency:** Phase 3 complete

### Objective
Implement Fixed Markets and Private Pickup Markets with proper validation, shared inventory, and buyer acknowledgments.

---

### 4.1 Database Schema - Markets

**Create Migration:** `YYYYMMDD_HHMMSS_002_market_types.sql`

```sql
-- Market types enum
CREATE TYPE market_type AS ENUM ('fixed', 'private_pickup');

-- Markets table
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vertical_id TEXT NOT NULL REFERENCES verticals(id),
  market_type market_type NOT NULL DEFAULT 'fixed',
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- For fixed markets
  day_of_week INTEGER, -- 0=Sunday, 6=Saturday
  start_time TIME,
  end_time TIME,
  
  -- For private pickup markets (vendor-specific)
  vendor_profile_id UUID REFERENCES vendor_profiles(id),
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fixed_market_schedule CHECK (
    market_type != 'fixed' OR (day_of_week IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL)
  ),
  CONSTRAINT private_market_vendor CHECK (
    market_type != 'private_pickup' OR vendor_profile_id IS NOT NULL
  )
);

-- Listing availability (which markets a bundle is available at)
CREATE TABLE listing_markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  
  -- For private pickup: specific availability windows
  available_dates JSONB, -- [{date: "2026-01-15", start_time: "16:00", end_time: "18:00"}]
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(listing_id, market_id)
);

-- Add market to order_items (buyer selected pickup location)
ALTER TABLE order_items ADD COLUMN market_id UUID REFERENCES markets(id);
ALTER TABLE order_items ADD COLUMN pickup_date DATE;
ALTER TABLE order_items ADD COLUMN pickup_time_start TIME;
ALTER TABLE order_items ADD COLUMN pickup_time_end TIME;
ALTER TABLE order_items ADD COLUMN pickup_acknowledged BOOLEAN DEFAULT FALSE;

-- Indexes
CREATE INDEX idx_markets_vertical ON markets(vertical_id);
CREATE INDEX idx_markets_type ON markets(market_type);
CREATE INDEX idx_markets_vendor ON markets(vendor_profile_id);
CREATE INDEX idx_listing_markets_listing ON listing_markets(listing_id);
CREATE INDEX idx_listing_markets_market ON listing_markets(market_id);
```

---

### 4.2 API Endpoints

**`/api/vendor/markets`** - GET
- List all markets vendor can participate in
- Filter by market type

**`/api/vendor/markets/private`** - POST
- Create private pickup market for vendor
- Validate address, hours
- Return market ID

**`/api/vendor/markets/join`** - POST
- Add vendor to fixed market
- Return confirmation

**`/api/vendor/listings/[id]/markets`** - POST
- Add market availability to listing
- For private pickup: set available dates/times
- Validate no schedule conflicts

**`/api/markets/[vertical]`** - GET
- Public endpoint: list all active markets
- Filter by type

---

### 4.3 UI Components

**Vendor:**

**`src/app/[vertical]/vendor/dashboard/markets/page.tsx`**
- List vendor's markets (fixed + private)
- "Create Private Pickup Location" button
- "Join Market" button
- Edit market availability

**`src/app/[vertical]/vendor/dashboard/markets/create-private.tsx`**
- Form: name, address, description
- "Create Market" button

**`src/app/[vertical]/vendor/dashboard/listings/[id]/markets.tsx`**
- Checkboxes: which markets is this bundle available at?
- For private pickup: date/time picker for availability windows
- Warning if multiple markets selected with different times

**Buyer:**

**`src/app/[vertical]/browse/page.tsx`**
- Filter by market (dropdown)
- Show bundles available at selected market

**`src/app/[vertical]/bundle/[id]/page.tsx`**
- Display available pickup locations/times
- Radio buttons: select pickup location (if multiple)
- For private pickup: dropdown for time window selection
- Checkbox: "I confirm I can pick up at [location] on [date] at [time]"

**`src/app/[vertical]/checkout/page.tsx`**
- Show selected pickup for each item
- Private pickup items require acknowledgment checkbox

---

### 4.4 Business Logic

**Market validation:**
- Fixed market: require day_of_week, start_time, end_time
- Private pickup: require vendor_profile_id
- Private pickup: vendor can create multiple (home, farm, alternate location)

**Listing availability:**
- Vendor selects which markets bundle is available at
- Shared inventory across all selected markets
- System warns if vendor has overlapping schedules

**Cart validation:**
- Multi-vendor cart: verify all items from same fixed market + same date
- Private pickup: single vendor only
- Mixed cart (fixed + private): block checkout, separate orders required

**Checkout validation:**
- Private pickup orders: require pickup_acknowledged = true
- Store selected market, date, time on order_item

---

### 4.5 Testing Checklist

- [ ] Vendor creates private pickup market
- [ ] Vendor joins fixed market
- [ ] Vendor creates bundle available at both markets
- [ ] Buyer browses fixed market (sees bundle)
- [ ] Buyer browses private pickup (sees bundle, confirms time)
- [ ] Buyer adds fixed market item to cart (succeeds)
- [ ] Buyer adds private pickup item to cart (different vendor, succeeds)
- [ ] Buyer tries multi-vendor cart with mixed markets (blocked)
- [ ] Buyer checks out private pickup order (requires acknowledgment)
- [ ] Inventory decrements correctly (shared pool)

---

### 4.6 Phase 4 Completion Criteria

**Phase 4 is complete when:**
- ✅ Vendors can create private pickup markets
- ✅ Vendors can join fixed markets
- ✅ Vendors can assign bundles to specific markets
- ✅ Buyers can filter by market
- ✅ Buyers can select pickup location for private pickup
- ✅ Buyers must acknowledge private pickup time/place
- ✅ Multi-vendor cart restricted to fixed markets
- ✅ Inventory shared across markets correctly

---

## Phase 5: Tier Management & Subscriptions

**Duration:** 10-12 hours  
**Dependency:** Phases 3-4 complete

### Objective
Implement free and premium tiers for buyers and vendors, enforce limits, integrate Stripe subscriptions.

---

### 5.1 Database Schema - Tiers

**Create Migration:** `YYYYMMDD_HHMMSS_003_tier_management.sql`

```sql
-- User tier enum
CREATE TYPE user_tier AS ENUM ('free', 'premium');

-- Vendor tier enum
CREATE TYPE vendor_tier AS ENUM ('standard', 'premium');

-- Add tier to user_profiles
ALTER TABLE user_profiles ADD COLUMN tier user_tier DEFAULT 'free';
ALTER TABLE user_profiles ADD COLUMN tier_expires_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE user_profiles ADD COLUMN stripe_subscription_id TEXT;

-- Add tier to vendor_profiles
ALTER TABLE vendor_profiles ADD COLUMN tier vendor_tier DEFAULT 'standard';
ALTER TABLE vendor_profiles ADD COLUMN tier_expires_at TIMESTAMPTZ;
ALTER TABLE vendor_profiles ADD COLUMN stripe_subscription_id TEXT;

-- Tier feature usage tracking
CREATE TABLE tier_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL, -- 'user' or 'vendor'
  entity_id UUID NOT NULL,
  feature TEXT NOT NULL, -- 'flash_sales', 'market_box', etc.
  usage_count INTEGER DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(entity_type, entity_id, feature, period_start)
);

CREATE INDEX idx_tier_usage_entity ON tier_usage(entity_type, entity_id);
CREATE INDEX idx_tier_usage_feature ON tier_usage(feature);
CREATE INDEX idx_tier_usage_period ON tier_usage(period_start, period_end);
```

---

### 5.2 Stripe Subscription Products

**Create in Stripe Dashboard:**

**Buyer Premium:**
- Product: "Market Pass Member"
- Monthly Price: $9.99/month (`price_buyer_premium_monthly`)
- Annual Price: $81.50/year (`price_buyer_premium_annual`)

**Vendor Premium:**
- Product: "Premium Vendor"
- Monthly Price: $24.99/month (`price_vendor_premium_monthly`)
- Annual Price: $208.15/year (`price_vendor_premium_annual`)

**Store Price IDs in environment variables:**
```
STRIPE_PRICE_BUYER_PREMIUM_MONTHLY=price_...
STRIPE_PRICE_BUYER_PREMIUM_ANNUAL=price_...
STRIPE_PRICE_VENDOR_PREMIUM_MONTHLY=price_...
STRIPE_PRICE_VENDOR_PREMIUM_ANNUAL=price_...
```

---

### 5.3 API Endpoints

**`/api/user/subscription/create`** - POST
- Create Stripe checkout session for buyer premium
- Parameter: billing_interval ('monthly' or 'annual')
- Return session ID

**`/api/vendor/subscription/create`** - POST
- Create Stripe checkout session for vendor premium
- Parameter: billing_interval ('monthly' or 'annual')
- Return session ID

**`/api/user/subscription/cancel`** - POST
- Cancel buyer's subscription
- Update tier to 'free' at period end

**`/api/vendor/subscription/cancel`** - POST
- Cancel vendor's subscription
- Update tier to 'standard' at period end

**`/api/webhooks/stripe`** - POST (enhanced)
- Handle: customer.subscription.created
- Handle: customer.subscription.updated
- Handle: customer.subscription.deleted
- Handle: invoice.paid
- Handle: invoice.payment_failed

**`/api/tier/check`** - POST
- Check if user/vendor can use feature
- Feature: 'flash_sale', 'market_box', 'vip_list', etc.
- Return: allowed (boolean), limit (number), used (number)

---

### 5.4 Feature Gates

**Middleware: `src/lib/tier/gates.ts`**

```typescript
// Check if vendor can create flash sale
async function canCreateFlashSale(vendorId: string): Promise<boolean> {
  const vendor = await getVendorProfile(vendorId);
  
  // Premium vendors: unlimited
  if (vendor.tier === 'premium') return true;
  
  // Standard vendors: check weekly limit (2)
  const usage = await getWeeklyUsage(vendorId, 'flash_sales');
  return usage < 2;
}

// Check if vendor can add Monthly Market Box customer
async function canAddMarketBoxCustomer(vendorId: string): Promise<boolean> {
  const vendor = await getVendorProfile(vendorId);
  
  // Premium vendors: unlimited
  if (vendor.tier === 'premium') return true;
  
  // Standard vendors: check concurrent limit (2)
  const activeCount = await getActiveMarketBoxCount(vendorId);
  return activeCount < 2;
}

// Check if buyer can purchase Monthly Market Box
async function canPurchaseMarketBox(userId: string): Promise<boolean> {
  const user = await getUserProfile(userId);
  return user.tier === 'premium';
}
```

**Apply gates before:**
- Creating flash sale
- Creating Monthly Market Box listing
- Purchasing Monthly Market Box
- Adding VIP customer
- Accessing analytics

---

### 5.5 UI Components

**Buyer:**

**`src/app/[vertical]/settings/subscription/page.tsx`**
- Show current tier (free or premium)
- "Upgrade to Premium" button
- Benefits list
- Billing info (if premium)
- "Cancel Subscription" button

**`src/components/UpgradePrompt.tsx`**
- Modal when buyer tries premium feature
- "Upgrade to access Monthly Market Box" message
- "See Premium Benefits" button

**Vendor:**

**`src/app/[vertical]/vendor/dashboard/subscription/page.tsx`**
- Show current tier (standard or premium)
- "Upgrade to Premium" button
- Benefits list
- Usage stats: "Flash sales this week: 2/2 (Upgrade for unlimited)"
- "Cancel Subscription" button

**`src/components/vendor/TierLimitNotice.tsx`**
- Alert when approaching limit
- "You've used 2/2 flash sales this week. Upgrade for unlimited."
- "Upgrade Now" button

---

### 5.6 Testing Checklist

**Subscription Flow:**
- [ ] Buyer upgrades to premium (monthly)
- [ ] Buyer upgrades to premium (annual)
- [ ] Vendor upgrades to premium (monthly)
- [ ] Vendor upgrades to premium (annual)
- [ ] Subscription shown in dashboard
- [ ] Tier updated in database
- [ ] Webhook updates tier correctly

**Feature Gates:**
- [ ] Standard vendor blocked after 2 flash sales/week
- [ ] Premium vendor creates unlimited flash sales
- [ ] Standard vendor blocked after 2 concurrent Market Box customers
- [ ] Free buyer blocked from purchasing Market Box
- [ ] Premium buyer can purchase Market Box
- [ ] Analytics only visible to premium vendors

**Cancellation:**
- [ ] Buyer cancels subscription
- [ ] Access continues until period end
- [ ] Tier reverts to free after period
- [ ] Vendor cancels subscription
- [ ] Same grace period behavior

---

### 5.7 Phase 5 Completion Criteria

**Phase 5 is complete when:**
- ✅ Buyers can upgrade to premium ($9.99/mo or $81.50/yr)
- ✅ Vendors can upgrade to premium ($24.99/mo or $208.15/yr)
- ✅ Stripe subscriptions working end-to-end
- ✅ Feature gates enforce limits by tier
- ✅ Usage tracking for weekly/concurrent limits
- ✅ Webhooks update tiers automatically
- ✅ Cancellation flow working with grace period

---

## Phase 6: Flash Sales System

**Duration:** 12-16 hours  
**Dependency:** Phases 3-5 complete

### Objective
Implement real-time flash sales with timing controls, location restrictions, and tiered access.

---

### 6.1 Database Schema - Flash Sales

**Create Migration:** `YYYYMMDD_HHMMSS_004_flash_sales.sql`

```sql
-- Flash sales table
CREATE TABLE flash_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  
  title TEXT NOT NULL,
  description TEXT,
  
  original_price_cents INTEGER NOT NULL,
  flash_price_cents INTEGER NOT NULL,
  discount_percent DECIMAL(5,2),
  
  quantity_total INTEGER NOT NULL,
  quantity_sold INTEGER DEFAULT 0,
  quantity_remaining INTEGER GENERATED ALWAYS AS (quantity_total - quantity_sold) STORED,
  
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  
  status flash_sale_status DEFAULT 'scheduled',
  
  vendor_certified BOOLEAN DEFAULT FALSE,
  vendor_certified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: cannot overlap at different locations for same vendor
  CONSTRAINT no_overlap_check CHECK (status != 'active')
);

-- Flash sale status enum
CREATE TYPE flash_sale_status AS ENUM (
  'scheduled',  -- Created, not started yet
  'active',     -- Currently running
  'ended',      -- Time expired or sold out
  'cancelled'   -- Vendor cancelled
);

-- Flash sale notifications sent (tracking)
CREATE TABLE flash_sale_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flash_sale_id UUID NOT NULL REFERENCES flash_sales(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  notification_tier TEXT NOT NULL, -- 'premium', 'vip', 'free'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  
  UNIQUE(flash_sale_id, user_id)
);

-- Flash sale purchases (link to order_items)
CREATE TABLE flash_sale_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flash_sale_id UUID NOT NULL REFERENCES flash_sales(id),
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor flash sale usage tracking (for standard tier limit)
CREATE TABLE vendor_flash_sale_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  week_start DATE NOT NULL,
  flash_sale_count INTEGER DEFAULT 0,
  
  UNIQUE(vendor_profile_id, week_start)
);

-- Indexes
CREATE INDEX idx_flash_sales_vendor ON flash_sales(vendor_profile_id);
CREATE INDEX idx_flash_sales_status ON flash_sales(status);
CREATE INDEX idx_flash_sales_active ON flash_sales(status, start_time, end_time);
CREATE INDEX idx_flash_sales_market ON flash_sales(market_id);
CREATE INDEX idx_flash_sale_notifications_user ON flash_sale_notifications(user_id);
CREATE INDEX idx_flash_sale_notifications_sent ON flash_sale_notifications(sent_at);
```

**Add constraint function:**
```sql
-- Function to check for overlapping flash sales at different locations
CREATE OR REPLACE FUNCTION check_flash_sale_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    -- Check if vendor has active flash sale at different market
    IF EXISTS (
      SELECT 1 FROM flash_sales
      WHERE vendor_profile_id = NEW.vendor_profile_id
        AND id != NEW.id
        AND status = 'active'
        AND market_id != NEW.market_id
        AND (NEW.start_time, NEW.end_time) OVERLAPS (start_time, end_time)
    ) THEN
      RAISE EXCEPTION 'Vendor already has active flash sale at different location';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flash_sale_overlap_check
  BEFORE INSERT OR UPDATE ON flash_sales
  FOR EACH ROW
  EXECUTE FUNCTION check_flash_sale_overlap();
```

---

### 6.2 API Endpoints

**`/api/vendor/flash-sales/create`** - POST
- Validate vendor tier and weekly limit
- Validate no overlapping flash sales at different locations
- Create flash sale record
- Schedule notification job
- Return flash sale ID

**`/api/vendor/flash-sales/end/[id]`** - POST
- End flash sale early
- Update status to 'ended'
- Release unsold inventory

**`/api/vendor/flash-sales`** - GET
- List vendor's flash sales
- Filter by status, date range

**`/api/flash-sales/active`** - GET
- Public endpoint (authenticated)
- Return active flash sales for user's location
- Filter by purchase history (past 365 days)
- Filter by distance (25 miles)
- Respect tier access timing

**`/api/flash-sales/[id]`** - GET
- Flash sale details
- Check if user has access based on tier timing

**`/api/flash-sales/[id]/purchase`** - POST
- Validate access (tier timing)
- Validate quantity available
- Create order with flash sale pricing
- Decrement flash sale quantity
- Create flash_sale_purchase record

---

### 6.3 Background Jobs

**Schedule with pg_cron or similar:**

**Flash Sale Activation Job (runs every minute):**
```sql
-- Find flash sales scheduled to start
SELECT * FROM flash_sales
WHERE status = 'scheduled'
  AND start_time <= NOW();

-- Update status to 'active'
-- Trigger notification job
```

**Flash Sale Expiration Job (runs every minute):**
```sql
-- Find flash sales that should end
SELECT * FROM flash_sales
WHERE status = 'active'
  AND (end_time <= NOW() OR quantity_remaining = 0);

-- Update status to 'ended'
```

**Flash Sale Notification Job (triggered on activation):**
```typescript
async function sendFlashSaleNotifications(flashSaleId: string) {
  const flashSale = await getFlashSale(flashSaleId);
  const vendor = await getVendorProfile(flashSale.vendor_profile_id);
  
  // Get eligible users
  const eligibleUsers = await getEligibleUsers({
    vendorId: vendor.id,
    marketId: flashSale.market_id,
    radiusMiles: 25,
    purchasedWithin: 365 // days
  });
  
  // Send in batches by tier timing
  // Premium: immediately
  await sendNotifications(eligibleUsers.filter(u => u.tier === 'premium'), flashSale);
  
  // VIPs: 5 minutes later
  setTimeout(() => {
    const vips = await getVIPsForVendor(vendor.id);
    await sendNotifications(vips.filter(u => u.tier !== 'premium'), flashSale);
  }, 5 * 60 * 1000);
  
  // Free tier: 10 minutes later
  setTimeout(() => {
    const freeTier = eligibleUsers.filter(u => u.tier === 'free' && !isVIP(u));
    await sendNotifications(freeTier, flashSale);
  }, 10 * 60 * 1000);
}
```

---

### 6.4 UI Components

**Vendor:**

**`src/app/[vertical]/vendor/dashboard/flash-sales/create/page.tsx`**
- Select existing listing (or create new)
- Set flash sale price (discount %)
- Set quantity (validate against inventory)
- Select market location
- Set duration (1-4 hours)
- Certification checkbox: "I certify I have this inventory on-hand"
- "Create Flash Sale" button
- Tier limit warning if at limit

**`src/app/[vertical]/vendor/dashboard/flash-sales/page.tsx`**
- List active, scheduled, and ended flash sales
- "End Sale Early" button
- Performance metrics (views, purchases, conversion)

**Buyer:**

**`src/app/[vertical]/flash-sales/page.tsx`**
- List active flash sales near buyer
- Filter: vendor, distance, time remaining
- Countdown timer for each sale
- "Buy Now" button
- Tier badge: "Premium Early Access" or "VIP Early Access"

**`src/app/[vertical]/flash-sales/[id]/page.tsx`**
- Flash sale details
- Countdown timer
- Quantity remaining bar
- Discount badge
- Vendor info
- "Purchase" button
- Access tier indicator

---

### 6.5 Testing Checklist

**Creation & Limits:**
- [ ] Premium vendor creates flash sale (succeeds)
- [ ] Standard vendor creates 1st flash sale (succeeds)
- [ ] Standard vendor creates 2nd flash sale same week (succeeds)
- [ ] Standard vendor tries 3rd flash sale same week (blocked)
- [ ] Vendor creates flash sale at Market A
- [ ] Vendor tries creating overlapping flash sale at Market B (blocked)
- [ ] Vendor ends flash sale at Market A
- [ ] Vendor creates flash sale at Market B (succeeds)

**Tiered Access:**
- [ ] Premium buyer sees flash sale immediately
- [ ] VIP (non-premium) sees flash sale 5 min later
- [ ] Free tier buyer sees flash sale 10 min later
- [ ] Premium buyer purchases immediately
- [ ] Flash sale sells out before free tier access
- [ ] Free tier buyer sees "sold out"

**Inventory:**
- [ ] Flash sale quantity tracked separately from listing
- [ ] Purchase decrements flash sale quantity
- [ ] Flash sale ends when quantity reaches 0
- [ ] Flash sale ends when time expires
- [ ] Unsold inventory can be released by vendor

---

### 6.6 Phase 6 Completion Criteria

**Phase 6 is complete when:**
- ✅ Vendors can create flash sales with pricing/quantity/duration
- ✅ Tier limits enforced (2/week for standard)
- ✅ Location exclusivity enforced (no overlaps)
- ✅ Tiered notification timing working (10 min, 5 min, immediate)
- ✅ Background jobs activate and expire flash sales
- ✅ Buyers can discover and purchase flash sales
- ✅ Inventory tracking accurate
- ✅ All test cases pass

---

## Phase 7: VIP System + Priority Notifications

**Duration:** 10-12 hours  
**Dependency:** Phase 6 complete

### Objective
Enable premium vendors to tag VIP customers, implement priority notification timing for flash sales and new bundles.

---

### 7.1 Database Schema - VIP System

**Create Migration:** `YYYYMMDD_HHMMSS_005_vip_system.sql`

```sql
-- VIP customers table
CREATE TABLE vip_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by_user_id UUID REFERENCES auth.users(id),
  
  last_purchase_at TIMESTAMPTZ,
  total_purchases INTEGER DEFAULT 0,
  lifetime_value_cents INTEGER DEFAULT 0,
  
  auto_removed_at TIMESTAMPTZ,
  removal_reason TEXT,
  
  UNIQUE(vendor_profile_id, user_id)
);

-- VIP notifications sent (consolidated daily)
CREATE TABLE vip_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  notification_date DATE NOT NULL,
  vendor_ids UUID[] NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  
  UNIQUE(user_id, notification_date)
);

-- New bundle notifications (for priority timing)
CREATE TABLE bundle_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  notification_tier TEXT NOT NULL, -- 'premium', 'vip', 'free'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(listing_id, user_id)
);

-- Indexes
CREATE INDEX idx_vip_customers_vendor ON vip_customers(vendor_profile_id);
CREATE INDEX idx_vip_customers_user ON vip_customers(user_id);
CREATE INDEX idx_vip_customers_last_purchase ON vip_customers(last_purchase_at);
CREATE INDEX idx_vip_notifications_user_date ON vip_notifications(user_id, notification_date);
```

---

### 7.2 VIP Management Logic

**Capacity Check:**
```typescript
async function canAddVIP(vendorId: string): Promise<boolean> {
  const vendor = await getVendorProfile(vendorId);
  
  // Only premium vendors can have VIPs
  if (vendor.tier !== 'premium') return false;
  
  // Check capacity (max 25)
  const vipCount = await countVIPs(vendorId);
  return vipCount < 25;
}
```

**Auto-Removal Job (runs weekly):**
```sql
-- Find VIPs with no purchase in 6 months
UPDATE vip_customers
SET 
  auto_removed_at = NOW(),
  removal_reason = 'No purchase in 6 months'
WHERE last_purchase_at < NOW() - INTERVAL '6 months'
  AND auto_removed_at IS NULL;

-- Send notification to removed VIPs (optional)
```

**VIP Metrics:**
```typescript
async function getVIPMetrics(vendorId: string) {
  return {
    totalVIPs: await countVIPs(vendorId),
    capacity: 25,
    averageLTV: await getAverageLTV(vendorId),
    repeatPurchaseRate: await getRepeatRate(vendorId),
    lastPurchaseDates: await getVIPPurchaseDates(vendorId)
  };
}
```

---

### 7.3 Priority Notification System

**New Bundle Posted:**
```typescript
async function sendBundleNotifications(listingId: string) {
  const listing = await getListing(listingId);
  const vendor = await getVendorProfile(listing.vendor_profile_id);
  
  // Get eligible users (past customers, nearby)
  const eligibleUsers = await getEligibleUsers({
    vendorId: vendor.id,
    marketIds: listing.market_ids,
    purchasedWithin: 365
  });
  
  // Premium members: immediately
  const premiumUsers = eligibleUsers.filter(u => u.tier === 'premium');
  await sendNotifications(premiumUsers, listing, 'premium');
  
  // VIPs (non-premium): 1 hour later
  setTimeout(async () => {
    const vips = await getVIPsForVendor(vendor.id);
    const vipNonPremium = vips.filter(v => v.tier !== 'premium');
    await sendNotifications(vipNonPremium, listing, 'vip');
  }, 60 * 60 * 1000);
  
  // Free tier: 2 hours later
  setTimeout(async () => {
    const freeTier = eligibleUsers.filter(
      u => u.tier === 'free' && !isVIP(u.id, vendor.id)
    );
    await sendNotifications(freeTier, listing, 'free');
  }, 120 * 60 * 1000);
}
```

**VIP Consolidation Job (runs daily at 8am):**
```typescript
async function sendDailyVIPNotifications() {
  // Find all bundles posted yesterday
  const yesterdayBundles = await getBundlesPostedYesterday();
  
  // Group by vendors
  const vendorBundles = groupBy(yesterdayBundles, 'vendor_profile_id');
  
  // For each user who is VIP for any of these vendors
  const vipUsers = await getVIPUsersForVendors(Object.keys(vendorBundles));
  
  for (const user of vipUsers) {
    // Get all vendors this user is VIP for who posted yesterday
    const relevantVendors = vendorBundles.filter(v => 
      isVIP(user.id, v.vendor_id)
    );
    
    // Send ONE consolidated email
    await sendConsolidatedVIPEmail(user, relevantVendors);
    
    // Track sent
    await createVIPNotification(user.id, relevantVendors.map(v => v.id));
  }
}
```

---

### 7.4 API Endpoints

**`/api/vendor/vips`** - GET
- List vendor's VIP customers
- Include metrics (LTV, last purchase, total purchases)

**`/api/vendor/vips/add`** - POST
- Check capacity (max 25)
- Add customer to VIP list
- Send notification to customer
- Return success

**`/api/vendor/vips/remove/[userId]`** - DELETE
- Remove customer from VIP list
- Optional: send notification
- Return success

**`/api/vendor/vips/metrics`** - GET
- Return VIP dashboard metrics
- Total VIPs, capacity, LTV, repeat rate

**`/api/user/vip-status`** - GET
- Return which vendors user is VIP for
- Include benefits info

---

### 7.5 UI Components

**Vendor:**

**`src/app/[vertical]/vendor/dashboard/vips/page.tsx`**
- VIP capacity indicator: "18/25 slots used"
- List VIP customers with:
  - Name
  - Last purchase date
  - Total purchases
  - Lifetime value
  - "Remove" button
- Search/filter VIP list
- "Add VIP" button (opens customer search modal)

**`src/app/[vertical]/vendor/dashboard/customers/page.tsx`**
- List all past customers
- Each row has "Add to VIP" button
- Disabled if at capacity
- Shows if already VIP

**`src/app/[vertical]/vendor/dashboard/vips/metrics.tsx`**
- Dashboard widget showing:
  - Total VIPs
  - Average LTV
  - Repeat purchase rate
  - VIPs approaching 6-month inactivity

**Buyer:**

**`src/app/[vertical]/buyer/profile/vip-status.tsx`**
- List vendors user is VIP for
- VIP benefits explanation
- "You'll get early access to flash sales and new bundles"

**Email Templates:**

**VIP Welcome Email:**
```
Subject: You're a VIP at [Vendor Name]! 🌟

Hi [Buyer Name],

Great news! [Vendor Name] has added you to their VIP customer list.

As a VIP, you get:
- 5-minute early access to flash sales (after premium members)
- 1-hour early access to new bundles (after premium members)
- Notifications when they post new items

Keep an eye out for special offers from [Vendor Name]!

[View Your VIP Vendors]
```

**VIP Consolidated Daily Email:**
```
Subject: New bundles from your favorite vendors! 🌟

Hi [Buyer Name],

Good news! 3 vendors you follow posted new items yesterday:

📦 Green Acres Farm - "Summer Harvest Box" - $45
   Pick up: Downtown Market (Sat 8am-1pm) or Farm (Tue 4-6pm)
   [View Bundle]

📦 Baker's Dozen - "Sourdough + Pastry Bundle" - $30
   Pick up: Downtown Market (Sat 8am-1pm)
   [View Bundle]

📦 Hill Country Honey - "Raw Honey Trio" - $25
   Pick up: Saturday Market or by appointment
   [View Bundle]

You're a VIP with these vendors, so you get 1-hour early access 
before everyone else. Check them out before they sell out!

[View All New Bundles]
```

---

### 7.6 Testing Checklist

**VIP Management:**
- [ ] Premium vendor adds VIP (succeeds)
- [ ] Standard vendor tries to add VIP (blocked)
- [ ] Premium vendor adds 25th VIP (succeeds)
- [ ] Premium vendor tries to add 26th VIP (blocked)
- [ ] VIP receives welcome notification
- [ ] VIP metrics display correctly
- [ ] Vendor removes VIP manually
- [ ] Auto-removal runs (6 months inactivity)

**Priority Notifications:**
- [ ] Vendor posts new bundle
- [ ] Premium buyers notified immediately
- [ ] VIPs notified 1 hour later
- [ ] Free tier notified 2 hours later
- [ ] VIP consolidation email sent (multiple vendors)
- [ ] VIP who is premium member gets premium timing (not VIP timing)

**Flash Sales + VIP:**
- [ ] Premium vendor posts flash sale
- [ ] Premium buyers notified immediately
- [ ] VIPs notified 5 min later
- [ ] Free tier notified 10 min later

---

### 7.7 Phase 7 Completion Criteria

**Phase 7 is complete when:**
- ✅ Premium vendors can add up to 25 VIPs
- ✅ VIP welcome notifications sent
- ✅ VIP metrics dashboard working
- ✅ Auto-removal after 6 months inactivity
- ✅ Priority notification timing working:
  - New bundles: 0hr (premium), 1hr (VIP), 2hr (free)
  - Flash sales: 0min (premium), 5min (VIP), 10min (free)
- ✅ VIP consolidation email working
- ✅ All test cases pass

---

## Phase 8: Monthly Market Box

**Duration:** 8-10 hours  
**Dependency:** Phases 3-7 complete

### Objective
Implement 4-week prepaid box system with capacity limits by tier.

---

### 8.1 Database Schema - Market Box

**Create Migration:** `YYYYMMDD_HHMMSS_006_market_box.sql`

```sql
-- Market Box subscriptions (not recurring, one-time 4-week)
CREATE TABLE market_box_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  listing_id UUID NOT NULL REFERENCES listings(id),
  
  weeks_total INTEGER DEFAULT 4,
  weeks_remaining INTEGER DEFAULT 4,
  
  base_price_cents INTEGER NOT NULL, -- per week
  total_paid_cents INTEGER NOT NULL, -- 4 weeks upfront
  
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  current_week INTEGER DEFAULT 1,
  
  status market_box_status DEFAULT 'active',
  
  stripe_payment_intent_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market Box status enum
CREATE TYPE market_box_status AS ENUM (
  'active',     -- Currently running
  'completed',  -- All 4 weeks done
  'cancelled'   -- Vendor or buyer cancelled
);

-- Market Box pickups (weekly tracking)
CREATE TABLE market_box_pickups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_box_subscription_id UUID NOT NULL REFERENCES market_box_subscriptions(id),
  week_number INTEGER NOT NULL,
  
  scheduled_date DATE NOT NULL,
  market_id UUID NOT NULL REFERENCES markets(id),
  pickup_time_start TIME,
  pickup_time_end TIME,
  
  picked_up_at TIMESTAMPTZ,
  order_item_id UUID REFERENCES order_items(id),
  
  status pickup_status DEFAULT 'scheduled',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(market_box_subscription_id, week_number)
);

-- Pickup status enum
CREATE TYPE pickup_status AS ENUM (
  'scheduled',
  'ready',
  'picked_up',
  'missed'
);

-- Indexes
CREATE INDEX idx_market_box_buyer ON market_box_subscriptions(buyer_user_id);
CREATE INDEX idx_market_box_vendor ON market_box_subscriptions(vendor_profile_id);
CREATE INDEX idx_market_box_status ON market_box_subscriptions(status);
CREATE INDEX idx_market_box_pickups_subscription ON market_box_pickups(market_box_subscription_id);
```

---

### 8.2 API Endpoints

**`/api/vendor/market-box/create`** - POST
- Check vendor tier and concurrent limit
- Create market box listing (listing_type = 'market_box')
- Set weekly price and 4-week total
- Return listing ID

**`/api/vendor/market-box/active`** - GET
- Count active subscriptions
- Return list with buyer info, weeks remaining

**`/api/buyer/market-box/purchase`** - POST
- Check buyer tier (premium only)
- Validate vendor capacity
- Create market_box_subscription
- Create 4 pickup records
- Process payment (4-week total)
- Vendor receives full amount upfront
- Return subscription ID

**`/api/buyer/market-box`** - GET
- List buyer's active subscriptions
- Include pickup schedule

**`/api/buyer/market-box/[id]/pickups`** - GET
- List pickups for subscription
- Show status for each week

**`/api/vendor/market-box/[id]/mark-ready`** - POST
- Mark current week ready for pickup

**`/api/buyer/market-box/[id]/confirm-pickup`** - POST
- Confirm pickup for current week
- Decrement weeks_remaining
- Update status if all weeks complete

---

### 8.3 Business Logic

**Capacity Check:**
```typescript
async function canCreateMarketBox(vendorId: string): Promise<boolean> {
  const vendor = await getVendorProfile(vendorId);
  
  // Premium vendors: unlimited
  if (vendor.tier === 'premium') return true;
  
  // Standard vendors: max 2 concurrent
  const activeCount = await countActiveMarketBoxes(vendorId);
  return activeCount < 2;
}
```

**Buyer Eligibility:**
```typescript
async function canPurchaseMarketBox(userId: string): Promise<boolean> {
  const user = await getUserProfile(userId);
  return user.tier === 'premium';
}
```

**Subscription Management:**
```typescript
// When buyer purchases
async function createMarketBoxSubscription(data) {
  // Create subscription record
  const subscription = await createSubscription({
    ...data,
    weeks_total: 4,
    weeks_remaining: 4,
    start_date: nextMarketDate(),
    end_date: addWeeks(nextMarketDate(), 4)
  });
  
  // Create 4 pickup records
  for (let week = 1; week <= 4; week++) {
    await createPickup({
      subscription_id: subscription.id,
      week_number: week,
      scheduled_date: addWeeks(subscription.start_date, week - 1),
      market_id: data.market_id
    });
  }
  
  return subscription;
}

// When week completes
async function completeWeek(subscriptionId: string, weekNumber: number) {
  await updatePickupStatus(subscriptionId, weekNumber, 'picked_up');
  
  const subscription = await getSubscription(subscriptionId);
  const newWeeksRemaining = subscription.weeks_remaining - 1;
  
  await updateSubscription(subscriptionId, {
    weeks_remaining: newWeeksRemaining,
    current_week: weekNumber + 1
  });
  
  // If all weeks done, mark completed
  if (newWeeksRemaining === 0) {
    await updateSubscription(subscriptionId, {
      status: 'completed'
    });
    
    // Free up vendor slot
  }
}
```

---

### 8.4 UI Components

**Vendor:**

**`src/app/[vertical]/vendor/dashboard/market-box/create/page.tsx`**
- Form: weekly bundle, price per week
- Calculate 4-week discount (suggest 10-15% off)
- Show total buyer pays
- Show vendor receives upfront
- "Create Market Box Offering" button
- Capacity indicator if standard tier

**`src/app/[vertical]/vendor/dashboard/market-box/active/page.tsx`**
- List active subscriptions
- For each: buyer name, current week, weeks remaining
- "Mark Week Ready" button

**`src/app/[vertical]/vendor/dashboard/market-box/capacity.tsx`**
- Standard tier: "2/2 slots used. Upgrade for unlimited."
- Premium tier: "Unlimited market boxes"

**Buyer:**

**`src/app/[vertical]/browse/market-boxes.tsx`**
- Filter: Market Box offerings only
- Show weekly price and 4-week total
- "Premium Members Only" badge for free tier

**`src/app/[vertical]/market-box/[id]/purchase.tsx`**
- Bundle details
- 4-week schedule preview
- Total cost breakdown
- Pickup location/time selection
- "Purchase 4-Week Box" button

**`src/app/[vertical]/buyer/market-boxes/page.tsx`**
- List active subscriptions
- For each: vendor, weeks remaining, next pickup date
- "View Schedule" button
- "Confirm Pickup" button (for current week)

**`src/app/[vertical]/buyer/market-boxes/[id]/schedule.tsx`**
- Week-by-week schedule
- Status for each week: scheduled, ready, picked up
- Pickup location/time for each

---

### 8.5 Testing Checklist

**Creation:**
- [ ] Premium vendor creates market box (succeeds)
- [ ] Standard vendor creates 1st market box (succeeds)
- [ ] Standard vendor creates 2nd market box (succeeds)
- [ ] Standard vendor tries 3rd market box (blocked - at capacity)

**Purchase:**
- [ ] Premium buyer purchases market box (succeeds)
- [ ] Free tier buyer tries to purchase (blocked)
- [ ] Payment processes correctly (4-week total)
- [ ] Vendor receives full amount upfront
- [ ] Vendor slot filled (capacity check)

**Lifecycle:**
- [ ] Week 1: Vendor marks ready, buyer picks up
- [ ] Week 2: Vendor marks ready, buyer picks up
- [ ] Week 3: Vendor marks ready, buyer picks up
- [ ] Week 4: Vendor marks ready, buyer picks up
- [ ] Subscription marked completed
- [ ] Vendor slot freed (capacity available)

**Edge Cases:**
- [ ] Buyer misses week (no pickup)
- [ ] Vendor cancels subscription (refund partial)
- [ ] Standard vendor at capacity upgrades to premium (capacity unlimited)

---

### 8.6 Phase 8 Completion Criteria

**Phase 8 is complete when:**
- ✅ Vendors can create Market Box offerings
- ✅ Capacity limits enforced (2 standard, unlimited premium)
- ✅ Premium buyers can purchase 4-week boxes
- ✅ Free buyers blocked from purchasing
- ✅ Vendor receives full payment upfront
- ✅ 4-week pickup schedule created
- ✅ Week-by-week tracking working
- ✅ Subscription completes after 4 weeks
- ✅ Vendor slot freed after completion

---

## Phase 9-12 Summary

**Phase 9: Communication System** (6-8 hrs)
- Pre-scripted messages (vendor ↔ buyer)
- Email delivery
- Message logging
- Premium vendor only

**Phase 10: Advanced Analytics** (8-10 hrs)
- Sales metrics dashboard
- Best-selling bundles
- Repeat customer rate
- Week-over-week growth
- Premium vendors only

**Phase 11: Data Retention** (4-6 hrs)
- Automated archival jobs
- 33-day rolling window (standard)
- 150-day / current year (premium)
- Long-term storage

**Phase 12: Polish + Testing** (8-10 hrs)
- UI refinement
- Edge case handling
- Load testing
- Security audit
- Documentation

---

## Build Execution Guidelines

### For Each Phase:

**1. Planning (CC reads build plan)**
- Review phase objectives
- Understand dependencies
- Check completion criteria

**2. Implementation**
- Create migrations FIRST (with timestamps)
- Apply to Dev, test, apply to Staging
- Update MIGRATION_LOG.md
- Build API endpoints
- Build UI components
- Write tests

**3. Testing**
- Run through test checklist
- Fix bugs
- Verify completion criteria

**4. Documentation**
- Update session summary
- Document decisions
- Note any deviations from plan

**5. Commit & Push**
- Commit after each component
- Push after 2-3 commits
- Always push at end of session

---

## Session Summary Template

```markdown
# Session Summary - Phase [N]: [Phase Name]

**Date:** YYYY-MM-DD
**Duration:** X hours
**Status:** [In Progress / Complete / Blocked]

## Completed Tasks
- [ ] Task 1
- [ ] Task 2

## Migrations Created
- `YYYYMMDD_HHMMSS_NNN_description.sql` - Applied to Dev ✅ Staging ✅

## Files Created
- `path/to/file.ts` - Purpose

## Files Modified
- `path/to/file.ts` - Changes made

## Testing Results
- [ ] Test case 1: Pass/Fail
- [ ] Test case 2: Pass/Fail

## Issues Encountered
- Issue 1: Resolution

## Next Session
- Task 1 to start
- Task 2 to continue

## Notes
- Important decisions
- Deviations from plan
```

---

## Success Metrics

**After Phase 3:** Working marketplace, real transactions
**After Phase 6:** Flash sales live, creating urgency
**After Phase 8:** Recurring revenue from Market Boxes
**After Phase 12:** Production-ready platform

**Total Timeline:** 11-14 full work days (90-114 hours)

---

*End of Build Plan*
