-- Migration 158: Seed help articles for market managers, booth rentals, events, joining a market
-- Brings the Help & FAQ (knowledge_articles) up to speed with functionality added across
-- the market-manager v1/v2, booth-rental, events, and NEW-8 invitation work that had no
-- self-help coverage. Surfaces automatically on /[vertical]/help.
-- Idempotent: NOT EXISTS guard per article (by title + vertical scope), matching mig 062.
-- Uses dollar-quoting ($art$...$art$) for titles + bodies so apostrophes need no escaping
-- (paste-robust). Content only - no schema change. Session 92 (2026-06-14).

-- ============================================================================
-- CATEGORY: Market Managers (farmers_market - MM v1 is FM-only)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$What is a market manager?$art$,
$art$A market manager runs a farmers market on the platform. If you organize a market - booking vendors, assigning booths, setting market days - the manager dashboard gives you free tools to do it in one place.

As a manager you can:
- Set up booth sizes and weekly prices, and collect booth rent online
- Invite vendors and approve who sells at your market
- Set the agreement vendors accept when they join
- Edit your market days and hours
- Send announcements to your vendors
- See your market's sales activity and your own booth-rental income

There's no subscription - the platform takes a small percentage of booth-rent and on-platform sales. You bring the market; we provide the operating system.$art$, 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$What is a market manager?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do I become a market manager?$art$,
$art$There are two ways to get set up:

1. Apply through the "Run your market with us" intake form - tell us your market name, location, and contact info. Our team reviews it (we may ask for proof you operate the market) and approves it.
2. If you already run a market on the platform, an administrator can assign you as its manager by email.

Once you're assigned, sign in with that email and you'll see a "My Markets" card on your dashboard with a link to manage your market.

If you applied and haven't heard back, check your spam folder for our confirmation email, or reach out through the support page.$art$, 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I become a market manager?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do I get started after I'm approved?$art$,
$art$Your dashboard opens with a setup checklist. Work through it top to bottom:

1. Booth inventory - add your booth size tiers and weekly prices
2. Vendors - add the vendors already at your market (or check "I don't have any yet")
3. Placeholders - note any off-platform vendors so booth counts stay accurate (optional)
4. Agreement statements - pick the rules vendors accept when they join

The jump links at the top of the dashboard let you skip straight to any section without scrolling. Once the required steps are done, the checklist collapses and your full toolset is available.$art$, 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I get started after I'm approved?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do I set up booth inventory?$art$,
$art$Booth inventory is the list of booth sizes you rent and what each costs per week. To set it up, open the Booth inventory section and add a tier for each size, for example:

- 10x10 - 12 available - $25/week
- 10x20 - 4 available - $40/week

You can edit the count or price any time. This is the foundation for online booth rentals - vendors can only book and pay once at least one tier exists and your payment setup is complete.

You can also set a booth-label range (like 1-16, or A1-A8) so the system auto-assigns a booth number when a vendor books.$art$, 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I set up booth inventory?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do booth rentals and payouts work?$art$,
$art$Once your booth inventory is set and you've connected your payout account, vendors can book and pay for a booth week online. The money routes to your connected account automatically.

How the price works, using a $25 booth as an example:
- The vendor pays $26.78 (your price plus a small platform fee)
- You receive $23.37 (your price minus a small platform percentage)

You set the price; the platform's cut comes out of the spread. To get paid you'll complete a quick payment-setup step (Stripe) from the dashboard - this verifies your identity and links your bank account. Until that's done, the booking page tells vendors online booking isn't available yet.$art$, 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do booth rentals and payouts work?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do I invite vendors to my market?$art$,
$art$You have two ways to bring vendors on:

1. Invite from the platform - search nearby vendors already on the platform and send them an invitation. They get a notification and can accept or decline. Accepted vendors are added to your market automatically.
2. Share your signup link - copy your market's invite link and send it to any vendor. When they sign up through it, they're tagged to your market and you approve them.

Invitations only go to NEW vendors for your market - vendors already at your market won't be re-invited.$art$, 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I invite vendors to my market?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do I approve and manage my vendors?$art$,
$art$Your Vendors section lists everyone connected to your market. From there you can:

- Approve a vendor who signed up through your link
- Assign or edit each vendor's booth number and size tier
- See which vendors still need a booth assigned (a badge flags the count)

