-- Migration 071: Help articles for corporate catering (vendor-facing)
-- Adds comprehensive guide for vendors participating in catering events.

-- ============================================================================
-- Article 1: Catering overview for vendors
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Food Truck Operators', 'What is corporate catering and how does it work?',
'Corporate catering is a way for companies to book food trucks for their employees at offices, events, and company gatherings. When a company submits a catering request, our admin team reviews it, creates an event, and invites food trucks to participate.

Here''s how the process works from your side:

1. You receive an invitation (email + in-app notification) with the event details
2. You review the date, location, headcount, and any cuisine preferences
3. You accept or decline the invitation
4. If you accept, you add your event menu items to the event market
5. Employees pre-order from your menu 1-2 days before the event
6. You arrive on event day with everything prepped based on the exact orders you received

The key benefit: you know exactly how many people to feed and exactly what they ordered. No guessing, no waste, and guaranteed revenue from committed headcount.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What is corporate catering and how does it work?' AND vertical_id = 'food_trucks');

-- ============================================================================
-- Article 2: Accepting a catering invitation
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Food Truck Operators', 'How do I accept or decline a catering invitation?',
'When you''re invited to a catering event, you''ll receive an email and an in-app notification with the event details.

To respond:

1. Open the catering invitation from your notifications or the link in your email
2. Review the event details — date, time, location, expected headcount, and any cuisine preferences or dietary requirements the company has requested
3. Check your estimated headcount per truck (total headcount divided by the number of trucks participating)
4. Add any notes or questions for the organizer (optional)
5. Tap "Accept" to commit or "Decline" to pass

Important things to know:
• You can only respond once — make sure you can commit before accepting
• Accepting means you''re committing to show up on the event date
• You''ll see how many other trucks are participating so you can estimate your portion of the headcount
• If you have questions about the event before responding, reach out to us via the Support page', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I accept or decline a catering invitation?' AND vertical_id = 'food_trucks');

-- ============================================================================
-- Article 3: Setting up your event menu
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Food Truck Operators', 'How do I set up my menu for a catering event?',
'After accepting a catering invitation, you need to add specific menu items to the event market. This is your event menu — a focused selection of what you want to serve at this particular event.

Steps to set up your event menu:

1. Go to your Vendor Dashboard
2. Make sure the items you want to offer are published as listings (create new ones if needed)
3. Visit the event market page (linked from your catering invitation)
4. Add your listings to this event market

Tips for a great catering menu:
• Keep it focused — 4-8 items is ideal for a corporate event
• Include at least one vegetarian option if the company mentioned dietary needs
• Consider the headcount — if you''re feeding 50 people, simpler items that scale well work best
• Price items as you normally would — employees pay for their own meals
• Make sure your inventory/quantity is set high enough to handle the expected orders

You don''t have to add your entire menu. Pick the items that work best for a high-volume, event-style service. Your regular menu at your regular markets stays unchanged.', 7, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I set up my menu for a catering event?' AND vertical_id = 'food_trucks');

-- ============================================================================
-- Article 4: Pre-orders and day-of prep
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Food Truck Operators', 'How do pre-orders work for catering events?',
'Catering events use our pre-order system so you know exactly what to prepare before you arrive.

How it works:

1. The company shares the event market link with their employees
2. Employees browse participating trucks and place orders 1-2 days before the event
3. Each employee selects a pickup time window (e.g., 11:00, 11:30, 12:00, 12:30)
4. Orders are cut off 48 hours before the event so you have time to prep
5. You can see your complete order list grouped by pickup time from your dashboard

On event day:
• Arrive at the location with everything prepped based on your order list
• Employees pick up in waves based on their chosen time slot — no 100-person rush
• Each order is already paid for, so there''s no payment handling at the truck
• Confirm pickups through the app as employees collect their food

The pre-order cutoff gives you a full day or two to shop for ingredients and prep. You''ll know the exact quantities of every item ordered.', 8, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do pre-orders work for catering events?' AND vertical_id = 'food_trucks');

-- ============================================================================
-- Article 5: What to expect on event day
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Food Truck Operators', 'What should I expect on catering event day?',
'Here''s a checklist to make your catering event go smoothly:

Before the event:
• Review your final order list (available in your dashboard after the pre-order cutoff)
• Prep all items based on exact order quantities
• Check the event details for setup instructions — parking location, power availability, and any access restrictions
• Plan to arrive 30-60 minutes before the first pickup time window

At the event:
• Set up at the designated location per the setup instructions
• Have your order list ready (phone or printed)
• Employees will arrive in waves during their chosen time slots
• Confirm each pickup through the app as employees collect their food
• Most catering events run 2-3 hours (e.g., 11:00 AM - 1:30 PM)

After the event:
• Make sure all orders are marked as picked up or handled
• Pack up and clean your area

Tips:
• Bring signage with your truck name so employees can find you easily
• If the company provided setup instructions (parking spot, power hookup), follow them
• Time slots spread out the crowd — you won''t get everyone at once
• If an employee doesn''t pick up their order, mark it accordingly in the app', 9, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What should I expect on catering event day?' AND vertical_id = 'food_trucks');

-- ============================================================================
-- Article 6: Payment and earnings for catering
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Food Truck Operators', 'How do I get paid for catering events?',
'Catering event payments work the same as regular orders on the platform:

• Employees pay for their own meals when they pre-order (you don''t handle any payments at the event)
• Standard platform fees apply (same as your regular orders)
• Payouts are deposited to your connected Stripe account on the regular schedule
• You can track catering event earnings in your Vendor Dashboard

The company books the event and invites employees to order, but each employee pays individually. This means you get paid per order, just like your regular market sales.

Why catering is great for your bottom line:
• Guaranteed headcount — you know how many people will be ordering
• Pre-orders mean zero waste — you prep exactly what''s been ordered
• Corporate events tend to have higher average order values
• Repeat business — companies that have a good experience often book again', 10, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I get paid for catering events?' AND vertical_id = 'food_trucks');

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
