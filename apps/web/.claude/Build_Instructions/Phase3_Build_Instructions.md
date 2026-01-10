# Build Instructions - Phase 3: Core Commerce Engine

**Created:** January 9, 2026  
**For:** Claude Code (CC)  
**Phase:** 3 of 12  
**Priority:** CRITICAL - Foundation for all commerce features  
**Estimated Duration:** 16-20 hours

---

## Objective

Enable complete buy-sell transaction flow for FastWrks BuildApp marketplace.

**What users can do after this phase:**
- **Vendors:** Connect Stripe account, create paid bundles, see incoming orders, mark orders fulfilled
- **Buyers:** Browse bundles, add to cart, checkout with Stripe, track orders, confirm pickup
- **Platform:** Collect 6.5% fee from buyers + 6.5% from vendors = ~9.3% net revenue

---

## Current State (Already Built)

✅ Multi-brand authentication (fastwrks.com, farmersmarket.app)  
✅ User profiles and vendor profiles  
✅ Basic listings table (title, description, price, quantity)  
✅ Supabase Auth + Session management  
✅ Vendor dashboard (basic)  
✅ Migration tracking system

---

## What This Phase Adds

### New Database Tables:
- `orders` - Buyer's shopping cart/order
- `order_items` - Individual items in order (links to bundles)
- `payments` - Stripe payment tracking
- `vendor_payouts` - Stripe Connect transfer tracking

### New Features:
- Stripe Connect onboarding for vendors
- Shopping cart functionality
- Stripe checkout integration
- Order management (vendor + buyer dashboards)
- Automated fee calculation (6.5% buyer + 6.5% vendor)
- Vendor payout processing

---

## Phase 3 Tasks Overview

1. Create database migrations (orders, payments, payouts)
2. Integrate Stripe Connect
3. Build cart and checkout APIs
4. Build vendor order management APIs
5. Build vendor Stripe onboarding UI
6. Build vendor orders dashboard
7. Build buyer browse and cart UI
8. Build buyer checkout flow
9. Build buyer orders dashboard
10. Test end-to-end flows

---

## Step 1: Database Migrations

### Task 1.1: Create Main Migration File

**File:** `supabase/migrations/YYYYMMDD_HHMMSS_001_orders_and_payments.sql`

**Replace YYYYMMDD_HHMMSS with actual timestamp when creating file.**

