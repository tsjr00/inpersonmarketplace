-- ============================================================================
-- Migration 216: Food-truck day-to-day pickup slot capacity + slot-time validation
-- Date: 2026-08-02
-- ============================================================================
-- WHY
--
-- Nothing limits how many app orders a food truck receives for the same pickup
-- time. Buyers DO choose a mandatory time (order_items.preferred_pickup_time,
-- mig 028), but slots are generated client-side only and the code says so
-- outright: "Multiple buyers can pick the same slot — slots are waves, not
-- reservations" (lib/utils/time-slots.ts:26). Nothing counts them.
--
-- Consequence: 40 buyers can all pick 12:00, all be told to come, and the truck
-- has a line it never agreed to — which breaks the `_platform_skip_line`
-- commitment every truck accepts (lib/markets/platform-agreement-clauses.ts:76).
-- The only existing defense is listings.quantity, which sells out the WHOLE DAY
-- instead of pacing within it.
--
-- Second, smaller hole closed here: the server validates the chosen pickup time
-- ONLY for a 15-minute boundary (api/cart/items/route.ts:179-185). The rules
-- "inside the vendor's hours", "in the future", and "past the lead time" live
-- exclusively in client-side generateTimeSlots — so a crafted API request can
-- book 3:07 AM, or a slot two minutes out, or one after the truck closes.
--
-- SLOT LENGTH IS NOT FIXED. It is the vendor's own lead time: 15 or 30 minutes
-- (time-slots.ts:49 → slotInterval = minLeadMinutes <= 15 ? 15 : 30, driven by
-- vendor_profiles.pickup_lead_minutes, mig 096). A capacity number is therefore
-- only meaningful relative to the slot length it was set against — hence
-- pickup_capacity_slot_minutes below, which lets the UI warn when a lead-time
-- change has invalidated the number.
--
-- INERT ON ARRIVAL: every column is nullable and NULL means UNLIMITED, which is
-- exactly today's behavior. No existing truck is affected until it opts in.
--
-- OUT OF SCOPE: events. Event orders go through /api/events/[token]/order and
-- the event_waves system (mig 110/111), which already enforces per-wave capacity
-- atomically. Nothing here touches that path.
-- ============================================================================

BEGIN;

-- ── 1. Vendor capacity settings ────────────────────────────────────────────
-- The vendor answers three plain questions; the two enforced caps are DERIVED
-- from those answers and then STORED (not recomputed at checkout) so the vendor
-- can see and override the exact number the app will enforce. This mirrors the
-- event form, where a calculated total pre-fills an editable field
-- (vendor/events/[marketId]/page.tsx:790-800).
--
--   Q1 → pickup_capacity_total_per_slot   "orders you complete in {slot} min, ALL customers"
--   Q2 → pickup_capacity_app_orders       "how many of those can be app pre-orders"   [ENFORCED]
--   Q3 → pickup_capacity_avg_items        "items in a typical order"
--        pickup_capacity_items            = Q2 × Q3, overridable                       [ENFORCED]
--
-- Q1 is asked FIRST and includes walk-ups on purpose. Food trucks are walk-up /
-- cash-first businesses; the app is additive. Asking "app orders minus walk-ups"
-- inverts their mental model and they answer with whole-service capacity.
ALTER TABLE public.vendor_profiles
  ADD COLUMN IF NOT EXISTS pickup_capacity_total_per_slot INTEGER
    CHECK (pickup_capacity_total_per_slot IS NULL OR pickup_capacity_total_per_slot > 0),
  ADD COLUMN IF NOT EXISTS pickup_capacity_app_orders INTEGER
    CHECK (pickup_capacity_app_orders IS NULL OR pickup_capacity_app_orders > 0),
  ADD COLUMN IF NOT EXISTS pickup_capacity_avg_items INTEGER
    CHECK (pickup_capacity_avg_items IS NULL OR pickup_capacity_avg_items > 0),
  ADD COLUMN IF NOT EXISTS pickup_capacity_items INTEGER
    CHECK (pickup_capacity_items IS NULL OR pickup_capacity_items > 0),
  ADD COLUMN IF NOT EXISTS pickup_capacity_slot_minutes INTEGER
    CHECK (pickup_capacity_slot_minutes IS NULL OR pickup_capacity_slot_minutes IN (15, 30));

COMMENT ON COLUMN public.vendor_profiles.pickup_capacity_total_per_slot IS
  'Q1: orders this truck completes in one pickup slot counting ALL customers (walk-ups included). Context for the vendor''s own math; not enforced (mig 216).';
COMMENT ON COLUMN public.vendor_profiles.pickup_capacity_app_orders IS
  'ENFORCED CAP: max distinct app orders per (market, date, pickup time) slot. Derived as the vendor''s Q2 answer, then overridable. NULL = unlimited (pre-opt-in default) (mig 216).';
COMMENT ON COLUMN public.vendor_profiles.pickup_capacity_avg_items IS
  'Q3: items in a typical order. Used to derive pickup_capacity_items (mig 216).';
