-- ============================================================================
-- Migration 213: Community Chip In — cause contributions at checkout
-- Date: 2026-07-31
-- ============================================================================
-- Feature (owner-approved design 2026-07-31): let a buyer add an extra amount at
-- checkout that goes 100% to a nonprofit/cause org — either event-scoped
-- ("Community Chip In": event manager picks a beneficiary + presets) or an
-- always-on partner "Round-Up" campaign across all/selected vendors.
--
-- MONEY MODEL (mirrors the tip pattern, verified): product checkouts have no
-- transfer_data, so the chip-in lands in the PLATFORM BALANCE (like
-- tip_on_platform_fee_cents). It is tracked here in a ledger and BATCH-remitted
-- 100% to the org later — via stripe.transfers.create to their Connect account
-- (auto), or recorded as a manual check. Platform keeps NONE of it and absorbs
-- the Stripe processing cost, so "100% to the org" stays honest.
--
-- ADDITIVE + NON-DESTRUCTIVE: 4 new tables + 2 nullable columns each on orders
-- and markets. Beneficiaries are SOFT-deleted (active flag); every FK from a
-- money/audit row uses ON DELETE SET NULL or RESTRICT so removing an org can
-- never cascade-delete order or ledger history (schema-intent gate, Rule 5).
--
-- RLS: the four cause_* tables are service-role only (mirrors
-- event_company_payments, mig 110). Buyer-facing beneficiary names are surfaced
-- through server API routes using the service client — no public table read.
-- The added columns on orders/markets inherit those tables' existing policies.
-- ============================================================================

BEGIN;

-- ── 1. Beneficiary orgs ─────────────────────────────────────────────────────
-- No EIN required (a Community Chip In is a NON-deductible pass-through, not a
-- charitable donation). remit_method defaults to 'check' (manual); set
-- stripe_account_id + remit_method='connect' to enable automated batch payout.
CREATE TABLE IF NOT EXISTS public.cause_beneficiaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  contact_email     TEXT,
  stripe_account_id TEXT,                                    -- Connect acct (payee); NULL until onboarded
  remit_method      TEXT NOT NULL DEFAULT 'check'
                      CHECK (remit_method IN ('connect', 'check')),
  mailing_address   TEXT,                                    -- for the check path
  active            BOOLEAN NOT NULL DEFAULT true,           -- soft-delete: deactivate, never DELETE
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cause_beneficiaries IS
  'Nonprofit/cause orgs that receive Community Chip In money (mig 213). Non-deductible pass-through. Soft-deleted via active. remit_method connect=auto Stripe transfer, check=manual. Service-role only.';

-- ── 2. Remittance batches (a payout of accumulated chip-ins to one org) ──────
CREATE TABLE IF NOT EXISTS public.cause_remittances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id     UUID NOT NULL REFERENCES public.cause_beneficiaries(id) ON DELETE RESTRICT,
  amount_cents       INTEGER NOT NULL CHECK (amount_cents > 0),
  method             TEXT NOT NULL CHECK (method IN ('connect', 'check')),
  stripe_transfer_id TEXT,                                   -- set for connect payouts
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'failed')),
  period_start       DATE,
  period_end         DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ
);

COMMENT ON TABLE public.cause_remittances IS
  'One row per batched payout of Community Chip In funds to a beneficiary (mig 213). connect=auto Stripe transfer (stripe_transfer_id set), check=admin marks paid after mailing. Service-role only.';

CREATE INDEX IF NOT EXISTS idx_cause_remittances_beneficiary
  ON public.cause_remittances (beneficiary_id, status);

-- ── 3. Ledger (one 'collected' row per paid chip-in; 'remitted' when batched) ─
-- balance owed to an org = SUM(amount_cents) over collected − remitted.
CREATE TABLE IF NOT EXISTS public.cause_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID NOT NULL REFERENCES public.cause_beneficiaries(id) ON DELETE RESTRICT,
  order_id       UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount_cents   INTEGER NOT NULL,                           -- +collected, −remitted
  type           TEXT NOT NULL CHECK (type IN ('collected', 'remitted', 'reversed')),
  remittance_id  UUID REFERENCES public.cause_remittances(id) ON DELETE SET NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cause_ledger IS
  'Community Chip In ledger (mig 213). collected=+ on paid order (webhook), remitted=− on batch payout, reversed=− if a contributing order is refunded before its batch. Balance per org = SUM. Mirrors vendor_fee_ledger. Service-role only.';

-- One collected row per order (idempotent webhook writes). Partial: only 'collected'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cause_ledger_collected_order
  ON public.cause_ledger (order_id)
  WHERE type = 'collected' AND order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cause_ledger_beneficiary
  ON public.cause_ledger (beneficiary_id, type);

-- ── 4. Always-on Round-Up campaigns (Feature B) ─────────────────────────────
-- vertical_id NULL = all verticals. Scope to specific markets via market_ids.
CREATE TABLE IF NOT EXISTS public.cause_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id   UUID NOT NULL REFERENCES public.cause_beneficiaries(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  vertical_id      TEXT REFERENCES public.verticals(vertical_id),   -- NULL = all
  market_ids       UUID[],                                          -- NULL/empty = all markets in scope
  round_up_enabled BOOLEAN NOT NULL DEFAULT true,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.cause_campaigns IS
  'Always-on partner Round-Up campaigns (mig 213, Feature B): a window during which checkout offers round-up-to-next-dollar for the beneficiary across the scoped verticals/markets. Service-role only.';

CREATE INDEX IF NOT EXISTS idx_cause_campaigns_active_window
  ON public.cause_campaigns (active, starts_at, ends_at);

-- ── 5. Order linkage (mirrors the tip fields) ───────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS chipin_amount_cents INTEGER
    CHECK (chipin_amount_cents IS NULL OR chipin_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS chipin_beneficiary_id UUID
    REFERENCES public.cause_beneficiaries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.chipin_amount_cents IS
  'Community Chip In amount on this order in cents (mig 213). Collected into the platform balance like a tip; ledgered + remitted 100% to chipin_beneficiary_id. NULL/0 = none.';

-- ── 6. Event-scoped chip-in config on the event market row ──────────────────
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS chipin_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chipin_beneficiary_id UUID
    REFERENCES public.cause_beneficiaries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.markets.chipin_enabled IS
  'Event manager has turned Community Chip In on for this event market (mig 213). Checkout offers a Support-[Org] contribution when true + chipin_beneficiary_id set.';

-- ── 7. RLS: cause_* tables are service-role only (mirrors event_company_payments)
ALTER TABLE public.cause_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_remittances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_campaigns     ENABLE ROW LEVEL SECURITY;
-- No policies granted → only service_role (which bypasses RLS) can read/write.
-- Buyer-facing beneficiary names are surfaced via server routes using the
-- service client, exactly like event/company-paid data.

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name LIKE 'cause_%';                 -- expect 4
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='orders' AND column_name LIKE 'chipin_%';    -- expect 2
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='markets' AND column_name LIKE 'chipin_%';   -- expect 2
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.markets DROP COLUMN IF EXISTS chipin_enabled,
--   DROP COLUMN IF EXISTS chipin_beneficiary_id;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS chipin_amount_cents,
--   DROP COLUMN IF EXISTS chipin_beneficiary_id;
-- DROP TABLE IF EXISTS public.cause_ledger;
-- DROP TABLE IF EXISTS public.cause_campaigns;
-- DROP TABLE IF EXISTS public.cause_remittances;
-- DROP TABLE IF EXISTS public.cause_beneficiaries;
-- NOTIFY pgrst, 'reload schema';