```sql
-- ============================================================================
-- Migration: Phase 3 - Orders and Payments
-- Created: [Auto-fill with current timestamp]
-- Purpose: Add complete commerce system (orders, payments, payouts)
-- Dependencies: Existing listings, vendor_profiles, user_profiles tables
-- ============================================================================

-- Applied to:
-- [ ] Dev (project-ref: vawpviatqalicckkqchs) - Date: _______
-- [ ] Staging (project-ref: vfknvsxfgcwqmlkuzhnq) - Date: _______

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Order status
CREATE TYPE order_status AS ENUM (
  'pending',      -- Created but not paid
  'paid',         -- Payment successful
  'confirmed',    -- Vendor confirmed
  'ready',        -- Ready for pickup
  'completed',    -- All items picked up
  'cancelled',    -- Buyer cancelled before payment
  'refunded'      -- Full refund processed
);

-- Order item status
CREATE TYPE order_item_status AS ENUM (
  'pending',      -- Awaiting vendor confirmation
  'confirmed',    -- Vendor accepted
  'ready',        -- Vendor marked ready for pickup
  'fulfilled',    -- Buyer picked up
  'cancelled',    -- Vendor cancelled
  'refunded'      -- Refunded to buyer
);

-- Payment status
CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded'
);

-- Payout status
CREATE TYPE payout_status AS ENUM (
  'pending',      -- Awaiting transfer
  'processing',   -- Stripe processing
  'completed',    -- Successfully transferred
  'failed',       -- Transfer failed
  'cancelled'     -- Cancelled before transfer
);

-- Listing type (add to existing listings table)
CREATE TYPE listing_type AS ENUM ('presale', 'flash', 'market_box');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Orders table (buyer's cart)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL REFERENCES verticals(id),
  order_number TEXT UNIQUE NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  stripe_checkout_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE orders IS 'Buyer orders (shopping carts)';
COMMENT ON COLUMN orders.order_number IS 'Human-readable order number (e.g., FW-2026-00001)';
COMMENT ON COLUMN orders.subtotal_cents IS 'Sum of all order items before fees';
COMMENT ON COLUMN orders.platform_fee_cents IS 'Total platform fees (buyer + vendor fees)';
COMMENT ON COLUMN orders.total_cents IS 'Final amount charged to buyer';

-- Order items table (links orders to bundles)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  vendor_payout_cents INTEGER NOT NULL,
  status order_item_status NOT NULL DEFAULT 'pending',
  pickup_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_items IS 'Individual items within orders';
COMMENT ON COLUMN order_items.unit_price_cents IS 'Price per unit at time of purchase (base price)';
COMMENT ON COLUMN order_items.subtotal_cents IS 'quantity × unit_price_cents';
COMMENT ON COLUMN order_items.platform_fee_cents IS 'Total platform fee for this item';
COMMENT ON COLUMN order_items.vendor_payout_cents IS 'Amount vendor receives after platform fee';

-- Payments table (Stripe tracking)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
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

COMMENT ON TABLE payments IS 'Stripe payment tracking';
COMMENT ON COLUMN payments.stripe_payment_intent_id IS 'Stripe payment intent ID';
COMMENT ON COLUMN payments.amount_cents IS 'Total amount charged to buyer';

-- Vendor payouts table (Stripe Connect transfers)
CREATE TABLE vendor_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  amount_cents INTEGER NOT NULL,
  stripe_transfer_id TEXT UNIQUE,
  status payout_status NOT NULL DEFAULT 'pending',
  transferred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendor_payouts IS 'Stripe Connect transfers to vendors';
COMMENT ON COLUMN vendor_payouts.stripe_transfer_id IS 'Stripe transfer ID';
COMMENT ON COLUMN vendor_payouts.amount_cents IS 'Amount transferred to vendor';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Orders indexes
CREATE INDEX idx_orders_buyer ON orders(buyer_user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_vertical ON orders(vertical_id);

-- Order items indexes
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_vendor ON order_items(vendor_profile_id);
CREATE INDEX idx_order_items_listing ON order_items(listing_id);
CREATE INDEX idx_order_items_status ON order_items(status);

-- Payments indexes
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Vendor payouts indexes
CREATE INDEX idx_payouts_vendor ON vendor_payouts(vendor_profile_id);
CREATE INDEX idx_payouts_order_item ON vendor_payouts(order_item_id);
CREATE INDEX idx_payouts_status ON vendor_payouts(status);

-- ============================================================================
-- ALTER EXISTING TABLES
-- ============================================================================

-- Add Stripe Connect fields to vendor_profiles
ALTER TABLE vendor_profiles 
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN vendor_profiles.stripe_account_id IS 'Stripe Connect account ID';
COMMENT ON COLUMN vendor_profiles.stripe_onboarding_complete IS 'Has vendor completed Stripe onboarding';
COMMENT ON COLUMN vendor_profiles.stripe_charges_enabled IS 'Can vendor accept charges';
COMMENT ON COLUMN vendor_profiles.stripe_payouts_enabled IS 'Can vendor receive payouts';

-- Add listing_type to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_type listing_type DEFAULT 'presale';

COMMENT ON COLUMN listings.listing_type IS 'Type of listing: presale, flash, market_box';

-- Add fee structure to verticals (if not exists)
ALTER TABLE verticals 
  ADD COLUMN IF NOT EXISTS buyer_fee_percent DECIMAL(4,2) DEFAULT 6.5,
  ADD COLUMN IF NOT EXISTS vendor_fee_percent DECIMAL(4,2) DEFAULT 6.5;

COMMENT ON COLUMN verticals.buyer_fee_percent IS 'Buyer markup percentage (default 6.5%)';
COMMENT ON COLUMN verticals.vendor_fee_percent IS 'Vendor deduction percentage (default 6.5%)';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payouts ENABLE ROW LEVEL SECURITY;

-- Orders: Buyers see their own orders
CREATE POLICY orders_buyer_select ON orders
  FOR SELECT 
  USING (auth.uid() = buyer_user_id);

-- Orders: Vendors see orders containing their items
CREATE POLICY orders_vendor_select ON orders
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN vendor_profiles vp ON oi.vendor_profile_id = vp.id
      WHERE oi.order_id = orders.id AND vp.user_id = auth.uid()
    )
  );

-- Order items: Buyers see items in their orders
CREATE POLICY order_items_buyer_select ON order_items
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  );

-- Order items: Vendors see their items
CREATE POLICY order_items_vendor_select ON order_items
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );

-- Order items: Vendors can update their items (status changes)
CREATE POLICY order_items_vendor_update ON order_items
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = order_items.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );

-- Payments: Buyers see their payments
CREATE POLICY payments_buyer_select ON payments
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = payments.order_id AND o.buyer_user_id = auth.uid()
    )
  );

-- Vendor payouts: Vendors see their payouts
CREATE POLICY vendor_payouts_select ON vendor_payouts
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = vendor_payouts.vendor_profile_id AND vp.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated timestamp triggers (reuse existing function if available)
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER vendor_payouts_updated_at
  BEFORE UPDATE ON vendor_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- END MIGRATION
-- ============================================================================
```

### Task 1.2: Apply Migration to Dev

