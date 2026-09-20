-- ============================================================================
-- ⛔ PRE-CHECK FIRST — run the read-only pre-check below on the SAME environment
--    and read the rows before pasting. Expected: the 4 new columns ABSENT, the
--    4 function fingerprints EQUAL to the mig-256 values listed there.
--    Prod order: 252 → 253 → 254 → 255 → 256 → 257 → 258 (256 must precede).
-- ============================================================================
-- Migration 258: booth numbering — numbers belong to sizes (Option U, owner
--                rulings 2026-09-20 · design apps/web/.claude/booth_numbering_design.md
--                N-1…N-10)
-- ============================================================================
-- WHAT WAS WRONG (booth_numbering_review.md F0)
--   Booth labels were ONE flat range for the whole market
--   (markets.booth_label_start/end, mig 144) while size tiers were only COUNTS.
--   Auto-assign took the smallest free label for ANY size, so a Large booking
--   could land on #1; nothing could answer "which booths are Large?"; pins typed
--   without a size produced the grid's "N occupants without a size tier".
--
-- WHAT THIS DOES
--   (1) market_booth_inventory gains its own labels per tier: a RANGE
--       (label_prefix + label_start…label_end, e.g. "A" 1…4 → A1…A4) OR an
--       explicit LIST (labels TEXT[], e.g. {"Pavilion","Corner"}). Exactly one
--       shape. `count` is DERIVED from the labels by the trigger.
--   (2) markets.booth_numbering_scheme: 'lettered' (new markets — range shape
--       only, letter prefix required) | 'existing' (a market keeping the labels
--       it already paints — prefix optional, list allowed). NULL until answered;
--       tiers cannot receive labels until it is.
--   (3) Trigger enforce_booth_tier_labels: shape · scheme · derived count ·
--       no label in two tiers of one market · changing labels never orphans an
--       occupied label (placeholder any week, active current/upcoming booking,
--       any pin) — the manager frees the slot first.
--   (4) booth_tier_labels(tier) NEW · booth_label_candidates(market, tier) —
--       2-arg replaces the 1-arg (per-tier labels; no tier → every tier's labels
--       for the grid) · booth_tier_for_label(market, label) NEW.
--   (5) book_weekly_booth_atomic / book_season_atomic: candidates are the BOOKED
--       tier's labels; a pin/forced label outside the booked tier raises
--       TIER_MISMATCH. A tier with no labels yet has no candidates →
--       LABELS_EXHAUSTED ("this size has no booth numbers yet"). Bodies are
--       otherwise byte-for-byte mig 256 (DROP + CREATE, same signatures).
--   NOT changed: check_booth_number_uniqueness (mig 256), pins/soft holds (BR-5/6),
--   freeze (BR-7), credits (257). markets.booth_label_start/end are no longer
--   read — left in place for a later housekeeping migration.
--
-- TRANSITION (owner): Dev/Staging tiers are test data → after this runs every
--   tier has NO labels and is not bookable until the manager answers the scheme
--   question and enters each tier's numbers in Booth inventory. No backfill.
--
-- ERROR CODES (new): P0009 TIER_LABELS_SHAPE · P0010 TIER_LABEL_OVERLAP ·
--   P0011 TIER_LABEL_OCCUPIED · P0012 TIER_MISMATCH · P0013 TIER_LETTER_REQUIRED ·
--   P0014 SCHEME_REQUIRED. Existing: P0001 OVERBOOKED · P0002 DUPLICATE ·
--   P0003 INVENTORY_NOT_FOUND · P0004 LABELS_EXHAUSTED · P0005 BOOTH_CONFLICT ·
--   P0008 BOOTH_TAKEN.
--
-- ROLLBACK (single transaction; safe only while no tier has labels):
--   BEGIN;
--     DROP TRIGGER IF EXISTS trg_enforce_booth_tier_labels ON market_booth_inventory;
--     DROP FUNCTION IF EXISTS enforce_booth_tier_labels();
--     DROP FUNCTION IF EXISTS booth_tier_for_label(uuid, text);
--     DROP FUNCTION IF EXISTS booth_label_candidates(uuid, uuid);
--     DROP FUNCTION IF EXISTS booth_tier_labels(uuid);
--     -- then re-run mig 256 sections 2, 4, 5 (booth_label_candidates(uuid),
--     -- book_weekly_booth_atomic, book_season_atomic) verbatim;
--     ALTER TABLE market_booth_inventory DROP COLUMN IF EXISTS label_prefix, DROP COLUMN IF EXISTS label_start,
--       DROP COLUMN IF EXISTS label_end, DROP COLUMN IF EXISTS labels;
--     ALTER TABLE markets DROP COLUMN IF EXISTS booth_numbering_scheme;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Dependencies: migs 135 (inventory), 144 (label parse rule), 145 (tier on pins/placeholders),
--   256 (function bodies this replaces, uniqueness trigger), 257 (untouched).
--
-- ============================================================================
-- PRE-CHECK (read-only; run on the target env first)
-- ============================================================================
-- 1. New columns must not exist yet (expect 0 rows):
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE (table_name = 'market_booth_inventory' AND column_name IN ('label_prefix','label_start','label_end','labels'))
--      OR (table_name = 'markets' AND column_name = 'booth_numbering_scheme');
-- 2. Live bodies must be the mig-256 ones (expect exactly these):
--      book_weekly_booth_atomic   b84e54198c38fa91f0bfda4fb4a91dfb  7391
--      book_season_atomic         b34c4fb3ad2271cdb12d6561e84b7d54  5063
--      booth_label_candidates     01a78c56385e91142be482a6ec2e3605  1206
--      check_booth_number_uniqueness 90ffe70791ccca424c9383ceb7a77988 3557
--   SELECT p.proname, md5(p.prosrc), length(p.prosrc) FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--     AND p.proname IN ('book_weekly_booth_atomic','book_season_atomic','booth_label_candidates','check_booth_number_uniqueness')
--   ORDER BY 1;
-- 3. Awareness — tiers that will be unbookable until labelled (any number is fine):
--   SELECT m.name, mbi.size_label, mbi.count FROM market_booth_inventory mbi JOIN markets m ON m.id = mbi.market_id ORDER BY 1, 2;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------
ALTER TABLE market_booth_inventory
  ADD COLUMN IF NOT EXISTS label_prefix TEXT NULL,
  ADD COLUMN IF NOT EXISTS label_start  INTEGER NULL,
  ADD COLUMN IF NOT EXISTS label_end    INTEGER NULL,
  ADD COLUMN IF NOT EXISTS labels       TEXT[] NULL;

