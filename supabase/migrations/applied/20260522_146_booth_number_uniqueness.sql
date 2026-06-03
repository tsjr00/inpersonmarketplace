-- Migration 146: Booth number uniqueness across all 3 occupant tables
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_mv_booth_unique ON market_vendors;
--   DROP TRIGGER IF EXISTS trg_placeholder_booth_unique ON market_booth_placeholders;
--   DROP TRIGGER IF EXISTS trg_wbr_booth_unique ON weekly_booth_rentals;
--   DROP FUNCTION IF EXISTS check_booth_number_uniqueness();
--   -- Restore mig 144 RPC body (omit the market_vendors UNION clause)
--   -- See mig 144 lines 246-260 for original SELECT.
-- COMMIT;
--
-- Pre-application risk:
--   None on empty data. On already-conflicting data (which Session 84
--   manager testing surfaced), pre-existing duplicates persist as-is —
--   triggers only block NEW inserts/updates. Manager must resolve
--   duplicates manually (delete one of the conflicting rows or change
--   its booth_number) before edits to either side will save.
--
-- Dependencies:
--   - mig 001 (market_vendors)
--   - mig 135 (market_booth_placeholders)
--   - mig 139 (weekly_booth_rentals)
--   - mig 144 (book_weekly_booth_atomic — replaced here with vendor-aware version)
-- =============================================================================
--
-- What this migration does:
--
-- 1. New function `check_booth_number_uniqueness()` — BEFORE INSERT/UPDATE
--    trigger that checks for booth_number conflicts across all 3 tables
--    (market_vendors, market_booth_placeholders, weekly_booth_rentals)
--    within the same market. Mounted on each of the 3 tables.
--
--    Conflict logic:
--      - market_vendors / placeholders are WEEK-AGNOSTIC: they conflict
--        with each other AND with any current-or-future active rental
--        at the same booth.
--      - weekly_booth_rentals are WEEK-SPECIFIC: they conflict with any
--        market_vendor or placeholder at the same booth. Same-week
--        rental-vs-rental duplication is already covered by the partial
--        UNIQUE index from mig 144, so the trigger doesn't repeat that
--        check.
--
--    Self-exclusion via `id <> NEW.id` when checking the same table the
--    trigger fired on (so updating an existing row doesn't conflict
--    with itself).
--
-- 2. Updated `book_weekly_booth_atomic` RPC (CREATE OR REPLACE — return
--    shape unchanged from mig 144 so no DROP required) — auto-assignment
--    now ALSO excludes booth_numbers in use by market_vendors. Previously
--    the RPC excluded placeholders + active rentals but not on-platform
--    vendors, so auto-assignment could pick booth "5" even after the
--    manager had manually assigned vendor X to booth "5". With this
--    update + the trigger defense-in-depth, that's now impossible.
--
-- Why this is two layers (trigger + RPC update):
--   - The trigger is the canonical correctness gate; any insert from
--     any code path is checked.
--   - The RPC update is a performance/UX optimization: it picks the
--     CORRECT label up front so we don't waste a label-selection cycle
--     getting LABELS_EXHAUSTED (the trigger would catch the dup at
--     INSERT time, but the RPC would have already picked a doomed label).

