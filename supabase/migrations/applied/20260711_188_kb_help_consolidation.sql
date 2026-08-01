-- Migration 188: Knowledge base / help CONSOLIDATION (content-only — no schema/logic)
--
-- Phase 2 of the help audit (apps/web/.claude/kb_help_audit.md). Mig 187 handled
-- the legacy FT FAQ; this reconciles the incremental help migrations (069, 071,
-- 073, 077, 082, 099, 158) + the 187 additions into ONE consistent set:
--   - one event category ("Vendor Events") instead of four fragmented ones
--   - one canonical manager category ("For Market Managers", mig 183) instead of
--     183's + 158's duplicate "Market Managers"
--   - one canonical booth category ("Booth & Season Booking", mig 183)
--   - sales-tax article corrected (platform does NOT collect tax yet; no legal
--     name), vendor plans deferred to the Upgrade page, hard-coded fee/price
--     math removed.
-- Data-only. Idempotent (re-run safe). USER applies; Claude does snapshot
-- bookkeeping after. ROLLBACK: content-only (re-apply the superseded seeds).
-- Depends on: migs 062, 158, 183, 187 (+ 069/071/073/077/082/099 content).

BEGIN;

-- ===========================================================================
-- 1. EVENTS — collapse to ONE category "Vendor Events"
-- ===========================================================================
-- 1a. Remove the two global event articles mig 187 added — they duplicate the
--     richer mig-158 "Events & Catering" set (kept below). (My miss in 187.)
DELETE FROM knowledge_articles
WHERE vertical_id IS NULL
  AND title IN (
    'How do I order for an event?',
    'How do I bring vendors or food trucks to my event?'
  );

-- 1b. Rename the canonical global event category to "Vendor Events".
UPDATE knowledge_articles
SET category = 'Vendor Events'
WHERE vertical_id IS NULL AND category = 'Events & Catering';

-- 1c. Fold the vendor-facing "pop-up market" guides (mig 073, FM) into
--     "Vendor Events" and reword the retired "pop-up" term → "vendor event".
UPDATE knowledge_articles
SET category = 'Vendor Events',
    title = replace(replace(title, 'pop-up markets', 'vendor events'), 'pop-up market', 'vendor event'),
    body  = replace(replace(replace(body,
              'pop-up markets', 'vendor events'),
              'pop-up market', 'vendor event'),
              'Pop-up', 'Vendor event')
WHERE vertical_id = 'farmers_market' AND category = 'For Vendors';

-- 1d. Fold the FT "private events" guides (migs 071 → renamed by 073/077) into
--     "Vendor Events" and reword "private event(s)" → "vendor event(s)".
UPDATE knowledge_articles
SET category = 'Vendor Events',
    title = replace(replace(title, 'private events', 'vendor events'), 'private event', 'vendor event'),
    body  = replace(replace(replace(body,
              'private events', 'vendor events'),
              'private event', 'vendor event'),
              'Private event', 'Vendor event')
WHERE vertical_id = 'food_trucks' AND category = 'For Food Truck Operators';

-- ===========================================================================
-- 2. MARKET MANAGERS — mig 183 "For Market Managers" is canonical.
--    Delete mig 158's duplicate "Market Managers" articles; migrate the two
--    unique ones into the canonical category.
-- ===========================================================================
DELETE FROM knowledge_articles
WHERE vertical_id = 'farmers_market' AND category = 'Market Managers'
  AND title IN (
    'How do I become a market manager?',          -- superseded by mig 187 "How do I sign up to run my market?"
    'How do I get started after I''m approved?',  -- dup of 183 "Getting started as a market manager"
    'How do I set up booth inventory?',           -- dup of 183 "Setting up your booth inventory"
    'How do booth rentals and payouts work?',     -- dup of 183 "Weekly booth bookings and payments" (+ hard-coded $ math)
    'How do I invite vendors to my market?',      -- dup of 183 "Inviting vendors to your market"
    'How do I approve and manage my vendors?',    -- dup of 183 "Approving vendors and assigning booths"
    'What are vendor agreement statements?',       -- dup of 183 "Choosing vendor agreement statements"
    'How do I edit my market schedule?',          -- dup of 183 "Setting your schedule and seasons"
    'How do I send an announcement to my vendors?' -- dup of 183 "Attendance, broadcasts, and surveys"
  );

