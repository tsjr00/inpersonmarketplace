From Tracy - Double pipe || indicates a comment or clarification.  text inside [square brackets] are my comments and need to be addressed. 


# FastWrks BuildApp - Pricing & Features
## Source of Truth Document

**Last Updated:** January 8, 2026  
**Platform:** Multi-brand marketplace (fireworksstand.com, farmersmarket.app)  || [fastwrks.com is the correct fireworks vertical domain name]
**Business Model:** Full Prepay via Stripe Connect  || [business model includes both pre-pay & subscriptions]

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
- Monthly Market Pass purchases  || [change this description to Monthly Market box]
- Multi-vendor cart orders (fee per transaction, not per order)

**No Additional Fees For:**
- Multi-vendor checkout (no extra convenience fee)
- Early access (members/VIPs)
- Premium features

---

## Shopper / Buyer Tiers

### Free Tier

**Cost:** $0

**Features:**
- Browse all vendor listings
- Purchase pre-sale bundles
- Purchase flash sales
- Single vendor checkout
- Multi-vendor cart & single checkout
- Pre-purchase benefits:
  - Guaranteed availability
  - First choice quality
  - Skip the line* (*vendor dependent)
- Standard flash sale notifications (after premium users)

**Transaction Fees:**
- 6.5% markup on all purchases

**Flash Sale Access:**
- Notified 10 minutes after paying members
- Notified 5 minutes after VIPs (non-members)
- Full access to all flash sales after waiting period

**Limitations:**
- No early access to flash sales
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
- **Monthly Market Box access** - eligible to purchase 4-week prepaid vendor boxes
- **Multi-vendor cart optimization** - enhanced checkout experience
- **Priority notifications** - first to know about new vendor bundles  || [how much advanced notice do they get?]

**Transaction Fees:**
- Same 6.5% markup (membership value is features, not fee discounts)

**Flash Sale Priority:**
- Notifications sent at 10:00 AM 
- VIPs (non-members) notified at 10:05 AM
- Free tier notified at 10:10 AM

**Value Proposition:**
- Early access to limited-quantity flash sales
- Flexibility of 4-week prepaid boxes (vs season-long CSA commitment)
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
- Availability date windows
- Category tagging
- Multiple product images per bundle

**Sales Channels:**
- Pre-sale orders (advance orders with pickup at market)
- Flash sales: **2 per week maximum**
  || [Add Monthly Market Box - **capped at 2 buyers at a time**]
- Access to all buyer tiers (free + premium)

**Market Presence:**
- Listed in market directory
- Standard search/browse placement
- Single location pin on market map
- Vendor profile page
- Customer reviews and ratings

**Tools & Analytics:**
- Order management dashboard
- Customer order history || [Maybe. They can get the basics from Stripe]
- Basic sales reporting || [Maybe. They can get the basics from Stripe]
- Transaction history || [Limit the time frame they can see past transactions] 
- Payout tracking (Stripe Connect)

