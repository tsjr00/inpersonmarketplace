-- Migration 062: Seed comprehensive knowledge articles for Help & FAQ pages
-- Covers: buyers, vendors, onboarding, payments, subscriptions, operations, privacy
-- Uses NOT EXISTS guard per article for idempotency

-- ============================================================================
-- CATEGORY 1: Getting Started (Global, 5 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Getting Started', 'What is this platform?',
'Our platform connects local vendors — farmers, artisans, food trucks, and small businesses — with customers in their community. Vendors list their products online, and customers can browse, pre-order, and pick up at local markets, events, or private pickup locations.

Think of it as a way to shop local, but smarter. You know exactly what will be available, your items are reserved for you, and you skip the guesswork at the market.

The platform currently supports two verticals:
• Farmers Marketing — for farmers markets, farm stands, and local producers
• Food Truck''n — for food trucks and mobile food vendors', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What is this platform?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Getting Started', 'How do I create an account?',
'Creating an account is free and takes less than a minute:

1. Visit the platform and tap "Sign Up"
2. Enter your name, email address, and create a password
3. Verify your email address by clicking the link we send you
4. You''re in! Start browsing vendors and products

You can create a shopper account to browse and order, or apply for a vendor account if you want to sell.

Tip: You can browse products without an account, but you''ll need one to place orders.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I create an account?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Getting Started', 'How do I find vendors near me?',
'There are several ways to find vendors in your area:

1. Enter your ZIP code or city on the browse page
2. Allow location access when prompted — we''ll show vendors nearest to you
3. Browse the Markets page to find markets and events in your area
4. Use the search bar to find specific products or vendor names

Your location preference is saved so you don''t have to enter it every time. You can change it anytime by updating your location on the browse page.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I find vendors near me?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Getting Started', 'Do I need an account to browse?',
'No! You can browse vendors, products, and markets without creating an account.

However, you will need an account to:
• Place orders
• Save favorite vendors
• Receive order notifications
• Leave reviews

Creating an account is free and only takes a minute.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Do I need an account to browse?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Getting Started', 'What types of vendors can I find here?',
'Our platform hosts a variety of local vendors, including:

Farmers Marketing:
• Produce growers (fruits, vegetables, herbs)
• Bakers and cottage food producers
• Dairy and egg producers
• Meat and poultry vendors
• Artisans (crafts, art, handmade goods)
• Plant and flower sellers
• Prepared food vendors

Food Truck''n:
• Food trucks and mobile food vendors
• Pop-up kitchen operators
• Catering-style meal prep services

All vendors go through an approval process before they can list products on the platform.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What types of vendors can I find here?' AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY 2: Orders & Pickup (Global, 8 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'How do I place an order?',
'Placing an order is simple:

1. Browse products from vendors in your area
2. Tap "Add to Cart" on items you want
3. Review your cart — you can adjust quantities or remove items
4. Choose your pickup location and time (if applicable)
5. Proceed to checkout
6. Enter your payment information (secure, encrypted processing)
7. Confirm your order

After you order, the vendor receives a notification and will confirm they can fulfill it. You''ll get a notification when your order is confirmed and again when it''s ready for pickup.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I place an order?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'What are the order statuses?',
'Your order goes through several stages:

• Paid — Your payment has been processed. Waiting for vendor to confirm.
• Confirmed — The vendor has confirmed they can fulfill your order.
• Ready — Your items are prepared and ready for pickup.
• Fulfilled — Both you and the vendor have confirmed the handoff. Complete!
• Cancelled — The order was cancelled (by you or the vendor).
• Refunded — A refund has been issued to your payment method.

You can check your order status anytime in your Orders page.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What are the order statuses?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'How does pickup work?',
'Pickup is simple and takes just a minute:

1. You''ll receive a notification when your order is ready
2. Go to the market or pickup location during the scheduled hours
3. Find the vendor''s booth or location
4. Show your order information to the vendor
5. The vendor verifies your order and hands over your items
6. You both confirm the handoff in the app

It''s important that both you and the vendor confirm — this protects both parties and ensures accurate record-keeping.

Tip: Have your phone charged and the app open when you arrive at the market.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How does pickup work?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'What is the mutual confirmation process?',
'Mutual confirmation is how we verify that the handoff happened:

1. After the vendor gives you your items, tap "Acknowledge Receipt" in the app
2. The vendor sees a prompt and taps "Yes, I Handed It Off" within 30 seconds
3. Both of you see a green confirmation screen — you''re done!

Why does this matter?
• Payment is not released to the vendor until both parties confirm
• It protects you if there''s a dispute about whether you received your items
• It protects the vendor by proving they fulfilled the order

If something is wrong with your order, tap "I Did Not Receive This" instead of confirming.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What is the mutual confirmation process?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'Can I cancel my order?',
'Yes, but the timing matters:

Before vendor confirms:
• Cancel for free — full refund, no questions asked

After vendor confirms (within grace period):
• Cancel for free during the initial grace period after placing your order

After vendor confirms (past grace period):
• A 25% cancellation fee applies — the vendor has already started preparing your order
• You receive a 75% refund

Please cancel as early as possible if your plans change. Vendors prepare items specifically for your order, and late cancellations mean wasted food and effort.

To cancel, go to your Orders page and tap "Cancel Order" on the order you want to cancel.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Can I cancel my order?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'What happens if I miss my pickup?',
'If you don''t pick up your order during the scheduled window:

• The vendor may mark the order as a no-show
• You will not receive a refund for missed pickups
• Repeated no-shows may result in account restrictions

If you know you can''t make it, cancel the order before the cutoff time to avoid the no-show penalty. You can also contact the vendor directly to arrange an alternative if possible.

Tip: Enable push notifications so you get reminded about upcoming pickups.', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What happens if I miss my pickup?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'Can I order from multiple vendors at once?',
'Yes! You can add items from multiple vendors to your cart in a single shopping session.

Here''s how it works:
• Each vendor''s items become a separate order at checkout
• You''ll see each vendor''s items grouped together in your cart
• Payment is processed for all orders at once
• Each vendor confirms and fulfills their portion independently
• You''ll pick up from each vendor separately at the market

This means you might have different pickup times or locations for different vendors'' items.', 7, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Can I order from multiple vendors at once?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Orders & Pickup', 'What if something is wrong with my order?',
'If there''s an issue with your order at pickup:

Missing items:
• Tap "I Did Not Receive This" instead of confirming receipt
• Talk to the vendor directly — most issues can be resolved on the spot

Wrong items:
• Work it out with the vendor at their booth
• The vendor can make corrections or substitutions

Quality concerns:
• Raise the issue with the vendor directly at the time of pickup
• The vendor is responsible for product quality

Vendor not present:
• Check the market schedule for the vendor''s hours
• Contact the vendor using the information on your order details
• If you cannot reach the vendor, contact our support team

For any unresolved issues, visit our support page to submit a request.', 8, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What if something is wrong with my order?' AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY 3: Payments & Fees (Global, 5 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Payments & Fees', 'What payment methods are accepted?',
'We accept all major credit and debit cards, including:
• Visa
• Mastercard
• American Express
• Discover

All payments are processed through a secure, PCI-compliant payment processor. Your card information is encrypted and never stored on our servers.

We do not currently accept cash payments through the platform. However, some vendors may accept cash in person — check with the vendor directly.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What payment methods are accepted?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Payments & Fees', 'What are the service fees?',
'Service fees help us maintain and improve the platform. All fees are clearly displayed before you complete your purchase:

For Shoppers:
• A service fee percentage is added to your order subtotal
• A small per-order service fee applies
• The exact amounts are shown at checkout before you pay

For Vendors:
• A service fee percentage is deducted from your payout
• A small per-order fee is shared between buyer and vendor
• Fee details are visible in your vendor dashboard

These fees cover payment processing, platform maintenance, customer support, and ongoing development. Current fee rates are always displayed at the time of your transaction.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What are the service fees?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Payments & Fees', 'How do tips work?',
'You can add a tip for your vendor during checkout:

• Choose from preset tip percentages or enter a custom amount
• Tips are voluntary — there is no obligation to tip
• 100% of your tip goes to the vendor (minus standard payment processing costs on the tip amount)
• Tips are included in the vendor''s payout after order completion

Tips are a great way to show appreciation for your favorite vendors!', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do tips work?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Payments & Fees', 'What happens if I need a refund?',
'Refund situations depend on the circumstances:

Order cancelled before vendor confirms:
• Full refund issued automatically

Order cancelled after vendor confirms (past grace period):
• 75% refund (25% cancellation fee applies)

Quality or fulfillment issues:
• Contact the vendor directly first — they handle product-related issues
• If unresolved, contact our support team for assistance

Refunds are processed back to your original payment method. Please allow 5-10 business days for the refund to appear on your statement.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What happens if I need a refund?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Payments & Fees', 'Is there a minimum order amount?',
'There is no minimum order amount required to place an order.

However, a small order surcharge may apply to very small orders to cover the fixed costs of payment processing. If applicable, this will be clearly shown at checkout before you confirm your purchase.

Tip: Ordering multiple items from the same vendor is a great way to make the most of your market trip!', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Is there a minimum order amount?' AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY 4: Market Boxes (FM-specific, 4 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Boxes', 'What is a Market Box?',
'A Market Box is a prepaid 4-week curated bundle offered by a vendor. Each week, you pick up a fresh selection of items curated by the vendor — think of it like a mini CSA (Community Supported Agriculture) box.

How it works:
1. Browse available Market Box offerings from vendors
2. Purchase a 4-week Market Box (one-time prepaid purchase)
3. Each week, pick up your curated box at the designated market or location
4. Confirm receipt each week, just like a regular order

Market Boxes are a great way to:
• Discover new products from your favorite vendors
• Get a guaranteed weekly selection
• Support local vendors with predictable revenue

Note: Market Boxes are prepaid for the full 4-week period. They are not auto-renewing subscriptions.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What is a Market Box?' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Boxes', 'How does Market Box pickup work?',
'Market Box pickups work similarly to regular orders:

1. Each week, the vendor prepares your curated box
2. You''ll receive a notification when your box is ready
3. Visit the market during the scheduled pickup window
4. Find the vendor and present your order information
5. Both you and the vendor confirm the handoff

You''ll do this each week for the 4-week duration of your Market Box. Make sure to pick up each week — the vendor prepares your box specifically for you.

Tip: Set a weekly reminder so you don''t forget your pickup!', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How does Market Box pickup work?' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Boxes', 'What if a vendor can''t fulfill a Market Box week?',
'Occasionally, a vendor may not be able to fulfill a specific week (e.g., due to weather, crop issues, or personal circumstances).

If this happens:
• The vendor should communicate with you as early as possible
• The platform may issue a credit for any verifiably unfulfilled weeks
• The vendor may offer a substitute or make-up box

If you experience repeated fulfillment issues with a Market Box vendor, please contact our support team.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What if a vendor can''t fulfill a Market Box week?' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Boxes', 'How do I cancel a Market Box?',
'Market Boxes are prepaid for the full 4-week period. Because vendors plan their inventory and preparation around your subscription:

• Mid-cycle cancellations are generally not available
• If you have a legitimate issue, contact the vendor directly to discuss options
• Credits may be issued for weeks that cannot be fulfilled by the vendor

Before purchasing a Market Box, make sure you can commit to the full 4-week pickup schedule.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I cancel a Market Box?' AND vertical_id = 'farmers_market');

-- ============================================================================
-- CATEGORY 5: Chef Boxes (FT-specific, 4 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Chef Boxes', 'What is a Chef Box?',
'A Chef Box is a prepaid 4-week curated meal package offered by a food truck operator. Each week, you pick up a specially prepared meal selection — it''s like having a personal chef at your favorite food truck.

How it works:
1. Browse available Chef Box offerings from food truck operators
2. Purchase a 4-week Chef Box (one-time prepaid purchase)
3. Each week, pick up your curated meal at the designated location
4. Confirm receipt each week

Chef Boxes are a great way to:
• Get weekly meals from your favorite food truck
• Try new dishes curated by the chef
• Support local food truck operators

Note: Chef Boxes are prepaid for the full 4-week period. They are not auto-renewing subscriptions.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What is a Chef Box?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Chef Boxes', 'What types of Chef Boxes are available?',
'Food truck operators can offer several types of Chef Boxes:

• Weekly Dinner Box — A complete dinner for one or two, featuring the chef''s weekly specialties
• Family Kit — Larger portions designed for families, with easy-to-serve meals
• Mystery Box — A surprise selection chosen by the chef each week
• Meal Prep Box — Pre-portioned meals ready for the week ahead
• Office Lunch Box — Lunch portions perfect for the workweek

Available types depend on what each food truck operator offers. Browse the Chef Box listings to see what''s available near you.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What types of Chef Boxes are available?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Chef Boxes', 'How does Chef Box pickup work?',
'Chef Box pickups work similarly to regular food truck orders:

1. Each week, the chef prepares your curated box
2. You''ll receive a notification when your box is ready
3. Visit the food truck at the designated location during pickup hours
4. Present your order information
5. Both you and the operator confirm the handoff

Pick up each week for the full 4-week duration. The chef prepares your box specifically for you, so please make every effort to pick up on time.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How does Chef Box pickup work?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Chef Boxes', 'Can I cancel a Chef Box?',
'Chef Boxes are prepaid for the full 4-week period. Because operators plan their ingredient purchases and preparation around your subscription:

• Mid-cycle cancellations are generally not available
• If you have a legitimate issue, contact the operator directly to discuss options
• Credits may be issued for weeks that cannot be fulfilled by the operator

Before purchasing a Chef Box, make sure you can commit to the full 4-week pickup schedule.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Can I cancel a Chef Box?' AND vertical_id = 'food_trucks');

-- ============================================================================
-- CATEGORY 6: Account & Settings (Global, 5 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Account & Settings', 'How do I update my account information?',
'To update your account information:

1. Go to your Settings page (accessible from the dashboard or navigation menu)
2. You can update your:
   • Display name
   • Email address
   • Phone number
   • Profile photo
   • Notification preferences

Changes are saved automatically. If you update your email address, you may need to verify the new address.

For vendor accounts, you can also update your business name, description, and business details from your vendor settings.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I update my account information?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Account & Settings', 'How do I enable push notifications?',
'Push notifications let you know instantly when something happens with your order:

To enable:
1. Go to your Settings page
2. Find the Notifications section
3. Toggle on "Push Notifications"
4. Your browser will ask for permission — tap "Allow"

You''ll receive push notifications for:
• Order confirmations and status changes
• Pickup reminders
• Messages from vendors (or buyers, if you''re a vendor)

Tip: Push notifications work even when you''re not actively using the app, so you''ll never miss an important update.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I enable push notifications?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Account & Settings', 'How do I manage my notification preferences?',
'You have full control over how you receive notifications:

Available channels:
• In-App — Always on, notifications appear in your dashboard
• Email — Order updates, market news, and more
• Push — Instant browser notifications
• SMS — Text messages for urgent updates (if opted in)

To manage your preferences:
1. Go to Settings
2. Find the Notification Preferences section
3. Toggle each channel on or off

To stop SMS notifications specifically:
• Reply STOP to any text message from us
• Or disable SMS in your notification settings
• Or remove your phone number from your profile', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I manage my notification preferences?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Account & Settings', 'How do I delete my account?',
'You can request account deletion at any time:

1. Go to Settings
2. Scroll to the "Delete Account" section
3. Follow the prompts to confirm deletion

What happens when you delete your account:
• Your personal information is removed
• Your order history is anonymized (transaction records may be retained for legal purposes)
• Any active orders should be completed or cancelled first
• Vendor accounts: deactivate all listings and resolve pending orders before deleting

If you need help with account deletion, contact us through our support page.

Note: Account deletion is permanent and cannot be undone.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I delete my account?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Account & Settings', 'How do I contact support?',
'You can reach our support team in several ways:

1. Visit the Support page (linked from the bottom of every page)
2. Fill out the contact form with your name, email, and a description of your issue
3. Choose a category that best matches your question:
   • General Question
   • Technical Problem
   • Order Issue
   • Account Help
   • Feature Request

We typically respond within 24-48 hours. For urgent order issues, we recommend also reaching out to the vendor directly.

Tip: Check our Help & FAQ page first — your question may already be answered!', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I contact support?' AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY 7: Vendor Onboarding (Global, 5 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Onboarding', 'How do I sign up as a vendor?',
'Becoming a vendor is straightforward:

1. Visit the vendor signup page for your vertical (Farmers Marketing or Food Truck''n)
2. Create your account or log in if you already have a shopper account
3. Complete the vendor application with your business information:
   • Business name and description
   • Contact information
   • Product categories you plan to sell
   • Any required permits or certifications (varies by category)
4. Submit your application for review

Our admin team will review your application and verify your information. You''ll receive a notification when your application is approved.

Tip: Have your business documents and permits ready before starting the application — it makes the process faster.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I sign up as a vendor?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Onboarding', 'What documents or permits do I need?',
'Required documents vary by what you sell and where you operate:

Farmers Marketing vendors:
• No permits needed: Produce, plants & flowers, art & crafts, clothing, home goods
• Cottage Food or Health Department permit: Baked goods, pantry items (jams, sauces)
• Health Department permit required: Dairy & eggs, prepared foods
• Health Department + Processing license: Meat & poultry

Food Truck operators:
• Mobile Food Unit (MFU) Permit
• Certified Food Manager (CFM) Certificate
• Food Handler''s Card
• Fire Safety Certificate
• Commissary Agreement (may be required in some jurisdictions)

Requirements vary by state and local jurisdiction. The information above is general guidance — always check with your local health department for specific requirements in your area.

You can upload your documents during the application process or add them later from your vendor settings.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What documents or permits do I need?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Onboarding', 'How long does approval take?',
'Application review times vary depending on the volume of applications and the completeness of your submission.

To speed up the process:
• Provide complete and accurate business information
• Upload all required permits and documents
• Respond promptly if we request additional information
• Make sure your contact information is correct

You''ll receive an email and in-app notification when your application status changes. If you have questions about your application status, contact our support team.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How long does approval take?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Onboarding', 'What items are prohibited from sale?',
'For the safety of our community, certain items cannot be sold on the platform:

• Controlled substances (including THC/CBD products)
• Firearms and ammunition
• Explosives and fireworks
• Tobacco and nicotine products
• Alcohol
• Raw unpasteurized milk (where prohibited by law)
• Live animals
• Recalled or adulterated products
• Resale or wholesale items not produced by the vendor
• Counterfeit goods

For a complete list with details, visit the Prohibited Items page in your vendor dashboard.

If you''re unsure whether your product is allowed, contact our support team before listing it.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What items are prohibited from sale?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Onboarding', 'What is the vendor trial period?',
'When your vendor application is approved, you may receive a complimentary promotional period on a paid plan tier at no cost. This gives you time to:

• Set up your listings and get familiar with the platform
• Start accepting orders and building your customer base
• Experience the features of a paid plan before committing

During the promotional period:
• You have access to the features of the granted plan tier
• No payment information is required
• You''ll receive reminders as the promotional period approaches its end

When the promotional period ends:
• Your account moves to the free tier
• You can continue using the platform with free-tier features
• Upgrade to a paid plan anytime to unlock more features

Promotional periods are offered at the platform''s discretion and may vary.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What is the vendor trial period?' AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY 8: Vendor Plans & Subscriptions (FM + FT split, 6 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Vendor Plans & Subscriptions', 'What vendor plans are available?',
'Farmers Marketing offers four vendor plan tiers:

Free — $0/month
• Get started with basic features
• Limited product listings and market access
• Great for trying out the platform

Standard — Paid monthly or annual plan
• More product listings and market access
• 30-day analytics dashboard
• Ideal for vendors just getting started

Premium — Paid monthly or annual plan (most popular)
• Even more listings and market access
• 60-day analytics dashboard
• Additional Market Box offerings
• Perfect for growing vendors

Featured — Paid monthly or annual plan
• Maximum listings and market access
• 90-day analytics with CSV export
• Most Market Box offerings and subscriber capacity
• Our top-tier plan for established vendors

Visit your Upgrade page in the vendor dashboard to see current pricing and compare all features side by side. Annual billing is available at a discount.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What vendor plans are available?' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Vendor Plans & Subscriptions', 'What vendor plans are available?',
'Food Truck''n offers four vendor plan tiers:

Free — $0/month
• Get started with basic features
• Limited menu items and locations
• No Chef Box access

Basic — $10/month
• More menu items and service locations
• Chef Box access with subscriber capacity
• 30-day analytics dashboard
• Email and in-app notifications

Pro — $30/month (most popular)
• Even more menu items and locations
• Larger Chef Box capacity
• 60-day analytics dashboard
• Push notifications included
• 2nd priority placement in search

Boss — $50/month
• Maximum menu items and locations
• Largest Chef Box capacity
• 90-day analytics with CSV export
• All notification channels including SMS
• 1st priority placement in search

Visit your Upgrade page in the vendor dashboard to compare all features and current pricing.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What vendor plans are available?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Plans & Subscriptions', 'How do I upgrade my plan?',
'Upgrading your vendor plan is easy:

1. Go to your Vendor Dashboard
2. Tap "Upgrade Plan" or navigate to the Upgrade page
3. Compare available plans and their features
4. Select the plan you want
5. Complete the secure checkout process

Your new plan takes effect immediately after payment. You''ll have instant access to all features included in your new tier.

You can manage your subscription from your vendor dashboard at any time.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I upgrade my plan?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Plans & Subscriptions', 'What happens when my trial ends?',
'When your promotional period ends:

• Your account moves to the free tier automatically
• No charges are made — there is no automatic billing
• Your existing listings and data are preserved
• If you exceed the free tier''s limits, excess listings may be moved to draft status

You''ll receive reminders as your promotional period approaches its end, giving you time to decide whether to upgrade to a paid plan.

To continue with premium features, simply upgrade from your vendor dashboard before or after the promotional period ends.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What happens when my trial ends?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Plans & Subscriptions', 'Can I downgrade my plan?',
'Yes, you can downgrade to a lower tier at any time:

1. Go to your Vendor Dashboard
2. Navigate to the Upgrade/Plan page
3. Select the lower tier you want to move to
4. Confirm the downgrade

What happens when you downgrade:
• Your current subscription is cancelled
• You move to the new tier immediately
• If you have more listings, markets, or offerings than the new tier allows, excess items may be deactivated
• No prorated refunds are issued for the remaining time on your current billing period

Tip: Before downgrading, review your current usage against the new tier''s limits to avoid disruption.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Can I downgrade my plan?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Plans & Subscriptions', 'How does billing work?',
'Vendor plan billing is straightforward:

• Monthly plans are billed once per month on the date you subscribed
• Annual plans (where available) are billed once per year at a discounted rate
• All billing is handled through our secure payment processor
• You can view your billing history and manage your subscription from your vendor dashboard

To cancel your subscription:
• Downgrade to the free tier from your plan page
• Your paid features remain active until the end of your current billing period

We do not issue prorated refunds for mid-cycle cancellations. Plan changes take effect at the time of the change.', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How does billing work?' AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY 9: Vendor Operations (Global, 6 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Operations', 'How do I create and manage listings?',
'Creating a listing:

1. Go to your Vendor Dashboard
2. Tap "New Listing" or navigate to your Listings page
3. Fill in the details:
   • Product name and description
   • Price
   • Quantity and unit of measurement
   • Category
   • Photos (clear, well-lit photos help attract buyers)
4. Select which market(s) the product is available at
5. Save as draft or publish immediately

Managing listings:
• Edit any listing from your Listings page
• Publish or unpublish listings to control availability
• Update inventory quantities as needed
• View how many listings you''ve used vs. your plan''s limit

Tip: Keep your inventory accurate to prevent overselling. Buyers rely on your listed quantities.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I create and manage listings?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Operations', 'How do I manage incoming orders?',
'When a buyer places an order, here''s your workflow:

1. You''ll receive a notification (in-app, email, or push depending on your settings)
2. Review the order details in your Vendor Dashboard
3. Tap "Confirm" to accept the order — this tells the buyer you''ll fulfill it
4. Prepare the items before the pickup window
5. When ready, mark the order as "Ready for Pickup"
6. At pickup: verify the buyer, hand over items, and confirm the handoff

Important:
• Confirm orders promptly — buyers are waiting to know their order is accepted
• If you cannot fulfill an order, cancel it as early as possible
• Keep your dashboard handy on market day for real-time order management

Your dashboard shows all pending, confirmed, and ready orders in one place.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I manage incoming orders?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Operations', 'How do I get paid?',
'Payments are handled through our secure payment system:

How it works:
1. Buyer pays at checkout — funds are held securely
2. You fulfill the order and both parties confirm the handoff
3. After mutual confirmation, your payout is initiated
4. Funds are transferred to your connected bank account

Setting up payouts:
• During vendor onboarding, you''ll set up your payment account
• Provide your bank account information for direct deposits
• You can manage your payment settings from your vendor dashboard

Payout timing:
• Payouts are initiated after order completion and mutual confirmation
• Transfer times depend on your bank (typically 2-7 business days)

You can track all your payouts, earnings, and fee details in your vendor dashboard and your payment account dashboard.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I get paid?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Operations', 'How do I set up my pickup locations?',
'You can set up different types of pickup locations:

Traditional Markets:
• Join an existing market listed on the platform
• Your products will be available for pickup at that market
• The number of markets you can join depends on your plan tier

Private Pickup Locations:
• Create your own pickup locations (e.g., your farm, kitchen, or designated spot)
• Set your own pickup windows and hours
• Great for direct-to-consumer sales outside of markets

Events:
• List your products at special events
• Events have their own schedules and locations

To set up a location:
1. Go to your Vendor Dashboard
2. Navigate to Markets or Locations
3. Choose to join an existing market or create a private pickup location
4. Set your pickup windows (days and times)

The number of locations available depends on your vendor plan tier. Upgrade your plan for more locations.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I set up my pickup locations?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Operations', 'What is the analytics dashboard?',
'The analytics dashboard helps you understand your business performance:

What you can see:
• Total revenue and order counts over time
• Sales trends (daily, weekly, or monthly charts)
• Top-selling products
• Customer insights (new vs. returning customers)
• Average order value

Analytics access depends on your plan tier:
• Free tier: Analytics not available
• Lower paid tiers: 30-day data history
• Mid-tier plans: 60-day data history
• Top-tier plans: 90-day data history with CSV export

To access your analytics:
1. Go to your Vendor Dashboard
2. Tap "Analytics" in the navigation

Use your analytics to identify your best sellers, track seasonal trends, and make data-driven decisions about your product offerings.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What is the analytics dashboard?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Vendor Operations', 'What are quality checks?',
'Quality checks are automated nightly reviews that help you maintain a great vendor profile:

What we check:
• Schedule conflicts — overlapping pickup windows or missing schedules
• Low stock alerts — products running low on inventory
• Price anomalies — unusually high or low prices that may need attention
• Listing completeness — missing descriptions, images, or required fields
• Inactive offerings — subscriptions or boxes that haven''t been updated

If an issue is found:
• You''ll see it flagged in your vendor dashboard
• Some checks may generate a notification
• No action is required unless the flag indicates a genuine problem

Quality checks help you maintain accurate listings and provide a better experience for your customers. They''re designed to catch potential issues before buyers encounter them.', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What are quality checks?' AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY 10: Privacy & Security (Global, 4 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Privacy & Security', 'How is my payment information protected?',
'Your payment security is our top priority:

• All payment processing is handled by a PCI-compliant payment processor
• Your credit/debit card information is encrypted and never stored on our servers
• We never see or have access to your full card number
• All data transmitted between your browser and our servers is encrypted (HTTPS)

The payment processor handles billions of dollars in transactions annually and meets the highest standards of payment security (PCI DSS Level 1).

You can remove saved payment methods at any time from your account settings.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How is my payment information protected?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Privacy & Security', 'What data does the platform collect?',
'We collect only the information needed to provide our services:

• Account information: name, email, phone number
• Profile information: business details (for vendors)
• Order information: what you ordered, pickup preferences
• Location: your area (when you share it for finding vendors)
• Usage information: how you use the platform (to improve our service)

We do NOT:
• Sell your personal information to third parties
• Share your data for advertising purposes
• Collect biometric data
• Track you across other websites

For complete details, read our Privacy Policy on the Terms of Service page.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What data does the platform collect?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Privacy & Security', 'How is my location data used?',
'When you share your location with us:

• It''s used to show you vendors, markets, and products near you
• Your location preference is stored in a browser cookie for convenience
• The cookie expires automatically after 30 days
• We do not share your location with third parties
• You can clear your location data at any time by clearing your browser cookies

You can also search by ZIP code instead of sharing your exact location. Location sharing is always optional — you can browse all vendors without sharing your location.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How is my location data used?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Privacy & Security', 'Where can I find the full privacy policy?',
'Our complete Privacy Policy is available on our Terms of Service page. It covers:

• What information we collect and why
• How we use your information
• Who we share information with (and who we don''t)
• Your rights and choices regarding your data
• How we protect your information
• Our cookie and tracking practices
• State-specific privacy rights (California, Illinois)

You can access it from the footer of any page by clicking "Privacy Policy" or "Terms of Service."

If you have questions about our privacy practices, contact us through our support page.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Where can I find the full privacy policy?' AND vertical_id IS NULL);

-- Done! 52 articles seeded across 10 categories
-- Global: 38 articles (visible on both FM and FT help pages)
-- FM-specific: 8 articles (visible only on FM help page)
-- FT-specific: 6 articles (visible only on FT help page)
