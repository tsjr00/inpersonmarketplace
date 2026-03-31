-- ============================================================================
-- Migration 106: Event vendor order capacity caps
-- ============================================================================
-- Adds per-vendor order limits for events. Vendors set these when accepting
-- an event invitation. Two columns support both verticals:
--
-- event_max_orders_total: Required for both FM and FT event acceptance.
--   FM: flat cap on total orders (vendor's production capacity).
--   FT: auto-calculated from waves × per-wave, vendor can override lower.
--
-- event_max_orders_per_wave: FT only. Per-time-slot cap. When a wave fills,
--   that slot closes but others stay open. NULL for FM (no wave concept).
--
-- Enforcement is in app code (cart-add API), not DB constraints, because
-- the check requires counting order_items with specific filters.
-- ============================================================================

ALTER TABLE market_vendors
  ADD COLUMN IF NOT EXISTS event_max_orders_total INTEGER,
  ADD COLUMN IF NOT EXISTS event_max_orders_per_wave INTEGER;

COMMENT ON COLUMN market_vendors.event_max_orders_total IS
  'Max total orders this vendor can fulfill for this event. '
  'Required when accepting event invitations. '
  'FM: vendor production capacity. FT: waves × per-wave cap (or vendor override). '
  'Enforced at cart-add time — once reached, vendor items unavailable for pre-order.';

COMMENT ON COLUMN market_vendors.event_max_orders_per_wave IS
  'FT only: max orders per time-slot wave (e.g. 30 per 30-min wave). '
  'NULL for FM events (no wave concept). '
  'When a wave fills, that time slot closes but others remain open.';

NOTIFY pgrst, 'reload schema';