-- ----------------------------------------------------------------------------
-- 1. Cross-table uniqueness trigger function
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_booth_number_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_table TEXT := TG_TABLE_NAME;
BEGIN
  -- NULL booth_number = no assignment yet; cannot conflict.
  IF NEW.booth_number IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) Conflict with on-platform vendors.
  IF EXISTS (
    SELECT 1 FROM market_vendors
    WHERE market_id = NEW.market_id
      AND booth_number = NEW.booth_number
      AND (v_table <> 'market_vendors' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'BOOTH_CONFLICT: booth number % is already assigned to an on-platform vendor at this market',
      NEW.booth_number USING ERRCODE = 'P0005';
  END IF;

  -- (b) Conflict with off-platform placeholders.
  IF EXISTS (
    SELECT 1 FROM market_booth_placeholders
    WHERE market_id = NEW.market_id
      AND booth_number = NEW.booth_number
      AND (v_table <> 'market_booth_placeholders' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'BOOTH_CONFLICT: booth number % is already assigned to an off-platform vendor placeholder at this market',
      NEW.booth_number USING ERRCODE = 'P0005';
  END IF;

  -- (c) Conflict with active weekly rentals.
  -- market_vendors + placeholders are week-agnostic; they conflict with
  -- ANY current-or-future active rental at this booth. weekly_booth_rentals
  -- firing the trigger doesn't need this check — same-week rental-vs-rental
  -- dup is handled by the partial UNIQUE index (mig 144), and cross-week
  -- rentals are not in conflict with each other.
  IF v_table <> 'weekly_booth_rentals' THEN
    IF EXISTS (
      SELECT 1 FROM weekly_booth_rentals
      WHERE market_id = NEW.market_id
        AND booth_number = NEW.booth_number
        AND status IN ('pending_payment', 'paid')
        AND week_start_date >= CURRENT_DATE
    ) THEN
      RAISE EXCEPTION 'BOOTH_CONFLICT: booth number % has an active paid booking for a current/upcoming week at this market',
        NEW.booth_number USING ERRCODE = 'P0005';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_booth_number_uniqueness() IS
  'Mig 146: cross-table booth_number uniqueness within a market. Mounted as BEFORE INSERT/UPDATE trigger on market_vendors, market_booth_placeholders, and weekly_booth_rentals. Raises BOOTH_CONFLICT (P0005) with a description of the conflicting source.';

-- ----------------------------------------------------------------------------
-- 2. Mount triggers on the three tables
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_mv_booth_unique ON market_vendors;
CREATE TRIGGER trg_mv_booth_unique
  BEFORE INSERT OR UPDATE OF booth_number, market_id
  ON market_vendors
  FOR EACH ROW
  EXECUTE FUNCTION check_booth_number_uniqueness();

DROP TRIGGER IF EXISTS trg_placeholder_booth_unique ON market_booth_placeholders;
CREATE TRIGGER trg_placeholder_booth_unique
  BEFORE INSERT OR UPDATE OF booth_number, market_id
  ON market_booth_placeholders
  FOR EACH ROW
  EXECUTE FUNCTION check_booth_number_uniqueness();

DROP TRIGGER IF EXISTS trg_wbr_booth_unique ON weekly_booth_rentals;
CREATE TRIGGER trg_wbr_booth_unique
  BEFORE INSERT OR UPDATE OF booth_number, market_id
  ON weekly_booth_rentals
  FOR EACH ROW
  EXECUTE FUNCTION check_booth_number_uniqueness();

-- ----------------------------------------------------------------------------
-- 3. Update book_weekly_booth_atomic to exclude vendor booth_numbers
-- ----------------------------------------------------------------------------
-- Return shape is unchanged from mig 144 (same 5 columns), so CREATE OR
-- REPLACE works — no DROP needed. The only body change is adding the
-- third UNION arm: `SELECT booth_number FROM market_vendors WHERE ...`.

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
  v_inventory_count INTEGER;
  v_price_cents INTEGER;
  v_placeholder_count INTEGER;
  v_taken_count INTEGER;
  v_remaining INTEGER;
  v_lock_key BIGINT;
  v_new_id UUID;
  v_label_start TEXT;
  v_label_end TEXT;
  v_prefix TEXT;
  v_start_num INTEGER;
  v_end_num INTEGER;
  v_total_count INTEGER;
  v_assigned_label TEXT;
BEGIN
  v_lock_key := hashtextextended(
    p_market_id::text || ':' || p_inventory_id::text || ':' || p_week_start_date::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT mbi.count, mbi.weekly_price_cents
    INTO v_inventory_count, v_price_cents
    FROM market_booth_inventory mbi
    WHERE mbi.id = p_inventory_id
      AND mbi.market_id = p_market_id;

  IF v_inventory_count IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_NOT_FOUND' USING ERRCODE = 'P0003';
  END IF;

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

  SELECT m.booth_label_start, m.booth_label_end
    INTO v_label_start, v_label_end
    FROM markets m
    WHERE m.id = p_market_id;

  SELECT COALESCE(SUM(count), 0)::INTEGER INTO v_total_count
    FROM market_booth_inventory
    WHERE market_id = p_market_id;

  v_prefix := '';
  v_start_num := 1;
  v_end_num := GREATEST(v_total_count, 1);

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

  -- Mig 146: now also excludes booth_numbers in use by market_vendors.
  -- The trigger would catch a conflict at INSERT time, but doing it
  -- here saves a wasted RPC cycle (the trigger raises after the RPC
  -- has chosen a doomed label).
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

  IF v_assigned_label IS NULL THEN
    RAISE EXCEPTION 'LABELS_EXHAUSTED' USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO weekly_booth_rentals (
    vendor_profile_id,
    market_id,
    inventory_id,
    week_start_date,
    booth_number,
    price_cents,
    status,
    agreement_acceptance_id,
    booked_at
  ) VALUES (
    p_vendor_profile_id,
    p_market_id,
    p_inventory_id,
    p_week_start_date,
    v_assigned_label,
    v_price_cents,
    'pending_payment',
    p_acceptance_id,
    NOW()
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY
    SELECT wbr.id, wbr.price_cents, wbr.status, wbr.week_start_date, wbr.booth_number
      FROM weekly_booth_rentals wbr
      WHERE wbr.id = v_new_id;
EXCEPTION
  WHEN unique_violation THEN
    -- vendor_profile_id+market_id+week_start_date UNIQUE
    RAISE EXCEPTION 'DUPLICATE' USING ERRCODE = 'P0002';
END;
$$;

NOTIFY pgrst, 'reload schema';
