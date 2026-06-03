-- Migration 144: Booth auto-assignment + same-week booth-number uniqueness
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction:
--
--   BEGIN;
--   DROP INDEX IF EXISTS idx_wbr_market_week_booth;
--   ALTER TABLE markets
--     DROP COLUMN IF EXISTS booth_label_end,
--     DROP COLUMN IF EXISTS booth_label_start;
--   -- Restore the prior RPC body by re-applying migration 142.
--   COMMIT;
--   NOTIFY pgrst, 'reload schema';
--
-- Risk profile:
--   PRE-application or DEV-only: zero data loss; safe.
--   POST-application: ROLLBACK leaves any rentals booked under this
--     migration with their auto-assigned booth_number intact (the column
--     existed pre-migration as nullable TEXT). The DROP COLUMN calls
--     drop the market-level label range columns — no rental data lost.
--     The DROP INDEX removes the same-week booth-number uniqueness
--     guarantee, so a manual edit could re-introduce same-week
--     duplicates after rollback. Coordinate with the user before
--     running on Prod.
--
-- Dependencies:
--   - mig 134 (market_booth_inventory) — count source
--   - mig 135 (market_booth_placeholders) — label-collision source
--   - mig 139 (weekly_booth_rentals) — destination table
--   - mig 142 (book_weekly_booth_atomic) — function being replaced
-- =============================================================================
--
-- What this migration does:
--
-- 1. Adds two new nullable TEXT columns to `markets`:
--      booth_label_start, booth_label_end
--    These let the market manager declare their booth-numbering convention
--    once (during onboarding); the auto-assignment RPC reads them at
--    booking time and generates the full sequence. Both NULL = system
--    defaults to "1"..."<sum of inventory.count>" (prefix "").
--
-- 2. Adds a partial UNIQUE index on `weekly_booth_rentals`:
--      (market_id, week_start_date, booth_number) WHERE
--        booth_number IS NOT NULL AND status <> 'cancelled'
--    Prevents same-week booth-number duplication via both auto-assignment
--    and manual manager override. Excludes NULL labels (pre-this-migration
--    legacy rows) and 'cancelled' rows (so freed labels can be reused).
--    Resolves backlog item P1.5 / N6a.
--
-- 3. Replaces `book_weekly_booth_atomic` (mig 142) via CREATE OR REPLACE
--    FUNCTION with a new body that picks the smallest unused booth label
--    inside the existing pg_advisory_xact_lock — no new race surface.
--
-- Auto-assignment logic (continuous numbering across size tiers):
--
--   - Read markets.booth_label_start, booth_label_end. If both set, parse:
--     prefix = leading non-digit chars; numeric suffix = trailing integer.
--     Prefixes must match between start and end; otherwise fall back to
--     defaults (defense-in-depth — the route-layer validator should have
--     caught this earlier).
--   - If either is NULL OR parsing fails: default to prefix="", start=1,
--     end = sum(market_booth_inventory.count) for this market.
--   - Generate the candidate label set: prefix || generate_series(start, end).
--   - Subtract labels already in use this week + placeholder labels for
--     this market. Pick the smallest-by-numeric-suffix candidate.
--   - If no label remains while v_remaining > 0, RAISE LABELS_EXHAUSTED
--     (P0004) — the manager's declared range is shorter than the
--     configured inventory. Route maps this to a 500-style error so
--     the manager sees a clean message in error_logs.
--
-- Why label-blind capacity + label-aware selection: the capacity check
-- (v_remaining) is by COUNT — works correctly regardless of label
-- conventions. The label selection only matters for assigning a stable
-- identifier per booth. They're decoupled by design.
--
-- Same-market integrity, idempotency, and duplicate handling are
-- unchanged from mig 142.

-- ----------------------------------------------------------------------------
-- 1. New columns on markets
-- ----------------------------------------------------------------------------

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS booth_label_start TEXT,
  ADD COLUMN IF NOT EXISTS booth_label_end TEXT;

