-- ============================================================================
-- ⛔ PRE-CHECK FIRST — do not paste until the read-only pre-check below has been
--    run on the SAME environment and its rows read (expected: 0 conflicts).
-- ============================================================================
-- Migration 256: booth model — same-vendor exclusion, SOFT pins that yield,
--                one booth number per season, booth-size request column
--                (OB-028 / TR-078 · owner rulings 2026-09-19 · design:
--                apps/web/.claude/booth_model_design.md BR-5/6/11 + §2 + §6-1)
-- ============================================================================
-- WHAT WAS WRONG (booth_model_review.md C1/C4/C7/§6-1):
--   C1  A vendor the manager PINNED to a booth could not book it: the booking
--       RPC (mig 186) honors the pin, then the uniqueness trigger (mig 146)
--       treats the vendor's own pin as "another on-platform vendor" — its
--       self-exclusion only works within the table the trigger fired on.
--       Every pinned vendor was locked out; since mig 255 booking is how they
--       get to sell.
--   C7  App-side twin: a manager could not pin a vendor to the booth that
--       vendor already rents (fixed in booth-conflict-checks.ts, same push).
--   C4  Pins were treated as permanent exclusions (auto-assign skipped them for
--       every week, forever) yet never counted as capacity → LABELS_EXHAUSTED
--       while the count said "room". Owner: a pin is a SOFT HOLD ("put a pin
--       in it"), never capacity; it becomes an ASSIGNMENT only once a paid week
--       backs it, and yields to a paying vendor when unpinned inventory runs out.
--   §6-1 A season buyer without a pin could receive a different booth number
--       each week (label chosen per week). Owner: "a season buyer gets to keep
--       their same booth the whole season, that is part of what they paid for."
--
-- WHAT THIS DOES (all function bodies start from the LIVE bodies — fingerprinted
-- 2026-09-19 on Dev, Staging AND Prod, all three identical to the repo text:
--   check_booth_number_uniqueness e2b105d6b3a93d8fbc205f56eed1bfb3 / 1981 (mig 146)
--   book_weekly_booth_atomic      9ddfd1a7e2b0f02da12c13f9171a56e2 / 7001 (mig 186)
--   book_season_atomic            537d395cc38248b808eb1cc181151183 / 2022 (mig 165)
--   triggers trg_mv_booth_unique / trg_placeholder_booth_unique / trg_wbr_booth_unique
--   mounted + enabled on all three):
--
--   1. market_vendors.requested_inventory_id — the vendor's booth-SIZE REQUEST
--      from the application (BR-2). Distinct from inventory_id (the manager's
--      decision at approval, BR-3). Additive, nullable.
--   2. booth_label_candidates(market) — NEW helper: the market's booth labels in
--      order (mig 144's range parse, extracted so the weekly AND season RPCs
--      share one definition).
--   3. check_booth_number_uniqueness() REPLACED:
--        (a) pins: a row never conflicts with the SAME vendor's pin (BR-11).
--            When a RENTAL fires the trigger, another vendor's pin blocks ONLY
--            if it is an ASSIGNMENT (that holder has a PAID rental under the
--            same number covering today or later). A SOFT pin does not block a
--            rental — that is how a pin yields (BR-6). Pins vs pins and
--            placeholders vs pins: unchanged (any pin blocks).
--        (b) placeholders: unchanged.
--        (c) pins/placeholders vs active rentals: excludes the same vendor's
--            own rentals when a PIN fires (C7); "current/upcoming" is now
--            week_start_date + 6 >= CURRENT_DATE (the week in progress counts —
--            mig 146 used week_start_date >= CURRENT_DATE, which let a pin be
--            moved onto a booth someone is renting THIS week).
--   4. book_weekly_booth_atomic REPLACED (DROP + CREATE: new optional
--      p_forced_label + new return column yielded_from_vendor_id):
--        own pin → honored (unchanged, BOOTH_TAKEN if that week has it);
--        forced label (season path) → used, BOOTH_TAKEN if that week has it;
--        else auto-assign: smallest label unused this week by an active
--        rental, a placeholder, or ANY pin (unchanged);
--        else NEW soft-pin fallback: smallest label pinned to another vendor
--        who has no active rental that week AND no paid current/upcoming week
--        under it → the booking takes the label for the week and returns
--        yielded_from_vendor_id (the pin itself is NOT touched here — it
--        transfers on PAYMENT in the webhook, owner 2026-09-19);
--        else LABELS_EXHAUSTED (unchanged code).
--      Capacity (placeholders + active rentals per tier per week) UNCHANGED.
--   5. book_season_atomic REPLACED (DROP + CREATE: return gains
--      yielded_from_vendor_id): picks the booth number ONCE for the whole
--      purchase — own pin; else the smallest label free in EVERY requested
--      week; else a soft pin that is soft for every requested week; else
--      SEASON_BOOK_FAILED week=<first week> reason=LABELS_EXHAUSTED — then
--      loops the weekly RPC with that label forced. All-or-nothing unchanged.
--
-- Callers (same push): api/vendor/markets/[id]/book (named params — the new
-- DEFAULT NULL arg is invisible to it), book-season via lib/markets/
-- season-booking.ts (reads columns by name; the new column is additive).
-- Pre-migration safe: neither route sends p_forced_label; both ignore the new
-- return column until the code that reads it ships (part C).
--
-- ROLLBACK (single transaction):
--   BEGIN;
--     DROP FUNCTION IF EXISTS book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date);
--     DROP FUNCTION IF EXISTS book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid, text);
--     DROP FUNCTION IF EXISTS booth_label_candidates(uuid);
--     -- re-create mig 186's book_weekly_booth_atomic (5-arg), mig 165's
--     -- book_season_atomic and mig 146's check_booth_number_uniqueness from
--     -- migrations/applied/ (bodies verified identical on all envs 2026-09-19);
--     ALTER TABLE market_vendors DROP COLUMN IF EXISTS requested_inventory_id;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   Risk: function bodies + one nullable column. No data is rewritten.
--
-- Dependencies: migs 133/145 (market_vendors.booth_number/inventory_id), 135
-- (placeholders), 139/144/193 (rentals + indexes), 146, 165, 186.
-- Prod order: 254 → 255 → 256.
--
-- ============================================================================
-- PRE-CHECK (read-only; run on the target env first; READ the rows)
-- ============================================================================
-- 1. Pins that would collide under the new rule — a pin whose number is ALSO
--    held by ANOTHER vendor's active current/upcoming rental. mig 146 blocks
--    this, so expect 0 rows; any row = pre-existing bad data → STOP and show
--    the owner before pasting.
--   SELECT mv.market_id, mv.vendor_profile_id AS pinned_vendor, mv.booth_number,
--          r.vendor_profile_id AS renting_vendor, r.week_start_date, r.status
--   FROM market_vendors mv
--   JOIN weekly_booth_rentals r
--     ON r.market_id = mv.market_id AND r.booth_number = mv.booth_number
--    AND r.vendor_profile_id <> mv.vendor_profile_id
--   WHERE mv.booth_number IS NOT NULL
--     AND r.status IN ('pending_payment','paid')
--     AND r.week_start_date + 6 >= CURRENT_DATE
--   ORDER BY mv.market_id, mv.booth_number;
-- 2. Context (how many pins / assignments exist today):
--   SELECT COUNT(*) FILTER (WHERE booth_number IS NOT NULL) AS pinned_vendors,
--          COUNT(*) FILTER (WHERE booth_number IS NOT NULL AND EXISTS (
--            SELECT 1 FROM weekly_booth_rentals r
--            WHERE r.market_id = mv.market_id AND r.vendor_profile_id = mv.vendor_profile_id
--              AND r.booth_number = mv.booth_number AND r.status = 'paid'
--              AND r.week_start_date + 6 >= CURRENT_DATE)) AS assigned_vendors
--   FROM market_vendors mv;
-- 3. The column must not exist yet (expect 0 rows):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'market_vendors' AND column_name = 'requested_inventory_id';
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. market_vendors.requested_inventory_id (BR-2)
-- ----------------------------------------------------------------------------
ALTER TABLE market_vendors
  ADD COLUMN IF NOT EXISTS requested_inventory_id UUID
    REFERENCES market_booth_inventory(id) ON DELETE SET NULL;