COMMENT ON COLUMN market_booth_inventory.label_prefix IS
  'Mig 258 (N-10): RANGE shape — text before the number ("A" → A1…A4; "" → 1…4). Set together with label_start/label_end; NULL when the tier uses the LIST shape or has no labels yet.';
COMMENT ON COLUMN market_booth_inventory.label_start IS
  'Mig 258: RANGE shape — first number (inclusive).';
COMMENT ON COLUMN market_booth_inventory.label_end IS
  'Mig 258: RANGE shape — last number (inclusive). count = label_end - label_start + 1 (derived by trigger).';
COMMENT ON COLUMN market_booth_inventory.labels IS
  'Mig 258 (N-10): LIST shape — the exact labels the market already uses ({"Pavilion","Corner"} or {"1","3","5"}). count = cardinality (derived). Only markets with booth_numbering_scheme = existing may use it.';

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS booth_numbering_scheme TEXT NULL
    CHECK (booth_numbering_scheme IN ('lettered', 'existing'));

COMMENT ON COLUMN markets.booth_numbering_scheme IS
  'Mig 258 (N-10, owner 2026-09-20): answered once early in setup — lettered = new market, each size a lettered range (A1…, B1…); existing = the market keeps the labels it already paints (prefix optional, explicit lists allowed). NULL = not answered; tiers cannot receive labels until it is.';