COMMENT ON COLUMN markets.booth_label_start IS
  'Optional first booth label in the manager''s numbering convention. Examples: "1", "A1", "Booth-1". When set with booth_label_end (matching prefix), the auto-assignment RPC generates the full sequence by incrementing the trailing integer from booth_label_start through booth_label_end. NULL = defaults to "1"..."<sum of inventory.count>".';

COMMENT ON COLUMN markets.booth_label_end IS
  'Optional last booth label, same prefix as booth_label_start. The route-layer validator (POST /api/market-manager/[marketId]/booth-labels) enforces that the range count equals sum(market_booth_inventory.count); the RPC falls back to defaults if either column is NULL or parsing fails.';

-- ----------------------------------------------------------------------------
-- 2. Partial UNIQUE index for same-week booth-number uniqueness
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_wbr_market_week_booth
  ON weekly_booth_rentals (market_id, week_start_date, booth_number)
  WHERE booth_number IS NOT NULL AND status <> 'cancelled';

COMMENT ON INDEX idx_wbr_market_week_booth IS
  'Same-week booth-number uniqueness within a market. Excludes NULL (pre-mig-144 legacy rows) and cancelled rows (so freed labels can be reused). Catches both auto-assignment races (defense in depth — the RPC already prevents them via advisory lock) and manual manager edit conflicts (PATCH route maps 23505 to 409).';

-- ----------------------------------------------------------------------------
-- 3. Replace book_weekly_booth_atomic with auto-assigning body
-- ----------------------------------------------------------------------------
--
-- Return shape adds rental_booth_number (5th column). Callers reading
-- 4 columns continue to work (extra column ignored); the book/route.ts
-- update in this PR adds the field to the TS type cast for clarity.
--
-- Postgres does NOT allow CREATE OR REPLACE FUNCTION to change a return
-- type — the RETURNS TABLE column list IS the return type. We DROP the
-- old function first, then CREATE the new one. The migration runs in a
-- single transaction so there's no window where the function is missing
-- (Postgres will raise "cannot change return type" if we omit the DROP).

DROP FUNCTION IF EXISTS book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid);

CREATE FUNCTION book_weekly_booth_atomic(
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
  -- Label-assignment vars (new in mig 144)
  v_label_start TEXT;
  v_label_end TEXT;
  v_prefix TEXT;
  v_start_num INTEGER;
  v_end_num INTEGER;
  v_total_count INTEGER;
  v_assigned_label TEXT;
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

  -- Label sequence: market-wide continuous numbering.
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
  -- this week at this market (any tier) + placeholder labels at this
  -- market (any tier — continuous numbering means cross-tier collision
  -- is possible). Ordered by parsed numeric suffix so 10 sorts after 2.
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
    )
    ORDER BY n ASC
    LIMIT 1;

  -- If capacity says room but no label is available, the manager's
  -- declared range is too short for the inventory configured. Raise
  -- with a distinct code so the route returns a clean error rather
  -- than INSERTing a NULL label.
  IF v_assigned_label IS NULL THEN
    RAISE EXCEPTION 'LABELS_EXHAUSTED' USING ERRCODE = 'P0004';
  END IF;

  -- Insert with the assigned label. UNIQUE conflicts (same vendor + week
  -- via mig 139 constraint, OR same market+week+booth via mig 144's
  -- partial index) translate to DUPLICATE — the partial index race is
  -- already prevented by the advisory lock but defense-in-depth.
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
  'Race-safe weekly booth booking + auto-assigned booth label. Replaces mig 142 atomically. Acquires pg_advisory_xact_lock on (market, inventory, week), checks per-tier capacity (count - placeholders - active rentals), then picks the smallest-suffix unused booth label from the manager-declared range markets.booth_label_start/end (defaults to 1..<sum of inventory.count> with empty prefix when not set), excluding labels in active rentals for this week + placeholders for this market. RAISES OVERBOOKED (P0001) / DUPLICATE (P0002) / INVENTORY_NOT_FOUND (P0003) / LABELS_EXHAUSTED (P0004). Returns 5 columns: rental_id, rental_price_cents, rental_status, rental_week_start_date, rental_booth_number.';

NOTIFY pgrst, 'reload schema';