```bash
# In project root
cd apps/web

# Apply migration to Dev
supabase db push --project-ref vawpviatqalicckkqchs
```

**Verify:**
1. Check Supabase Dev dashboard → Database → Tables
2. Confirm new tables exist: orders, order_items, payments, vendor_payouts
3. Check enums created
4. Check indexes created

**Update migration header:**
- Mark `[x] Dev` with today's date and time

### Task 1.3: Apply Migration to Staging

```bash
# Apply migration to Staging
supabase db push --project-ref vfknvsxfgcwqmlkuzhnq
```

**Verify same as Dev**

**Update migration header:**
- Mark `[x] Staging` with today's date and time

### Task 1.4: Update MIGRATION_LOG.md

**File:** `supabase/migrations/MIGRATION_LOG.md`

**Add entry:**
```markdown
| Migration File | Dev Status | Dev Date | Staging Status | Staging Date | Notes |
|----------------|------------|----------|----------------|--------------|-------|
| YYYYMMDD_HHMMSS_001_orders_and_payments.sql | ✅ | 2026-01-09 HH:MM | ✅ | 2026-01-09 HH:MM | Phase 3: Core commerce tables |
```

### Task 1.5: Commit Migration

```bash
git add supabase/migrations/
git commit -m "Phase 3: Create orders and payments migration

- Add orders, order_items, payments, vendor_payouts tables
- Add Stripe Connect fields to vendor_profiles
- Add listing_type enum and column
- Add RLS policies for multi-tenant access
- Applied to Dev and Staging"
git push origin main
```

---

## Step 2: Stripe Connect Integration

### Task 2.1: Install Stripe SDK

```bash
npm install stripe @stripe/stripe-js
```

### Task 2.2: Add Environment Variables

**File:** `apps/web/.env.local`

```
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51...
```

**Get from:** Stripe Dashboard → Developers → API keys

### Task 2.3: Create Stripe Utilities

**File:** `src/lib/stripe/config.ts`

```typescript
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true,
});

export const STRIPE_CONFIG = {
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
  applicationFeePercent: 13.0, // 6.5% buyer + 6.5% vendor
  buyerFeePercent: 6.5,
  vendorFeePercent: 6.5,
};
```

**File:** `src/lib/stripe/connect.ts`

```typescript
import { stripe } from './config';

/**
 * Create Stripe Connect Express account for vendor
 */
export async function createConnectAccount(email: string) {
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  return account;
}

/**
 * Create account link for vendor onboarding
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return accountLink;
}

/**
 * Check account status
 */
export async function getAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);

  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: account.requirements,
  };
}
```

**File:** `src/lib/stripe/payments.ts`

```typescript
import { stripe, STRIPE_CONFIG } from './config';

/**
 * Calculate fees for transaction
 */
export function calculateFees(basePriceCents: number) {
  const buyerFeeCents = Math.round(
    basePriceCents * (STRIPE_CONFIG.buyerFeePercent / 100)
  );
  const vendorFeeCents = Math.round(
    basePriceCents * (STRIPE_CONFIG.vendorFeePercent / 100)
  );

  const buyerPaysCents = basePriceCents + buyerFeeCents;
  const vendorGetsCents = basePriceCents - vendorFeeCents;
  const platformFeeCents = buyerFeeCents + vendorFeeCents;

  return {
    basePriceCents,
    buyerFeeCents,
    vendorFeeCents,
    buyerPaysCents,
    vendorGetsCents,
    platformFeeCents,
  };
}

/**
 * Create checkout session
 */
export async function createCheckoutSession({
  orderId,
  orderNumber,
  items,
  successUrl,
  cancelUrl,
}: {
  orderId: string;
  orderNumber: string;
  items: Array<{
    name: string;
    description: string;
    amount: number; // cents
    quantity: number;
  }>;
  successUrl: string;
  cancelUrl: string;
}) {
  const lineItems = items.map((item) => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
        description: item.description,
      },
      unit_amount: item.amount,
    },
    quantity: item.quantity,
  }));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: orderId,
    metadata: {
      order_id: orderId,
      order_number: orderNumber,
    },
  });

  return session;
}

/**
 * Create transfer to vendor
 */
export async function transferToVendor({
  amount,
  destination,
  orderId,
  orderItemId,
}: {
  amount: number; // cents
  destination: string; // Stripe account ID
  orderId: string;
  orderItemId: string;
}) {
  const transfer = await stripe.transfers.create({
    amount,
    currency: 'usd',
    destination,
    metadata: {
      order_id: orderId,
      order_item_id: orderItemId,
    },
  });

  return transfer;
}

/**
 * Create refund
 */
export async function createRefund(paymentIntentId: string, amount?: number) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
  });

  return refund;
}
```

**File:** `src/lib/stripe/webhooks.ts`