-- ----------------------------------------------------------------------------
-- 2. booth_tier_labels(tier) — one tier's labels in order (the ONE place the
--    two shapes are materialized; every other function reads through it)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION booth_tier_labels(p_inventory_id UUID)
RETURNS TABLE (n INTEGER, label TEXT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s AS n, COALESCE(mbi.label_prefix, '') || s::TEXT AS label
    FROM market_booth_inventory mbi
    CROSS JOIN LATERAL generate_series(mbi.label_start, mbi.label_end) AS s
    WHERE mbi.id = p_inventory_id
      AND mbi.label_start IS NOT NULL AND mbi.label_end IS NOT NULL
  UNION ALL
  SELECT ord::INTEGER AS n, lbl AS label
    FROM market_booth_inventory mbi
    CROSS JOIN LATERAL unnest(mbi.labels) WITH ORDINALITY AS u(lbl, ord)
    WHERE mbi.id = p_inventory_id
      AND mbi.labels IS NOT NULL
  ORDER BY 1;
$$;

COMMENT ON FUNCTION booth_tier_labels(uuid) IS
  'Mig 258: a size tier''s booth labels in order — RANGE shape (prefix || n for label_start..label_end) or LIST shape (labels[] in array order). No labels yet → no rows (the tier is not bookable, N-7).';

REVOKE EXECUTE ON FUNCTION booth_tier_labels(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION booth_tier_labels(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. booth_label_candidates(market, tier) — replaces the mig-256 1-arg version
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS booth_label_candidates(uuid);

CREATE OR REPLACE FUNCTION booth_label_candidates(p_market_id UUID, p_inventory_id UUID DEFAULT NULL)
RETURNS TABLE (n INTEGER, label TEXT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- With a tier: that tier's labels. Without: every tier's labels at the market
  -- (tier order by size_label, then label order) — used by the occupancy grid to
  -- draw every slot. `n` is made unique across tiers by offsetting per tier so
  -- callers can ORDER BY n in both modes.
  WITH tiers AS (
    SELECT mbi.id, ROW_NUMBER() OVER (ORDER BY mbi.size_label, mbi.id) AS tier_ord
      FROM market_booth_inventory mbi
      WHERE mbi.market_id = p_market_id
        AND (p_inventory_id IS NULL OR mbi.id = p_inventory_id)
  )
  SELECT ((t.tier_ord - 1) * 100000 + l.n)::INTEGER AS n, l.label
    FROM tiers t
    CROSS JOIN LATERAL booth_tier_labels(t.id) AS l
    ORDER BY 1;
$$;

COMMENT ON FUNCTION booth_label_candidates(uuid, uuid) IS
  'Mig 258 (was mig 256 1-arg, market-wide range): with p_inventory_id → that tier''s labels in order; without → every tier''s labels (tier order, then label order; n offset per tier). A tier with no labels contributes nothing. The two booking RPCs pass the booked tier — a Large booking can only ever receive a Large label (N-2).';

REVOKE EXECUTE ON FUNCTION booth_label_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION booth_label_candidates(uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. booth_tier_for_label(market, label) — which size a label belongs to
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION booth_tier_for_label(p_market_id UUID, p_label TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT mbi.id
    FROM market_booth_inventory mbi
    WHERE mbi.market_id = p_market_id
      AND EXISTS (SELECT 1 FROM booth_tier_labels(mbi.id) l WHERE l.label = p_label)
    LIMIT 1;
$$;

COMMENT ON FUNCTION booth_tier_for_label(uuid, text) IS
  'Mig 258 (N-1): the tier whose labels contain p_label at this market; NULL when no tier claims it. The writers (pin, approval, placeholder, weekly override) and the booking RPCs use it so a number always carries its size.';

REVOKE EXECUTE ON FUNCTION booth_tier_for_label(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION booth_tier_for_label(uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Trigger — shape · scheme · derived count · no overlap · never orphan
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_booth_tier_labels()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_scheme TEXT;
  v_has_range BOOLEAN := NEW.label_start IS NOT NULL OR NEW.label_end IS NOT NULL OR NEW.label_prefix IS NOT NULL;
  v_has_list  BOOLEAN := NEW.labels IS NOT NULL;
  v_new_labels TEXT[];
  v_dup TEXT;
  v_orphan TEXT;
  v_sibling RECORD;
BEGIN
  -- No labels at all: allowed (a tier waiting to be numbered). count stays as given.
  IF NOT v_has_range AND NOT v_has_list THEN
    RETURN NEW;
  END IF;

  -- Exactly one shape, fully specified.
  IF v_has_range AND v_has_list THEN
    RAISE EXCEPTION 'TIER_LABELS_SHAPE: a tier uses a range OR a list, not both' USING ERRCODE = 'P0009';
  END IF;
  IF v_has_range AND (NEW.label_start IS NULL OR NEW.label_end IS NULL) THEN
    RAISE EXCEPTION 'TIER_LABELS_SHAPE: range needs both a first and a last number' USING ERRCODE = 'P0009';
  END IF;
  IF v_has_range AND NEW.label_end < NEW.label_start THEN
    RAISE EXCEPTION 'TIER_LABELS_SHAPE: last number % is before first number %', NEW.label_end, NEW.label_start USING ERRCODE = 'P0009';
  END IF;
  IF v_has_range AND NEW.label_start < 0 THEN
    RAISE EXCEPTION 'TIER_LABELS_SHAPE: numbers start at 0 or above' USING ERRCODE = 'P0009';
  END IF;
  IF v_has_range AND NEW.label_end - NEW.label_start + 1 > 500 THEN
    RAISE EXCEPTION 'TIER_LABELS_SHAPE: a tier may hold at most 500 booths' USING ERRCODE = 'P0009';
  END IF;
  IF v_has_range THEN
    NEW.label_prefix := COALESCE(btrim(NEW.label_prefix), '');
  END IF;
  IF v_has_list THEN
    -- trim, drop blanks, require distinct
    SELECT array_agg(btrim(x)) INTO v_new_labels
      FROM unnest(NEW.labels) AS x WHERE btrim(x) <> '';
    IF v_new_labels IS NULL OR cardinality(v_new_labels) = 0 THEN
      RAISE EXCEPTION 'TIER_LABELS_SHAPE: the list has no labels' USING ERRCODE = 'P0009';
    END IF;
    SELECT x INTO v_dup FROM unnest(v_new_labels) AS x GROUP BY x HAVING COUNT(*) > 1 LIMIT 1;
    IF v_dup IS NOT NULL THEN
      RAISE EXCEPTION 'TIER_LABELS_SHAPE: label % appears twice in the list', v_dup USING ERRCODE = 'P0009';
    END IF;
    IF cardinality(v_new_labels) > 500 THEN
      RAISE EXCEPTION 'TIER_LABELS_SHAPE: a tier may hold at most 500 booths' USING ERRCODE = 'P0009';
    END IF;
    NEW.labels := v_new_labels;
  END IF;

  -- Scheme (N-10): must be answered; lettered = range with an alphabetic prefix.
  SELECT m.booth_numbering_scheme INTO v_scheme FROM markets m WHERE m.id = NEW.market_id;
  IF v_scheme IS NULL THEN
    RAISE EXCEPTION 'SCHEME_REQUIRED: answer "new market or existing numbers?" before numbering booths' USING ERRCODE = 'P0014';
  END IF;
  IF v_scheme = 'lettered' THEN
    IF v_has_list THEN
      RAISE EXCEPTION 'TIER_LETTER_REQUIRED: a new market numbers each size as a lettered range (A1, A2…)' USING ERRCODE = 'P0013';
    END IF;
    IF NEW.label_prefix !~ '^[A-Za-z]+$' THEN
      RAISE EXCEPTION 'TIER_LETTER_REQUIRED: the prefix must be letters only (got "%")', NEW.label_prefix USING ERRCODE = 'P0013';
    END IF;
  END IF;

  -- Derived count (N-5).
  IF v_has_range THEN
    NEW.count := NEW.label_end - NEW.label_start + 1;
  ELSE
    NEW.count := cardinality(NEW.labels);
  END IF;

  -- Materialize this tier's labels from NEW (booth_tier_labels reads the table,
  -- which does not have NEW yet).
  IF v_has_range THEN
    SELECT array_agg(NEW.label_prefix || s::TEXT ORDER BY s) INTO v_new_labels
      FROM generate_series(NEW.label_start, NEW.label_end) AS s;
  END IF;

  -- No label in two tiers of the same market (N-5).
  FOR v_sibling IN
    SELECT mbi.id, mbi.size_label FROM market_booth_inventory mbi
      WHERE mbi.market_id = NEW.market_id AND mbi.id <> NEW.id
  LOOP
    SELECT l.label INTO v_dup
      FROM booth_tier_labels(v_sibling.id) l
      WHERE l.label = ANY (v_new_labels)
      LIMIT 1;
    IF v_dup IS NOT NULL THEN
      RAISE EXCEPTION 'TIER_LABEL_OVERLAP: % is already a % booth', v_dup, v_sibling.size_label USING ERRCODE = 'P0010';
    END IF;
  END LOOP;

  -- Never orphan an occupied label (N-6): a label leaving this tier that a
  -- placeholder, an active current/upcoming booking, or a pin still carries.
  IF TG_OP = 'UPDATE' THEN
    SELECT booth_number INTO v_orphan FROM (
      SELECT mbp.booth_number FROM market_booth_placeholders mbp
        WHERE mbp.market_id = NEW.market_id AND mbp.inventory_id = NEW.id
      UNION
      SELECT r.booth_number FROM weekly_booth_rentals r
        WHERE r.market_id = NEW.market_id AND r.inventory_id = NEW.id
          AND r.booth_number IS NOT NULL
          AND r.status IN ('pending_payment', 'paid', 'completed')
          AND r.week_start_date + 6 >= CURRENT_DATE
      UNION
      SELECT mv.booth_number FROM market_vendors mv
        WHERE mv.market_id = NEW.market_id AND mv.inventory_id = NEW.id
          AND mv.booth_number IS NOT NULL
    ) occ
    WHERE occ.booth_number IS NOT NULL AND NOT (occ.booth_number = ANY (v_new_labels))
    LIMIT 1;
    IF v_orphan IS NOT NULL THEN
      RAISE EXCEPTION 'TIER_LABEL_OCCUPIED: % is still held or booked — free it before removing it from this size', v_orphan USING ERRCODE = 'P0011';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booth_tier_labels ON market_booth_inventory;
CREATE TRIGGER trg_enforce_booth_tier_labels
  BEFORE INSERT OR UPDATE ON market_booth_inventory
  FOR EACH ROW EXECUTE FUNCTION enforce_booth_tier_labels();

COMMENT ON FUNCTION enforce_booth_tier_labels() IS
  'Mig 258 (N-5/N-6/N-10): BEFORE INSERT/UPDATE on market_booth_inventory — one label shape (range or list), scheme rules (lettered = alphabetic prefix + range), count derived from the labels, no label in two tiers of a market (TIER_LABEL_OVERLAP P0010), a change never orphans an occupied label (TIER_LABEL_OCCUPIED P0011). A tier with no labels passes untouched (not bookable).';

-- ----------------------------------------------------------------------------
-- 6. book_weekly_booth_atomic — mig 256 body, candidates = the booked tier
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid, text);

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
    -- (mig 186). Fail loud if it's already taken for this week rather than
    -- silently reslotting the vendor elsewhere.
    v_assigned_label := COALESCE(p_forced_label, v_manager_booth);

    -- mig 258 (N-1/N-3): the label must belong to the booked size. A pin at a
    -- different size, or a label no tier claims yet, cannot be booked as this tier.
    IF booth_tier_for_label(p_market_id, v_assigned_label) IS DISTINCT FROM p_inventory_id THEN
      RAISE EXCEPTION 'TIER_MISMATCH' USING ERRCODE = 'P0012';
    END IF;

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
    -- Layer 3: auto-assign (mig 186 rule) INSIDE THE BOOKED TIER (mig 258, N-2).
    -- "Used" = active rentals this week + placeholder labels + ANY pinned booth
    -- so a new vendor never lands on a booth held for a pinned vendor while an
    -- unpinned one is free.
    SELECT c.label INTO v_assigned_label
      FROM booth_label_candidates(p_market_id, p_inventory_id) c
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

    -- mig 256 (BR-6): no unpinned label left → take the smallest SOFT pin in
    -- this tier: pinned to another vendor who has no active rental this week
    -- under it and no PAID current/upcoming week under it (i.e. not an
    -- assignment). The pin is not modified here; it transfers on payment.
    IF v_assigned_label IS NULL THEN
      SELECT c.label, mv.vendor_profile_id
        INTO v_assigned_label, v_yielded_from
        FROM booth_label_candidates(p_market_id, p_inventory_id) c
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

    -- Every label of this size is a placeholder, an assignment or booked this
    -- week — or the size has no labels yet (N-7).
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
  'Mig 258 (was 256): race-safe weekly booth booking + label assignment INSIDE the booked size tier. Own pin / p_forced_label honored only if booth_tier_for_label = the booked tier (TIER_MISMATCH P0012), BOOTH_TAKEN P0008 if that week has it; else the smallest label of the tier unused this week by an active rental, a placeholder or ANY pin; else the smallest SOFT pin in the tier (yielded_from_vendor_id, pin transfers on payment); else LABELS_EXHAUSTED P0004 (tier full or not yet numbered). Capacity = placeholders + active rentals per tier per week. RAISES OVERBOOKED P0001 / DUPLICATE P0002 / INVENTORY_NOT_FOUND P0003. Service-role only.';

REVOKE EXECUTE ON FUNCTION book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. book_season_atomic — mig 256 body, candidates = the booked tier
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
  --    (a) the vendor's own pin — mig 258: only if it belongs to the booked size
  --        (otherwise TIER_MISMATCH, same as the weekly RPC would raise);
  SELECT mv.booth_number INTO v_label
    FROM market_vendors mv
    WHERE mv.market_id = p_market_id
      AND mv.vendor_profile_id = p_vendor_profile_id;

  IF v_label IS NOT NULL AND booth_tier_for_label(p_market_id, v_label) IS DISTINCT FROM p_inventory_id THEN
    RAISE EXCEPTION 'SEASON_BOOK_FAILED week=% reason=TIER_MISMATCH',
      to_char(p_week_start_dates[1], 'YYYY-MM-DD');
  END IF;

  --    (b) else the smallest label OF THIS TIER free in EVERY requested week: not a
  --        placeholder, not any other vendor's pin, not booked in any week;
  IF v_label IS NULL THEN
    SELECT c.label INTO v_label
      FROM booth_label_candidates(p_market_id, p_inventory_id) c
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

  --    (c) else the smallest SOFT pin of this tier that is soft for every
  --        requested week: another vendor's pin, no booking under it in any
  --        requested week, holder has no paid current/upcoming week under it (BR-6);
  IF v_label IS NULL THEN
    SELECT c.label, mv.vendor_profile_id INTO v_label, v_yield
      FROM booth_label_candidates(p_market_id, p_inventory_id) c
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

  --    (d) else no single booth of this size is free for the whole purchase.
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
  'Mig 258 (was 256): all-or-nothing season/partial booking with ONE booth number OF THE BOOKED SIZE for the whole purchase — the vendor''s pin (TIER_MISMATCH if it is another size), else the smallest label of the tier free in every requested week, else a soft pin of the tier soft for every week (yielded_from_vendor_id), else SEASON_BOOK_FAILED week=<first> reason=LABELS_EXHAUSTED. Inserts the booth_booking_groups row then loops book_weekly_booth_atomic(…, p_forced_label) per week in one transaction. Caller: /api/vendor/markets/[id]/book-season via service client.';

REVOKE EXECUTE ON FUNCTION book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- POST-CHECK (read-only; paste the results back)
-- ============================================================================
-- 1. Columns present (expect 5 rows):
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--   WHERE (table_name = 'market_booth_inventory' AND column_name IN ('label_prefix','label_start','label_end','labels'))
--      OR (table_name = 'markets' AND column_name = 'booth_numbering_scheme') ORDER BY 1, 2;
-- 2. Functions + fingerprints (expect 6 rows; the hashes are recorded in the snapshot):
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid), md5(p.prosrc), length(p.prosrc) FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--     AND p.proname IN ('booth_tier_labels','booth_label_candidates','booth_tier_for_label','enforce_booth_tier_labels','book_weekly_booth_atomic','book_season_atomic')
--   ORDER BY 1;
-- 3. Trigger mounted (expect 1 row):
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_booth_tier_labels';
-- 4. Lockdown (expect anon f · authed f · svc t for each of the 3 new callable functions):
--   SELECT p.proname,
--     has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--     has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
--     has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN ('booth_tier_labels','booth_label_candidates','booth_tier_for_label') ORDER BY 1;
-- ============================================================================
