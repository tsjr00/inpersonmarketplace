-- ============================================================================
-- Migration 214: Sales-tax jurisdiction storage (Texas readiness, step 1)
-- Date: 2026-08-01
-- ============================================================================
-- WHY THIS COMES BEFORE ANY CALCULATION
--
-- As a marketplace provider we are required to file the Texas LONG FORM (01-114)
-- plus the LIST SUPPLEMENT (01-116) — a PER-JURISDICTION table requiring the
-- seven-digit local code, the amount subject to tax, the rate, and the tax due
-- for every city / county / transit authority / SPD we did business in — from
-- our FIRST return, regardless of size (Form 01-922 instructions, Rev. 8-25).
-- We are on MONTHLY filing.
--
-- Local rates change QUARTERLY and refunds must reverse at the ORIGINAL rate,
-- so a tax figure that isn't snapshotted at sale time cannot be reconstructed
-- later. Records must be retained 4 years (Tex. Tax Code §151.0242). This
-- migration adds that storage so the numbers exist the day we switch collection
-- on — and so filing frequency becomes a date-range query, not a fire drill.
--
-- Design notes:
--  * markets = the jurisdiction SOURCE OF TRUTH. We are pickup-only, so every
--    sale sources to a known market address; the jurisdiction set is bounded by
--    market count, not transaction count. Resolve once per market, reuse.
--  * order_items (NOT orders) carries the snapshot: same-market is enforced
--    only for market_type='traditional' (cart/validate:160), so private_pickup
--    and event orders can legitimately span markets with different rates.
--    order_items already carries market_id.
--  * orders keeps a rollup total purely for reconciliation against the charge.
--  * Booth / vendor-space rentals get NOTHING here — space rental is not
--    taxable in Texas (Comptroller Pub. 96-211).
--  * Subscriptions are not `orders` rows; they are Stripe subscription invoices
--    and will be reported from Stripe Tax. Out of scope for this migration.
--
-- ADDITIVE + NON-DESTRUCTIVE: nullable columns and defaulted JSONB only. No
-- backfill, no data change, no behavior change. NOTHING reads or writes these
-- columns yet — collection is a later, separately-gated build.
-- ============================================================================

BEGIN;

-- ── 1. markets: the jurisdiction configuration for this location ────────────
-- tax_jurisdictions shape (array, ordered state → local):
--   [{"code":"7000000","name":"TEXAS","level":"state","rate_pct":6.25},
--    {"code":"2227000","name":"AUSTIN","level":"city","rate_pct":1.0},
--    {"code":"3227000","name":"AUSTIN MTA","level":"transit","rate_pct":1.0}]
-- `code` is the Texas seven-digit local code required by Form 01-116 Column 2.
-- `level` ∈ state | city | county | transit | spd.
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS tax_jurisdictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_rate_total_pct NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS tax_rate_version TEXT,
  ADD COLUMN IF NOT EXISTS tax_jurisdiction_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tax_jurisdiction_note TEXT;

COMMENT ON COLUMN public.markets.tax_jurisdictions IS
  'Ordered array of the Texas taxing jurisdictions sourcing to this market address: [{code (7-digit local code, Form 01-116 col 2), name, level (state|city|county|transit|spd), rate_pct}]. Empty = not yet resolved. Resolved once per market via the Comptroller Rate Locator; every order at this market inherits it (mig 214).';
COMMENT ON COLUMN public.markets.tax_rate_total_pct IS
  'Sum of tax_jurisdictions rate_pct, cached for display/validation. Texas caps combined at 8.25% (6.25 state + up to 2.00 local) — values above that indicate a resolution error (mig 214).';
COMMENT ON COLUMN public.markets.tax_rate_version IS
  'Which Comptroller quarterly rate file / lookup the jurisdictions came from (e.g. "2026-Q3"). Rates change quarterly; this is how we know which vintage a market was resolved against (mig 214).';
COMMENT ON COLUMN public.markets.tax_jurisdiction_verified_at IS
  'When a human last verified this market''s jurisdictions against the Comptroller Rate Locator (mig 214).';
COMMENT ON COLUMN public.markets.tax_jurisdiction_note IS
  'Audit trail: how the jurisdictions were resolved (address searched, who verified, anomalies). Free text (mig 214).';

-- Guard: combined rate can never exceed the Texas statutory ceiling.
-- Written as NOT VALID so it cannot fail on any pre-existing row; validated
-- immediately below (there are no non-NULL values yet, so this is instant).
ALTER TABLE public.markets
  DROP CONSTRAINT IF EXISTS ck_markets_tax_rate_ceiling;
ALTER TABLE public.markets
  ADD CONSTRAINT ck_markets_tax_rate_ceiling
  CHECK (tax_rate_total_pct IS NULL OR (tax_rate_total_pct >= 0 AND tax_rate_total_pct <= 8.25))
  NOT VALID;
