-- Migration 073: Help articles for pop-up markets (FM vendor-facing)
-- + Update FT articles to use "Private Events" branding instead of "Corporate Catering"
-- Parallels migration 071 structure for the FM vertical.

-- ============================================================================
-- PART A: FM Pop-Up Market articles (new)
-- ============================================================================

-- Article 1: Pop-up market overview for vendors
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Vendors', 'What are pop-up markets and how do they work?',
'Pop-up markets are temporary, one-time or short-run markets organized by companies, neighborhoods, or community groups. An organizer submits a request for vendors, our team reviews it, creates an event, and invites vendors to participate.

Here''s how the process works from your side:

1. You receive an invitation (email + in-app notification) with the event details
2. You review the date, location, expected attendance, and any vendor type preferences
3. You accept or decline the invitation
4. If you accept, you add your products to the event market
5. Guests browse and buy directly from you at the event — just like a regular market day
6. After the event, payments are settled through the platform as usual

The key benefit: you get access to a curated audience at a new location without having to find the event yourself. The organizer handles the venue, promotion, and foot traffic — you just show up and sell.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What are pop-up markets and how do they work?' AND vertical_id = 'farmers_market');

-- Article 2: Accepting a pop-up market invitation
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Vendors', 'How do I accept or decline a pop-up market invitation?',
'When you''re invited to a pop-up market, you''ll receive an email and an in-app notification with the event details.

To respond:

1. Open the pop-up market invitation from your notifications or the link in your email
2. Review the event details — date, time, location, expected attendance, and any vendor type preferences the organizer has requested
3. Check your estimated vendor count (how many other vendors will be there)
4. Add any notes or questions for the organizer (optional)
5. Tap "Accept" to commit or "Decline" to pass

Important things to know:
• You can only respond once — make sure you can commit before accepting
• Accepting means you''re committing to show up on the event date
• You''ll see how many other vendors are participating
• If you have questions about the event before responding, reach out to us via the Support page', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I accept or decline a pop-up market invitation?' AND vertical_id = 'farmers_market');

-- Article 3: Setting up products for a pop-up market
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Vendors', 'How do I set up my products for a pop-up market?',
'After accepting a pop-up market invitation, you need to add your products to the event market. This lets guests see what you''ll have available and optionally pre-order before the event.

Steps to set up your pop-up market products:

1. Go to your Vendor Dashboard
2. Make sure the products you want to offer are published as listings (create new ones if needed)
3. Visit the event market page (linked from your pop-up market invitation)
4. Add your listings to this event market

Tips for a great pop-up market selection:
• Bring your best sellers — pop-up markets are a chance to make a strong first impression with new customers
• Consider the audience — an office pop-up may want grab-and-go items, while a neighborhood event may want a wider variety
• Include a range of price points so there''s something for everyone
• Make sure your inventory/quantity is set high enough to handle the expected foot traffic
• Market Boxes are a great add-on — curated bundles can attract new subscribers

Your regular market listings stay unchanged. You''re just adding products to this specific event.', 7, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I set up my products for a pop-up market?' AND vertical_id = 'farmers_market');

-- Article 4: Pre-orders and browsing at pop-up markets
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Vendors', 'How do pre-orders and browsing work at pop-up markets?',
'Pop-up markets support both pre-orders and walk-up browsing, combining the best of online ordering with the in-person market experience.

How pre-orders work:

1. The organizer shares the event market link with their guests
2. Guests can browse participating vendors and place pre-orders before the event
3. Pre-orders are paid in advance, so you know exactly what to bring
4. You can see your complete pre-order list from your dashboard

At the event:
• Guests who pre-ordered pick up their reserved items from your booth
• Walk-up guests browse and buy directly — just like a regular farmers market
• The event atmosphere encourages exploration, so many guests will discover you for the first time
• All payments (pre-orders and walk-ups) go through the platform

Pop-up markets are designed for browsing and discovery. Unlike a regular weekly market, guests are there specifically for the event, which means higher engagement and a great opportunity to build your customer base.', 8, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do pre-orders and browsing work at pop-up markets?' AND vertical_id = 'farmers_market');