COMMENT ON COLUMN market_vendors.requested_inventory_id IS
  'Mig 256 (BR-2): the booth-size tier the vendor REQUESTED on their application. The manager''s decision at approval is inventory_id. NULL when the market has no priced tiers or the vendor did not ask.';

-- ----------------------------------------------------------------------------
-- 2. booth_label_candidates — shared label enumeration (mig 144 parse rule)
-- ----------------------------------------------------------------------------
-- Labels are market-wide and continuous across tiers. Default range 1..SUM(count)
-- with no prefix; a manager-declared range (markets.booth_label_start/end) with a
-- shared textual prefix + numeric suffix overrides it. Parse failure → defaults
-- (the route-layer validator catches bad input upstream). Ordered by the numeric
-- suffix so "10" sorts after "2". Returns at least one label (GREATEST(…,1)).
CREATE OR REPLACE FUNCTION booth_label_candidates(p_market_id UUID)
RETURNS TABLE (n INTEGER, label TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_label_start TEXT;
  v_label_end TEXT;
  v_prefix TEXT := '';
  v_start_num INTEGER := 1;
  v_end_num INTEGER;
  v_total_count INTEGER;
  v_start_match TEXT[];
  v_end_match TEXT[];
BEGIN
  SELECT m.booth_label_start, m.booth_label_end
    INTO v_label_start, v_label_end
    FROM markets m
    WHERE m.id = p_market_id;

  SELECT COALESCE(SUM(count), 0)::INTEGER INTO v_total_count
    FROM market_booth_inventory
    WHERE market_id = p_market_id;

  v_end_num := GREATEST(v_total_count, 1);

  IF v_label_start IS NOT NULL AND v_label_end IS NOT NULL THEN
    v_start_match := regexp_match(v_label_start, '^(.*?)(\d+)$');
    v_end_match := regexp_match(v_label_end, '^(.*?)(\d+)$');
    IF v_start_match IS NOT NULL AND v_end_match IS NOT NULL
       AND v_start_match[1] = v_end_match[1]
       AND v_end_match[2]::INTEGER >= v_start_match[2]::INTEGER THEN
      v_prefix := v_start_match[1];
      v_start_num := v_start_match[2]::INTEGER;
      v_end_num := v_end_match[2]::INTEGER;
    END IF;
  END IF;

  RETURN QUERY
    SELECT s AS n, v_prefix || s::TEXT AS label
      FROM generate_series(v_start_num, v_end_num) AS s
      ORDER BY s;
END;
$$;

COMMENT ON FUNCTION booth_label_candidates(uuid) IS
  'Mig 256: a market''s booth labels in order (mig 144 rule: default 1..SUM(market_booth_inventory.count), or the manager''s booth_label_start/end range when both parse to the same prefix + ascending numbers). Shared by book_weekly_booth_atomic and book_season_atomic. Service-role only.';

REVOKE EXECUTE ON FUNCTION booth_label_candidates(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION booth_label_candidates(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. check_booth_number_uniqueness — same-vendor exclusion + soft pins
-- ----------------------------------------------------------------------------
-- Mounted (unchanged) as BEFORE INSERT/UPDATE OF booth_number, market_id on
-- market_vendors, market_booth_placeholders, weekly_booth_rentals (mig 146).
-- Placeholders carry no vendor_profile_id, so the same-vendor exclusion applies
-- only when a pin or a rental fires.
CREATE OR REPLACE FUNCTION check_booth_number_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_table TEXT := TG_TABLE_NAME;
  v_vendor UUID;
BEGIN
  -- NULL booth_number = no assignment yet; cannot conflict.
  IF NEW.booth_number IS NULL THEN
    RETURN NEW;
  END IF;

  -- The vendor behind the firing row (NULL for placeholders).
  IF v_table IN ('market_vendors', 'weekly_booth_rentals') THEN
    v_vendor := NEW.vendor_profile_id;
  END IF;

  -- (a) Conflict with on-platform vendors' PINS.
  --     Never against the same vendor's own pin (BR-11 / OB-028).
  --     A RENTAL is blocked by another vendor's pin only when that pin is an
  --     ASSIGNMENT — the holder has a PAID rental under the same number that
  --     covers today or later. A soft pin lets the rental through (BR-6 yield;
  --     the pin transfers on payment, in the webhook).
  IF v_table = 'weekly_booth_rentals' THEN
    IF EXISTS (
      SELECT 1 FROM market_vendors mv
      WHERE mv.market_id = NEW.market_id
        AND mv.booth_number = NEW.booth_number
        AND mv.vendor_profile_id <> v_vendor
        AND EXISTS (
          SELECT 1 FROM weekly_booth_rentals r
          WHERE r.market_id = mv.market_id
            AND r.vendor_profile_id = mv.vendor_profile_id
            AND r.booth_number = mv.booth_number
            AND r.status = 'paid'
            AND r.week_start_date + 6 >= CURRENT_DATE
        )
    ) THEN
      RAISE EXCEPTION 'BOOTH_CONFLICT: booth number % is assigned to another on-platform vendor at this market (they hold a paid week under it)',
        NEW.booth_number USING ERRCODE = 'P0005';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM market_vendors
      WHERE market_id = NEW.market_id
        AND booth_number = NEW.booth_number
        AND (v_table <> 'market_vendors' OR id <> NEW.id)
        AND (v_vendor IS NULL OR vendor_profile_id <> v_vendor)
    ) THEN
      RAISE EXCEPTION 'BOOTH_CONFLICT: booth number % is already assigned to an on-platform vendor at this market',
        NEW.booth_number USING ERRCODE = 'P0005';
    END IF;
  END IF;

  -- (b) Conflict with off-platform placeholders (unchanged).
  IF EXISTS (
    SELECT 1 FROM market_booth_placeholders
    WHERE market_id = NEW.market_id
      AND booth_number = NEW.booth_number
      AND (v_table <> 'market_booth_placeholders' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'BOOTH_CONFLICT: booth number % is already assigned to an off-platform vendor placeholder at this market',
      NEW.booth_number USING ERRCODE = 'P0005';
  END IF;

  -- (c) Pins / placeholders vs ACTIVE current-or-upcoming rentals.
  --     A pin never conflicts with the same vendor's own rentals (C7: the
  --     manager pins a vendor to the booth that vendor already rents).
  --     "Current or upcoming" = the rented week has not ended (+6).
  --     Rentals firing the trigger skip this: same-week rental-vs-rental is
  --     the mig 144 partial UNIQUE index; different weeks never conflict.
  IF v_table <> 'weekly_booth_rentals' THEN
    IF EXISTS (
      SELECT 1 FROM weekly_booth_rentals
      WHERE market_id = NEW.market_id
        AND booth_number = NEW.booth_number
        AND status IN ('pending_payment', 'paid')
        AND week_start_date + 6 >= CURRENT_DATE
        AND (v_vendor IS NULL OR vendor_profile_id <> v_vendor)
    ) THEN
      RAISE EXCEPTION 'BOOTH_CONFLICT: booth number % has an active paid booking for a current/upcoming week at this market',
        NEW.booth_number USING ERRCODE = 'P0005';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_booth_number_uniqueness() IS
  'Mig 256 (was 146): cross-table booth_number uniqueness within a market, mounted BEFORE INSERT/UPDATE on market_vendors, market_booth_placeholders, weekly_booth_rentals. A row never conflicts with the SAME vendor''s pin or rentals (BR-11). A rental is blocked by another vendor''s pin only when that pin is an ASSIGNMENT (holder has a paid current/upcoming week under it); soft pins yield (BR-6). Raises BOOTH_CONFLICT (P0005).';

-- ----------------------------------------------------------------------------
-- 4. book_weekly_booth_atomic — own pin · forced label · auto · soft-pin yield
-- ----------------------------------------------------------------------------
-- Return shape and signature change → DROP the mig-186 5-arg version first.
DROP FUNCTION IF EXISTS book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid);

CREATE OR REPLACE FUNCTION book_weekly_booth_atomic(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_inventory_id UUID,
  p_week_start_date DATE,
  p_acceptance_id UUID,
  p_forced_label TEXT DEFAULT NULL     -- mig 256: season path passes its one label
)
RETURNS TABLE (
  rental_id UUID,
  rental_price_cents INTEGER,
  rental_status TEXT,
  rental_week_start_date DATE,
  rental_booth_number TEXT,
  yielded_from_vendor_id UUID          -- mig 256: another vendor's SOFT pin this booking took (NULL otherwise)
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
  v_assigned_label TEXT;
  -- Layer-2: the manager's roster pin for this vendor at this market (mig 186)
  v_manager_booth TEXT;
  -- mig 256: holder of the soft pin this booking takes, if any
  v_yielded_from UUID;
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
  -- Pins are NOT capacity (BR-6, owner 2026-09-19) — unchanged from mig 186.
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

  IF p_forced_label IS NOT NULL OR v_manager_booth IS NOT NULL THEN
    -- Forced label (season path, mig 256) wins; else the vendor's own pin
    -- (mig 186). Market-wide label; not bound to the range or the booked tier.
    -- Fail loud if it's already taken for this week rather than silently
    -- reslotting the vendor elsewhere.
    v_assigned_label := COALESCE(p_forced_label, v_manager_booth);

    IF EXISTS (
      SELECT 1 FROM weekly_booth_rentals
        WHERE market_id = p_market_id
          AND week_start_date = p_week_start_date
          AND booth_number = v_assigned_label
          AND status IN ('pending_payment', 'paid', 'completed')
    ) THEN
      RAISE EXCEPTION 'BOOTH_TAKEN' USING ERRCODE = 'P0008';
    END IF;

    -- A forced label that is another vendor's SOFT pin is a yield (the season
    -- function already verified it is soft for every requested week).
    IF p_forced_label IS NOT NULL AND p_forced_label IS DISTINCT FROM v_manager_booth THEN
      SELECT mv.vendor_profile_id INTO v_yielded_from
        FROM market_vendors mv
        WHERE mv.market_id = p_market_id
          AND mv.booth_number = p_forced_label
          AND mv.vendor_profile_id <> p_vendor_profile_id
        LIMIT 1;
    END IF;
  ELSE
    -- Layer 3: auto-assign (mig 186 rule). "Used" = active rentals this week
    -- (any tier) + placeholder labels (any tier) + ANY pinned booth
    -- (market_vendors.booth_number, any tier) so a new vendor never lands on a
    -- booth held for a pinned vendor while an unpinned one is free.
    SELECT c.label INTO v_assigned_label
      FROM booth_label_candidates(p_market_id) c
      WHERE c.label NOT IN (
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
      ORDER BY c.n ASC
      LIMIT 1;

    -- mig 256 (BR-6): no unpinned label left → take the smallest SOFT pin:
    -- pinned to another vendor who has no active rental this week under it
    -- and no PAID current/upcoming week under it (i.e. not an assignment).
    -- The pin is not modified here; it transfers on payment (webhook).
    IF v_assigned_label IS NULL THEN
      SELECT c.label, mv.vendor_profile_id
        INTO v_assigned_label, v_yielded_from
        FROM booth_label_candidates(p_market_id) c
        JOIN market_vendors mv
          ON mv.market_id = p_market_id
         AND mv.booth_number = c.label
         AND mv.vendor_profile_id <> p_vendor_profile_id
        WHERE NOT EXISTS (
            SELECT 1 FROM market_booth_placeholders mbp
            WHERE mbp.market_id = p_market_id AND mbp.booth_number = c.label
          )
          AND NOT EXISTS (
            SELECT 1 FROM weekly_booth_rentals r
            WHERE r.market_id = p_market_id
              AND r.week_start_date = p_week_start_date
              AND r.booth_number = c.label
              AND r.status IN ('pending_payment', 'paid', 'completed')
          )
          AND NOT EXISTS (
            SELECT 1 FROM weekly_booth_rentals r
            WHERE r.market_id = p_market_id
              AND r.vendor_profile_id = mv.vendor_profile_id
              AND r.booth_number = c.label
              AND r.status = 'paid'
              AND r.week_start_date + 6 >= CURRENT_DATE
          )
        ORDER BY c.n ASC
        LIMIT 1;
    END IF;

    -- Capacity says room but no label at all (every label is a placeholder, an
    -- assignment, or booked this week): the manager's range is too short.
    IF v_assigned_label IS NULL THEN
      RAISE EXCEPTION 'LABELS_EXHAUSTED' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- Insert with the assigned label. UNIQUE conflicts (same vendor + week via
  -- the mig 193 partial index, OR same market+week+booth via mig 144's partial
  -- index) translate to DUPLICATE. The mig 256 trigger lets a soft-pinned
  -- label through and blocks an assigned one (P0005 propagates to the route).
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
    SELECT wbr.id, wbr.price_cents, wbr.status, wbr.week_start_date, wbr.booth_number, v_yielded_from
      FROM weekly_booth_rentals wbr
      WHERE wbr.id = v_new_id;
END;
$$;

COMMENT ON FUNCTION book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid, text) IS
  'Mig 256 (was 186): race-safe weekly booth booking + label assignment. Own pin honored (BOOTH_TAKEN P0008 if that week has it); p_forced_label (season path) used the same way; else smallest label unused this week by an active rental, a placeholder or ANY pin; else the smallest SOFT pin (holder has no active rental this week and no paid current/upcoming week under it) — returned as yielded_from_vendor_id, pin transfers on payment; else LABELS_EXHAUSTED (P0004). Capacity = placeholders + active rentals per tier per week (pins are not capacity). RAISES OVERBOOKED P0001 / DUPLICATE P0002 / INVENTORY_NOT_FOUND P0003. Service-role only.';

REVOKE EXECUTE ON FUNCTION book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. book_season_atomic — ONE booth number for the whole purchase (§6-1)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date);

CREATE OR REPLACE FUNCTION book_season_atomic(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_inventory_id UUID,
  p_acceptance_id UUID,
  p_season_id UUID,             -- nullable: NULL for ad-hoc partial
  p_kind TEXT,                  -- 'season' | 'partial'
  p_week_start_dates DATE[],    -- Sundays (from season-weeks enumeration)
  p_purchase_date DATE
)
RETURNS TABLE (
  group_id UUID,
  rental_id UUID,
  rental_week_start_date DATE,
  rental_price_cents INTEGER,
  rental_booth_number TEXT,
  yielded_from_vendor_id UUID   -- mig 256: same value on every row
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
  v_week DATE;
  v_rental_id UUID;
  v_price INTEGER;
  v_wsd DATE;
  v_booth TEXT;
  v_label TEXT;
  v_yield UUID;
  v_row_yield UUID;
BEGIN
  IF array_length(p_week_start_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_WEEKS' USING ERRCODE = 'P0006';
  END IF;

  IF p_kind NOT IN ('season', 'partial') THEN
    RAISE EXCEPTION 'INVALID_KIND' USING ERRCODE = 'P0007';
  END IF;

  -- 0. mig 256: choose the booth number ONCE for every requested week.
  --    (a) the vendor's own pin;
  SELECT mv.booth_number INTO v_label
    FROM market_vendors mv
    WHERE mv.market_id = p_market_id
      AND mv.vendor_profile_id = p_vendor_profile_id;

  --    (b) else the smallest label free in EVERY requested week: not a
  --        placeholder, not any other vendor's pin, not booked in any week;
  IF v_label IS NULL THEN
    SELECT c.label INTO v_label
      FROM booth_label_candidates(p_market_id) c
      WHERE NOT EXISTS (
          SELECT 1 FROM market_booth_placeholders mbp
          WHERE mbp.market_id = p_market_id AND mbp.booth_number = c.label
        )
        AND NOT EXISTS (
          SELECT 1 FROM market_vendors mv
          WHERE mv.market_id = p_market_id AND mv.booth_number = c.label
        )
        AND NOT EXISTS (
          SELECT 1 FROM weekly_booth_rentals r
          WHERE r.market_id = p_market_id
            AND r.booth_number = c.label
            AND r.week_start_date = ANY (p_week_start_dates)
            AND r.status IN ('pending_payment', 'paid', 'completed')
        )
      ORDER BY c.n ASC
      LIMIT 1;
  END IF;

  --    (c) else the smallest SOFT pin that is soft for every requested week:
  --        another vendor's pin, no booking under it in any requested week,
  --        holder has no paid current/upcoming week under it (BR-6);
  IF v_label IS NULL THEN
    SELECT c.label, mv.vendor_profile_id INTO v_label, v_yield
      FROM booth_label_candidates(p_market_id) c
      JOIN market_vendors mv
        ON mv.market_id = p_market_id
       AND mv.booth_number = c.label
       AND mv.vendor_profile_id <> p_vendor_profile_id
      WHERE NOT EXISTS (
          SELECT 1 FROM market_booth_placeholders mbp
          WHERE mbp.market_id = p_market_id AND mbp.booth_number = c.label
        )
        AND NOT EXISTS (
          SELECT 1 FROM weekly_booth_rentals r
          WHERE r.market_id = p_market_id
            AND r.booth_number = c.label
            AND r.week_start_date = ANY (p_week_start_dates)
            AND r.status IN ('pending_payment', 'paid', 'completed')
        )
        AND NOT EXISTS (
          SELECT 1 FROM weekly_booth_rentals r
          WHERE r.market_id = p_market_id
            AND r.vendor_profile_id = mv.vendor_profile_id
            AND r.booth_number = c.label
            AND r.status = 'paid'
            AND r.week_start_date + 6 >= CURRENT_DATE
        )
      ORDER BY c.n ASC
      LIMIT 1;
  END IF;

  --    (d) else no single booth is free for the whole purchase.
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'SEASON_BOOK_FAILED week=% reason=LABELS_EXHAUSTED',
      to_char(p_week_start_dates[1], 'YYYY-MM-DD');
  END IF;

  -- 1. Create the group (pending_payment). Totals are placeholders — the caller
  --    fills them from the per-week prices via pricing.ts. The same-market
  --    integrity trigger (mig 164) validates inventory_id + season_id ∈ market.
  INSERT INTO booth_booking_groups (
    vendor_profile_id, market_id, inventory_id, season_id, kind,
    week_count, total_vendor_cents, total_manager_cents, purchase_date, status
  ) VALUES (
    p_vendor_profile_id, p_market_id, p_inventory_id, p_season_id, p_kind,
    array_length(p_week_start_dates, 1), 0, 0, p_purchase_date, 'pending_payment'
  )
  RETURNING id INTO v_group_id;

  -- 2. Book each week via the weekly RPC with the ONE label forced, in THIS
  --    transaction. Annotate any failure with the week, then re-RAISE → whole
  --    transaction rolls back (all-or-nothing, mig 165).
  FOREACH v_week IN ARRAY p_week_start_dates LOOP
    BEGIN
      SELECT r.rental_id, r.rental_price_cents, r.rental_week_start_date, r.rental_booth_number, r.yielded_from_vendor_id
        INTO v_rental_id, v_price, v_wsd, v_booth, v_row_yield
        FROM book_weekly_booth_atomic(
          p_vendor_profile_id, p_market_id, p_inventory_id, v_week, p_acceptance_id, v_label
        ) AS r;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'SEASON_BOOK_FAILED week=% reason=%',
        to_char(v_week, 'YYYY-MM-DD'), SQLERRM;
    END;

    -- Link the freshly-created rental to its group.
    UPDATE weekly_booth_rentals SET group_id = v_group_id WHERE id = v_rental_id;

    group_id := v_group_id;
    rental_id := v_rental_id;
    rental_week_start_date := v_wsd;
    rental_price_cents := v_price;
    rental_booth_number := v_booth;
    yielded_from_vendor_id := COALESCE(v_yield, v_row_yield);
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) IS
  'Mig 256 (was 165): all-or-nothing season/partial booking with ONE booth number for the whole purchase — the vendor''s pin, else the smallest label free in every requested week, else a soft pin soft for every week (yielded_from_vendor_id), else SEASON_BOOK_FAILED week=<first> reason=LABELS_EXHAUSTED. Inserts the booth_booking_groups row then loops book_weekly_booth_atomic(…, p_forced_label) per week in one transaction. Caller: /api/vendor/markets/[id]/book-season via service client.';

REVOKE EXECUTE ON FUNCTION book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- POST-CHECK (read-only; run after applying; paste the results back)
-- ============================================================================
-- 1. Bodies + grants (expect anon/auth = false and svc = true on the three
--    callable functions; the trigger function keeps its default grants):
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--          md5(p.prosrc) AS body_md5, length(p.prosrc) AS body_len,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('check_booth_number_uniqueness','book_weekly_booth_atomic',
--                       'book_season_atomic','booth_label_candidates')
--   ORDER BY p.proname;
--   -- expect EXACTLY one row per name (the old 5-arg weekly / old season are gone).
-- 2. COMMENT carries "Mig 256" on all four:
--   SELECT p.proname, obj_description(p.oid, 'pg_proc') LIKE '%Mig 256%' AS has_256
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('check_booth_number_uniqueness','book_weekly_booth_atomic',
--                       'book_season_atomic','booth_label_candidates');
-- 3. Column present:
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'market_vendors' AND column_name = 'requested_inventory_id';
-- 4. Triggers still mounted + enabled (expect 3 rows, tgenabled = 'O'):
--   SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger
--   WHERE tgname IN ('trg_mv_booth_unique','trg_placeholder_booth_unique','trg_wbr_booth_unique');
-- ============================================================================
