# Flash Sales & VIP Customer System — Implementation Plan

**Created:** 2026-03-25 (Session 63)
**Status:** Planning — no code changes approved
**Applies to:** All verticals (FM, FT, Fireworks)
**Tier relevance:** Premium buyer tier + Pro/Boss vendor tier

---

## Executive Summary

Two cross-vertical features from the original FastWrks design that add significant value:

1. **Flash Sales** — vendors post time-limited, quantity-limited offers. Premium buyers get first access.
2. **VIP Customers** — Pro/Boss vendors tag their best customers for early access and priority notifications.

Both features reinforce the premium buyer tier value proposition (which currently has limited differentiation) and give vendors tools to build customer loyalty and move inventory efficiently.

---

## Part 1: Flash Sales System

### What It Is

A flash sale is a time-limited, quantity-limited offer posted by a vendor during operating hours. It's separate from regular listings — think "end-of-day half-price on remaining strawberries" or "just pulled 20 racks of ribs off the smoker."

### Why It Matters

**For vendors:**
- Move surplus/perishable inventory before it's wasted
- Create urgency that drives immediate sales
- Reward loyal customers with deals
- Generate buzz and foot traffic

**For buyers:**
- Get deals on quality products
- Discover vendors they wouldn't otherwise try
- Premium members get first pick (reinforces subscription value)

**For the platform:**
- Transaction volume increases (more sales = more fees)
- Premium buyer tier has a clear, tangible benefit (early access)
- Engagement increases (buyers check the app more frequently for flash deals)
- Reduces food waste narrative (positive brand story)

### How It Works

#### Vendor Creates a Flash Sale
1. Vendor opens "Flash Sale" from their dashboard or order management page
2. Selects an existing listing OR creates a quick one-off item
3. Sets:
   - **Sale price** (discounted from regular price, or a new item with its own price)
   - **Available quantity** (what they physically have on hand)
   - **Duration** (1-6 hours, default 2 hours)
   - **Certifies on-hand inventory** (checkbox: "I have this product ready now")
4. Flash sale goes live immediately

#### Buyer Notification Cascade (Tiered Access)
When a vendor posts a flash sale, notifications go out in waves:

| Time | Who Gets Notified | Access |
|------|-------------------|--------|
| T+0 | Premium buyers + VIP customers of this vendor | Can purchase immediately |
| T+15 min | All buyers who favorited this vendor | Can purchase |
| T+30 min | All buyers within radius of the vendor's location | Can purchase |

**Why staggered:** Creates real value for premium membership. If flash sales sell out in the first 15 minutes (likely for popular vendors), premium buyers got first pick. Free tier buyers still have access — just later.

#### Flash Sale Lifecycle
```
vendor_creates → live (notifications sent in waves)
                  → sold_out (quantity hits 0)
                  → expired (duration ends)
                  → cancelled (vendor manually ends)
```

#### Inventory Rules
- Flash sale inventory is SEPARATE from regular listing inventory
- A flash sale can reference an existing listing (discounted price) or be standalone
- When a flash sale ends (any reason), unsold quantity does NOT transfer to regular listings
- Vendor can release unsold flash sale inventory to regular listing manually

### Data Model

#### New Table: `flash_sales`
```sql
CREATE TABLE flash_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id),
  listing_id UUID REFERENCES listings(id),  -- optional, can reference existing listing
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  regular_price_cents INTEGER,  -- original price (for showing discount)
  sale_price_cents INTEGER NOT NULL,  -- flash sale price
  quantity_available INTEGER NOT NULL,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active, sold_out, expired, cancelled
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  market_id UUID REFERENCES markets(id),  -- where the vendor is today
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT chk_flash_sale_status CHECK (status IN ('active', 'sold_out', 'expired', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_flash_sales_vendor ON flash_sales(vendor_profile_id);
CREATE INDEX idx_flash_sales_vertical_status ON flash_sales(vertical_id, status);
CREATE INDEX idx_flash_sales_active ON flash_sales(status, expires_at) WHERE status = 'active';
CREATE INDEX idx_flash_sales_market ON flash_sales(market_id) WHERE market_id IS NOT NULL;
```

#### New Notification Types
- `flash_sale_premium` — sent to premium buyers at T+0
- `flash_sale_favorites` — sent to favorited-vendor buyers at T+15
- `flash_sale_nearby` — sent to nearby buyers at T+30
- `flash_sale_sold_out` — sent to vendor when their flash sale sells out

### Vendor Tier Limits

| Feature | Free | Pro | Boss |
|---------|------|-----|------|
| Flash sales per week | 2 | 5 | Unlimited |
| Flash sale duration | 1-2 hours | 1-4 hours | 1-6 hours |
| VIP customers | 0 | 10 | 25 |