```typescript
import { stripe } from './config';
import Stripe from 'stripe';

/**
 * Verify webhook signature
 */
export function constructEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/**
 * Handle webhook event
 */
export async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
      break;

    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      break;

    case 'account.updated':
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;

    case 'transfer.created':
      await handleTransferCreated(event.data.object as Stripe.Transfer);
      break;

    case 'transfer.failed':
      await handleTransferFailed(event.data.object as Stripe.Transfer);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Implement handlers (connect to database updates)
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  // Update order status to 'paid'
  // Update payment record
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  // Update payment status
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  // Update order and payment status
}

async function handleAccountUpdated(account: Stripe.Account) {
  // Update vendor_profile with account status
}

async function handleTransferCreated(transfer: Stripe.Transfer) {
  // Update vendor_payout record
}

async function handleTransferFailed(transfer: Stripe.Transfer) {
  // Update vendor_payout status to failed
}
```

### Task 2.4: Commit Stripe Integration

```bash
git add src/lib/stripe/
git commit -m "Phase 3: Add Stripe Connect utilities

- Add Stripe SDK config
- Add Connect account creation and onboarding
- Add payment processing and fee calculation
- Add transfer to vendor logic
- Add webhook handling skeleton"
git push origin main
```

---

## Step 3: API Endpoints - Vendor Stripe

### Task 3.1: Vendor Stripe Onboarding

**File:** `src/app/api/vendor/stripe/onboard/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createConnectAccount, createAccountLink } from '@/lib/stripe/connect';

export async function POST(request: NextRequest) {
  const supabase = createClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get vendor profile
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (vendorError || !vendorProfile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  try {
    let stripeAccountId = vendorProfile.stripe_account_id;

    // Create Stripe account if doesn't exist
    if (!stripeAccountId) {
      const account = await createConnectAccount(user.email!);
      stripeAccountId = account.id;

      // Save to database
      await supabase
        .from('vendor_profiles')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', vendorProfile.id);
    }

    // Create account link
    const baseUrl = request.nextUrl.origin;
    const refreshUrl = `${baseUrl}/vendor/dashboard/stripe/refresh`;
    const returnUrl = `${baseUrl}/vendor/dashboard/stripe/complete`;

    const accountLink = await createAccountLink(
      stripeAccountId,
      refreshUrl,
      returnUrl
    );

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    console.error('Stripe onboarding error:', error);
    return NextResponse.json(
      { error: 'Failed to create onboarding link' },
      { status: 500 }
    );
  }
}
```

**File:** `src/app/api/vendor/stripe/status/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccountStatus } from '@/lib/stripe/connect';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('stripe_account_id')
    .eq('user_id', user.id)
    .single();

  if (!vendorProfile?.stripe_account_id) {
    return NextResponse.json({ connected: false });
  }

  try {
    const status = await getAccountStatus(vendorProfile.stripe_account_id);

    // Update database
    await supabase
      .from('vendor_profiles')
      .update({
        stripe_charges_enabled: status.chargesEnabled,
        stripe_payouts_enabled: status.payoutsEnabled,
        stripe_onboarding_complete: status.detailsSubmitted,
      })
      .eq('user_id', user.id);

    return NextResponse.json({
      connected: true,
      ...status,
    });
  } catch (error) {
    console.error('Stripe status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
```

### Task 3.2: Commit Vendor Stripe APIs

```bash
git add src/app/api/vendor/stripe/
git commit -m "Phase 3: Add vendor Stripe Connect APIs

- POST /api/vendor/stripe/onboard - Create onboarding link
- GET /api/vendor/stripe/status - Check account status"
git push origin main
```

---

## Step 4: API Endpoints - Cart & Checkout

### Task 4.1: Cart Management

**File:** `src/app/api/cart/add/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { listingId, quantity } = await request.json();

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate listing exists and has inventory
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .single();

  if (listingError || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.quantity < quantity) {
    return NextResponse.json({ error: 'Insufficient inventory' }, { status: 400 });
  }

  // Add to session cart (store in cookies/session for now)
  // For MVP, can use simple session storage
  // Later: create cart table in database

  return NextResponse.json({ success: true, listing, quantity });
}
```

**File:** `src/app/api/cart/remove/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { listingId } = await request.json();

  // Remove from session cart

  return NextResponse.json({ success: true });
}
```

### Task 4.2: Checkout Session

