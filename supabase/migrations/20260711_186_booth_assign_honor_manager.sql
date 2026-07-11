-- Migration 186: booth auto-assignment honors the manager's roster pin
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Re-apply migration 144's book_weekly_booth_atomic body (this migration is a
-- CREATE OR REPLACE of the SAME function signature — no schema/table change).
-- No data is touched; existing rentals keep their booth_number either way.
--   BEGIN;
--     -- (paste mig 144's CREATE FUNCTION book_weekly_booth_atomic body)
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Risk profile: function-body only. Same signature, same return shape, same
-- grants (CREATE OR REPLACE preserves privileges; REVOKE/GRANT re-asserted
-- below for defense-in-depth per the anon-exposure note in migs 142/149/152).
--
-- Dependencies: mig 144 (function being replaced + booth_label_start/end +
--   the same-week uniqueness index), mig 133 (market_vendors.booth_number).
-- =============================================================================
--
-- What changes (the 3-layer booth model — see fm_dashboard_tester_findings.md):
--
--   Layer 1 (off-platform placeholders): market_booth_placeholders.booth_number
--     — already excluded from auto-assign. UNCHANGED.
--   Layer 2 (on-platform vendor the manager PINNED to a booth): when the booking
--     vendor has a market_vendors.booth_number at this market, HONOR it instead
--     of auto-assigning. If that booth is already taken for THIS week (rare —
--     duplicate pins are blocked by the mig 146 trigger, and auto-assign now
--     excludes pinned booths — so this only bites legacy pre-migration rentals),
--     RAISE BOOTH_TAKEN (P0008) so the vendor gets a clear "contact your manager"
--     message instead of a silent reslot.
--   Layer 3 (new/unpinned vendor): auto-assign the smallest unused label AS
--     BEFORE, but ALSO exclude every market_vendors.booth_number at this market
--     so a new vendor never lands on a booth pinned to a layer-2 vendor.
--
-- Booth numbers are market-wide/continuous across tiers (mig 144), so honoring a
-- pinned number regardless of the booked tier is consistent; per-tier capacity
-- (v_remaining) is unchanged. book_season_atomic (mig 165) loops THIS function,
-- so the season path inherits all of the above with no separate change.

CREATE OR REPLACE FUNCTION book_weekly_booth_atomic(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_inventory_id UUID,
  p_week_start_date DATE,
  p_acceptance_id UUID
)
RETURNS TABLE (
  rental_id UUID,
  rental_price_cents INTEGER,
  rental_status TEXT,
  rental_week_start_date DATE,
  rental_booth_number TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Capacity vars (mig 142 carry-over)
  v_inventory_count INTEGER;
  v_price_cents INTEGER;
  v_placeholder_count INTEGER;
  v_taken_count INTEGER;
  v_remaining INTEGER;
  v_lock_key BIGINT;
  v_new_id UUID;
  -- Label-assignment vars (mig 144)
  v_label_start TEXT;
  v_label_end TEXT;
  v_prefix TEXT;
  v_start_num INTEGER;
  v_end_num INTEGER;
  v_total_count INTEGER;
  v_assigned_label TEXT;
  -- Layer-2: the manager's roster pin for this vendor at this market (mig 186)
  v_manager_booth TEXT;
BEGIN
  -- Advisory lock on (market, inventory, week). Transaction-scoped;
  -- auto-releases on COMMIT/ROLLBACK. Same key as mig 142.
  v_lock_key := hashtextextended(
    p_market_id::text || ':' || p_inventory_id::text || ':' || p_week_start_date::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Inventory existence + same-market check.
  SELECT mbi.count, mbi.weekly_price_cents
    INTO v_inventory_count, v_price_cents
    FROM market_booth_inventory mbi
    WHERE mbi.id = p_inventory_id
      AND mbi.market_id = p_market_id;

  IF v_inventory_count IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_NOT_FOUND' USING ERRCODE = 'P0003';
  END IF;

  -- Per-tier capacity. Placeholders + active rentals subtract from count.
  SELECT COUNT(*) INTO v_placeholder_count
    FROM market_booth_placeholders mbp
    WHERE mbp.market_id = p_market_id
      AND mbp.inventory_id = p_inventory_id;

  SELECT COUNT(*) INTO v_taken_count
    FROM weekly_booth_rentals wbr
    WHERE wbr.market_id = p_market_id
      AND wbr.inventory_id = p_inventory_id
      AND wbr.week_start_date = p_week_start_date
      AND wbr.status IN ('pending_payment', 'paid');

  v_remaining := v_inventory_count - v_placeholder_count - v_taken_count;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'OVERBOOKED' USING ERRCODE = 'P0001';
  END IF;

  -- Layer 2 vs Layer 3: does the manager already pin this vendor to a booth?
  SELECT mv.booth_number INTO v_manager_booth
    FROM market_vendors mv
    WHERE mv.market_id = p_market_id
      AND mv.vendor_profile_id = p_vendor_profile_id;

  IF v_manager_booth IS NOT NULL THEN
    -- Layer 2: honor the manager's roster assignment (market-wide label; not
    -- bound to the range or the booked tier). Fail loud if it's already taken
    -- for this week rather than silently reslotting the vendor elsewhere.
    v_assigned_label := v_manager_booth;

    IF EXISTS (
      SELECT 1 FROM weekly_booth_rentals
        WHERE market_id = p_market_id
          AND week_start_date = p_week_start_date
          AND booth_number = v_assigned_label
          AND status IN ('pending_payment', 'paid', 'completed')
    ) THEN
      RAISE EXCEPTION 'BOOTH_TAKEN' USING ERRCODE = 'P0008';
    END IF;
  ELSE
    -- Layer 3: auto-assign. Market-wide continuous numbering.
    -- Read manager's configured range; fall back to defaults when not set.
    SELECT m.booth_label_start, m.booth_label_end
      INTO v_label_start, v_label_end
      FROM markets m
      WHERE m.id = p_market_id;

    SELECT COALESCE(SUM(count), 0)::INTEGER INTO v_total_count
      FROM market_booth_inventory
      WHERE market_id = p_market_id;

    -- Defaults: prefix "", range 1..total_count.
    v_prefix := '';
    v_start_num := 1;
    v_end_num := GREATEST(v_total_count, 1);

    -- Parse manager-provided range if both columns are set. On any parse
    -- failure, silently fall back to defaults (route-layer validator
    -- should have caught bad input upstream).
    IF v_label_start IS NOT NULL AND v_label_end IS NOT NULL THEN
      DECLARE
        v_start_match TEXT[];
        v_end_match TEXT[];
        v_start_prefix TEXT;
        v_end_prefix TEXT;
        v_parsed_start INTEGER;
        v_parsed_end INTEGER;
      BEGIN
        v_start_match := regexp_match(v_label_start, '^(.*?)(\d+)$');
        v_end_match := regexp_match(v_label_end, '^(.*?)(\d+)$');

        IF v_start_match IS NOT NULL AND v_end_match IS NOT NULL THEN
          v_start_prefix := v_start_match[1];
          v_end_prefix := v_end_match[1];
          v_parsed_start := v_start_match[2]::INTEGER;
          v_parsed_end := v_end_match[2]::INTEGER;

          IF v_start_prefix = v_end_prefix AND v_parsed_end >= v_parsed_start THEN
            v_prefix := v_start_prefix;
            v_start_num := v_parsed_start;
            v_end_num := v_parsed_end;
          END IF;
        END IF;
      END;
    END IF;

    -- Pick the smallest unused label in the range. "Used" = active rentals
    -- this week (any tier) + placeholder labels (any tier) + MANAGER-PINNED
    -- booths (market_vendors.booth_number, any tier — mig 186) so a new
    -- vendor never lands on a booth reserved for a pinned layer-2 vendor.
    -- Ordered by parsed numeric suffix so 10 sorts after 2.
    SELECT v_prefix || n::TEXT INTO v_assigned_label
      FROM generate_series(v_start_num, v_end_num) AS n
      WHERE v_prefix || n::TEXT NOT IN (
        SELECT booth_number FROM weekly_booth_rentals
          WHERE market_id = p_market_id
            AND week_start_date = p_week_start_date
            AND booth_number IS NOT NULL
            AND status IN ('pending_payment', 'paid', 'completed')
        UNION
        SELECT booth_number FROM market_booth_placeholders
          WHERE market_id = p_market_id
            AND booth_number IS NOT NULL
        UNION
        SELECT booth_number FROM market_vendors
          WHERE market_id = p_market_id
            AND booth_number IS NOT NULL
      )
      ORDER BY n ASC
      LIMIT 1;

    -- If capacity says room but no label is available, the manager's declared
    -- range is too short for the inventory (+ pins). Distinct code so the
    -- route returns a clean error rather than INSERTing a NULL label.
    IF v_assigned_label IS NULL THEN
      RAISE EXCEPTION 'LABELS_EXHAUSTED' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- Insert with the assigned label. UNIQUE conflicts (same vendor + week
  -- via mig 139 constraint, OR same market+week+booth via mig 144's
  -- partial index) translate to DUPLICATE.
  BEGIN
    INSERT INTO weekly_booth_rentals (
      vendor_profile_id,
      market_id,
      week_start_date,
      inventory_id,
      price_cents,
      status,
      agreement_acceptance_id,
      booth_number
    ) VALUES (
      p_vendor_profile_id,
      p_market_id,
      p_week_start_date,
      p_inventory_id,
      v_price_cents,
      'pending_payment',
      p_acceptance_id,
      v_assigned_label
    )
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE' USING ERRCODE = 'P0002';
  END;

  RETURN QUERY
    SELECT wbr.id, wbr.price_cents, wbr.status, wbr.week_start_date, wbr.booth_number
      FROM weekly_booth_rentals wbr
      WHERE wbr.id = v_new_id;
END;
$$;

COMMENT ON FUNCTION book_weekly_booth_atomic IS
  'Race-safe weekly booth booking + booth-label assignment (mig 186: 3-layer). Layer 2 — if the booking vendor has a market_vendors.booth_number at this market, honor it (RAISE BOOTH_TAKEN P0008 if that booth is taken this week). Layer 3 — otherwise auto-assign the smallest unused label from markets.booth_label_start/end (default 1..sum(inventory.count)), excluding active rentals this week + placeholders + manager-pinned market_vendors booths. Placeholders (layer 1) already excluded. RAISES OVERBOOKED (P0001) / DUPLICATE (P0002) / INVENTORY_NOT_FOUND (P0003) / LABELS_EXHAUSTED (P0004) / BOOTH_TAKEN (P0008). Returns rental_id, price_cents, status, week_start_date, booth_number. book_season_atomic (mig 165) loops this fn, so seasons inherit the behavior.';

-- Defense-in-depth: CREATE OR REPLACE preserves grants, but re-assert the
-- anon lockdown (migs 142/149/152) so a future re-apply can't reopen it.
REVOKE EXECUTE ON FUNCTION
  book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION
  book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