-- Keep the two genuinely-unique 158 manager articles; move them into the
-- canonical "For Market Managers" category.
UPDATE knowledge_articles
SET category = 'For Market Managers'
WHERE vertical_id = 'farmers_market' AND category = 'Market Managers'
  AND title IN (
    'What is a market manager?',
    'Why isn''t my market showing up for buyers yet?'
  );

-- ===========================================================================
-- 3. BOOTH RENTALS — mig 183 "Booth & Season Booking" is canonical.
--    Delete 158's duplicate/hard-coded booth articles; migrate the unique one.
-- ===========================================================================
DELETE FROM knowledge_articles
WHERE vertical_id = 'farmers_market' AND category = 'Booth Rentals'
  AND title IN (
    'How do I rent a booth at a market?',  -- dup of 183 "How do I book a booth?"
    'How much does a booth cost?'          -- hard-coded $25→$26.78; pricing covered by 183 + booth-credits (187)
  );

UPDATE knowledge_articles
SET category = 'Booth & Season Booking'
WHERE vertical_id = 'farmers_market' AND category = 'Booth Rentals'
  AND title = 'What if my booth payment doesn''t go through?';

-- ===========================================================================
-- 4. SALES TAX — the platform does NOT collect/remit sales tax yet. Correct the
--    live article (mig 099 wrongly claims it does + names the legal entity).
--    State vendor responsibility for now; refer to "the platform" generically.
--    Recategorize into Payments & Fees (its own "For Vendors" category is going
--    away). Title kept so the UPDATE targets the existing row.
-- ===========================================================================
UPDATE knowledge_articles
SET category = 'Payments & Fees',
    body = $art$Sales tax rules vary by location and by what you sell, and they can change. As a vendor, you are responsible for understanding and meeting your own sales-tax obligations for the sales you make.

Right now, the platform does not collect or remit sales tax on your behalf — your listed prices are what buyers are charged, so factor any tax you owe into your pricing or your own bookkeeping. If you're unsure what applies to you, check with your state's tax authority or a tax professional.

If the platform begins collecting and remitting sales tax on your behalf in the future, we'll update this article and notify vendors before anything changes.$art$
WHERE title = 'Sales Tax: What Vendors Need to Know';

-- ===========================================================================
-- 5. VENDOR PLANS — remove hard-coded prices; defer to the Upgrade page.
--    (Mig 187 already did the FT article; this fixes the FM one, which mig 069
--    had filled with prices that the code treats as legacy → free.)
-- ===========================================================================
UPDATE knowledge_articles
SET body = $art$Farmers Marketing offers vendor plan tiers that unlock more product listings, more market access, longer analytics history (with CSV export at the top tier), and additional Market Box capacity as you move up.

Visit the Upgrade page in your vendor dashboard to see current pricing and compare all features side by side. Annual billing is available at a discount.$art$
WHERE vertical_id = 'farmers_market' AND title = 'What vendor plans are available?';

-- ===========================================================================
-- 6. SOFTEN HARD-CODED FEE MATH (mig 069 filled these with exact numbers that
--    rot if fees change). Keep the concept; drop the specific figures.
-- ===========================================================================
UPDATE knowledge_articles
SET body = $art$Ordering through the platform includes a small service fee that covers secure payment processing and running the marketplace. Both buyers and vendors pay a small share.

The exact fee is always shown at checkout before you pay, so there are no surprises. Vendors can see the fee breakdown for a sale in their dashboard.$art$
WHERE category = 'Payments & Fees' AND title = 'What are the service fees?';

UPDATE knowledge_articles
SET body = $art$There's no platform-wide minimum order. A small surcharge may apply to very small orders to keep them worthwhile for vendors to prepare. If it applies, it's shown at checkout before you pay.$art$
WHERE category = 'Payments & Fees' AND title = 'Is there a minimum order amount?';

COMMIT;

-- No NOTIFY pgrst needed — data-only, no schema/RLS change.