**File:** `src/app/api/checkout/session/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateFees } from '@/lib/stripe/payments';
import { createCheckoutSession } from '@/lib/stripe/payments';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { items } = await request.json(); // [{listingId, quantity}]

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch listings with vendor info
    const listingIds = items.map((i: any) => i.listingId);
    const { data: listings } = await supabase
      .from('listings')
      .select('*, vendor_profile_id, vendor_profiles(*)')
      .in('id', listingIds);

    if (!listings || listings.length !== items.length) {
      return NextResponse.json({ error: 'Invalid items' }, { status: 400 });
    }

    // Calculate totals
    let subtotalCents = 0;
    let platformFeeCents = 0;

    const orderItems = items.map((item: any) => {
      const listing = listings.find((l) => l.id === item.listingId);
      const fees = calculateFees(listing.price_cents * item.quantity);

      subtotalCents += fees.basePriceCents;
      platformFeeCents += fees.platformFeeCents;

      return {
        listing_id: listing.id,
        vendor_profile_id: listing.vendor_profile_id,
        quantity: item.quantity,
        unit_price_cents: listing.price_cents,
        subtotal_cents: fees.basePriceCents,
        platform_fee_cents: fees.platformFeeCents,
        vendor_payout_cents: fees.vendorGetsCents,
      };
    });

    const totalCents = subtotalCents + platformFeeCents;

    // Create order record
    const orderNumber = `FW-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_user_id: user.id,
        vertical_id: listings[0].vertical_id,
        order_number: orderNumber,
        status: 'pending',
        subtotal_cents: subtotalCents,
        platform_fee_cents: platformFeeCents,
        total_cents: totalCents,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItems.map((item) => ({
        ...item,
        order_id: order.id,
      }))
    );

    if (itemsError) throw itemsError;

    // Create Stripe checkout session
    const baseUrl = request.nextUrl.origin;
    const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/checkout/cancel`;

    const checkoutItems = listings.map((listing) => {
      const item = items.find((i: any) => i.listingId === listing.id);
      const fees = calculateFees(listing.price_cents);

      return {
        name: listing.title,
        description: listing.description || '',
        amount: fees.buyerPaysCents,
        quantity: item.quantity,
      };
    });

    const session = await createCheckoutSession({
      orderId: order.id,
      orderNumber: order.order_number,
      items: checkoutItems,
      successUrl,
      cancelUrl,
    });

    // Save session ID
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
```

**File:** `src/app/api/checkout/success/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/config';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const sessionId = request.nextUrl.searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  try {
    // Verify session with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
    }

    const orderId = session.metadata?.order_id;

    // Update order status
    await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId);

    // Create payment record
    await supabase.from('payments').insert({
      order_id: orderId,
      stripe_payment_intent_id: session.payment_intent as string,
      amount_cents: session.amount_total!,
      platform_fee_cents: 0, // Calculate from order
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    });

    // Send confirmation emails (future enhancement)

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    console.error('Success handler error:', error);
    return NextResponse.json({ error: 'Failed to process success' }, { status: 500 });
  }
}
```

### Task 4.3: Commit Cart & Checkout APIs

```bash
git add src/app/api/cart/
git add src/app/api/checkout/
git commit -m "Phase 3: Add cart and checkout APIs

- POST /api/cart/add - Add item to cart
- POST /api/cart/remove - Remove item from cart
- POST /api/checkout/session - Create Stripe checkout
- GET /api/checkout/success - Handle successful payment"
git push origin main
```

---

## Step 5: API Endpoints - Vendor Orders

### Task 5.1: Vendor Order Management

**File:** `src/app/api/vendor/orders/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
  }

  // Get order items for this vendor
  const { data: orderItems, error } = await supabase
    .from('order_items')
    .select(`
      *,
      order:orders(*),
      listing:listings(title, description),
      buyer:orders(buyer_user_id, user_profiles(*))
    `)
    .eq('vendor_profile_id', vendorProfile.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orderItems });
}
```

**File:** `src/app/api/vendor/orders/[id]/confirm/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const orderItemId = params.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify vendor owns this order item
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('*, vendor_profiles!inner(*)')
    .eq('id', orderItemId)
    .eq('vendor_profiles.user_id', user.id)
    .single();

  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 });
  }

  // Update status
  const { error } = await supabase
    .from('order_items')
    .update({ status: 'confirmed' })
    .eq('id', orderItemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // TODO: Send notification to buyer

  return NextResponse.json({ success: true });
}
```

