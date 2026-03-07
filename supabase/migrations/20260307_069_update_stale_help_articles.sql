-- Migration 069: Update stale/incomplete help articles
-- Fixes 6 articles identified in content audit:
--   1. Payment methods — was missing Venmo, Cash App, PayPal, Cash
--   2. Service fees — was missing specific percentages and small order fee details
--   3. Tips — simplified but accurate rewrite
--   4. Minimum order — was vague about thresholds and fee amounts
--   5. FM vendor plans — was missing pricing
--   6. FT vendor plans — had wrong Pro tier price ($30 → $25)

-- ============================================================================
-- Article: "What payment methods are accepted?"
-- Was: "We do not currently accept cash payments through the platform"
-- Now: Lists all 5 payment methods accurately
-- ============================================================================
UPDATE knowledge_articles
SET body = 'We support several payment methods to make buying and selling convenient:

Online Payments (processed at checkout):
• Credit & Debit Cards — Visa, Mastercard, Amex, and Discover are accepted on every order. Payments are processed securely through Stripe.

In-Person Payments (arranged between buyer and vendor):
• Venmo — If a vendor has linked their Venmo, you can pay via Venmo at pickup.
• Cash App — If a vendor has linked their Cash App, you can pay via Cash App at pickup.
• PayPal — If a vendor has linked their PayPal, you can pay via PayPal at pickup.
• Cash — Some vendors accept cash at pickup. Look for the "Cash" badge on their profile.

Each vendor chooses which payment methods they accept. You can see their accepted methods on their vendor profile and on each listing. You can also filter the Vendors page by payment method to find vendors that accept your preferred way to pay.

Note: In-person payment methods (Venmo, Cash App, PayPal, Cash) are arranged directly between you and the vendor at pickup. The platform processes card payments only.',
    updated_at = now()
WHERE title = 'What payment methods are accepted?'
  AND category = 'Payments & Fees';

-- ============================================================================
-- Article: "What are the service fees?"
-- Was: Vague about "service fee percentage" without specifics
-- Now: Exact percentages, flat fee, and small order fee details
-- ============================================================================
UPDATE knowledge_articles
SET body = 'A small service fee is added to each order to cover payment processing, platform maintenance, and customer support. Here is how it works:

Buyer Service Fee:
• 6.5% of your order subtotal, plus a $0.15 per-order flat fee
• This is added to the prices you see at checkout
• Example: A $20.00 order would have a $1.30 percentage fee + $0.15 flat fee = $1.45 in fees, for a total of $21.45

Small Order Fee:
• Farmers Marketing: Orders with a displayed subtotal under $10.00 have an additional $1.00 small order fee
• Food Truck''n: Orders with a displayed subtotal under $5.00 have an additional $0.50 small order fee
• This fee helps cover the fixed costs of processing smaller transactions
• Tip: Add one more item to get above the threshold and avoid this fee

Vendor Service Fee:
• Vendors pay a matching 6.5% + $0.15 fee on the base price of each order
• This is deducted from their payout automatically

All fees are shown transparently at checkout before you confirm your order. There are no hidden charges.',
    updated_at = now()
WHERE title = 'What are the service fees?'
  AND category = 'Payments & Fees';

-- ============================================================================
-- Article: "How do tips work?"
-- Was: Oversimplified tip distribution
-- Now: Clear and accurate without overcomplicating
-- ============================================================================
UPDATE knowledge_articles
SET body = 'You can add a tip to any order during checkout. Tips are a great way to show appreciation for your vendor''s work.

How tipping works:
• Choose a tip percentage (10%, 15%, 20%) or enter a custom amount at checkout
• Your tip is calculated on the displayed subtotal (the prices you see including the service fee markup)
• The tip is added to your total charge

Where does the tip go?
• The vendor receives the tip on the base food cost of your order
• A small portion of the tip that corresponds to the platform service fee is retained by the platform
• No additional processing fees are taken from tips beyond this split

Tips are completely optional but always appreciated. They go a long way in supporting the local vendors you love.',
    updated_at = now()
