# FastWrks BuildApp - Pricing & Features
## Source of Truth Document

**Version:** 2.0  
**Last Updated:** January 9, 2026  
**Platform:** Multi-brand marketplace (fastwrks.com, farmersmarket.app)  
**Business Model:** Pre-pay & Subscriptions via Stripe Connect

---

## Transaction Fee Structure

### Universal Fees (Apply to All Users & All Transaction Types)

**Split Fee Model (Blind to Buyer):**
- **Buyer Markup:** 6.5% added to bundle base price
- **Vendor Deduction:** 6.5% deducted from bundle base price
- **Platform Net:** ~9.3% of base price (after Stripe fees)
- **Stripe Fees:** ~2.9% + $0.30 (absorbed by platform, effectively split between buyer/vendor)

**Example: $50 Bundle**
```
Vendor lists bundle at:        $50.00
Buyer sees and pays:           $53.25  (base + 6.5%)
Vendor receives:               $46.75  (base - 6.5%)
Platform gross:                 $6.50
Stripe fee (on $53.25):        -$1.85
Platform net:                   $4.65  (9.3% of base)
```

**Transaction Fee Applies To:**
- Pre-sale orders (all time windows)
- Flash sales
- Monthly Market Box purchases
- Multi-vendor cart orders (fee per transaction, not per order)

**No Additional Fees For:**
- Multi-vendor checkout (no extra convenience fee)
- Early access (members/VIPs)
- Premium features

---

## Market Types

FastWrks supports two distinct market types to serve different vendor needs:

### Type A: Fixed Market (Traditional Farmers Market)

**Characteristics:**
- Fixed location (specific address)
- Fixed schedule (same day/time weekly)
- Multiple vendors at same location
- Multi-vendor cart enabled

**Examples:**
- Downtown Farmers Market - Every Saturday 8am-1pm
- Suburban Market - Every Sunday 9am-2pm
- Holiday Fireworks Stand - July 1-4, 10am-9pm

**Use Case:**
- Traditional farmers markets
- Regular seasonal markets
- Fireworks stands with set hours

---

### Type B: Private Pickup Market (Cottage/Flexible Market)