**File:** `src/app/api/vendor/orders/[id]/ready/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const orderItemId = params.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Update status
  const { error } = await supabase
    .from('order_items')
    .update({ status: 'ready' })
    .eq('id', orderItemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

**File:** `src/app/api/vendor/orders/[id]/fulfill/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transferToVendor } from '@/lib/stripe/payments';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const orderItemId = params.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get order item with vendor info
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('*, vendor_profiles!inner(*), order:orders(*)')
    .eq('id', orderItemId)
    .eq('vendor_profiles.user_id', user.id)
    .single();

  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 });
  }

  try {
    // Update status
    await supabase
      .from('order_items')
      .update({
        status: 'fulfilled',
        pickup_confirmed_at: new Date().toISOString(),
      })
      .eq('id', orderItemId);

    // Initiate payout to vendor
    const transfer = await transferToVendor({
      amount: orderItem.vendor_payout_cents,
      destination: orderItem.vendor_profiles.stripe_account_id,
      orderId: orderItem.order_id,
      orderItemId: orderItem.id,
    });

    // Create payout record
    await supabase.from('vendor_payouts').insert({
      order_item_id: orderItem.id,
      vendor_profile_id: orderItem.vendor_profile_id,
      amount_cents: orderItem.vendor_payout_cents,
      stripe_transfer_id: transfer.id,
      status: 'processing',
    });

    // Check if all items in order fulfilled
    const { data: allItems } = await supabase
      .from('order_items')
      .select('status')
      .eq('order_id', orderItem.order_id);

    const allFulfilled = allItems?.every((item) => item.status === 'fulfilled');

    if (allFulfilled) {
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', orderItem.order_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Fulfill error:', error);
    return NextResponse.json({ error: 'Failed to fulfill order' }, { status: 500 });
  }
}
```

### Task 5.2: Commit Vendor Order APIs

```bash
git add src/app/api/vendor/orders/
git commit -m "Phase 3: Add vendor order management APIs

- GET /api/vendor/orders - List vendor's orders
- POST /api/vendor/orders/[id]/confirm - Confirm order
- POST /api/vendor/orders/[id]/ready - Mark ready for pickup
- POST /api/vendor/orders/[id]/fulfill - Mark fulfilled and trigger payout"
git push origin main
```

---

## Step 6: API Endpoints - Buyer Orders

### Task 6.1: Buyer Order Management

**File:** `src/app/api/buyer/orders/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get buyer's orders with items
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(
        *,
        listing:listings(title, description),
        vendor:vendor_profiles(business_name, vendor_locations(*))
      )
    `)
    .eq('buyer_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders });
}
```

### Task 6.2: Commit Buyer Order APIs

```bash
git add src/app/api/buyer/orders/
git commit -m "Phase 3: Add buyer order APIs

- GET /api/buyer/orders - List buyer's orders with items"
git push origin main
```

---

## Step 7: Webhook Handler

### Task 7.1: Create Webhook Endpoint

**File:** `src/app/api/webhooks/stripe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { constructEvent, handleWebhookEvent } from '@/lib/stripe/webhooks';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  try {
    const event = constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    await handleWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}

// Disable body parsing for webhooks
export const config = {
  api: {
    bodyParser: false,
  },
};
```

### Task 7.2: Implement Webhook Handlers

**Update:** `src/lib/stripe/webhooks.ts`

```typescript
import { createClient } from '@/lib/supabase/server';

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createClient();
  const orderId = session.metadata?.order_id;

  if (!orderId) return;

  await supabase
    .from('orders')
    .update({ status: 'paid' })
    .eq('id', orderId);

  await supabase.from('payments').insert({
    order_id: orderId,
    stripe_payment_intent_id: session.payment_intent as string,
    amount_cents: session.amount_total!,
    status: 'succeeded',
    paid_at: new Date().toISOString(),
  });
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const supabase = createClient();

  await supabase
    .from('payments')
    .update({
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = createClient();

  await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id);
}

async function handleAccountUpdated(account: Stripe.Account) {
  const supabase = createClient();

  await supabase
    .from('vendor_profiles')
    .update({
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
      stripe_onboarding_complete: account.details_submitted,
    })
    .eq('stripe_account_id', account.id);
}

async function handleTransferCreated(transfer: Stripe.Transfer) {
  const supabase = createClient();
  const orderItemId = transfer.metadata?.order_item_id;

  if (!orderItemId) return;

  await supabase
    .from('vendor_payouts')
    .update({
      status: 'completed',
      transferred_at: new Date().toISOString(),
    })
    .eq('order_item_id', orderItemId);
}

async function handleTransferFailed(transfer: Stripe.Transfer) {
  const supabase = createClient();
  const orderItemId = transfer.metadata?.order_item_id;

  if (!orderItemId) return;

  await supabase
    .from('vendor_payouts')
    .update({ status: 'failed' })
    .eq('order_item_id', orderItemId);
}
```

### Task 7.3: Commit Webhook Handler

```bash
git add src/app/api/webhooks/
git commit -m "Phase 3: Add Stripe webhook handler

- POST /api/webhooks/stripe - Handle Stripe events
- Implement handlers for checkout, payment, account, transfer events"
git push origin main
```

---

## Step 8: Vendor UI Components

**Due to length constraints, I'll provide high-level guidance for UI implementation.**

### Task 8.1: Vendor Stripe Onboarding Component

**File:** `src/app/[vertical]/vendor/dashboard/stripe/onboard/page.tsx`

**Features:**
- Check if vendor already connected
- Display "Connect Bank Account" button
- Show onboarding status
- Handle return from Stripe

### Task 8.2: Vendor Orders Dashboard

