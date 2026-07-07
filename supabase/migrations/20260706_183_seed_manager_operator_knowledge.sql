-- Migration 183: Seed knowledge articles for the manager / operator surfaces
-- (and the recent vendor booth/park booking flows) that mig 062 never covered.
--
-- Pattern mirrors mig 062 exactly: INSERT ... SELECT ... WHERE NOT EXISTS guard
-- per article (idempotent), plain-text body with numbered steps + Tips. No schema
-- change — the help page (/[vertical]/help) already surfaces any published article
-- by (global OR matching vertical) + category, and ManagerSupportCard already
-- links managers there.
--
-- New categories:
--   food_trucks   : 'For Park Operators' (10), 'Booking a Park Spot' (5)
--   farmers_market: 'For Market Managers' (11), 'Booth & Season Booking' (3)
-- Content grounded in current behavior; deliberately avoids hard-coded thresholds
-- (fees, strike limits, cutoffs) that are shown in-product, matching mig 062 voice.

-- ============================================================================
-- CATEGORY: For Park Operators (food_trucks, 10 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Getting started as a park operator',
'Your park dashboard is where you run everything about your food-truck park. It''s organized by how you actually work:

1. What''s on your plate — anything needing your attention right now
2. This week — who''s booked over the next 7 operating days, and who''s checked in
3. Your trucks — the trucks at your park, recurring holds, and invites
4. Park setup — spots, payments, schedule, agreements, and branding (collapsed by default)
5. Communicate & learn — announcements, surveys, and support

If you''re brand new, start in Park setup: add your spots, connect your payment account, set your open days, and choose your agreement statements. Once that''s done, trucks can find and book your park.

Tip: Use the jump links at the top of the dashboard to move between sections quickly.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Getting started as a park operator' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Setting up your spots',
'Spots are the individual parking places trucks book at your park. Set them up under Park setup > Spot inventory:

1. Add each spot with its details — length it fits, power (none, generator allowed, or shore power), and water
2. Set the per-day price for each spot
3. Mark which spots can be held on a recurring weekly basis (optional)

Your park has two modes:
• Free — trucks can be listed at your park but don''t pay to book a spot
• Paid — trucks book and pay for a spot online; you receive your share automatically

To take paid bookings you must switch the park to Paid and finish connecting your payment account.

Tip: Only spots you mark active are bookable, so you can take a spot offline anytime without deleting it.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Setting up your spots' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Connecting your payment account',
'To collect spot-rental payments you connect a Stripe payment account under Park setup > Stripe Payment Account:

1. Tap Connect and follow the secure Stripe setup
2. Provide the details Stripe asks for (this may include an ID that matches the account name)
3. Once Stripe confirms your account, your park can accept paid bookings

Good to know:
• Your payment account is separate from any vendor account you might have — it''s handled by Stripe directly and we never see your bank details
• When a truck pays for a spot, your share is transferred to you automatically
• Until Stripe finishes verifying you, you can keep setting up spots and your schedule; you just can''t take payments yet

Tip: Complete this early — trucks can''t book paid spots until your account is ready.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Connecting your payment account' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Your week at a glance',
'The "This week at your park" card shows the next 7 operating days, one row per day:

• A collapsed day shows a quick summary — how many trucks, how many spots filled, and any unpaid bookings
• Tap a day to expand it and see each truck, their spot, whether they''ve paid, and whether the booking is a recurring hold
• Today is expanded automatically and shows check-in status for each booked truck
• If any trucks are waiting on your approval, the card header links you straight to them

From an expanded day you can also cancel a specific truck''s booking if you need to (see "Cancelling a booking or a date").

Tip: Only today and future days are shown — the view is always forward-looking.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Your week at a glance' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Approving and vetting trucks',
'Trucks can book and pay for a spot on their own — booking isn''t gated on your approval. But every truck that books lands on your "Your trucks" list so you can vet them:

1. Open Your trucks to see everyone booked or invited at your park
2. Review a truck''s status and, if they''ve shared them, their compliance documents
3. Mark a truck reviewed once you''ve checked their paperwork
4. If a truck isn''t a good fit — for any reason — you can Block them from making new bookings

Blocking:
• Stops the truck from booking new spots or requesting weekly holds
• Does not affect bookings they''ve already paid for (to cancel one of those, see the next article)
• Notifies the truck, and you can unblock them later

Tip: Blocking is general-purpose — use it for documentation problems or any other reason you don''t want a truck back.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Approving and vetting trucks' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Reviewing a truck''s compliance documents',
'When a truck books at your park, they acknowledge it''s their responsibility to upload the documents you require (licenses, permits, insurance) and keep them current.

To review them:
1. In Your trucks, find the truck and tap "View docs" (available once the truck has authorized sharing)
2. Check that each required document is present, valid, and unexpired
3. Mark the truck reviewed when you''re satisfied

We''ll also notify you when a truck''s documents change, so you know to take another look.

If a truck''s documents are missing, expired, or inaccurate before their booked day, you may cancel the booking without a refund and decline their future bookings — the truck agreed to this when they booked.

Tip: Reviewing early gives the truck time to fix anything before their rented day.', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Reviewing a truck''s compliance documents' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Weekly spot holds: approving, denying, and strikes',
'A weekly hold is a truck''s standing claim on one spot for one day of the week (for example, "Spot A every Saturday"). Trucks can request a hold only after they''ve paid for at least one rental at your park.

Managing requests (Your trucks > Recurring holds):
1. New requests appear highlighted, with the spot, day, and the truck''s requested start date
2. Approve a request to reserve that spot every week, or Deny it to free it up
3. You''re notified whenever a new request comes in

After you approve:
• Each week, the system reserves the spot for the truck and asks them to pay by a cutoff before that date
• If a truck doesn''t pay in time, that week opens back up for others and counts as a missed week
• If a truck misses too many weeks (or repeatedly doesn''t show up), the hold is paused automatically and the spot frees up — you can reinstate it, which clears its strikes

Tip: A denied or revoked hold immediately frees the spot+day for another truck to request.', 7, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Weekly spot holds: approving, denying, and strikes' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Cancelling a booking or a date',
'There are two different cancellations:

Cancel one truck''s booking (in "This week"):
1. Expand the day and find the paid truck
2. Tap Cancel and enter a reason (the truck is notified)
3. The booking is cancelled without a refund — the truck forfeits the fee, and the spot is not resold

Use this when a specific truck needs to be removed (for example, documents weren''t provided in time). It''s deliberately not a refund and doesn''t reopen the slot.

Cancel a whole date (Park setup > Cancel a Date):
1. Pick the upcoming date you need to close (for example, weather)
2. Confirm — this closes that date for everyone

Tip: Cancelling a single booking is a per-truck action; cancelling a date closes the park for that day.', 8, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Cancelling a booking or a date' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Choosing agreement statements for your park',
'Agreement statements are the terms trucks accept when they book at your park. Choose them under Park setup > Food truck agreement statements:

1. Browse the catalog of available statements — some are universal, others are specific to food-truck parks (licensing, propane/LP-gas, generators, and more)
2. Select the ones that apply to your park
3. Some statements have blanks (in curly braces) you fill in with values specific to your park

When a truck books a spot or requests a weekly hold, they accept the statements you''ve selected. Trucks who already accepted an earlier version keep what they agreed to — changes only affect new signers.

Tip: Pick statements that match how your park actually operates; you can update your selection anytime.', 9, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Choosing agreement statements for your park' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'For Park Operators', 'Your spot rental revenue and payouts',
'Once trucks start paying for spots, a Money section appears on your dashboard showing your spot-rental revenue — the operator''s share of what trucks pay to park. It does not include the trucks'' own food sales.

How payouts work:
• When a truck pays for a spot, your share is transferred to your connected payment account automatically
• Transfer timing depends on your bank (typically a few business days)
• You can see the detail in the Money section and in your Stripe account

The Money section stays hidden until you have at least one paid booking, so a brand-new park won''t show an empty card.

Tip: If the Money section isn''t showing, it just means no spot has been paid for yet.', 10, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Your spot rental revenue and payouts' AND vertical_id = 'food_trucks');