### API Routes Needed

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/vendor/flash-sales` | POST | Create flash sale |
| `/api/vendor/flash-sales` | GET | List vendor's flash sales |
| `/api/vendor/flash-sales/[id]` | PATCH | Cancel/end flash sale |
| `/api/flash-sales` | GET | Browse active flash sales (buyer) |
| `/api/flash-sales/[id]/purchase` | POST | Buy from flash sale |

### UI Components

**Vendor side:**
- Flash Sale creation form (quick — title, price, quantity, duration)
- Active flash sales card on vendor dashboard
- Flash sale history in analytics

**Buyer side:**
- "Flash Deals" section on browse page (highlighted, time-limited badge)
- Flash sale card component (shows countdown timer, remaining quantity, % discount)
- Flash sale notification handling (deep link to the sale)
- "Flash Deals Near Me" quick-access from dashboard

### Checkout Integration
- Flash sale purchases use the same Stripe checkout flow
- `order_items` gets a `flash_sale_id` column to track
- Inventory decrement uses `atomic_decrement` pattern (same as listings)
- When quantity hits 0, status auto-updates to `sold_out` via trigger

### Notification Logic (Cron or Event-Driven)
- T+0: Immediate notification on flash sale creation to premium + VIP (event-driven, in the POST handler)
- T+15: Cron job or delayed task sends to favorites
- T+30: Cron job or delayed task sends to nearby buyers
- Alternatively: use `after()` with `setTimeout` in the API route (simpler, but Vercel function timeout limits apply)
- Recommended: Use notification queue with scheduled delivery times

---

## Part 2: VIP Customer System

### What It Is

Pro and Boss tier vendors can designate their best customers as "VIPs." VIPs get early access to flash sales and priority notifications when their vendor posts new items.

### Why It Matters

**For vendors:**
- Reward and retain their best customers
- Build a loyalty program without external tools
- VIP designation makes customers feel valued → repeat purchases

**For buyers:**
- Getting VIP status feels exclusive and personal
- Tangible benefit: early flash sale access
- Strengthens vendor-customer relationship

**For the platform:**
- Increases vendor retention (vendors with loyal VIP base are sticky)
- Premium vendor tier has more value (VIP management is Pro/Boss only)
- More repeat purchases = more transaction volume

### How It Works

#### Vendor Adds a VIP
1. Vendor goes to "My Customers" or sees a customer in their order history
2. Taps "Add to VIP list" (star icon)
3. Customer receives notification: "You're now a VIP at [Vendor Name]!"
4. Customer appears in vendor's VIP dashboard

#### VIP Benefits
- **Flash sale early access:** VIPs get notified at T+0 (same as premium buyers)
- **New listing notifications:** When their VIP vendor posts a new listing, VIP gets notified
- **VIP badge:** Visible to vendor on orders (helps vendor recognize VIPs at pickup)

#### VIP + Premium Buyer Interaction
A buyer can be BOTH a premium member AND a VIP of specific vendors:
- Premium membership gives early access to ALL flash sales
- VIP status gives early access to THAT vendor's flash sales
- A free-tier buyer who is a VIP gets early access only from their VIP vendor
- A premium buyer who is also a VIP gets no additional timing benefit (already at T+0)

This means: **VIP is the free-tier buyer's path to early access for their favorite vendors.** Premium membership gives it universally. Both are valuable, not conflicting.

### Data Model

#### New Table: `vendor_vip_customers`
```sql
CREATE TABLE vendor_vip_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_purchase_at TIMESTAMPTZ,
  total_purchases INTEGER DEFAULT 0,
  total_spent_cents INTEGER DEFAULT 0,
  notes TEXT,  -- vendor's private notes about this customer
  UNIQUE(vendor_profile_id, buyer_user_id)
);

CREATE INDEX idx_vip_customers_vendor ON vendor_vip_customers(vendor_profile_id);
CREATE INDEX idx_vip_customers_buyer ON vendor_vip_customers(buyer_user_id);
```

#### Auto-Maintenance
- Cron job: remove VIPs with no purchase from this vendor in 6 months
- Vendor notified when auto-removal happens
- Vendor can re-add if they choose

### Vendor Tier Limits

| Feature | Free | Pro | Boss |
|---------|------|-----|------|
| VIP slots | 0 | 10 | 25 |

### API Routes Needed

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/vendor/vip-customers` | GET | List vendor's VIPs with stats |
| `/api/vendor/vip-customers` | POST | Add customer to VIP list |
| `/api/vendor/vip-customers/[id]` | DELETE | Remove VIP |
| `/api/buyer/vip-status` | GET | Buyer checks which vendors they're VIP for |

### UI Components

**Vendor side:**
- VIP management page (list, add, remove, capacity indicator "8/10 slots")
- VIP badge on order cards (vendor sees which customers are VIPs)
- "Add to VIP" button in order history / customer list
- VIP stats: last purchase, total spent, purchase count

**Buyer side:**
- "You're a VIP!" notification when added
- VIP badge on their favorites page next to vendor name
- VIP vendors highlighted in flash sale notifications

### Notification Types
- `vip_added` — buyer notified when vendor adds them as VIP
- `vip_removed` — buyer notified when removed (optional, vendor choice)
- `vip_vendor_new_listing` — consolidated daily email of new listings from VIP vendors

---

## Part 3: Event System Tie-In

### Where Flash Sales Connect to Events

