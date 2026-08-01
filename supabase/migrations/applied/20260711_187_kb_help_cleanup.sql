-- Migration 187: Knowledge base / help cleanup (CONTENT-ONLY — no schema, no logic)
--
-- Audit + rationale: apps/web/.claude/kb_help_audit.md
-- Retires the legacy FOOD_TRUCK_FAQ_SEED set (duplicates + contradictions),
-- fixes stale content, and adds coverage for newer features. Every statement
-- is content — no table/column/function/RLS change. Idempotent + self-healing
-- (safe to re-run). USER applies; Claude does snapshot bookkeeping after.
--
-- ROLLBACK: content-only. Section notes below. No schema to revert.
-- Depends on: mig 013 (table), mig 062 + mig 183 (canonical seeds).

BEGIN;

-- ===========================================================================
-- 1. RETIRE THE LEGACY FOOD_TRUCK_FAQ_SEED SET (dedup)
-- ===========================================================================
-- The loose FOOD_TRUCK_FAQ_SEED.sql inserted 16 food_trucks articles that
-- duplicate the global (vertical_id NULL) mig-062 articles and, for pickup /
-- cancellation / fees, CONTRADICT the real flows. It also began with a
-- destructive `DELETE ... WHERE vertical_id='food_trucks'`. Remove its 16
-- articles by exact title. Global (NULL) articles are a different vertical and
-- are untouched, so FT buyers keep the canonical mig-062 versions.
DELETE FROM knowledge_articles
WHERE vertical_id = 'food_trucks'
  AND title IN (
    'What is Food Truck''n?',
    'How do I find food trucks near me?',
    'Do I need to create an account?',
    'How do I place an order?',
    'Can I order from multiple trucks at once?',
    'What payment methods are accepted?',
    'Can I cancel or modify my order?',
    'How does pickup work?',
    'What if the food truck isn''t at the expected location?',
    'What are the different location types?',
    'How do I list my food truck?',
    'What are the fees?',
    'How do I manage my menu and schedule?',
    'How do I get paid?',
    'How do I enable notifications?',
    'How do I update my account information?'
  );

-- ===========================================================================
-- 2. RESTORE mig-062 FT "Chef Boxes" (the legacy FAQ's DELETE may have wiped
--    them) — re-inserted with GENERALIZED multi-week wording (see section 5).
--    Idempotent: only inserts if missing.
-- ===========================================================================
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Chef Boxes', 'What is a Chef Box?',
'A Chef Box is a prepaid multi-week curated meal package offered by a food truck operator (offerings are commonly 4 or 8 weeks — the length is shown on each one). Each week, you pick up a specially prepared meal selection — it''s like having a personal chef at your favorite food truck.

How it works:
1. Browse available Chef Box offerings from food truck operators
2. Purchase a Chef Box (a one-time prepaid purchase for the full term)
3. Each week, pick up your curated meal at the designated location
4. Confirm receipt each week

Chef Boxes are a great way to:
• Get weekly meals from your favorite food truck
• Try new dishes curated by the chef
• Support local food truck operators

Note: Chef Boxes are prepaid for the full term. They are not auto-renewing subscriptions.', 1, true
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

Pick up each week for the full term of your box. The chef prepares your box specifically for you, so please make every effort to pick up on time.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How does Chef Box pickup work?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Chef Boxes', 'Can I cancel a Chef Box?',
'Chef Boxes are prepaid for the full term. Because operators plan their ingredient purchases and preparation around your box:

• Mid-cycle cancellations are generally not available
• If you have a legitimate issue, contact the operator directly to discuss options
• Credits may be issued for weeks that cannot be fulfilled by the operator

Before purchasing a Chef Box, make sure you can commit to the full pickup schedule.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Can I cancel a Chef Box?' AND vertical_id = 'food_trucks');

-- ===========================================================================
-- 3. FT VENDOR PLANS — remove hard-coded prices; defer to the Upgrade page
--    (matches the FM plans article). Delete any existing FT copy, insert one.
-- ===========================================================================
DELETE FROM knowledge_articles
WHERE vertical_id = 'food_trucks' AND title = 'What vendor plans are available?';

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
VALUES ('food_trucks', 'Vendor Plans & Subscriptions', 'What vendor plans are available?',
'Food Truck''n offers four vendor plan tiers — Free, Basic, Pro, and Boss. Higher tiers unlock more menu items and service locations, larger Chef Box capacity, longer analytics history (with CSV export at the top tier), more notification channels, and higher placement in search.

Visit the Upgrade page in your vendor dashboard to see current pricing and compare all features side by side. Annual billing is available at a discount.', 2, true);

-- ===========================================================================
-- 4. PRESERVE the one genuinely-unique FAQ buyer article (location types),
--    rewritten as a canonical FT buyer article. Idempotent.
-- ===========================================================================
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Getting Started', 'Where can I pick up from a food truck?',
'Food trucks appear at a few kinds of locations:
• Food truck parks — designated spots where multiple trucks gather
• Single-truck locations — a regular stop where one truck parks on a schedule
• Events — special appearances at festivals, markets, or private events

Each location shows the truck''s operating hours and schedule, and you''ll be notified if a truck''s plans change. You can always check a truck''s current location on its profile.', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Where can I pick up from a food truck?' AND vertical_id = 'food_trucks');

