-- Migration 189: event-eligible opt-in statements (Events Tier-1, Commit B)
--
-- Adds an `event_eligible` flag to the opt-in statement catalog and seeds the
-- 18 event-agreement statements the organizer picks from when building an
-- event's vendor agreement. Content locked + user-approved 2026-07-11
-- (apps/web/.claude/event_agreements_plan.md).
--
-- WHY the flag (coupling): event statements live in the SAME catalog table as
-- market/park-manager statements. The market-manager catalog + selections
-- routes filter only by vertical_id, so without a separating flag these event
-- rows would appear in the market/park manager picker too. `event_eligible`
-- partitions the two audiences: market/park routes add `event_eligible = false`
-- (this migration ships WITH those route edits — never seed alone); the new
-- organizer event picker filters `event_eligible = true`.
--
-- Categories reuse the existing CHECK set (product_quality, conduct, insurance,
-- fees, compliance) — see mig 136. vertical_id: NULL = universal (all
-- verticals), a slug restricts to that vertical (mig 175 convention).
-- No placeholders on any event statement (plain text).
--
-- DATA + additive DDL. Idempotent: ADD COLUMN IF NOT EXISTS + INSERT ...
-- ON CONFLICT (id) DO NOTHING.
--
-- ROLLBACK (only before any event selects one — vendor acceptances snapshot
-- the text so already-accepted agreements are safe regardless):
--   DELETE FROM market_optin_statement_catalog WHERE event_eligible = true;
--   DROP INDEX IF EXISTS idx_optin_catalog_event_eligible;
--   ALTER TABLE market_optin_statement_catalog DROP COLUMN IF EXISTS event_eligible;

ALTER TABLE market_optin_statement_catalog
  ADD COLUMN IF NOT EXISTS event_eligible BOOLEAN NOT NULL DEFAULT false;

-- Partial index: the organizer picker queries WHERE event_eligible = true.
CREATE INDEX IF NOT EXISTS idx_optin_catalog_event_eligible
  ON market_optin_statement_catalog (event_eligible)
  WHERE event_eligible = true;

-- ── Universal event statements (vertical_id NULL, all verticals) ──
INSERT INTO market_optin_statement_catalog (id, category, statement, vertical_id, sort_order, event_eligible) VALUES
  ('ev-attendance', 'conduct',
   'I commit to attend this event on its scheduled date and hours. Attendees pre-order from me specifically and the organizer builds the event around my confirmed participation.',
   NULL, 500, true),
  ('ev-cancellation', 'conduct',
   'If I must cancel, I will notify the organizer immediately so they can secure a replacement. I understand a late cancellation or no-show may bar me from future events.',
   NULL, 501, true),
  ('ev-throughput', 'conduct',
   'I will serve at least the throughput I stated in my event-readiness so pre-orders can be filled on time.',
   NULL, 502, true),
  ('ev-readiness-accurate', 'conduct',
   'My event-readiness answers — setup size, power needs, perishability, and odors — are accurate and current, and I will operate within them at this event.',
   NULL, 503, true),
  ('ev-footprint', 'conduct',
   'I will keep to the space and footprint the organizer assigns and follow their setup, power, and placement instructions.',
   NULL, 504, true),
  ('ev-odor-disclose', 'conduct',
   'I will disclose strong cooking smoke or odors to the organizer in advance and set up in the position they assign to limit the impact on guests.',
   NULL, 505, true),
  ('ev-allergen', 'product_quality',
   'I will accurately label allergens and honor the dietary accommodations the organizer specified for this event.',
   NULL, 506, true),
  ('ev-menu-match', 'product_quality',
   'What I serve will match what the organizer requested and what I listed for this event; I will not make material substitutions without approval.',
   NULL, 507, true),
  ('ev-stay-policy', 'conduct',
   'I will follow the event''s stay policy (remain for the full event, or leave when sold out) as the organizer set it.',
   NULL, 508, true),
  ('ev-licenses', 'compliance',
   'My licenses and insurance, including any required Certificate of Insurance, are valid for this event''s location and date.',
   NULL, 509, true),
  ('ev-food-safety', 'compliance',
   'I will follow the venue''s and organizer''s rules and all applicable food-safety requirements for this event.',
   NULL, 510, true),
  ('ev-sales-tax', 'compliance',
   'I am responsible for any sales tax on what I sell at this event.',
   NULL, 511, true),
  ('ev-conduct', 'conduct',
   'I will conduct myself professionally toward guests, staff, and other vendors.',
   NULL, 512, true)
ON CONFLICT (id) DO NOTHING;

-- ── Food-truck-specific event statements ──
INSERT INTO market_optin_statement_catalog (id, category, statement, vertical_id, sort_order, event_eligible) VALUES
  ('ev-ft-quiet-generator', 'conduct',
   'At an indoor or noise-sensitive event I will use a quiet/inverter generator only, and will not run a standard generator without the organizer''s written approval.',
   'food_trucks', 520, true),
  ('ev-ft-runtime', 'conduct',
   'My equipment and fuel/runtime will cover the full duration of the event without a power interruption.',
   'food_trucks', 521, true)
ON CONFLICT (id) DO NOTHING;

-- ── Farmers-market-specific event statements ──
INSERT INTO market_optin_statement_catalog (id, category, statement, vertical_id, sort_order, event_eligible) VALUES
  ('ev-fm-power', 'conduct',
   'I will confirm my electrical/power needs with the organizer in advance and bring my own power if the venue cannot supply it.',
   'farmers_market', 530, true),
  ('ev-fm-weather', 'conduct',
   'For outdoor events I will bring weather-appropriate setup (shade or cover) to keep my products safe and presentable.',
   'farmers_market', 531, true),
  ('ev-fm-cooling', 'compliance',
   'I will keep temperature-sensitive products properly cooled or shaded for the full event.',
   'farmers_market', 532, true)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