Approving a vendor lets them appear at your market and start accepting orders. You can't remove an active vendor from the market here - that's handled separately - but you can manage their booth and approval status.$art$, 7, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I approve and manage my vendors?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$What are vendor agreement statements?$art$,
$art$Agreement statements are the rules a vendor accepts when they join your market - things like setup and teardown times, insurance expectations, product standards, and conduct.

In the Vendor agreement statements section you choose which statements apply to your market from a ready-made list. Some statements have blanks (shown in curly braces) you fill in with your market's specifics, like a distance or a coverage amount. Vendors see and accept your selected statements when they join, and a copy is saved with their acceptance.$art$, 8, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$What are vendor agreement statements?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do I edit my market schedule?$art$,
$art$Open the Market schedule section to set your market days, hours, and season start/end. Toggle a day on or off and set its open and close times.

Two things to know before you save:
- Changing the schedule notifies every approved vendor at your market automatically.
- You - not the platform - are responsible for any refunds or direct outreach a schedule change requires. The platform does not issue refunds for schedule changes. You'll confirm this before the change saves.

Turning a day off preserves its hours and your vendors' attendance, so you can turn it back on later without redoing setup.$art$, 9, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I edit my market schedule?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$How do I send an announcement to my vendors?$art$,
$art$Use the "Send an announcement" card to send a one-way message to the vendors at your market - everyone approved, plus anyone with a paid booth this week or later. They get an in-app notification and an email.

A few notes:
- It's send-only - vendors can't reply through it, so include contact details if you want a response.
- You can send up to 2 announcements per 7 days, to keep it from becoming noisy.

It's best for things like "we've moved to the east lot this Saturday" or "new vendors welcome - here's how to book a booth."$art$, 10, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I send an announcement to my vendors?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Market Managers', $art$Why isn't my market showing up for buyers yet?$art$,
$art$A market appears in the public directory once at least one vendor has BOTH of these at your market:
- a published product listing, and
- an active attendance schedule

This keeps buyers from finding markets they can't actually order from. Your dashboard shows a live count of how many vendors have each, so you can see exactly what's missing.

Until you reach that point, plan to do some of your own outreach - invite vendors, and encourage them to publish a listing and set their schedule. Once one vendor is fully set up, your market goes live to buyers.$art$, 11, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$Why isn't my market showing up for buyers yet?$art$ AND vertical_id = 'farmers_market');

-- ============================================================================
-- CATEGORY: Booth Rentals (farmers_market - vendor-facing)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth Rentals', $art$How do I rent a booth at a market?$art$,
$art$If a market manager has set up booth rentals, you can book and pay for a booth week online:

1. Open the market's page and tap "Book a Booth Space."
2. Pick the week you want (booths are booked by the week) and the booth size.
3. Review and accept the market's agreement.
4. Pay securely - your booth is reserved as soon as payment goes through.

You'll get a confirmation with your booth number (if the manager uses auto-assigned labels), and the booking shows up under "My Bookings." If a market doesn't offer online booking yet, reach out to the manager directly.$art$, 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I rent a booth at a market?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth Rentals', $art$How much does a booth cost?$art$,
$art$The market manager sets the weekly price for each booth size. At checkout you'll pay that price plus a small platform fee.

For example, on a $25 booth you'd pay $26.78. The exact total is always shown before you confirm, so there are no surprises.

Booths are priced and booked by the week. Each week you want is a separate booking.$art$, 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How much does a booth cost?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Booth Rentals', $art$What if my booth payment doesn't go through?$art$,
$art$If you start a booking but don't finish paying, we hold the spot briefly and then release it so others can book that week. You'll get a notification letting you know the booking was released, with a link to try again.

If you think you were charged but don't see your booking under "My Bookings," contact support with the date and market and we'll sort it out.$art$, 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$What if my booth payment doesn't go through?$art$ AND vertical_id = 'farmers_market');

-- ============================================================================
-- CATEGORY: Events & Catering (global - both verticals)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events & Catering', $art$How do I request an event?$art$,
$art$If you're planning an event - a corporate lunch, a festival, a grand opening - you can request vendors through the platform:

1. Fill out the event request form with your date, time, location, headcount, and the kinds of food or products you want.
2. Tell us how guests will pay (your company covers it, or guests pay per item).
3. Submit - we match you with suitable vendors and you'll get a link to your event page.