-- Article 5: What to expect on pop-up market day
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Vendors', 'What should I expect on pop-up market day?',
'Here''s a checklist to make your pop-up market go smoothly:

Before the event:
• Review your pre-order list (available in your dashboard)
• Prepare pre-ordered items and bring extra stock for walk-up sales
• Check the event details for setup instructions — booth location, table setup, power availability, and any access notes
• Plan to arrive 30-60 minutes before the event starts to set up

At the event:
• Set up your booth at the designated location per the setup instructions
• Display your products attractively — first impressions matter at pop-ups
• Have your pre-order list ready (phone or printed) for customers who reserved items
• Be ready for both pre-order pickups and walk-up sales
• Most pop-up markets run 2-4 hours

After the event:
• Make sure all pre-orders are marked as picked up or handled
• Pack up and clean your area

Tips:
• Bring signage with your business name and what you sell
• Offer samples if possible — pop-ups are all about discovery
• Have business cards or a sign pointing people to your regular market schedule
• Mention your Market Boxes if you offer subscriptions — new customers at pop-ups are great subscription leads', 9, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What should I expect on pop-up market day?' AND vertical_id = 'farmers_market');

-- Article 6: Payment and earnings for pop-up markets
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Vendors', 'How do I get paid for pop-up markets?',
'Pop-up market payments work the same as regular orders on the platform:

• Pre-orders are paid by guests when they place their order (before the event)
• Walk-up purchases are paid through the platform at the event
• Standard platform fees apply (same as your regular orders)
• Payouts are deposited to your connected Stripe account on the regular schedule
• You can track pop-up market earnings in your Vendor Dashboard

Why pop-up markets are great for your business:
• New customer acquisition — you reach people outside your regular market area
• Higher foot traffic — organizers promote the event and bring the audience
• Cross-selling opportunity — guests browsing other vendors discover you
• Subscription leads — new customers who love your products may subscribe to Market Boxes
• Repeat events — organizers who have a great experience often book again', 10, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I get paid for pop-up markets?' AND vertical_id = 'farmers_market');

-- ============================================================================
-- PART B: Update FT articles — rebrand "Corporate Catering" to "Private Events"
-- ============================================================================

-- Article 1: Overview
UPDATE knowledge_articles
SET title = 'What are private events and how do they work?',
    body = 'Private events are a way for companies and organizations to book food trucks for their employees at offices, gatherings, and special occasions. When an organizer submits an event request, our admin team reviews it, creates an event, and invites food trucks to participate.

Here''s how the process works from your side:

1. You receive an invitation (email + in-app notification) with the event details
2. You review the date, location, headcount, and any cuisine preferences
3. You accept or decline the invitation
4. If you accept, you add your event menu items to the event market
5. Guests pre-order from your menu 1-2 days before the event
6. You arrive on event day with everything prepped based on the exact orders you received

The key benefit: you know exactly how many people to feed and exactly what they ordered. No guessing, no waste, and guaranteed revenue from committed headcount.'
WHERE vertical_id = 'food_trucks'
  AND title = 'What is corporate catering and how does it work?';

-- Article 2: Accepting invitation
UPDATE knowledge_articles
SET title = 'How do I accept or decline an event invitation?',
    body = 'When you''re invited to a private event, you''ll receive an email and an in-app notification with the event details.

To respond:

1. Open the event invitation from your notifications or the link in your email
2. Review the event details — date, time, location, expected headcount, and any cuisine preferences or dietary requirements the organizer has requested
3. Check your estimated headcount per truck (total headcount divided by the number of trucks participating)
4. Add any notes or questions for the organizer (optional)
5. Tap "Accept" to commit or "Decline" to pass

Important things to know:
• You can only respond once — make sure you can commit before accepting
• Accepting means you''re committing to show up on the event date
• You''ll see how many other trucks are participating so you can estimate your portion of the headcount
• If you have questions about the event before responding, reach out to us via the Support page'
WHERE vertical_id = 'food_trucks'
  AND title = 'How do I accept or decline a catering invitation?';