-- ===========================================================================
-- 5. STALE FIXES (existing global / FM articles) — targeted substring updates
--    so the surrounding copy is preserved.
-- ===========================================================================

-- 5a. Payment methods: no cash, no off-platform methods — everything via Stripe.
UPDATE knowledge_articles
SET body =
'All payments are processed securely through Stripe, our payment provider. At checkout you can pay with major credit and debit cards (Visa, Mastercard, American Express, Discover). Depending on your device and browser, you may also see digital-wallet options that Stripe supports — such as Apple Pay, Google Pay, Link, Cash App Pay, and Amazon Pay. Your full card details are never stored on our servers.

Every order is paid through the app at checkout — we don''t handle cash or any off-platform payment methods.'
WHERE vertical_id IS NULL AND title = 'What payment methods are accepted?';

-- 5b. Market Box: generalize the hard-coded "4-week" wording to multi-week.
UPDATE knowledge_articles
SET body = replace(replace(replace(replace(body,
      'prepaid 4-week', 'prepaid multi-week'),
      '4-week Market Box (one-time prepaid purchase)', 'Market Box (a one-time prepaid purchase for the full term)'),
      'the full 4-week period', 'the full term'),
      'the 4-week duration of your Market Box', 'the full term of your Market Box')
WHERE vertical_id = 'farmers_market' AND category = 'Market Boxes';
-- Also catch the "full 4-week pickup schedule" phrasing in the cancel article.
UPDATE knowledge_articles
SET body = replace(body, 'the full 4-week pickup schedule', 'the full pickup schedule')
WHERE vertical_id = 'farmers_market' AND title = 'How do I cancel a Market Box?';

-- ===========================================================================
-- 6. COVERAGE GAPS — new articles for features shipped without help.
--    Voice matches migs 062/183; NO hard-coded thresholds (183 convention).
-- ===========================================================================

-- 6a. Prospect-facing "sign up to run a market/park" (the public intake).
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'How do I sign up to run my market?',
'If you run a farmers market, you can bring it onto the platform yourself. Visit the Market Manager Program page (linked in the site footer under "For Vendors") and fill out a short form — your name, email, market name, and location.

We''ll email you a link to set up your dashboard, where you configure your booth inventory, operating schedule, vendor agreement statements, and connect a Stripe account to receive booth payments. We review your setup and activate your public market listing — usually within one business day. There''s no subscription; we take a small percentage of booth rentals and on-platform transactions at your market.', 12, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I sign up to run my market?' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'How do I sign up to run my park?',
'If you operate a food truck park (or have a lot you''d like to run as one), you can bring it onto the platform yourself. Visit the Park Operator Program page (linked in the site footer under "For Vendors") and fill out a short form — your name, email, park name, and location.

We''ll email you a link to set up your dashboard, where you turn on paid spots, add your spots (size, power, water, and price), pick your truck agreement statements, and connect a Stripe account to receive spot payments. We review your setup and activate your public park listing — usually within one business day. There''s no subscription; we take a small percentage of the spot rentals at your park.', 11, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I sign up to run my park?' AND vertical_id = 'food_trucks');

-- 6b. Events (global — neutral wording so it reads for both verticals).
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events', 'How do I order for an event?',
'Some vendors and food trucks appear at private events. If an organizer shared an event link with you, open it to see the vendors or trucks taking part in that event. Browse their menus, add items to your cart, and check out just like a normal order. For some events you''ll choose a pickup time slot so orders are spread out. You pick up your order at the event during its hours.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I order for an event?' AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events', 'How do I bring vendors or food trucks to my event?',
'Hosting an office lunch, festival, or private gathering? Use the Events page to submit an event request — tell us your date, location, headcount, and what you''re looking for. We help line up participating vendors or food trucks, and your attendees order ahead through a shared event link and pick up on site. Submit a request and we''ll follow up with the details.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I bring vendors or food trucks to my event?' AND vertical_id IS NULL);

-- 6c. Booth credits (FM vendor-facing).
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth & Season Booking', 'How do booth credits work?',
'If you''ve paid for a booth and the market manager cancels that market day, you receive a booth credit instead of losing the payment. Your credit balance at that market is applied automatically the next time you book a booth there — you''ll see it reduce your total at checkout.

Credits are specific to the market where they were issued, and they can expire, so it''s best to use them on an upcoming booking. Your available balance is shown when you book.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do booth credits work?' AND vertical_id = 'farmers_market');

-- 6d. Season booking window (FM vendor-facing).
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth & Season Booking', 'When can I book a booth?',
'You can book booths for the weeks your market is operating. If a market runs a defined season, only weeks within that season are offered — you can book upcoming in-season weeks in advance, but weeks outside the season won''t appear. If a market operates year-round, the next several weeks are always available. The booking page only ever shows weeks you can actually attend.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'When can I book a booth?' AND vertical_id = 'farmers_market');

-- 6e. Following a market/location (global buyer-facing).
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Account & Settings', 'How do I follow a market or location?',
'Open a market or location''s page and tap Follow to keep up with it. Following lets you get notified about upcoming market days and special dates so you don''t miss when your favorite vendors or trucks are out. You can unfollow anytime from the same page. Make sure notifications are enabled in Settings to receive the alerts.', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I follow a market or location?' AND vertical_id IS NULL);

COMMIT;

-- No NOTIFY pgrst needed — data-only, no schema/RLS change.