The more detail you give about your event, the better the vendor matches. You can update the details later, and refreshing key fields re-runs the vendor matching.$art$, 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I request an event?$art$ AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events & Catering', $art$What kinds of events can I host?$art$,
$art$Events range from small corporate lunches to large festivals. When you request one you'll pick an event type (corporate lunch, team building, grand opening, festival, private party, and more) so we can size the vendor lineup appropriately.

You'll also choose a service level:
- Self-service - the platform auto-approves your request and invites matching vendors. There's no platform fee for this option.
- Full-service - our team helps coordinate the details with you.

Either way, your address is required before the event can go live so vendors and guests know where to go.$art$, 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$What kinds of events can I host?$art$ AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events & Catering', $art$How are vendors matched to my event?$art$,
$art$When your event is approved, the platform scores event-ready vendors against your details - event type, timing, location, headcount, and the food or product categories you asked for - and invites the strongest matches.

Vendors then accept or decline and choose which items they'll offer at your event. You'll see the confirmed vendors and their menus on your event page. If you change details that affect matching, you can refresh the matches to pull in new candidates.$art$, 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How are vendors matched to my event?$art$ AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events & Catering', $art$How do guests order at an event?$art$,
$art$Each event has its own shop page with a private link. Guests open it, browse the participating vendors and their items, and place an order for pickup at the event.

For larger events, ordering can be organized into time windows (waves) so pickups are spread out and lines stay short. Guests pick a window and order within it. On the day, they pick up from the vendor during their window.$art$, 4, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do guests order at an event?$art$ AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events & Catering', $art$Who pays - my company or the guests?$art$,
$art$You choose when you request the event:

- Company-paid - your organization covers the cost. Guests use an access code to claim their selection at no charge to them.
- Attendee-paid - each guest pays for their own order at checkout.

Pick whichever fits your event. The form walks you through the details for each, including any per-guest limits you want to set.$art$, 5, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$Who pays - my company or the guests?$art$ AND vertical_id IS NULL);

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'Events & Catering', $art$As a vendor, how do I get invited to events?$art$,
$art$To be considered for events you first complete an event-readiness step from your dashboard - a short form about your setup, capacity, and experience. Once an administrator marks you event-ready, you're eligible to be matched.

After that, when an event fits your profile you'll receive an invitation. You can:
- Review the event details (date, location, headcount, what they're looking for)
- Accept and choose which of your items to offer, with limits on how many orders you'll take
- Decline if it's not a fit

Accepted vendors get a prep view showing orders by time window on the day of the event.$art$, 6, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$As a vendor, how do I get invited to events?$art$ AND vertical_id IS NULL);

-- ============================================================================
-- CATEGORY: Joining a Market (farmers_market - vendor-facing)
-- ============================================================================

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Joining a Market', $art$How do I join a market?$art$,
$art$There are a few ways to get connected to a market:

1. Accept an invitation - if a market manager invites you, you'll get a notification. Accept it and you're added to the market.
2. Use a market's signup link - if a manager shares their invite link, signing up through it tags you to that market for the manager to approve.
3. Add a market to your listings - from your Markets page you can connect to available markets and set your schedule.

Once you're connected and approved, publish a listing and set your attendance schedule so buyers can find and order from you there.$art$, 1, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I join a market?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Joining a Market', $art$How do I respond to a market invitation?$art$,
$art$When a manager invites you, the invitation appears on your Markets page and in your notifications. Open it to see the market's details, then choose Accept or Decline.

If you accept, you're added to the market and can start setting up - connect your listings and set your schedule for that market's days. If you don't respond, the invitation expires on its own after a while, and the manager can re-invite you later.$art$, 2, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$How do I respond to a market invitation?$art$ AND vertical_id = 'farmers_market');

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT 'farmers_market', 'Joining a Market', $art$What is the market vendor agreement?$art$,
$art$Each market sets its own rules - things like setup and teardown times, insurance expectations, product standards, and conduct. When you join a market, you'll see that market's agreement statements and accept them.

A copy of exactly what you agreed to is saved with the date, so both you and the manager have a record even if the market updates its rules later. If you have questions about a specific statement, ask the market manager before accepting.$art$, 3, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = $art$What is the market vendor agreement?$art$ AND vertical_id = 'farmers_market');