**File:** `src/app/[vertical]/vendor/dashboard/orders/page.tsx`

**Features:**
- List incoming orders
- Filter by status (pending, confirmed, ready, fulfilled)
- Show order details (buyer, items, pickup location/time)
- Action buttons: Confirm, Mark Ready, Mark Fulfilled
- Real-time updates (poll every 30 seconds)

### Task 8.3: Commit Vendor UI

```bash
git add src/app/[vertical]/vendor/dashboard/
git commit -m "Phase 3: Add vendor Stripe onboarding and orders UI

- Stripe Connect onboarding flow
- Orders dashboard with status management
- Order detail views"
git push origin main
```

---

## Step 9: Buyer UI Components

### Task 9.1: Browse Bundles Page

**File:** `src/app/[vertical]/browse/page.tsx`

**Features:**
- List all bundles for vertical
- Filter by vendor, category
- Show pricing (includes platform fee, displayed as single price)
- "Add to Cart" button
- Search functionality

### Task 9.2: Bundle Detail Page

**File:** `src/app/[vertical]/bundle/[id]/page.tsx`

**Features:**
- Bundle details (title, description, images)
- Vendor info
- Pricing (shown as single price to buyer)
- Quantity selector
- "Add to Cart" button
- Pickup location/time

### Task 9.3: Cart Drawer Component

**File:** `src/components/cart/CartDrawer.tsx`

**Features:**
- Slide-out drawer
- List items in cart
- Show total (single price, fees included)
- Remove item button
- "Checkout" button

### Task 9.4: Checkout Page

**File:** `src/app/[vertical]/checkout/page.tsx`

**Features:**
- Review cart items
- Show total
- Embedded Stripe checkout or redirect to Stripe
- Handle success/cancel redirects

### Task 9.5: Checkout Success Page

**File:** `src/app/[vertical]/checkout/success/page.tsx`

**Features:**
- Order confirmation message
- Order number display
- Pickup instructions
- "View Orders" link

### Task 9.6: Buyer Orders Dashboard

**File:** `src/app/[vertical]/buyer/orders/page.tsx`

**Features:**
- List buyer's orders
- Filter by status
- Order details (items, vendors, pickup info)
- Status updates

### Task 9.7: Commit Buyer UI

```bash
git add src/app/[vertical]/browse/
git add src/app/[vertical]/bundle/
git add src/app/[vertical]/checkout/
git add src/app/[vertical]/buyer/orders/
git add src/components/cart/
git commit -m "Phase 3: Add buyer shopping and checkout UI

- Browse bundles page with filters
- Bundle detail page
- Cart drawer component
- Checkout flow
- Success/cancel pages
- Orders dashboard"
git push origin main
```

---

## Step 10: Testing

### Task 10.1: Test Vendor Flow

**Checklist:**
- [ ] Vendor visits dashboard
- [ ] Vendor clicks "Connect Bank Account"
- [ ] Redirects to Stripe onboarding
- [ ] Vendor completes Stripe onboarding
- [ ] Returns to dashboard
- [ ] Status shows "Connected"
- [ ] Vendor creates bundle with price and quantity
- [ ] Bundle appears in browse page

### Task 10.2: Test Buyer Flow

**Checklist:**
- [ ] Buyer browses bundles
- [ ] Buyer views bundle detail
- [ ] Buyer adds bundle to cart
- [ ] Cart shows correct total (with fees, displayed as single price)
- [ ] Buyer proceeds to checkout
- [ ] Stripe checkout page loads
- [ ] Buyer enters test card: 4242 4242 4242 4242
- [ ] Payment succeeds
- [ ] Redirects to success page
- [ ] Order confirmation displayed
- [ ] Order appears in buyer's orders dashboard

### Task 10.3: Test Vendor Order Management

**Checklist:**
- [ ] Vendor sees incoming order in dashboard
- [ ] Vendor clicks "Confirm" → status updates
- [ ] Vendor clicks "Mark Ready" → status updates
- [ ] Vendor clicks "Mark Fulfilled" → status updates
- [ ] Buyer sees status updates in their dashboard
- [ ] Vendor payout record created in database
- [ ] Check Stripe dashboard: transfer created

### Task 10.4: Test Edge Cases

**Checklist:**
- [ ] Buyer tries to checkout with out-of-stock item → blocked
- [ ] Payment fails (test card: 4000 0000 0000 0002) → order status remains pending
- [ ] Vendor not yet connected to Stripe → cannot receive payouts
- [ ] Multiple items in cart (single vendor) → all items in one order
- [ ] Vendor marks wrong status (e.g., fulfilled before ready) → allowed (or add validation)

### Task 10.5: Verify Stripe Integration