COMMENT ON COLUMN public.vendor_profiles.pickup_capacity_items IS
  'ENFORCED CAP: max total item quantity per slot. Derived as Q2 × Q3, then overridable. Stops one very large order from consuming a slot that the order cap alone would allow. NULL = unlimited (mig 216).';
COMMENT ON COLUMN public.vendor_profiles.pickup_capacity_slot_minutes IS
  'The slot length (15 or 30, = pickup_lead_minutes) these capacity numbers were set against. If pickup_lead_minutes later changes, the caps are stale and the UI must warn: "Your order capacity is set based on your order lead time — your order capacity probably needs to be changed to match your new lead time." (mig 216)';

-- Counting index: the capacity check groups by exactly this key.
CREATE INDEX IF NOT EXISTS idx_order_items_pickup_slot
  ON public.order_items (vendor_profile_id, market_id, pickup_date, preferred_pickup_time)
  WHERE preferred_pickup_time IS NOT NULL AND cancelled_at IS NULL;

-- ── 2. Atomic capacity check ───────────────────────────────────────────────
-- Advisory-lock → count → compare, the same shape as book_weekly_booth_atomic
-- (mig 186:82-116). The lock is transaction-scoped and keyed on the slot, so two
-- concurrent checkouts for the same slot serialize rather than both reading a
-- stale count.
--
-- Returns a row rather than a bare boolean so the caller can produce an honest
-- message ("this time is full") and log the numbers.
--
-- p_order_id lets an in-progress order exclude its OWN rows, so re-running the
-- check for a multi-item cart doesn't count the order against itself.
CREATE OR REPLACE FUNCTION public.check_pickup_slot_capacity(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_pickup_date DATE,
  p_pickup_time TIME,
  p_adding_items INTEGER DEFAULT 1,
  p_order_id UUID DEFAULT NULL
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  orders_used INTEGER,
  orders_cap INTEGER,
  items_used INTEGER,
  items_cap INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders_cap INTEGER;
  v_items_cap INTEGER;
  v_orders_used INTEGER;
  v_items_used INTEGER;
  v_lock_key BIGINT;
BEGIN
  SELECT vp.pickup_capacity_app_orders, vp.pickup_capacity_items
    INTO v_orders_cap, v_items_cap
    FROM vendor_profiles vp
   WHERE vp.id = p_vendor_profile_id;

  -- Not opted in (or no slot chosen) → unlimited, today's behavior.
  IF (v_orders_cap IS NULL AND v_items_cap IS NULL) OR p_pickup_time IS NULL THEN
    RETURN QUERY SELECT true, NULL::TEXT, 0, v_orders_cap, 0, v_items_cap;
    RETURN;
  END IF;

  -- Serialize concurrent checkouts for this exact slot.
  v_lock_key := hashtextextended(
    p_vendor_profile_id::text || ':' || p_market_id::text || ':' ||
    p_pickup_date::text || ':' || p_pickup_time::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Live load in this slot. Cancelled items and dead orders must not consume
  -- capacity, or a slot would stay "full" forever after refunds.
  SELECT COALESCE(COUNT(DISTINCT oi.order_id), 0),
         COALESCE(SUM(oi.quantity), 0)
    INTO v_orders_used, v_items_used
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
   WHERE oi.vendor_profile_id = p_vendor_profile_id
     AND oi.market_id         = p_market_id
     AND oi.pickup_date       = p_pickup_date
     AND oi.preferred_pickup_time = p_pickup_time
     AND oi.cancelled_at IS NULL
     AND oi.status <> 'cancelled'
     AND o.status NOT IN ('cancelled', 'refunded')
     AND (p_order_id IS NULL OR oi.order_id <> p_order_id);

  IF v_orders_cap IS NOT NULL AND (v_orders_used + 1) > v_orders_cap THEN
    RETURN QUERY SELECT false, 'slot_orders_full'::TEXT,
                        v_orders_used, v_orders_cap, v_items_used, v_items_cap;
    RETURN;
  END IF;

  IF v_items_cap IS NOT NULL AND (v_items_used + COALESCE(p_adding_items, 1)) > v_items_cap THEN
    RETURN QUERY SELECT false, 'slot_items_full'::TEXT,
                        v_orders_used, v_orders_cap, v_items_used, v_items_cap;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT,
                      v_orders_used, v_orders_cap, v_items_used, v_items_cap;
END;
$$;

COMMENT ON FUNCTION public.check_pickup_slot_capacity IS
  'Atomically checks whether one more app order (and p_adding_items items) fits in a food truck''s (market, date, pickup time) slot. Advisory-locked per slot so concurrent checkouts serialize. NULL caps = unlimited. Cancelled/refunded rows never consume capacity. Returns allowed + reason + used/cap numbers (mig 216).';

REVOKE EXECUTE ON FUNCTION public.check_pickup_slot_capacity(UUID, UUID, DATE, TIME, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_pickup_slot_capacity(UUID, UUID, DATE, TIME, INTEGER, UUID) TO service_role;

-- ── 3. Server-side pickup-time validation ──────────────────────────────────
-- Closes the hole where "inside the vendor's hours / in the future / past lead
-- time" existed only in client-side generateTimeSlots. Mirrors that function's
-- rules, in the market's OWN timezone (Vercel runs UTC — a naive now() would be
-- wrong by hours). Vendor per-market time overrides win when present, matching
-- get_available_pickup_dates (mig 199/200 use COALESCE(vms.vendor_start_time, ms.start_time)).
CREATE OR REPLACE FUNCTION public.validate_pickup_slot_time(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_pickup_date DATE,
  p_pickup_time TIME
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
  v_start TIME;
  v_end TIME;
  v_lead INTEGER;
  v_local_now TIMESTAMP;
BEGIN
  IF p_pickup_time IS NULL THEN
    RETURN TRUE;  -- non-FT flows legitimately have no slot
  END IF;

  SELECT COALESCE(m.timezone, 'America/Chicago') INTO v_tz
    FROM markets m WHERE m.id = p_market_id;
  IF v_tz IS NULL THEN
    RETURN FALSE;  -- unknown market
  END IF;

  -- Effective service window for this vendor at this market on this weekday.
  SELECT COALESCE(vms.vendor_start_time, ms.start_time),
         COALESCE(vms.vendor_end_time,   ms.end_time)
    INTO v_start, v_end
    FROM market_schedules ms
    LEFT JOIN vendor_market_schedules vms
           ON vms.schedule_id = ms.id
          AND vms.vendor_profile_id = p_vendor_profile_id
          AND vms.is_active = true
   WHERE ms.market_id = p_market_id
     AND ms.active = true
     AND ms.day_of_week = EXTRACT(DOW FROM p_pickup_date)::INTEGER
   ORDER BY vms.id NULLS LAST
   LIMIT 1;

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN FALSE;  -- no active schedule that weekday
  END IF;

  -- Must fall inside the service window. A slot AT end time is valid (the buyer
  -- arrives at close and is served) — matches time-slots.ts:28-29.
  IF p_pickup_time < v_start OR p_pickup_time > v_end THEN
    RETURN FALSE;
  END IF;

  -- Same-day orders must respect the vendor's prep lead time.
  SELECT COALESCE(vp.pickup_lead_minutes, 30) INTO v_lead
    FROM vendor_profiles vp WHERE vp.id = p_vendor_profile_id;

  v_local_now := (NOW() AT TIME ZONE v_tz);
  IF p_pickup_date < v_local_now::DATE THEN
    RETURN FALSE;  -- past date
  END IF;
  IF p_pickup_date = v_local_now::DATE
     AND p_pickup_time < (v_local_now + (v_lead || ' minutes')::INTERVAL)::TIME THEN
    RETURN FALSE;  -- too soon (or already past) today
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.validate_pickup_slot_time IS
  'Server-side guard for order_items.preferred_pickup_time: slot must fall inside the vendor''s effective service window for that weekday, the date must not be past, and a same-day slot must be at least pickup_lead_minutes out. All comparisons in the market''s timezone. Mirrors client-side generateTimeSlots, which was previously the ONLY place these rules existed (mig 216).';

REVOKE EXECUTE ON FUNCTION public.validate_pickup_slot_time(UUID, UUID, DATE, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_pickup_slot_time(UUID, UUID, DATE, TIME) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- 1) Columns:
--    SELECT column_name FROM information_schema.columns
--     WHERE table_name='vendor_profiles' AND column_name LIKE 'pickup_capacity%';  -- expect 5
-- 2) Functions:
--    SELECT proname FROM pg_proc
--     WHERE proname IN ('check_pickup_slot_capacity','validate_pickup_slot_time'); -- expect 2
-- 3) Unlimited by default (no truck opted in yet) — expect allowed = true:
--    SELECT * FROM check_pickup_slot_capacity('<vendor>','<market>',CURRENT_DATE,'12:00',1);
-- 4) Opt a test vendor in, then re-check — expect allowed=false once orders_used hits the cap:
--    UPDATE vendor_profiles SET pickup_capacity_app_orders = 1, pickup_capacity_items = 4,
--           pickup_capacity_slot_minutes = 30 WHERE id = '<vendor>';
-- 5) Time validation — expect false for a slot outside hours / in the past:
--    SELECT validate_pickup_slot_time('<vendor>','<market>',CURRENT_DATE,'03:07');
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.validate_pickup_slot_time(UUID, UUID, DATE, TIME);
-- DROP FUNCTION IF EXISTS public.check_pickup_slot_capacity(UUID, UUID, DATE, TIME, INTEGER, UUID);
-- DROP INDEX IF EXISTS idx_order_items_pickup_slot;
-- ALTER TABLE public.vendor_profiles
--   DROP COLUMN IF EXISTS pickup_capacity_total_per_slot,
--   DROP COLUMN IF EXISTS pickup_capacity_app_orders,
--   DROP COLUMN IF EXISTS pickup_capacity_avg_items,
--   DROP COLUMN IF EXISTS pickup_capacity_items,
--   DROP COLUMN IF EXISTS pickup_capacity_slot_minutes;
-- NOTIFY pgrst, 'reload schema';