**Pre-event flash sales:** An event-approved vendor could post a flash sale specifically for an upcoming event — "Order now for the Bizbash event next Friday, 20% off if you order today." This creates pre-event buzz and gives the vendor a demand signal before the event.

**Post-event flash sales:** After a catering event, the vendor might have surplus prepared items. A flash sale lets them move that inventory to nearby buyers before it goes to waste.

**Event attendee targeting:** When a flash sale is posted by a vendor who is confirmed for an upcoming event, the notification could include the event context: "Smokestack BBQ has a flash deal — they'll also be at the Downtown Tech Event on Friday!"

### Where VIP Connects to Events

**VIP → Event invitations:** When a vendor is invited to an event and accepts, their VIP customers could get an early notification: "Your VIP vendor Smokestack BBQ will be at the Downtown Tech Event! Pre-order now." This drives pre-event orders from the vendor's most loyal customers.

**Event feedback from VIPs:** After an event, VIP customers who attended could be prompted for feedback first — their opinions carry more weight because they have an established relationship with the vendor.

### What Does NOT Connect

**Flash sales and wave-based ordering are separate systems.** Flash sales are spontaneous, real-time offers. Wave-based event ordering is scheduled, capacity-managed, and pre-planned. They shouldn't be mixed — a flash sale during an event would bypass the wave system and create chaos.

**VIP status does not affect event wave priority.** Event waves are first-come-first-served (or organizer-assigned). VIP is a vendor-customer relationship, not an event-management tool.

---

## Part 4: Implementation Sequence

### Build Order (recommended)

**Step 1: Database tables + API routes (flash_sales + vendor_vip_customers)**
- Migrations for both tables
- CRUD API routes
- RLS policies
- Tier limit enforcement in vendor-limits.ts

**Step 2: Vendor UI — Flash Sale creation + VIP management**
- Flash sale creation form (quick, mobile-friendly)
- Flash sale dashboard card (active sales, history)
- VIP management page with capacity indicator
- "Add to VIP" button on order history

**Step 3: Buyer UI — Flash Deals discovery**
- Flash Deals section on browse page
- Flash sale card component (countdown, quantity, discount %)
- Flash Deals page (standalone, linked from dashboard)
- VIP badge on favorites page

**Step 4: Notification system — Tiered delivery**
- New notification types (flash_sale_premium, flash_sale_favorites, flash_sale_nearby, vip_added, vip_vendor_new_listing)
- Staggered notification delivery (T+0, T+15, T+30)
- Daily VIP vendor digest email
- Notification frequency limits (max 1 flash sale email per buyer per day)

**Step 5: Cron integration**
- Flash sale expiry (auto-expire past duration)
- VIP auto-removal (6 months no purchase)
- Flash sale analytics aggregation

**Step 6: Analytics + Reporting**
- Flash sale performance report (admin)
- Vendor flash sale analytics (per-sale conversion, revenue)
- VIP engagement metrics (purchase frequency, lifetime value)

### Estimated Effort
- Step 1: 1 session (migrations, APIs, tests)
- Step 2: 1 session (vendor UI)
- Step 3: 1 session (buyer UI)
- Step 4: 1 session (notifications)
- Step 5-6: 0.5 session (cron + reports)

Total: ~4.5 sessions

---

## Part 5: Premium Buyer Tier Value Refresh

With flash sales and VIP, the premium buyer tier finally has strong, tangible benefits:

| Benefit | Free Buyer | Premium Buyer |
|---------|-----------|---------------|
| Browse & purchase | Yes | Yes |
| Early access to new listings | No | Yes (2-hour premium window) |
| Flash sale access | T+30 min (after everyone else) | T+0 (immediate, first pick) |
| Can be a VIP | Yes (vendor's choice) | Yes (vendor's choice) |
| VIP flash sale access | T+0 for VIP vendor only | T+0 for ALL vendors |
| Monthly Market Box | Yes | Yes |

**The pitch becomes clear:** "Premium members get first pick on every flash deal from every vendor. Free users get VIP access only from vendors who choose them. Go premium and never miss a deal."

This is a much stronger value proposition than the current "early access to new listings" which most buyers don't notice because the 2-hour window is short.

---

## Decision Points for User

| # | Question | Impact |
|---|----------|--------|
| 1 | Flash sale tier limits: 2/5/unlimited for Free/Pro/Boss? | Vendor tier value |
| 2 | VIP capacity: 0/10/25 for Free/Pro/Boss? | Vendor tier value |
| 3 | Notification timing: T+0/T+15/T+30 or different intervals? | Premium buyer value |
| 4 | Flash sale duration limits by tier? | Vendor flexibility |
| 5 | Can flash sales reference existing listings (discounted) or must be standalone? | UX simplicity |
| 6 | Daily flash sale notification limit per buyer? (suggested: 3/day) | Spam prevention |
| 7 | Auto-expire VIPs after 6 months no purchase? | List hygiene |
| 8 | Should the flash deals section be a tab on browse, or a standalone page? | Navigation design |
| 9 | Event tie-in: do we build the event connections in the same phase or defer? | Scope control |
| 10 | Does flash sale discount come from vendor's margin only, or does platform reduce its fee? | Financial model |