ALTER TABLE public.markets VALIDATE CONSTRAINT ck_markets_tax_rate_ceiling;

-- ── 2. order_items: the per-item snapshot taken at sale time ────────────────
-- Per ITEM (not per order) because private_pickup/event orders can span markets.
-- tax_jurisdictions here is the FROZEN breakdown INCLUDING the per-jurisdiction
-- tax amount, so Form 01-116 can be produced by grouping on code without any
-- recomputation, and a refund can reverse at the original rate.
--   [{"code":"7000000","name":"TEXAS","level":"state","rate_pct":6.25,"tax_cents":63}]
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tax_amount_cents INTEGER
    CHECK (tax_amount_cents IS NULL OR tax_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS taxable_amount_cents INTEGER
    CHECK (taxable_amount_cents IS NULL OR taxable_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS tax_jurisdictions JSONB,
  ADD COLUMN IF NOT EXISTS tax_rate_version TEXT,
  ADD COLUMN IF NOT EXISTS tax_source TEXT
    CHECK (tax_source IS NULL OR tax_source IN ('none', 'manual', 'stripe'));

COMMENT ON COLUMN public.order_items.tax_amount_cents IS
  'Sales tax collected on this item, in cents. NULL = pre-tax-launch row (we collected no tax); 0 = tax computed and correctly zero (exempt item). The NULL/0 distinction is deliberate — do not COALESCE it away (mig 214).';
COMMENT ON COLUMN public.order_items.taxable_amount_cents IS
  'The base this item''s tax was computed on. Differs from subtotal_cents when an item is exempt (0) or partially taxable (mig 214).';
COMMENT ON COLUMN public.order_items.tax_jurisdictions IS
  'Frozen per-jurisdiction breakdown at sale time: [{code, name, level, rate_pct, tax_cents}]. Sums to tax_amount_cents. Group by code to produce Texas Form 01-116; reverse at these rates on refund — never at today''s rates (mig 214).';
COMMENT ON COLUMN public.order_items.tax_rate_version IS
  'Rate vintage used (e.g. "2026-Q3"), or the Stripe tax calculation id when tax_source=stripe. Rates change quarterly — this is the audit link (mig 214).';
COMMENT ON COLUMN public.order_items.tax_source IS
  'Where the figure came from: none (no tax collected) | manual (our own rate lookup) | stripe (Stripe Tax calculation). Lets us reconcile mixed-vintage data during the cutover (mig 214).';

-- Partial index: month-end filing scans only rows that actually carry tax.
CREATE INDEX IF NOT EXISTS idx_order_items_tax_collected
  ON public.order_items (created_at)
  WHERE tax_amount_cents IS NOT NULL AND tax_amount_cents > 0;

-- ── 3. orders: rollup total, for reconciliation against the charge ──────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_total_cents INTEGER
    CHECK (tax_total_cents IS NULL OR tax_total_cents >= 0);

COMMENT ON COLUMN public.orders.tax_total_cents IS
  'Sum of this order''s order_items.tax_amount_cents, cached so a charge can be reconciled without a join. The ITEM rows remain authoritative for filing (an order can span markets with different rates). NULL = pre-tax-launch (mig 214).';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_name='markets' AND column_name LIKE 'tax_%';        -- expect 5
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='order_items' AND column_name LIKE 'tax%';     -- expect 5
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='orders' AND column_name='tax_total_cents';    -- expect 1
-- -- ceiling guard should reject an impossible rate:
-- --   UPDATE markets SET tax_rate_total_pct = 9.5 WHERE id = '<any>';  -- expect CHECK violation
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS tax_total_cents;
-- DROP INDEX IF EXISTS idx_order_items_tax_collected;
-- ALTER TABLE public.order_items
--   DROP COLUMN IF EXISTS tax_amount_cents,
--   DROP COLUMN IF EXISTS taxable_amount_cents,
--   DROP COLUMN IF EXISTS tax_jurisdictions,
--   DROP COLUMN IF EXISTS tax_rate_version,
--   DROP COLUMN IF EXISTS tax_source;
-- ALTER TABLE public.markets DROP CONSTRAINT IF EXISTS ck_markets_tax_rate_ceiling;
-- ALTER TABLE public.markets
--   DROP COLUMN IF EXISTS tax_jurisdictions,
--   DROP COLUMN IF EXISTS tax_rate_total_pct,
--   DROP COLUMN IF EXISTS tax_rate_version,
--   DROP COLUMN IF EXISTS tax_jurisdiction_verified_at,
--   DROP COLUMN IF EXISTS tax_jurisdiction_note;
-- NOTIFY pgrst, 'reload schema';