WHERE title = 'How do tips work?'
  AND category = 'Payments & Fees';

-- ============================================================================
-- Article: "Is there a minimum order amount?"
-- Was: Vague "small order surcharge" without specifics
-- Now: Exact thresholds and fee amounts per vertical
-- ============================================================================
UPDATE knowledge_articles
SET body = 'There is no hard minimum order amount — you can place an order of any size. However, a small order fee applies to help cover the fixed costs of processing smaller transactions:

Farmers Marketing:
• Orders with a displayed subtotal under $10.00 have a $1.00 small order fee added
• Once your displayed subtotal reaches $10.00, the fee is automatically removed

Food Truck''n:
• Orders with a displayed subtotal under $5.00 have a $0.50 small order fee added
• Once your displayed subtotal reaches $5.00, the fee is automatically removed

The "displayed subtotal" is the sum of item prices you see in your cart (which already includes the service fee markup). This fee is shown clearly at checkout, so there are no surprises.

Tip: If you are close to the threshold, adding one more item will often push you over and remove the small order fee entirely.',
    updated_at = now()
WHERE title = 'Is there a minimum order amount?'
  AND category = 'Payments & Fees';

-- ============================================================================
-- Article: "What vendor plans are available?" (FM — vertical_id = 'farmers_market')
-- Was: Listed tiers but no pricing
-- Now: Includes monthly pricing for each tier
-- ============================================================================
UPDATE knowledge_articles
SET body = 'Farmers Marketing offers four vendor tiers, each with increasing features and limits:

Free Tier (no cost):
• Up to 3 active listings
• 1 market location
• Basic vendor profile
• No analytics access
• Great for getting started or casual sellers

Standard Tier ($10/month):
• Up to 10 active listings
• 2 market locations
• 30-day analytics history
• Good for regular market vendors

Premium Tier ($25/month):
• Up to 20 active listings
• 3 market locations
• Market Box offerings (subscriptions)
• 60-day analytics history
• Best for established vendors looking to grow

Featured Tier ($50/month):
• Up to 30 active listings
• 5 market locations
• Market Box offerings
• 90-day analytics history with CSV export
• Priority placement in search results
• Ideal for high-volume professional vendors

All paid plans can be billed monthly or annually (with a discount for annual billing). You can upgrade, downgrade, or cancel at any time from your Vendor Dashboard under Account settings.

New vendors may receive a free trial of a paid tier when first approved — check your dashboard for details.',
    updated_at = now()
WHERE title = 'What vendor plans are available?'
  AND vertical_id = 'farmers_market';

-- ============================================================================
-- Article: "What vendor plans are available?" (FT — vertical_id = 'food_trucks')
-- Was: Pro tier listed as $30/month (wrong — it is $25/month)
-- Now: Correct pricing for all tiers
-- ============================================================================
UPDATE knowledge_articles
SET body = 'Food Truck''n offers four vendor tiers, each with increasing features and limits:

Free Tier (no cost):
• Up to 3 active listings
• 1 location
• Basic vendor profile
• No analytics access
• Great for getting started

Basic Tier ($10/month):
• Up to 8 active listings
• 2 locations
• 30-day analytics history
• Good for food trucks just starting their online presence

Pro Tier ($25/month):
• Up to 15 active listings
• 3 locations
• Chef Box offerings (subscriptions)
• 60-day analytics history
• Best for active food trucks looking to build a regular customer base

Boss Tier ($50/month):
• Up to 25 active listings
• 5 locations
• Chef Box offerings
• 90-day analytics history with CSV export
• Priority placement in search results
• Ideal for food truck operators running multiple trucks or high-volume operations

All paid plans can be billed monthly or annually (with a discount for annual billing). You can upgrade, downgrade, or cancel at any time from your Vendor Dashboard under Account settings.

New vendors may receive a free trial of a paid tier when first approved — check your dashboard for details.',
    updated_at = now()
WHERE title = 'What vendor plans are available?'
  AND vertical_id = 'food_trucks';