**Checklist:**
- [ ] Stripe Dashboard → Payments: Payment appears
- [ ] Stripe Dashboard → Connect: Vendor account exists
- [ ] Stripe Dashboard → Transfers: Transfer to vendor appears
- [ ] Platform application fee deducted correctly
- [ ] Vendor receives correct payout amount (base price - 6.5%)

### Task 10.6: Document Test Results

Create file: `.claude/Testing/phase3_test_results.md`

Document all test cases with pass/fail status and any issues found.

---

## Step 11: Bug Fixes & Refinements

### Task 11.1: Fix Any Issues Found in Testing

**Common issues to watch for:**
- Fee calculation rounding errors
- RLS policies blocking legitimate access
- Webhook signature verification failures
- Session/cart state management issues
- UI state not updating after API calls

### Task 11.2: Commit Bug Fixes

```bash
git add .
git commit -m "Phase 3: Bug fixes and refinements

- Fix fee calculation precision
- Update RLS policies for vendor order access
- Add error handling for failed payments
- Improve cart state management"
git push origin main
```

---

## Step 12: Documentation & Session Summary

### Task 12.1: Create Session Summary

**File:** `.claude/Build_Instructions/Phase3_Session_Summary.md`

```markdown
# Phase 3 Session Summary - Core Commerce Engine

**Date:** [Fill in]
**Duration:** [Fill in hours]
**Status:** Complete ✅

## Completed Tasks
- [x] Created orders and payments migration
- [x] Applied migration to Dev and Staging
- [x] Updated MIGRATION_LOG.md
- [x] Integrated Stripe Connect SDK
- [x] Built Stripe Connect utilities
- [x] Built vendor Stripe onboarding API
- [x] Built cart and checkout APIs
- [x] Built vendor order management APIs
- [x] Built buyer order APIs
- [x] Implemented webhook handlers
- [x] Built vendor Stripe onboarding UI
- [x] Built vendor orders dashboard
- [x] Built buyer browse and cart UI
- [x] Built buyer checkout flow
- [x] Built buyer orders dashboard
- [x] Tested end-to-end flows
- [x] Fixed bugs

## Migrations Created
- `YYYYMMDD_HHMMSS_001_orders_and_payments.sql` - Applied to Dev ✅ Staging ✅

## Files Created
[List all files created]

## Files Modified
[List all files modified]

## Testing Results
- Vendor Stripe onboarding: PASS ✅
- Buyer checkout flow: PASS ✅
- Order status updates: PASS ✅
- Vendor payouts: PASS ✅
- All edge cases: PASS ✅

## Issues Encountered
[Document any issues and resolutions]

## Phase 3 Completion Criteria - ALL MET ✅
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

## Next Phase
**Phase 4: Market Types System**
- Add Fixed Markets and Private Pickup Markets
- Implement market selection for listings
- Add buyer acknowledgment for Private Pickup

## Notes
[Any important notes, decisions, or deviations from plan]
```

### Task 12.2: Update MIGRATION_LOG.md

Ensure MIGRATION_LOG.md is up to date with final application dates.

### Task 12.3: Final Commit & Push

```bash
git add .
git commit -m "Phase 3: Complete - Core Commerce Engine

Phase 3 is complete and tested. All completion criteria met:
- Vendors can connect Stripe and receive payouts
- Buyers can browse, purchase, and track orders
- Platform earns ~9.3% per transaction
- Full working marketplace MVP

Ready for Phase 4: Market Types System"
git push origin main
```

---

## Phase 3 Completion Criteria

**Phase 3 is complete when ALL of the following are true:**

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
- ✅ Migration applied to Dev and Staging
- ✅ MIGRATION_LOG.md updated
- ✅ Session summary created

---

## Important Reminders

### Commit Strategy
- Commit after each completed component
- Push to GitHub after every 2-3 commits
- Always push at end of session

### Migration Discipline
- ALWAYS create migration files with timestamps
- ALWAYS update migration headers when applied
- ALWAYS update MIGRATION_LOG.md
- Apply to Dev first, test, then Staging

### Testing
- Test each component as you build it
- Don't wait until end to test
- Use Stripe test cards
- Check Stripe Dashboard to verify transfers

### Code Quality
- Add TypeScript types for all API responses
- Handle errors gracefully
- Add loading states in UI
- Show user-friendly error messages

---

## Getting Help

**If blocked or confused:**
1. Re-read the relevant section of this document
2. Check the Source of Truth document (FastWrks_Pricing_Features_v2.0.md)
3. Check Stripe documentation for Connect/Checkout
4. Ask Tracy for clarification

---

## Success Indicator

**You'll know Phase 3 is successful when:**
- You can complete a full transaction: vendor creates bundle → buyer purchases → vendor gets paid
- Real money flows correctly (in test mode)
- Platform earns correct fees
- All users see correct information in their dashboards

**After Phase 3, FastWrks BuildApp is a working marketplace! 🎉**

---

*End of Phase 3 Build Instructions*