**Characteristics:**
- Fixed location (vendor's home, farm, business)
- Flexible schedule (vendor sets availability per listing)
- Single vendor per "market"
- Multi-vendor cart NOT available

**Examples:**
- Green Acres Farm - 123 Farm Road (available Tue 4-6pm, Thu 10am-2pm)
- Honey Bee Cottage - After church Sundays, 12:30-1pm at Fellowship Hall
- Fireworks by Joe - 456 Main St (Mon-Fri by appointment)

**Use Case:**
- Cottage industry producers
- Home-based vendors
- Vendors selling between market days
- Church/community group sales
- Appointment-based pickup

---

### Market Type Implementation Details

**Vendor Setup:**
- Vendor can participate in BOTH market types simultaneously
- When creating bundle listing, vendor selects which market(s) bundle is available at
- Inventory is SHARED across all markets (same pool per bundle)

**Example Scenario:**
```
Green Acres Farm has:
- Market A: Downtown Market (Fixed - Saturday 8am-1pm)
- Market B: Farm Location (Private Pickup - Tuesday 4-6pm, Thursday 10am-2pm)

Veggie Box Bundle:
- Quantity: 10 available
- Available at: Market A + Market B (shared inventory)
- Buyer at Market A orders 3 → 7 remain for either market
- Buyer at Market B orders 4 → 3 remain for either market
```

**Vendor Responsibilities:**
- Ensure adequate inventory for all selected markets
- Update availability for Private Pickup markets when creating listings
- Manage time conflicts (vendor cannot be in two places at once)

**System Warnings:**
- Alert vendor when bundle is available at multiple markets with different pickup times
- "Warning: This bundle is available at 2 locations. Ensure pickup times don't conflict."

**Buyer Experience:**

**Fixed Market:**
```
Tomato Box - $50
Pickup: Downtown Farmers Market
Saturday, Jan 11, 2026 (8am-1pm)
123 Market Street
[Add to Cart]
```

**Private Pickup:**
```
Egg Carton - $12
Pickup: Green Acres Farm
Choose pickup window:
( ) Tuesday, Jan 14, 4-6pm
( ) Thursday, Jan 16, 10am-2pm
456 Farm Road

☐ I confirm I can pick up during this window

[Add to Cart]
```

**At Checkout (Private Pickup):**
- Buyer MUST check confirmation box acknowledging pickup time/location
- Cannot proceed to payment without confirmation

**Multi-Vendor Cart Restrictions:**
- Multi-vendor cart ONLY available for Fixed Markets
- Same market + same day + multiple vendors = can combine
- Private Pickup markets = single vendor orders only
- System blocks combining vendors from different markets

**Flash Sales + Market Types:**
- Vendor selects ONE location per flash sale
- Cannot have overlapping flash sales at different locations
- After flash sale ends/expires at Location A, can start new flash sale at Location B
- Flash sale follows same pickup confirmation rules as regular listings

---

## Shopper / Buyer Tiers

### Free Tier

**Cost:** $0

**Features:**
- Browse all vendor listings (all market types)
- Purchase pre-sale bundles
- Purchase flash sales (after waiting period)
- Single vendor checkout
- Multi-vendor cart (Fixed Markets only)
- Pre-purchase benefits:
  - Guaranteed availability
  - First choice quality
  - Skip the line* (*vendor dependent, Fixed Markets only)
- Flash sale notifications (after premium users)

**Transaction Fees:**
- 6.5% markup on all purchases

**Flash Sale Access:**
- Notified 10 minutes after paying members
- Notified 5 minutes after VIPs (non-members)
- Full access to all flash sales after waiting period

**Pre-Sale Bundle Notifications:**
- Notified 2 hours after paying members
- Notified 1 hour after VIPs (non-members)
- Standard timing for new vendor bundles

**Limitations:**
- No early access to flash sales or new bundles
- No Monthly Market Box access
- Standard notification timing only

---

### Premium Member ("Market Pass Member")

**Cost:** 
- **Monthly:** $9.99/month
- **Annual:** $81.50/year (saves $38.38 = 32% discount)

**All Free Tier Features PLUS:**

**Exclusive Features:**
- **10-minute head start on ALL flash sales** (first access, before VIPs and free users)
- **2-hour head start on new bundle postings** (before VIPs and free users)
- **Monthly Market Box access** - eligible to purchase 4-week prepaid vendor boxes
- **Multi-vendor cart optimization** - enhanced checkout experience (Fixed Markets)
- **Priority notifications** - first to know about new vendor bundles and flash sales

**Transaction Fees:**
- Same 6.5% markup (membership value is features, not fee discounts)

**Flash Sale Priority Timing:**
- Premium members notified at: 10:00 AM
- VIPs (non-members) notified at: 10:05 AM  
- Free tier notified at: 10:10 AM

**Pre-Sale Bundle Priority Timing:**
- Premium members notified at: 10:00 AM
- VIPs (non-members) notified at: 11:00 AM
- Free tier notified at: 12:00 PM

**Value Proposition:**
- Early access to limited-quantity flash sales
- **Core Value:** 4-week prepaid boxes (CSA-style without season-long commitment)
- First choice on new vendor bundles
- Priority treatment across platform
- Support local vendors with guaranteed advance purchases

---

## Vendor / Seller Tiers

### Standard Vendor

**Cost:** $0

**Features:**

**Listing Management:**
- Create and manage up to 7 bundles (5 recommended for optimal performance)
- Full listing editor (title, description, price, images, quantity)
- Bundle-based inventory (flexible item grouping)
- Select market type(s) per bundle (Fixed and/or Private Pickup)
- Availability date windows
- Category tagging
- Multiple product images per bundle

**Sales Channels:**
- Pre-sale orders (advance orders with pickup at market)
- Flash sales: **2 per week maximum**
- Monthly Market Box: **2 concurrent customers maximum**
- Access to all buyer tiers (free + premium)
- Both market types supported (Fixed + Private Pickup)

**Market Presence:**
- Participate in Fixed Markets (traditional markets)
- Create Private Pickup markets (home/farm/cottage location)
- Listed in market directory
- Standard search/browse placement
- Single location pin per market on map
- Vendor profile page
- Customer reviews and ratings

**Tools & Analytics:**
- Order management dashboard
- Basic sales reporting (current month only via Stripe dashboard)
- Transaction history: **33-day retention**
- Payout tracking (Stripe Connect)

**Customer Management:**
- View order details: **33-day retention**
- Customer list: names only (first & last name), order history, **33-day retention**
- **NO customer contact info** (no email, phone, or address)
- Pre-scripted messaging (see Communication System)
- Order status updates

**Data Retention (Standard Vendors):**
- Transaction history: 33 days
- Order details: 33 days  
- Customer data: 33 days
- Older data archived by platform (not accessible to vendor)

**Transaction Fees:**
- 6.5% deduction from all sales
- Direct deposits via Stripe Connect
- No additional platform fees

**Monthly Market Box Limit:**
- Maximum 2 concurrent active subscriptions
- Once customer's 4-week cycle ends, slot opens for new customer
- Can be same customers renewing or different customers
- Limit prevents over-commitment for small vendors

---

### Premium Vendor

**Cost:**
- **Monthly:** $24.99/month
- **Annual:** $208.15/year (saves $91.73 = 31% discount)

**All Standard Vendor Features PLUS:**

**Enhanced Sales Tools:**
- **Unlimited flash sales** (no 2-per-week limit)
- **Unlimited Monthly Market Box customers** (no 2-concurrent limit)
- VIP Customer List management (up to 25 VIPs)
- Featured vendor badge and priority placement
- Multi-location presence (participate in multiple markets)
- Pre-scripted messaging for order-specific communication

**VIP Customer Management:**
- Tag up to 25 customers as VIPs
- VIPs get 5-minute flash sale head start (after paying members)
- VIPs get 1-hour new bundle notification head start (after paying members)
- VIPs receive consolidated daily emails when you post new bundles
- VIPs auto-notified when added to your list
- Auto-removal of inactive VIPs (no purchase in 6 months)
- VIP dashboard: track engagement, purchase history, lifetime value

**Featured Placement:**
- Appear at top of search results
- "Featured Vendor" badge on all listings
- Highlighted map pin with special color/icon
- Priority in browse/discovery views
- Enhanced visibility in multi-vendor searches

**Multi-Location Operations:**
- Add multiple market locations (Fixed and/or Private Pickup)
- Participate in multiple Fixed Markets simultaneously
- Multiple Private Pickup locations (home, farm, alternate sites)
- Shared inventory management across all locations
- Location-specific analytics

**Advanced Analytics (Phase 1):**
- Total sales (year-to-date)
- Best-selling bundles (top 3)
- Transaction count
- Average order value
- Repeat customer count and rate
- Week-over-week growth
- Flash sale performance metrics

**Priority Support:**
- Priority email support (faster response times)
- Feature request consideration
- Early access to new platform features

**Data Retention (Premium Vendors):**
- Transaction history: **Current year (rolling 12 months)**
- Order details: **150 days**
- Customer data: **150 days**

**Transaction Fees:**
- Same 6.5% deduction (subscription value is features and tools)

**Value Proposition:**
- Build loyal VIP customer base
- Unlimited flash sales for real-time inventory movement
- Unlimited Monthly Market Box capacity (recurring revenue)
- Multi-market presence for vendors who travel
- Featured placement drives more discovery and sales
- Advanced analytics for data-driven business decisions
- Pre-scripted messaging for customer communication

---

## Special Products & Programs

### Monthly Market Box (4-Week Prepaid Box)

**Available To:** Premium Members only

**How It Works:**
- One-time purchase for 4 consecutive weeks of vendor's bundle
- Buyer selects participating vendor
- Pays upfront for all 4 weeks
- Picks up one bundle per week for 4 weeks
- No auto-renewal (not a subscription)

**Pricing Structure:**
```
Example: Vendor's weekly bundle normally $75

Monthly Market Box: $65/week × 4 weeks = $260 base price
  Buyer pays:    $260 × 1.065 = $277.00 (one-time payment)
  Vendor gets:   $260 × 0.935 = $242.90 (upfront, immediately)
  Platform net:  ~$25.15 (9.3%)
```

**Buyer Benefits:**
- Save $10/week ($40 total over 4 weeks) vs regular price
- Guaranteed weekly fresh box
- No season-long commitment (like traditional CSA)
- 4-week commitment is manageable and trial-friendly
- Flexibility to try different vendors every 4 weeks

**Vendor Benefits:**
- $242.90 upfront cash flow (4 weeks guaranteed income)
- Predictable demand (know how many boxes to prepare)
- Customer retention over 4 weeks
- No cancellation risk
- Better than traditional CSA (shorter commitment attracts more buyers)

**Platform Strategy:**
- Week 3: Email buyer "Your pass ends next week - renew for 10% discount?"
- Renewal incentive: Next 4-week pass discounted to encourage rebuy
- Habit formation over 4 weeks
- Encourage vendor relationship building

**Vendor Participation:**
- Standard vendors: Maximum 2 concurrent active customers
- Premium vendors: Unlimited concurrent customers
- Vendor sets discount amount (recommended $10-15/week off regular price)
- Available at both market types (Fixed or Private Pickup)

**Market Type Compatibility:**
- Works with both Fixed Markets and Private Pickup markets
- Buyer acknowledges pickup location/time for all 4 weeks at checkout
- Vendor ensures consistent availability across 4-week period

---

## Communication System

### Overview
FastWrks provides structured communication between buyers and vendors while protecting privacy and preventing spam.

### System Automated Messages (All Users)

**Order Status Updates:**
- "Order confirmed! Pick up at [market] on [date] at [time]"
- "Order marked as fulfilled - thanks for shopping!"

**No Other Automated Messages at Launch**

### Pre-Scripted Messages (Premium Vendors Only)

**Purpose:** Enable critical order-specific communication without exposing contact info or allowing spam.

**Delivery Method:** Email-based (Phase 1)
- Future enhancement: SMS option for additional cost

**Message Templates:**

**Vendor → Buyer:**

*Timing/Logistics Category:*
1. "Running 10-15 minutes late to market today"
2. "Leaving market in 15 minutes - last chance to pick up"
3. "Market cancelled due to weather - full refund processed"
4. "Your order didn't get picked up today, a partial refund will be processed"

**Buyer → Vendor:**

*Timing Category:*
1. "Running 10-15 minutes late - still coming!"
2. "There is a problem with my product, please contact me at [buyer enters phone number]"

**Usage Rules:**
- Premium vendors only
- Order-specific only (no broadcast messages)
- Sent to individual customers regarding their specific orders
- System logs all messages for dispute resolution
- Vendor must select from dropdown (cannot compose free-form)

**Technical Implementation:**
- Difficulty: Low
- Time to build: 6-8 hours
- Cost: Free (email-based)
- Database table: `order_messages` tracks sender, recipient, template used, timestamp

**Future Enhancement (Phase 2):**
- SMS delivery option for Premium vendors
- Cost: ~$0.0075 per message (Twilio)
- Faster delivery for time-sensitive messages

---

## Flash Sales System

### Overview
Flash sales enable vendors to move real-time, on-hand inventory during market hours with time-bound, limited-quantity offers.

**Key Characteristics:**
- Separate from pre-sale inventory (never combined)
- Time-limited (1-4 hours typical)
- Quantity-limited (vendor sets available count)
- Real-time offers during market days
- Vendor certifies on-hand inventory before posting

### Frequency Limits

**Standard Vendors:**
- Maximum 2 flash sales per week
- Prevents spam and maintains special nature

**Premium Vendors:**
- Unlimited flash sales
- Freedom to post as real-time inventory allows

### Market Type Restrictions

**Critical Rule:** One location per flash sale

**Fixed Markets:**
- Vendor can post flash sale for any Fixed Market they participate in
- Example: "Flash Sale at Downtown Market (today 12-3pm)"

**Private Pickup Markets:**
- Vendor can post flash sale for their Private Pickup location
- Example: "Flash Sale - pickup at farm (today 2-6pm)"

**Overlapping Flash Sales:**
- Vendor CANNOT have simultaneous flash sales at different locations
- Must wait for current flash sale to end/expire before posting at different location
- System blocks creation of overlapping flash sales at different markets
- Rationale: Vendor cannot be in two places at once

**Example Valid Sequence:**
```
10:00 AM: Post flash sale at Downtown Market (ends 2pm)
2:01 PM: Flash sale ends
2:05 PM: Can now post flash sale at Farm location (ends 6pm)
```

**Example Invalid Attempt:**
```
10:00 AM: Flash sale active at Downtown Market (ends 2pm)
12:00 PM: Try to post flash sale at Farm
System: ❌ "You have an active flash sale at Downtown Market. 
         End that sale before creating another at a different location."
```

### Notification & Access Timing

**When vendor posts flash sale at 10:00 AM:**

| Time | Notification Sent To | Access Status |
|------|---------------------|---------------|
| 10:00 AM | Premium Members | Exclusive 10-minute window |
| 10:05 AM | VIPs (non-members) | 5-minute advantage over general public |
| 10:10 AM | All Free Tier Users | General availability |

**Access Rules:**
- Premium members get full 10-minute exclusive window
- VIPs can purchase starting at 10:05 (5 min before general public)
- Premium members maintain access during VIP window
- All users have access after 10:10 AM (if inventory remains)

### Targeting & Eligibility

**Who Gets Notified:**
- Users who previously purchased from THIS vendor (within 365 days)
- Users within 25 miles of vendor's market location
- Users with flash sale notifications enabled (opt-in)
- Respects user-vendor blocking (if user blocked vendor, no notification)

**Notification Frequency Limits:**
- Maximum 1 flash sale email per user per day
- Time window: 8am - 6pm only
- Multiple vendors consolidated into single email when possible

### VIP Flash Sale Benefits

**For Premium Vendors Only:**
- Tag up to 25 customers as VIPs
- VIPs get 5-minute head start (after premium members, before general public)
- VIPs notified when added to list: "You're now a VIP for [Vendor Name]!"
- Auto-removal: VIPs who haven't purchased in 6 months removed automatically

### Inventory Management

**Separate Pools:**
- Pre-sale inventory and flash sale inventory NEVER combine
- Vendor declares flash sale quantity at posting
- System tracks: total quantity, sold count, remaining count
- Auto-ends when: time expires OR quantity sells out OR vendor manually ends

**Vendor Controls:**
- Set duration (1-4 hours recommended)
- Set quantity available
- Certify on-hand inventory (checkbox required)
- Manually end early if needed
- Release unsold inventory back to general stock

---

## Bundle & Inventory Guidelines

### Bundle Structure

**Philosophy:**
- Bundles can contain 1 item or multiple items
- Even single items listed as "bundles" for system consistency
- Designed for simplicity and vendor ease-of-use

**Limits:**
- **Recommended:** 5 bundles per vendor (optimal for vendor management and buyer browsing)
- **Maximum:** 7 bundles per vendor (hard cap)
- Keep offerings focused and manageable

**Bundle Contents:**
- Vendor defines and describes bundle contents
- Text description + product image
- Platform does NOT track individual items within bundle
- Buyer confirms bundle contents at pickup (buyer's responsibility)

**Examples:**
```
Fireworks:
- "Family Fun Pack" - 3 fountains, 5 sparklers, 2 roman candles
- "Single Artillery Shell" - 1 premium artillery shell

Farmers Market:
- "Breakfast Bundle" - 1 dozen eggs, 1 lb bacon, 1 loaf bread  
- "Tomato Lovers Box" - 3 lbs heirloom, 1 lb cherry tomatoes
- "Single Watermelon" - 1 large watermelon
```

### Inventory Types

**Pre-Sale Inventory:**
- Advance orders with buffer time for vendor preparation
- Vendor knows demand ahead of market day
- Can plan harvesting, packing, bundling
- Typical: orders accepted 1-7 days before market

**Flash Sale Inventory:**
- Real-time, on-hand inventory
- Posted during market hours (or before)
- Time-sensitive (1-4 hours)
- Quantity-limited based on what vendor physically has

**Critical Rule:**
- Pre-sale and flash sale inventory pools are COMPLETELY SEPARATE
- Never combined or overlapping
- Different listing records in system

**Shared Inventory Across Markets:**
- Single inventory pool per bundle
- If vendor sells at multiple markets (Fixed + Private Pickup), same inventory pool
- Example: 10 Veggie Boxes total, available at Downtown Market OR Farm pickup
- Buyer A orders 3 for Saturday market → 7 remain for either location
- Buyer B orders 4 for Tuesday farm pickup → 3 remain

**Leftover Inventory:**
- Vendor can sell leftover inventory during week
- List at Private Pickup location (if vendor has one)
- Or list for next market date
- Flexible inventory management across market types

---

## VIP Customer System

### Overview
Premium vendors can designate up to 25 customers as VIPs, creating a loyal customer base with special benefits.

### VIP Benefits (For Customers)

**Early Access:**
- 5-minute head start on vendor's flash sales (after premium members)
- 1-hour head start on new bundle postings (after premium members)
- Priority over free tier users

**Notifications:**
- Notified when added to VIP list
- Daily consolidated email when vendor posts new bundles
- Immediate notification for flash sales

**Recognition:**
- VIP status badge on vendor's customer list (vendor can see)
- Exclusive treatment builds vendor-customer relationship

### VIP Management (For Vendors)

**Capacity:**
- Maximum 25 VIPs per vendor
- Keeps VIP status meaningful (not everyone is VIP)
- Manageable number for vendor to remember/recognize

**Adding VIPs:**
- Vendor manually tags customers from order history
- Customer immediately notified via email
- VIP status active immediately

**Removing VIPs:**
- Vendor can manually remove to free up slots
- Auto-removal after 6 months of no purchases
- Email notification when removed (optional, vendor choice)

**VIP Dashboard (Premium Vendors):**
- Current VIP count: "18/25 slots used"
- VIP list with purchase history
- Last purchase date for each VIP
- Lifetime value per VIP
- Engagement metrics

### VIP Notification Consolidation

**Problem Prevention:**
- Buyer could be VIP for multiple vendors
- Without consolidation: spam from 5+ vendors daily

**Smart Solution:**
- Daily consolidation job (runs 8am)
- All vendors who posted new bundles yesterday → grouped into ONE email
- Max 1 VIP notification email per buyer per day

**Email Example:**
```
Subject: New bundles from your favorite vendors! 🌟

Hi Tracy,

Good news! 3 vendors you follow posted new items:

📦 Green Acres Farm - "Summer Harvest Box" - $45
📦 Baker's Dozen - "Sourdough + Pastry Bundle" - $30  
📦 Hill Country Honey - "Raw Honey Trio" - $25

[View All New Bundles]

You're on these vendors' VIP lists, which means you get 1-hour 
early access to their new bundles. Check them out before everyone else!
```

**Rules:**
- Only sent if vendor posted new bundle in last 24 hours
- Shows up to 5 vendors per email
- If more than 5: "...and 3 more vendors posted new items"
- Links to platform to view all

---

## Multi-Vendor Cart System

### Overview
Buyers can add items from multiple vendors into a single cart and checkout once, with separate transactions per vendor.

**Available To:** All users (free and premium)

**Restriction:** Multi-vendor cart ONLY works for Fixed Markets (same market, same day)

### How It Works

**Buyer Experience:**
1. Browse listings from multiple vendors at same Fixed Market
2. Add items to cart from Vendor A, B, C
3. Single checkout page showing all items
4. Pay once
5. Receive order confirmation
6. Pick up items from each vendor at market (separate pickups)

**Example Cart:**
```
Your Cart - Downtown Farmers Market (Saturday, Jan 11)
- Green Acres Farm: "Veggie Box" - $53.25
- Baker's Dozen: "Sourdough Loaf" - $10.65
- Hill Country Honey: "Raw Honey" - $21.30

Total: $85.20
[Checkout]
```

**Behind the Scenes:**
- Creates ONE Order (buyer's shopping cart)
- Creates THREE Transactions (one per vendor)
- Stripe charges buyer once: $85.20
- Platform distributes payouts to each vendor via Stripe Connect
- Each vendor gets separate payment notification

### Transaction Structure

**Example: 3-Vendor Order**
```
ORDER #12345 (Buyer: Tracy)
  Total charged to buyer: $85.20
  
  Transaction 1: Green Acres Farm
    Bundle: "Veggie Box" base price $50
    Buyer paid: $53.25 (6.5% markup)
    Vendor gets: $46.75 (6.5% deduction)
    Platform: $4.65 net
    Status: Pending pickup
    
  Transaction 2: Baker's Dozen  
    Bundle: "Sourdough" base price $10
    Buyer paid: $10.65
    Vendor gets: $9.35
    Platform: $0.87 net
    Status: Pending pickup
    
  Transaction 3: Hill Country Honey
    Bundle: "Honey" base price $20  
    Buyer paid: $21.30
    Vendor gets: $18.70
    Platform: $1.74 net
    Status: Pending pickup
```

### Vendor No-Show Handling

**Problem:** Buyer pre-purchased from 3 vendors, but Vendor B doesn't show up at market.

**Solution:**
1. Buyer reports Vendor B no-show via app
2. System refunds Transaction 2 only ($10.65)
3. Vendor A and C still get paid (their transactions complete)
4. Buyer receives partial refund (Vendor B's portion)
5. Platform keeps fee from completed transactions only

**Accountability:**
- Vendor B's rating impacted
- Multiple no-shows → vendor suspension
- Buyer trust maintained (automatic refund)

### Pickup Coordination

**No Pickup Slots:**
- Buyer responsible for visiting each vendor booth
- No scheduled pickup times
- Real-time pickup during market hours
- Vendor marks order as "fulfilled" when buyer picks up

**Order Status Tracking:**
```
Order #12345 Status:
✅ Vendor A - Picked up
✅ Vendor C - Picked up  
❌ Vendor B - Refunded (no-show)
```

### Multi-Vendor Restrictions

**Cannot combine in multi-vendor cart:**
- Vendors from different Fixed Markets
- Any Private Pickup vendors (different pickup times)
- Mixed Fixed Market + Private Pickup

**System blocks these scenarios:**
```
❌ Vendor A at Downtown Market (Saturday) + Vendor B at Suburban Market (Sunday)
❌ Vendor A at Downtown Market + Vendor B at Farm (Private Pickup)
❌ Vendor A at Farm (Private Pickup) + Vendor B at different farm
```

**Buyer must place separate orders for:**
- Different markets
- Different days
- Private Pickup vendors

---

## Payment Processing (Stripe Connect)

### Architecture

**Stripe Connect Model:** Platform uses Stripe Connect to handle vendor payouts directly

**Benefits:**
- Vendors get paid directly (platform never holds funds)
- Platform automatically deducts application fee
- Stripe handles all payout timing, tax forms, 1099s
- Platform avoids money transmitter regulations

### Vendor Onboarding

**Stripe Express Accounts (Recommended):**
- Vendor clicks "Connect with Stripe" button
- Minimal setup (basic info + bank account)
- Stripe owns vendor support
- One-click onboarding experience

**Onboarding Flow:**
1. Vendor completes platform signup
2. Platform prompts: "Connect your bank account to receive payments"
3. Redirects to Stripe Connect onboarding
4. Vendor enters: name, address, SSN/EIN, bank routing/account
5. Stripe verifies information
6. Vendor approved and can receive payments

**Approval Time:**
- Instant for US vendors with valid info
- Manual review if flagged (24-48 hours)

### Payment Flow

**Pre-Sale Order:**
1. Buyer checks out ($53.25)
2. Stripe charges buyer's card
3. Platform holds funds in Stripe Connect
4. At pickup: Buyer confirms receipt
5. Platform releases funds to vendor ($46.75) via Connect transfer
6. Vendor receives payout 2 business days later (standard Stripe timing)

**Flash Sale Order:**
- Same flow as pre-sale
- Faster timing (pickup typically same day as sale)

**Monthly Market Box:**
- Buyer pays upfront ($277 for 4 weeks)
- Vendor receives full amount immediately ($242.90)
- No installment releases (vendor gets it all at purchase)

### Fee Breakdown

**$50 Bundle Transaction:**
```
Buyer's card charged:           $53.25
  
Stripe fee (2.9% + $0.30):      -$1.85
Platform application fee:       -$4.75  
Vendor payout:                  $46.75

Platform gross:                  $6.50
Platform net (after Stripe):     $4.65 (9.3% of base)
```

**Platform Never Touches Money:**
- Buyer's payment goes to Stripe
- Platform instructs Stripe: "Send $46.75 to Vendor A"
- Stripe deducts platform application fee automatically
- Stripe handles all money movement

### Payout Timing

**Standard Stripe Timing:**
- Transaction completes (buyer picks up)
- Funds settle to vendor in 2 business days
- Vendors see payout schedule in Stripe dashboard

**Platform Can Configure:**
- Daily payouts (requires higher volume)
- Weekly payouts (default for new vendors)
- Monthly payouts (vendor choice)

### Tax & Reporting

**Stripe Handles:**
- Annual 1099-K forms for vendors (if >$600/year)
- Transaction reporting
- Tax documentation

**Platform Provides:**
- Vendor dashboard showing: sales, fees, net payouts
- Downloadable transaction history (per data retention policy)
- Annual summary reports

---

## Data Retention & Management

### Standard Vendor Data Retention

**33-Day Rolling Window:**
- Transaction history: Last 33 days visible
- Order details: Last 33 days visible
- Customer data (names, order history): Last 33 days visible

**Rationale:**
- Covers typical dispute window
- Encourages premium upgrade for longer access
- Reduces database size for free tier

**After 33 Days:**
- Data archived by platform (vendor cannot access)
- Available for dispute resolution if needed
- Vendor must upgrade to Premium for historical access

### Premium Vendor Data Retention

**Extended Access:**
- Transaction history: **Current year (rolling 12 months)**
- Order details: **150 days**
- Customer data: **150 days**

**Rationale:**
- Supports tax preparation needs (current year transactions)
- Longer dispute/refund window
- Better customer relationship management
- Analytics require historical data

### Platform Data Management

**Background Archival:**
- Data older than retention period moved to long-term storage
- Not deleted (compliance, disputes, analytics)
- Not accessible to vendors after retention period
- Platform maintains for legal/operational needs

**Database Efficiency:**
- Periodic cleanup job removes old data from primary database
- Improves query performance
- Reduces storage costs
- Maintains system speed

**Long-Term Storage:**
- Archived data stored separately
- Available for:
  - Dispute resolution
  - Legal compliance
  - Platform analytics
  - Vendor premium upgrade (back-fill historical data)

---

## Feature Comparison Tables

### Buyer / Shopper Comparison

| Feature | Free Tier | Premium Member |
|---------|-----------|----------------|
| **Cost** | $0 | $9.99/mo or $81.50/yr |
| **Transaction Fee** | 6.5% markup | 6.5% markup |
| **Browse Listings** | ✅ All markets | ✅ All markets |
| **Purchase Pre-Sales** | ✅ | ✅ |
| **Purchase Flash Sales** | ✅ (after 10 min) | ✅ (immediate) |
| **Multi-Vendor Cart** | ✅ Fixed Markets | ✅ Fixed Markets |
| **Flash Sale Head Start** | ❌ | ✅ 10 minutes |
| **New Bundle Notifications** | ✅ (2 hrs delay) | ✅ (immediate) |
| **Monthly Market Box** | ❌ | ✅ |
| **VIP Eligible** | ✅ (5 min/1 hr head start) | ✅ (10 min/2 hr as member) |
| **Private Pickup Markets** | ✅ | ✅ |

### Vendor / Seller Comparison

| Feature | Standard Vendor | Premium Vendor |
|---------|----------------|----------------|
| **Cost** | $0 | $24.99/mo or $208.15/yr |
| **Transaction Fee** | 6.5% deduction | 6.5% deduction |
| **Bundle Listings** | Up to 7 (5 recommended) | Up to 7 (5 recommended) |
| **Market Types** | Fixed + Private Pickup | Fixed + Private Pickup |
| **Pre-Sale Orders** | ✅ | ✅ |
| **Flash Sales** | 2 per week | Unlimited |
| **Monthly Market Box** | 2 concurrent customers | Unlimited |
| **VIP Customer List** | ❌ | ✅ Up to 25 |
| **Featured Placement** | ❌ | ✅ Badge + Priority |
| **Multi-Location** | ✅ Multiple markets | ✅ Multiple markets |
| **Analytics** | Basic (via Stripe) | Advanced (in-app) |
| **Data Retention** | 33 days | 150 days / current year |
| **Pre-Scripted Messages** | ❌ | ✅ Email-based |
| **Priority Support** | Standard | Priority email |

---

## Pricing Psychology & Value Props

### Why Buyers Upgrade to Premium

**Core Value - Monthly Market Box:**
- CSA-style 4-week boxes without season-long commitment
- Most requested feature: flexibility without long-term lock-in
- Try different vendors every month
- Guaranteed weekly fresh boxes

**Secondary Value - Flash Sale Access:**
- Flash sales sell out fast (limited quantity + time)
- 10-minute head start = getting items others miss
- Psychological: "I'm a smart shopper getting first pick"

**Additional Values:**
- 2-hour head start on new vendor bundles
- Supporting local vendors with guaranteed purchases
- Premium status = being part of vendor's loyal community

**Break-Even Analysis:**
- Membership: $9.99/month = $120/year
- If buyer purchases 2 Monthly Market Boxes per year (saves $40 total)
- Or catches 5-10 flash sales per year that free users miss
- Pays for itself in value received

---

### Why Vendors Upgrade to Premium

**Core Value - Unlimited Flash Sales:**
- Move excess inventory any time
- Real-time revenue during market hours
- No arbitrary limits on selling capability

**Core Value - Unlimited Monthly Market Boxes:**
- Recurring revenue from loyal customers
- Predictable cash flow
- Build subscription-style customer base

**Secondary Values:**
- VIP list = build loyal customer base (repeat purchases)
- Featured placement = more discovery, more sales
- Multi-location = serve multiple markets efficiently
- Advanced analytics = data-driven business decisions
- Extended data retention = better tax prep and customer insights

**Break-Even Analysis:**
- Premium: $24.99/month = $300/year
- If vendor uses 3+ flash sales per week (vs 2 free limit)
- Or gains 3-5 Monthly Market Box customers at $240+ each upfront
- Or builds VIP base generating 20% more repeat purchases
- ROI positive in 2-3 months

---

### Platform Revenue Model

**Diversified Revenue Streams:**
1. **Transaction fees (primary):** 9.3% net on all sales
2. **Premium memberships (buyers):** Recurring revenue ($9.99/mo)
3. **Premium subscriptions (vendors):** Recurring revenue ($24.99/mo)
4. **Monthly Market Box:** Higher-value transactions ($260+ per purchase)

**Revenue Scaling:**
- More transactions = more platform fees
- More premium users = predictable recurring revenue
- Growth in vendor base = more inventory = more buyer activity
- Network effects: more vendors attract more buyers attract more vendors

**Target Margins:**
- Transaction fees net 9.3% after Stripe
- Memberships/subscriptions = 100% margin (pure profit after payment processing)
- Monthly Market Box = same 9.3% but on higher transaction values ($260 vs $50)

---

## Implementation Notes

### For Development Team

**Database Schema Requirements:**

**Core Tables:**
- User tiers: enum('free', 'premium')
- Vendor tiers: enum('standard', 'premium')
- Market types: enum('fixed', 'private_pickup')
- Listing types: enum('presale', 'flash', 'market_box')
- VIP customer tracking table
- Order messages table (pre-scripted communications)

**Business Rules:**
- Bundle limit enforcement (7 max)
- Flash sale frequency tracking (standard vendors: 2/week)
- Flash sale location exclusivity (no overlapping at different locations)
- Monthly Market Box capacity (standard vendors: 2 concurrent)
- VIP list capacity (25 max per premium vendor)
- Notification log (prevent spam, consolidate VIP notifications)

**Data Retention:**
- Automated archival job (moves old data to long-term storage)
- Standard vendors: 33-day rolling window
- Premium vendors: 150 days for orders/customers, current year for transactions
- Archival triggers on data age, runs daily

**Stripe Integration:**
- Stripe Connect Express accounts for vendors
- Payment intents for transactions
- Application fee structure: 6.5% buyer + 6.5% vendor
- Connected account transfers for payouts
- Webhook handling for payment events

**Notification System:**
- Email service (SendGrid, AWS SES, or similar)
- Flash sale timing logic (10 min, 5 min, general)
- Pre-sale bundle timing logic (2 hr, 1 hr, general)
- VIP consolidation job (daily at 8am)
- Frequency limits enforcement (1 flash sale email per user per day max)

**Premium Feature Gates:**
- Check user/vendor tier before allowing access
- Flash sale creation limit for standard vendors (2/week)
- Monthly Market Box capacity check (standard vendors: 2 concurrent)
- VIP list capacity enforcement (25 max)
- Monthly Market Box availability (premium members only)
- Pre-scripted messaging (premium vendors only)
- Data retention window enforcement
- Analytics access (premium vendors only)

---

### Business Rules to Enforce

**Bundle Limits:**
- Hard stop at 7 bundles per vendor
- Warning at 5: "We recommend keeping 5 bundles for best results"
- Cannot create more until deleting existing

**Flash Sale Frequency:**
- Standard vendors: Track count per week, reset Sunday midnight
- Premium vendors: No tracking needed (unlimited)

**Flash Sale Location Exclusivity:**
- Check for active flash sales when creating new one
- Block creation if existing flash sale at different location
- Allow creation once previous flash sale ends/expires
- Error message: "End your current flash sale at [location] before starting at different location"

**Monthly Market Box Capacity:**
- Standard vendors: Count active subscriptions (4-week cycles in progress)
- Block new Monthly Market Box purchases when at 2 concurrent
- Auto-release slot when customer's 4-week cycle completes
- Premium vendors: No capacity check

**VIP Management:**
- Capacity check before adding new VIP (max 25)
- Auto-removal job runs weekly (check 6-month purchase inactivity)
- VIP notification sent immediately on add
- Block VIP add if at capacity: "Remove inactive VIP or upgrade to add more"

**Transaction Fees:**
- Always 6.5% markup + 6.5% deduction
- No exceptions or special pricing
- Applied universally across all transaction types
- Calculated server-side (never trust client)

**Access Timing:**
- Flash sale notifications: exact timing (10 min, 5 min, general)
- Pre-sale bundle notifications: exact timing (2 hr, 1 hr, general)
- Database timestamp verification
- Grace period: 30 seconds (account for clock drift)

**Multi-Vendor Cart Restrictions:**
- Validate all items are from same Fixed Market
- Validate all items have same pickup date
- Block checkout if any Private Pickup items in cart with Fixed Market items
- Block checkout if items from different markets
- Error message: "Multi-vendor cart only works for same market, same day"

**Market Type Validations:**
- Private Pickup: Require pickup time/date confirmation at checkout
- Flash sales: Validate only one location selected
- Flash sales: Block overlapping at different locations
- Shared inventory: Deduct from same pool regardless of selected market
- Pickup confirmation checkbox required for Private Pickup orders

**Data Retention Enforcement:**
- Nightly job: Archive data older than retention window
- Standard vendors: 33-day cutoff
- Premium vendors: 150-day cutoff for orders/customers, 365-day for transactions
- Dashboard queries: Filter by retention window based on vendor tier
- Upgrade handling: Back-fill historical data when vendor upgrades

---

## Glossary

**Terms & Definitions:**

**Bundle:** A pre-packaged group of items (or single item) sold as one unit. Vendor defines contents via description and image.

**Pre-Sale:** Advance order placed before market day, giving vendor time to prepare. Typical window: 1-7 days before market.

**Flash Sale:** Real-time, limited-quantity offer posted during market hours. Time-bound (1-4 hours) and quantity-limited based on on-hand inventory.

**VIP Customer:** Customer designated by premium vendor as high-value. Gets early access to flash sales (5 min) and new bundles (1 hour) plus notifications.

**Monthly Market Box:** 4-week prepaid bundle purchase. Buyer pays once upfront, picks up weekly for 4 consecutive weeks. Not a subscription.

**Multi-Vendor Cart:** Shopping cart containing items from multiple vendors at same Fixed Market. Single checkout, but separate transactions per vendor.

**Transaction:** Single vendor-buyer exchange. Platform earns fee per transaction. Multiple transactions can exist within one order.

**Order:** Buyer's shopping cart at checkout. May contain one or many transactions if multi-vendor.

**Fixed Market:** Traditional market with fixed location and schedule (e.g., farmers market every Saturday 8am-1pm). Supports multi-vendor cart.

**Private Pickup Market:** Flexible market where vendor sets availability at their location (home/farm/cottage). Single vendor per transaction. Requires pickup time confirmation.

**Stripe Connect:** Stripe's platform for marketplaces. Enables direct vendor payouts without platform holding funds.

**Application Fee:** Platform's fee automatically deducted by Stripe from vendor payout. Configured as 6.5% of base price.

**Express Account:** Simplified Stripe Connect account type. Minimal onboarding, Stripe owns vendor support.

**Data Retention Window:** Time period vendor can access historical data. 33 days (standard) or 150 days / current year (premium).

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | Jan 8, 2026 | Initial comprehensive document | Chet (Claude Chat) |
| 2.0 | Jan 9, 2026 | Major update: Added market types (Fixed/Private Pickup), corrected domain name, renamed Monthly Market Pass to Monthly Market Box, updated business model description, added communication system, refined analytics, added data retention policies, updated priority notification timing, added flash sale location restrictions, removed primary market concept, clarified all vendor/buyer tier limits | Chet (Claude Chat) |

---

## Document Purpose

This document serves as the **single source of truth** for:
- All pricing decisions
- Feature availability by tier
- Transaction fee structures
- Business rules and limits
- Implementation requirements
- Market type specifications
- Data retention policies

**When in doubt, refer to this document.**

**Any changes to pricing, features, or tiers must be updated here first.**

---

*End of Document*
