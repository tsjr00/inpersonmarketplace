-- Migration 077: Update FT help articles for event approval process
-- Adds event approval info to overview article + "Available for Events" checkbox to menu setup article.
-- Data update only — no schema changes.

-- ============================================================================
-- Article 1: Overview — add event approval section
-- ============================================================================

UPDATE knowledge_articles
SET body = 'Private events are a way for companies and organizations to book food trucks for their guests at offices, gatherings, and special occasions. When an organizer submits an event request, our admin team reviews it, creates an event, and invites food trucks to participate.

Getting event-approved:

Before you can be invited to private events, your food truck needs to be event-approved by our team. This is a separate step from your regular marketplace approval. Here''s how it works:

1. Get approved as a vendor on the platform (regular marketplace approval)
2. Our admin team reviews your profile, menu quality, and reliability
3. When approved for events, you''ll receive a notification and see an "Event Approved" badge on your public profile
4. Event managers can now see your badge and consider you for upcoming events

Event approval means our team has confidence in your ability to handle the logistics of private events — consistent food quality, reliable show-up rate, and professional service. Keep your profile and menu up to date to maintain your event-approved status.

Once you''re event-approved, here''s how private events work:

1. You receive an invitation (email + in-app notification) with the event details
2. You review the date, location, headcount, and any cuisine preferences
3. You accept or decline the invitation
4. If you accept, you add your event menu items to the event market
5. Guests pre-order from your menu 1-2 days before the event
6. You arrive on event day with everything prepped based on the exact orders you received

The key benefit: you know exactly how many people to feed and exactly what they ordered. No guessing, no waste, and guaranteed revenue from committed headcount.'
WHERE vertical_id = 'food_trucks'
  AND title = 'What are private events and how do they work?';

-- ============================================================================
-- Article 3: Menu setup — add "Available for Events" checkbox instructions
-- ============================================================================

UPDATE knowledge_articles
SET body = 'After accepting an event invitation, you need to add specific menu items to the event market. This is your event menu — a focused selection of what you want to serve at this particular event.

Marking items as event-ready:

As an event-approved vendor, you''ll see an "Available for Events" checkbox when editing any of your menu items. Checking this box does two things:

1. Adds an "Event Ready" badge to the item on your public listing page — so event managers browsing your menu can quickly see which items you offer for events
2. Signals to our team and event organizers that this item is suitable for high-volume, event-style service

To mark items as event-ready:

1. Go to your Vendor Dashboard and open Listings
2. Edit the listing you want to mark
3. Scroll down to find the "Available for Events" checkbox (below the allergen section)
4. Check the box and save

Tips for choosing which items to mark:

• Pick items that scale well — things you can prep in bulk and serve quickly
• Include crowd-pleasers that work for a wide audience
• Consider items that travel well and hold temperature
• Don''t mark everything — a focused event menu of 4-8 items is more appealing than your entire catalog
• You can change which items are marked at any time

Setting up your event menu for a specific event:

Once you''ve accepted an event invitation:

1. Go to your Vendor Dashboard
2. Make sure the items you want to offer are published as listings (create new ones if needed)
3. Visit the event market page (linked from your event invitation)
4. Add your listings to this event market

Tips for a great event menu:
• Start with your event-ready items — they''re already flagged as suitable
• Include at least one vegetarian option if the organizer mentioned dietary needs
• Consider the headcount — if you''re feeding 50 people, simpler items that scale well work best
• Price items as you normally would — guests pay for their own meals
• Make sure your inventory/quantity is set high enough to handle the expected orders

You don''t have to add your entire menu. Pick the items that work best for a high-volume, event-style service. Your regular menu at your regular locations stays unchanged.'
WHERE vertical_id = 'food_trucks'
  AND title = 'How do I set up my menu for a private event?';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