-- Article 3: Menu setup
UPDATE knowledge_articles
SET title = 'How do I set up my menu for a private event?',
    body = 'After accepting an event invitation, you need to add specific menu items to the event market. This is your event menu — a focused selection of what you want to serve at this particular event.

Steps to set up your event menu:

1. Go to your Vendor Dashboard
2. Make sure the items you want to offer are published as listings (create new ones if needed)
3. Visit the event market page (linked from your event invitation)
4. Add your listings to this event market

Tips for a great event menu:
• Keep it focused — 4-8 items is ideal for a private event
• Include at least one vegetarian option if the organizer mentioned dietary needs
• Consider the headcount — if you''re feeding 50 people, simpler items that scale well work best
• Price items as you normally would — guests pay for their own meals
• Make sure your inventory/quantity is set high enough to handle the expected orders

You don''t have to add your entire menu. Pick the items that work best for a high-volume, event-style service. Your regular menu at your regular locations stays unchanged.'
WHERE vertical_id = 'food_trucks'
  AND title = 'How do I set up my menu for a catering event?';

-- Article 4: Pre-orders
UPDATE knowledge_articles
SET title = 'How do pre-orders work for private events?',
    body = 'Private events use our pre-order system so you know exactly what to prepare before you arrive.

How it works:

1. The organizer shares the event market link with their guests
2. Guests browse participating trucks and place orders 1-2 days before the event
3. Each guest selects a pickup time window (e.g., 11:00, 11:30, 12:00, 12:30)
4. Orders are cut off before the event so you have time to prep
5. You can see your complete order list grouped by pickup time from your dashboard

On event day:
• Arrive at the location with everything prepped based on your order list
• Guests pick up in waves based on their chosen time slot — no 100-person rush
• Each order is already paid for, so there''s no payment handling at the truck
• Confirm pickups through the app as guests collect their food

The pre-order cutoff gives you time to shop for ingredients and prep. You''ll know the exact quantities of every item ordered.'
WHERE vertical_id = 'food_trucks'
  AND title = 'How do pre-orders work for catering events?';

-- Article 5: Event day checklist
UPDATE knowledge_articles
SET title = 'What should I expect on event day?',
    body = 'Here''s a checklist to make your private event go smoothly:

Before the event:
• Review your final order list (available in your dashboard after the pre-order cutoff)
• Prep all items based on exact order quantities
• Check the event details for setup instructions — parking location, power availability, and any access restrictions
• Plan to arrive 30-60 minutes before the first pickup time window

At the event:
• Set up at the designated location per the setup instructions
• Have your order list ready (phone or printed)
• Guests will arrive in waves during their chosen time slots
• Confirm each pickup through the app as guests collect their food
• Most private events run 2-3 hours (e.g., 11:00 AM - 1:30 PM)

After the event:
• Make sure all orders are marked as picked up or handled
• Pack up and clean your area

Tips:
• Bring signage with your truck name so guests can find you easily
• If the organizer provided setup instructions (parking spot, power hookup), follow them
• Time slots spread out the crowd — you won''t get everyone at once
• If a guest doesn''t pick up their order, mark it accordingly in the app'
WHERE vertical_id = 'food_trucks'
  AND title = 'What should I expect on catering event day?';

-- Article 6: Payment
UPDATE knowledge_articles
SET title = 'How do I get paid for private events?',
    body = 'Private event payments work the same as regular orders on the platform:

• Guests pay for their own meals when they pre-order (you don''t handle any payments at the event)
• Standard platform fees apply (same as your regular orders)
• Payouts are deposited to your connected Stripe account on the regular schedule
• You can track event earnings in your Vendor Dashboard

The organizer books the event and invites guests to order, but each guest pays individually. This means you get paid per order, just like your regular market sales.

Why private events are great for your bottom line:
• Guaranteed headcount — you know how many people will be ordering
• Pre-orders mean zero waste — you prep exactly what''s been ordered
• Events tend to have higher average order values
• Repeat business — organizers who have a good experience often book again'
WHERE vertical_id = 'food_trucks'
  AND title = 'How do I get paid for catering events?';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
