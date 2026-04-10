-- Migration 110: Event Wave-Based Ordering Schema
-- Adds tables and columns for wave-based ordering at company-paid events.
-- Focus: FT events where organizer pays, attendees select wave + 1 item.
--
-- New tables: event_waves, event_wave_reservations, event_company_payments
-- Column additions: markets, orders, order_items

BEGIN;

-- ============================================================
-- 1. New table: event_waves
-- Defines time slots for an event with capacity limits.
-- reserved_count is denormalized for atomic race-safe updates.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_waves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  wave_number     INTEGER NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  capacity        INTEGER NOT NULL,
  reserved_count  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_waves_market_number UNIQUE (market_id, wave_number),
  CONSTRAINT ck_event_waves_no_overbook CHECK (reserved_count <= capacity),
  CONSTRAINT ck_event_waves_positive_number CHECK (wave_number > 0),
  CONSTRAINT ck_event_waves_positive_capacity CHECK (capacity > 0),
  CONSTRAINT ck_event_waves_valid_status CHECK (status IN ('open', 'full', 'closed'))
);

COMMENT ON TABLE public.event_waves IS 'Time-slot waves for event ordering. Each wave has a capacity limit enforced at the DB level.';
COMMENT ON COLUMN public.event_waves.reserved_count IS 'Denormalized counter — updated atomically via reserve_event_wave RPC. CHECK constraint prevents overbooking.';

-- ============================================================
-- 2. New table: event_wave_reservations
-- Tracks which attendee reserved which wave.
-- UNIQUE(market_id, user_id) enforces one reservation per event.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_wave_reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id         UUID NOT NULL REFERENCES public.event_waves(id) ON DELETE CASCADE,
  market_id       UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'reserved',
  reserved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_id        UUID REFERENCES public.orders(id),

  CONSTRAINT uq_event_wave_reservations_market_user UNIQUE (market_id, user_id),
  CONSTRAINT ck_event_wave_reservations_status CHECK (status IN ('reserved', 'ordered', 'cancelled', 'walk_up'))
);

COMMENT ON TABLE public.event_wave_reservations IS 'One reservation per attendee per event. Links to order after food selection.';
COMMENT ON COLUMN public.event_wave_reservations.status IS 'reserved=slot held, ordered=food selected, cancelled=freed slot, walk_up=day-of arrival';

-- ============================================================
-- 3. New table: event_company_payments
-- Tracks organizer payments for company-paid events.
-- MVP: admin manually records; future: Stripe payment link.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_company_payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id               UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  catering_request_id     UUID NOT NULL REFERENCES public.catering_requests(id) ON DELETE CASCADE,
  payment_type            TEXT NOT NULL,
  amount_cents            INTEGER NOT NULL,
  payment_method          TEXT,
  stripe_payment_intent_id TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ,

  CONSTRAINT ck_event_company_payments_type CHECK (payment_type IN ('deposit', 'final_settlement')),
  CONSTRAINT ck_event_company_payments_status CHECK (status IN ('pending', 'paid', 'refunded')),
  CONSTRAINT ck_event_company_payments_positive CHECK (amount_cents > 0)
);

COMMENT ON TABLE public.event_company_payments IS 'Organizer payments for company-paid events. Admin records these manually for MVP.';

-- ============================================================
-- 4. Column additions to existing tables
-- ============================================================

-- markets: wave ordering flags
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS wave_ordering_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wave_duration_minutes INTEGER NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.markets.wave_ordering_enabled IS 'When true, event uses wave-based ordering with capacity limits.';
COMMENT ON COLUMN public.markets.wave_duration_minutes IS 'Duration of each wave in minutes. Fixed at 30 for MVP.';

-- orders: company-paid tracking
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_model TEXT,
  ADD COLUMN IF NOT EXISTS event_wave_reservation_id UUID REFERENCES public.event_wave_reservations(id);

COMMENT ON COLUMN public.orders.payment_model IS 'null=standard Stripe, company_paid=organizer paid for attendees';

-- order_items: wave linkage
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS wave_id UUID REFERENCES public.event_waves(id);

-- ============================================================
-- 5. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_event_waves_market
  ON public.event_waves(market_id);

CREATE INDEX IF NOT EXISTS idx_event_wave_reservations_market_user
  ON public.event_wave_reservations(market_id, user_id);

CREATE INDEX IF NOT EXISTS idx_event_wave_reservations_wave
  ON public.event_wave_reservations(wave_id);

CREATE INDEX IF NOT EXISTS idx_event_company_payments_market
  ON public.event_company_payments(market_id);

CREATE INDEX IF NOT EXISTS idx_orders_payment_model
  ON public.orders(payment_model) WHERE payment_model IS NOT NULL;

-- ============================================================
-- 6. RLS Policies
-- ============================================================

-- event_waves: anyone can read (wave availability is public), no public write
ALTER TABLE public.event_waves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_waves_select_all" ON public.event_waves;
CREATE POLICY "event_waves_select_all" ON public.event_waves
  FOR SELECT USING (true);

-- event_wave_reservations: users can read their own, insert/update via RPC only
ALTER TABLE public.event_wave_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_wave_reservations_select_own" ON public.event_wave_reservations;
CREATE POLICY "event_wave_reservations_select_own" ON public.event_wave_reservations
  FOR SELECT USING (auth.uid() = user_id);

-- event_company_payments: admin only (service_role for API routes)
ALTER TABLE public.event_company_payments ENABLE ROW LEVEL SECURITY;

-- No public policies — accessed via service client in admin routes only

-- ============================================================
-- 7. Grant service_role full access to new tables
-- ============================================================
GRANT ALL ON public.event_waves TO service_role;
GRANT ALL ON public.event_wave_reservations TO service_role;
GRANT ALL ON public.event_company_payments TO service_role;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