-- ============================================================================
-- CATEGORY: Booking a Park Spot (food_trucks vendor-facing, 5 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Booking a Park Spot', 'How do I book a spot at a park?',
'Booking a spot at a food-truck park takes a minute:

1. Open the park and tap Book a spot
2. On the "Book a day" tab, pick your spot
3. Choose Single day and pick the day, or Prepay a week to pay for a whole week''s operating days at once
4. Accept the park''s agreement and the compliance acknowledgment
5. Pay through Stripe — the park receives their share automatically

After payment you''ll see a confirmation. You don''t need approval to book — the spot is yours for the day(s) you paid for.

Good to know:
• There''s a small minimum charge, so very short bookings may ask you to add a day
• Payment is collected up front and is secure

Tip: Make sure your required documents are uploaded and current before your rented day (see "What documents does a park require?").', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I book a spot at a park?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Booking a Park Spot', 'How do weekly holds work?',
'A weekly hold reserves the same spot for you every week — for example, Spot A every Saturday.

How to request one:
1. On the Book a spot page, open the Weekly hold tab
2. Weekly holds unlock after your first paid booking at that park, so book a day first if you''re new
3. Pick the spot, the day of the week, and a start date
4. Send the request — the park operator reviews and approves or denies it

Important:
• Requesting a hold does not charge you now — it''s a request, not a payment
• It''s separate from paying for a single day
• You can''t request the same spot on the same day twice; if you already have one pending, it''s locked to you until the operator responds (changing the start date won''t change that)
• The tab shows "Your weekly holds here" so you can see what you''ve already requested

Tip: Once approved, you''ll pay each week''s date to keep the spot (see the next article).', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do weekly holds work?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Booking a Park Spot', 'Paying to keep your recurring spot',
'Once the operator approves your weekly hold, the spot is reserved for you each week — but you still pay for each date:

1. Before each occurrence, you''ll get a notification that it''s time to pay
2. Open the Book a spot page — approved dates awaiting payment appear on the Weekly hold tab
3. Pay by the cutoff shown to keep that week''s spot

If you don''t pay in time:
• That week opens back up for other trucks
• It counts as a missed week

Missing too many weeks in a row (or repeatedly not showing up) can pause your hold and free the spot. If that happens, ask the operator to reinstate it.

Tip: Turn on notifications so you never miss a pay-by cutoff.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Paying to keep your recurring spot' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Booking a Park Spot', 'What documents does a park require?',
'Parks may require licenses, permits, and insurance before you operate. You don''t have to upload them to book — but you agree to provide them, and to keep them current, when you book.

What you''re agreeing to at booking:
• It''s your responsibility to upload every document the park requires
• Keep them unexpired and valid before your rented time begins
• If your documents are missing, expired, inaccurate, or not provided before your booking starts, the operator may cancel your booking without a refund and may decline your future bookings

Where to upload:
1. From the booking page, use the "See the documents this park requires and upload them" link, or
2. Go to your vendor profile''s Documents & Certifications section anytime

Tip: Upload and renew documents early — a cancellation for missing paperwork is not refunded.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What documents does a park require?' AND vertical_id = 'food_trucks');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'food_trucks', 'Booking a Park Spot', 'How do I check in at a park?',
'Checking in records that you showed up on a day you booked, and it keeps any recurring hold in good standing.

1. On a day you have a paid spot, open your dashboard
2. Tap "Confirm I''m here" to check in for that day
3. You may get reminders during the day if you haven''t checked in yet

Why it matters:
• It confirms your attendance for the operator
• For recurring holds, a paid week with no check-in can count against you, so checking in protects your standing
• Where required, checking in also records your location for compliance logs

Tip: Check in when you arrive and set up — it only takes a tap.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I check in at a park?' AND vertical_id = 'food_trucks');

-- ============================================================================
-- CATEGORY: For Market Managers (farmers_market, 11 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Getting started as a market manager',
'Your market dashboard is where you run your market. It''s grouped by how you work:

1. What''s on your plate — anything needing attention now
2. Booths & this week — booth inventory, occupancy, weekly bookings, and day-of attendance
3. Your vendors — the vendors at your market and invites
4. Setup — onboarding, payments, schedule, seasons, agreements, and branding (collapses once onboarding is complete)
5. Money & insights — earnings, transactions, and surveys
6. Communicate — announcements and support

If you''re new, follow the onboarding checklist in Setup: connect payments, set your booth inventory, set your schedule, and choose your agreement statements.

Tip: Use the jump links at the top to move between sections.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Getting started as a market manager' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Setting up your booth inventory',
'Booth inventory defines the booth sizes at your market and what they cost. Set it up in Booths & this week > Booth inventory:

1. Add each booth size tier (for example, single, double)
2. Set how many of each size you have
3. Set the weekly rental price for each tier

This inventory is the foundation for the weekly vendor booking flow — vendors book and pay for a booth size you''ve defined. You can also track booths occupied by off-platform vendors using placeholders, which capture just a booth number (no vendor identity).

Tip: Keep your counts accurate so the occupancy view and booking availability stay correct.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Setting up your booth inventory' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Connecting your payment account',
'To collect booth-rental payments you connect a Stripe payment account in Setup:

1. Tap Connect and follow the secure Stripe setup
2. Provide the details Stripe requests (this may include an ID matching the account name)
3. Once Stripe confirms your account, your market can accept booth payments

Good to know:
• Your payment account is separate from any vendor account you have — Stripe handles it directly and we never see your bank details
• When a vendor pays for a booth, your share transfers to you automatically
• Until Stripe finishes verifying you, you can keep setting up your market; you just can''t take payments yet

Tip: Do this early so vendors can start booking booths.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Connecting your payment account' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Approving vendors and assigning booths',
'Vendors join your market either by responding to your invite or by signing up through your market''s link. You manage them in Your vendors:

1. Vendors awaiting review appear under "Pending approval" — approve the ones you want at your market
2. For approved vendors, assign a booth number (and size tier, if you use tiers)
3. Use the filters to see who''s active, who still needs a booth number, and who''s pending

Revoking:
• You can revoke a vendor''s approval at any time — existing bookings stay on the books, and they move back to pending

Tip: Assigning booth numbers keeps your market organized and helps vendors know where to set up.', 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Approving vendors and assigning booths' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Inviting vendors to your market',
'There are two ways to bring vendors to your market, both in Your vendors > Invite:

1. Share your market''s invite link — vendors who use it see a banner identifying your market on the standard signup page
2. Once your onboarding is complete, browse nearby on-platform vendors and invite them directly

Invited vendors show up with their own status so you can tell who''s been invited versus who''s joined. Invited vendors don''t need any action from you until they respond.

Tip: The invite link is the easiest way to onboard vendors you already work with off-platform.', 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Inviting vendors to your market' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Weekly booth bookings and payments',
'Once your booth inventory and payment account are set, vendors can book and pay for a booth for upcoming market days. You''ll see these in the Booths & this week section:

• The weekly bookings card shows who''s booked which booth for which day
• When a vendor pays, your share transfers to your payment account automatically
• The occupancy view helps you see what''s filled and what''s open

You can also track off-platform booth occupancy with placeholders so your occupancy picture is complete even for vendors who aren''t on the platform.

Tip: Keep an eye on upcoming days so you know your booth fill rate ahead of market day.', 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Weekly booth bookings and payments' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Setting your schedule and seasons',
'Your schedule tells the platform which days your market is open, which drives vendor booking and buyer pickup windows. Set it in Setup > Schedule:

1. Choose your open days and hours
2. Set your season start and end dates if your market runs seasonally

When you change your schedule, vendors who are affected can be notified. Your season window also drives some of the reporting on your dashboard.

Tip: Keep your schedule current — it''s what buyers and vendors rely on to know when your market operates.', 7, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Setting your schedule and seasons' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Season prepay and end-of-season settlement',
'You can let vendors prepay for a booth across multiple weeks of your season instead of paying week by week:

• You set the prepay window and terms
• Vendors pay once for the weeks they commit to
• Cancelled market days during the season are tracked

At the end of the season, you settle up any cancelled days using the options you offer — for example, make-up days, rollover credit toward a future booking, or other choices you make available. Vendors pick from the options you offer.

Tip: Season prepay gives you predictable revenue and gives vendors a guaranteed spot for the season.', 8, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Season prepay and end-of-season settlement' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Cancelling a market day: credits and make-up days',
'If you need to close a single date — say, for weather — use Cancel a market day:

1. Pick the upcoming date to close
2. Confirm — the closure applies to that day

What happens automatically:
• Buyers with product orders for that day are refunded
• Vendors who paid for a booth that day are credited or rescheduled per your choice
• Market-box pickups scheduled for that day are credited

You can also schedule a make-up day after your season closes to give vendors back a day they lost. This can''t be undone, so double-check the date before confirming.

Tip: Cancel as early as you can so buyers and vendors have time to adjust.', 9, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Cancelling a market day: credits and make-up days' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Choosing vendor agreement statements',
'Agreement statements are the terms vendors accept when they sign up to your market. Choose them in Setup > Vendor agreement statements:

1. Browse the catalog of available statements
2. Select the ones that apply to your market
3. Some statements have blanks (in curly braces) you fill in with values specific to your market — for example, a coverage amount or notice period

Vendors accept your selected statements when they join. Vendors who already accepted an earlier version keep what they agreed to — changes only affect new signers.

Tip: Choose statements that reflect how your market actually operates; you can update your selection anytime.', 10, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Choosing vendor agreement statements' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'For Market Managers', 'Attendance, broadcasts, and surveys',
'A few day-of and communication tools round out your dashboard:

Attendance:
• On market day, track which vendors have checked in from the Booths & this week section

Broadcasts:
• Send a one-way announcement to your market''s vendors — handy for schedule notes or reminders. Broadcasts are rate-limited to prevent overuse.

Surveys:
• Post-market surveys collect feedback from vendors and buyers; results appear in the Money & insights section as responses come in

Tip: A short broadcast the night before market day is a great way to remind vendors of setup times or weather changes.', 11, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Attendance, broadcasts, and surveys' AND vertical_id = 'farmers_market');

-- ============================================================================
-- CATEGORY: Booth & Season Booking (farmers_market vendor-facing, 3 articles)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth & Season Booking', 'How do I book a booth?',
'If your market manager has set up booth rentals, you can book and pay for a booth for upcoming market days:

1. From your vendor dashboard, go to the market and choose to book a booth
2. Pick the booth size and the day(s) you want
3. Accept the market''s agreement if prompted
4. Pay through Stripe — the market receives their share automatically

Once booked, your booth is reserved for that day. Keep an eye on your schedule so you know which days you''re committed to.

Tip: Book early for popular market days — booth availability depends on the market''s inventory.', 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'How do I book a booth?' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth & Season Booking', 'Season prepay: paying for multiple weeks at once',
'Some markets let you prepay for a booth across a stretch of the season instead of paying week by week:

• You pay once for the weeks you commit to
• Your booth is reserved for those weeks
• If the market cancels a day during the season, it''s tracked and settled at season end

At the end of the season, the manager offers options for any cancelled days — such as a make-up day or a credit toward a future booking — and you pick the option that works for you.

Tip: Season prepay locks in your spot for the season; make sure you can commit to the weeks before you pay.', 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Season prepay: paying for multiple weeks at once' AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth & Season Booking', 'What happens if a market day is cancelled?',
'If a manager cancels a market day (for example, due to weather):

• If you paid for a booth that day, you''re credited or rescheduled based on the manager''s choice
• If you had product orders from buyers for that day, those buyers are refunded automatically
• You''ll be notified of the cancellation

For prepaid seasons, cancelled days are tracked and settled at the end of the season using the options the manager offers.

Tip: Watch for cancellation notifications so you can adjust your plans and let your customers know.', 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'What happens if a market day is cancelled?' AND vertical_id = 'farmers_market');

-- Done! 29 new articles across 4 new categories.
--   food_trucks    : 'For Park Operators' (10) + 'Booking a Park Spot' (5) = 15
--   farmers_market : 'For Market Managers' (11) + 'Booth & Season Booking' (3) = 14
-- No schema change; help page + ManagerSupportCard already surface these.