**Customer Management:**
- View order details  || [Limit the time frame these stay visible]
- Communicate with buyers   || [How? - need details - don't think i want in-app messaging for free tier]
- Order status updates
- Basic customer list  || [No buyer contact info provided]

**Transaction Fees:**
- 6.5% deduction from all sales
- Direct deposits via Stripe Connect
- No additional platform fees

---

### Premium Vendor

**Cost:**
- **Monthly:** $24.99/month
- **Annual:** $208.15/year (saves $91.73 = 31% discount)

**All Standard Vendor Features PLUS:**

**Enhanced Sales Tools:**
- **Unlimited flash sales** (no 2-per-week limit)
 || [Add Monthly Market Box - Unlimited (no 2-buyer limit)]
- VIP Customer List management (up to 25 VIPs)
- Featured vendor badge and priority placement
- Multi-location presence (participate in multiple markets)

**VIP Customer Management:**
- Tag up to 25 customers as VIPs
- VIPs get 5-minute flash sale head start (after paying members)
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
- Add multiple market locations
- Toggle weekly participation per market
- Default "home market" always active
- Select additional markets each week via dashboard
- Separate inventory management per location (optional) || [does this mean if they are selling in multiple markets?] 
- Location-specific analytics 

**Advanced Analytics:**  --  || [We NEVER TALKED ABOUT most OF THIS - must discuss]
- Customer purchase patterns
- Repeat customer rate tracking
- Best-selling bundle analysis
- Revenue forecasting tools
- VIP customer lifetime value
- Flash sale performance metrics
- Market-by-market performance comparison

**Priority Support:**
- Dedicated vendor success team   || [NO - not for a while.  but eventually when we need it]
- Priority email/phone support
- Feature request consideration
- Early access to new platform features

**Transaction Fees:**
- Same 6.5% deduction (subscription value is features and tools)

**Value Proposition:**
- Build loyal VIP customer base
- Unlimited flash sales for real-time inventory movement
- Multi-market presence for vendors who travel
- Featured placement drives more discovery and sales
- Advanced tools for serious vendors treating this as a business  || [Still need to explore]

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
- Cancel/skip not available (4-week commitment)
- Flexibility to try different vendors every 4 weeks

**Vendor Benefits:**
- $242.90 upfront cash flow (4 weeks guaranteed income)
- Predictable demand (know how many boxes to prepare)
- Customer retention over 4 weeks
- No cancellation risk
- Better than traditional CSA (shorter commitment attracts more buyers)

**Platform Strategy:**
- Week 3: Email buyer "Your pass ends next week - renew?"
- Renewal incentive: 10% discount on next 4-week pass  || [only with seller consent, not sure if we want this in version 1] 
- Build habit formation over 4 weeks
- Encourage vendor relationship building

**Vendor Participation:**
- Premium vendors: unlimited Market Box offerings
- Standard vendors: can offer  || [CAP THIS AT 2 BUYERS]
- Vendor sets discount amount (recommended $10-15/week off regular price)  || [need seller input]

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
 || [We can increase time frame for Premium vendor flash sales as well - up to 6 hours]

### Notification & Access Timing

**When vendor posts flash sale at 10:00 AM:**

| Time | Notification Sent To | Access Status |
|------|---------------------|---------------|
| 10:00 AM | Premium Members | Exclusive 10-minute window |  || [Make this 15 min window for Premium buyers]
| 10:05 AM | VIPs (non-members) | 5-minute advantage over general public |
| 10:10 AM | All Free Tier Users | General availability |

**Access Rules:**
- Premium members get full 15-minute exclusive window
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

**VIP Notification Example:**
```
Subject: You're a VIP at Green Acres Farm! 🌟

Hi Tracy,

Great news! Green Acres Farm has added you to their VIP customer list.

As a VIP, you'll get:
- 5-minute early access to their flash sales
- Notifications when they post new weekly bundles
- Priority treatment from a vendor who values your business

Keep an eye out for special offers!

 || [customer must be able to opt out of emails - they may not want them]
```

### Inventory Management

**Separate Pools:**
- Pre-sale inventory and flash sale inventory NEVER combine
- Vendor declares flash sale quantity at posting
- System tracks: total quantity, sold count, remaining count
- Auto-ends when: time expires OR quantity sells out OR vendor manually ends

**Vendor Controls:**
- Set duration (1-4 hours recommended)  || [increased for premium vendors]
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
- Posted during market hours
- Time-sensitive (1-4 hours)  || [more for premium vendors]
- Quantity-limited based on what vendor physically has

**Critical Rule:**
- Pre-sale and flash sale inventory pools are COMPLETELY SEPARATE
- Never combined or overlapping
- Different listing records in system

---

## VIP Customer System

### Overview
Premium vendors can designate up to 25 customers as VIPs, creating a loyal customer base with special benefits.

### VIP Benefits (For Customers)

**Early Access:**
- 5-minute head start on vendor's flash sales (after premium members)
- Priority over free tier users

**Notifications:**
- Notified when added to VIP list
- Daily consolidated email when vendor posts new bundles
- Immediate notification for flash sales

**Recognition:**
- VIP badge on vendor's customer list (vendor can see)
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

You're on these vendors' VIP lists, which means you get 5-minute 
early access to their flash sales. Keep an eye out!

 || [client must be able to opt-out]

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

### How It Works

**Buyer Experience:**
1. Browse listings from multiple vendors
2. Add items to cart from Vendor A, B, C
3. Single checkout page showing all items
4. Pay once
5. Receive order confirmation
6. Pick up items from each vendor at market (separate pickups)

**Example Cart:**
```
Your Cart:
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
1. Buyer reports Vendor B no-show via app  || [lets think of best ways to make sure this is not abused - buyer could lie to get out of an order they no longer want] 
2. System refunds Transaction 2 only ($10.65)
3. Vendor A and C still get paid (their transactions complete)
4. Buyer receives partial refund (Vendor B's portion)
5. Platform keeps fee from completed transactions only

**Accountability:**
- Vendor B's rating impacted   || [another reason we need to figure out confirmation of no-show, so buyers reputation not damaged by dishonest or impatient buyers. ]
- Multiple no-shows → vendor suspension
- Buyer trust maintained (automatic refund)

### Pickup Coordination

**No Pickup Slots:**
- Buyer responsible for visiting each vendor booth
- No scheduled pickup times   || [Lets rethink this in terms of a non-standard market.  some markets don't have fixed beginning / end times, they just provide a space for sellers to set-up.  We may need to have a category for Market Types so pickup scheduling can be arranged - something like 'Vendor will be onsite from 8am to 11am' and the buyer has to confirm their understanding & acceptance of that time window.]
- Real-time pickup during market hours
- Vendor marks order as "fulfilled" when buyer picks up

**Order Status Tracking:**
```
Order #12345 Status:
✅ Vendor A - Picked up
✅ Vendor C - Picked up  
❌ Vendor B - Refunded (no-show)
```

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

**Monthly Market Pass:**
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
- Downloadable transaction history
- Annual summary reports

---

## Feature Comparison Tables

### Buyer / Shopper Comparison

| Feature | Free Tier | Premium Member |
|---------|-----------|----------------|
| **Cost** | $0 | $9.99/mo or $81.50/yr |
| **Transaction Fee** | 6.5% markup | 6.5% markup |
| **Browse Listings** | ✅ | ✅ |
| **Purchase Pre-Sales** | ✅ | ✅ |
| **Purchase Flash Sales** | ✅ (after 10 min) | ✅ (immediate) |
| **Multi-Vendor Cart** | ✅ | ✅ |
| **Flash Sale Head Start** | ❌ | ✅ 10 minutes |
| **Monthly Market Pass** | ❌ | ✅ |
| **Priority Notifications** | ❌ | ✅ |
| **VIP Eligible** | ✅ (5 min head start) | ✅ (10 min as member) |

### Vendor / Seller Comparison

| Feature | Standard Vendor | Premium Vendor |
|---------|----------------|----------------|
| **Cost** | $0 | $24.99/mo or $208.15/yr |
| **Transaction Fee** | 6.5% deduction | 6.5% deduction |
| **Bundle Listings** | Up to 7 (5 recommended) | Up to 7 (5 recommended) |
| **Pre-Sale Orders** | ✅ | ✅ |
| **Flash Sales** | 2 per week | Unlimited |
| **VIP Customer List** | ❌ | ✅ Up to 25 |
| **Featured Placement** | ❌ | ✅ Badge + Priority |
| **Multi-Location** | 1 market | Multiple markets |
| **Advanced Analytics** | Basic | Full suite |
| **Priority Support** | Standard | Dedicated team |

---

## Pricing Psychology & Value Props

### Why Buyers Upgrade to Premium

**The Core Value:**
- Flash sales sell out fast (limited quantity + time)
- 10-minute head start = getting items others miss
- Psychological: "I'm a smart shopper getting first pick"

**Secondary Values:**
- Monthly Market Pass = try CSA-style without season commitment  || [The monthly box is a core value, avoiding the long CSA commitment is a popular ask]
- Supporting local vendors with guaranteed purchases
- Premium status = being part of vendor's loyal community

**Break-Even Analysis:**
- Membership: $9.99/month = $120/year
- If buyer catches 2-3 flash sales per month that free users miss   || [not sure i get your math, but it doesn't affect the system]
- Or purchases 2 Monthly Market Passes per year (saves $20 each)
- Pays for itself in value received

### Why Vendors Upgrade to Premium

**The Core Value:**
- Unlimited flash sales = move excess inventory any time
- || [Unlimited Market Boxes]
- Real-time revenue during market hours
- No arbitrary limits on your selling capability

**Secondary Values:**
- VIP list = build loyal customer base (these customers come back)
- Featured placement = more discovery, more sales
- Multi-location = serve multiple markets without separate accounts
- Advanced analytics = run business smarter

**Break-Even Analysis:**
- Premium: $24.99/month = $300/year
- If vendor uses 3+ flash sales per week (vs 2 free limit)
- Or gains 1-2 extra orders per week from featured placement ($50 avg)
- Or builds VIP base that generates repeat purchases
- ROI positive in 2-3 months

### Platform Revenue Model

**Diversified Revenue Streams:**
1. **Transaction fees (primary):** 9.3% net on all sales
2. **Premium memberships (buyers):** Recurring revenue
3. **Premium subscriptions (vendors):** Recurring revenue
4. **Monthly Market Box:** Higher-value transactions

**Revenue Scaling:**
- More transactions = more platform fees
- More premium users = predictable recurring revenue
- Growth in vendor base = more inventory = more buyer activity
- Network effects: more vendors attract more buyers attract more vendors

**Target Margins:**
- Transaction fees net 9.3% after Stripe
- Memberships/subscriptions = 100% margin (pure profit after payment processing)
- Monthly Market Pass = same 9.3% but on higher transaction values

---

## Implementation Notes

### For Development Team

**Database Schema Requirements:**
- User tiers: enum('free', 'premium')
- Vendor tiers: enum('standard', 'premium')
- Listing types: enum('presale', 'flash')
- VIP customer tracking table
- Bundle limit enforcement (7 max)
- Flash sale frequency tracking
- Notification log (prevent spam)

**Stripe Integration:**
- Stripe Connect Express accounts for vendors
- Payment intents for transactions
- Application fee structure: 6.5% buyer + 6.5% vendor
- Connected account transfers for payouts
- Webhook handling for payment events

**Notification System:**
- Email service (SendGrid, AWS SES, or similar)
- Flash sale timing logic (10 min, 5 min, general)
- VIP consolidation job (daily at 8am)
- Frequency limits enforcement

**Premium Feature Gates:**
- Check user/vendor tier before allowing access
- Flash sale creation limit for standard vendors
- VIP list capacity enforcement (25 max)
- Monthly Market Box availability (premium members only)

### Business Rules to Enforce

**Bundle Limits:**
- Hard stop at 7 bundles per vendor
- Warning at 5: "We recommend keeping 5 bundles for best results"
- Cannot create more until deleting existing

**Flash Sale Frequency:**
- Standard vendors: Track count, reset weekly
- Premium vendors: No tracking needed (unlimited)

**VIP Management:**
- Capacity check before adding new VIP
- Auto-removal job runs weekly (check 6-month inactivity)
- VIP notification sent immediately on add

**Transaction Fees:**
- Always 6.5% markup + 6.5% deduction
- No exceptions or special pricing
- Applied universally across all transaction types

**Access Timing:**
- Flash sale notifications must follow exact timing (10 min, 5 min, general)
- Database timestamp verification
- Grace period: 30 seconds (account for clock drift)

---

## Glossary

**Terms & Definitions:**

**Bundle:** A pre-packaged group of items (or single item) sold as one unit. Vendor defines contents via description and image.

**Pre-Sale:** Advance order placed before market day, giving vendor time to prepare. Typical window: 1-7 days before market.

**Flash Sale:** Real-time, limited-quantity offer posted during market hours. Time-bound (1-4 hours) and quantity-limited based on on-hand inventory.

**VIP Customer:** Customer designated by premium vendor as high-value. Gets early access to flash sales (5 min) and notifications for new bundles.

**Monthly Market Pass:** 4-week prepaid bundle purchase. Buyer pays once upfront, picks up weekly for 4 consecutive weeks. Not a subscription.

**Multi-Vendor Cart:** Shopping cart containing items from multiple vendors. Single checkout, but separate transactions per vendor.

**Transaction:** Single vendor-buyer exchange. Platform earns fee per transaction. Multiple transactions can exist within one order.

**Order:** Buyer's shopping cart at checkout. May contain one or many transactions if multi-vendor.

**Stripe Connect:** Stripe's platform for marketplaces. Enables direct vendor payouts without platform holding funds.

**Application Fee:** Platform's fee automatically deducted by Stripe from vendor payout. Configured as percentage or flat amount.

**Express Account:** Simplified Stripe Connect account type. Minimal onboarding, Stripe owns vendor support.

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | Jan 8, 2026 | Initial comprehensive document | Chet (Claude Chat) |

---

## Document Purpose

This document serves as the **single source of truth** for:
- All pricing decisions
- Feature availability by tier
- Transaction fee structures
- Business rules and limits
- Implementation requirements

**When in doubt, refer to this document.**

**Any changes to pricing, features, or tiers must be updated here first.**

---

*End of Document*
