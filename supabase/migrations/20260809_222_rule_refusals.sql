-- ============================================================================
-- Migration 222: rule_refusals — telemetry for every time the app says "no"
-- Date: 2026-08-09
-- ============================================================================
-- WHY
--
-- On 2026-08-09 we found that multi-market checkout had been dead in PRODUCTION
-- for three weeks. 1911 tests were green the whole time. Every gate in this repo
-- checks that something IS PRESENT; nothing detects a capability quietly
-- disappearing. The regression was invisible because a refusal that had never
-- fired in six months suddenly started firing, and nothing counts refusals.
--
-- This table makes two otherwise-unanswerable questions into queries:
--
--   1. WHICH RULES HAVE NEVER FIRED?  A registered rule with zero rows is either
--      dead code or a rule nobody meant. The multi-market block would have shown
--      zero for six months, then a step change on 2026-07-21.
--   2. WHICH RULES SUDDENLY STARTED FIRING?  A step change with no commit that
--      intended it is a regression in flight.
--
-- WHY NOT error_logs
--
-- Thrown refusals already land there (with-error-tracing.ts logs every
-- TracedError including 4xx). But error_logs is PRUNED AT 90 DAYS
-- (lib/cron/retention.ts), and "has this fired in six months?" cannot be asked
-- of a 90-day window. Refusals are also not errors — mixing them would swamp the
-- admin error console with normal, working behaviour.
--
-- ⚠ DO NOT ADD THIS TABLE TO DATA_RETENTION_DAYS. Long retention IS the feature.
-- Refusals are low-volume by nature; if volume ever becomes a concern, roll old
-- rows into a monthly aggregate rather than deleting them.
--
-- ⚠ DO NOT REGISTER RATE-LIMIT REFUSALS. A bot hammering an endpoint would write
-- unbounded rows, and the limiter already counts those itself.
--
-- ADDITIVE: one new table. Nothing existing is touched.
-- ============================================================================

-- ── PRE-CHECK (expect NULL; the table should not already exist) ──
--
--   SELECT to_regclass('public.rule_refusals');

BEGIN;

CREATE TABLE IF NOT EXISTS public.rule_refusals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable identity of the RULE, not of the error code. Codes are reused:
  -- ERR_CHECKOUT_001 appears at twelve sites and means only "some validation
  -- failed", which answers neither question above. Keys are declared in
  -- src/lib/telemetry/refusal-registry.ts and must never be renamed — a rename
  -- silently resets a rule's history to "never fired", which is the exact
  -- blindness this table exists to remove.
  rule_key text NOT NULL,

  vertical_id text REFERENCES public.verticals(vertical_id),
  route text,
  method text,

  -- No FK to auth.users ON DELETE CASCADE: the COUNT must survive the account.
  -- A deleted user must not retroactively erase evidence that a rule fired.
  user_id uuid,

  -- Small and bounded — enough to tell two firings apart, never a payload dump.
  context jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- The "which fired, and when" query — both headline questions read this.
CREATE INDEX IF NOT EXISTS idx_rule_refusals_key_created
  ON public.rule_refusals (rule_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rule_refusals_created
  ON public.rule_refusals (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rule_refusals_vertical
  ON public.rule_refusals (vertical_id) WHERE vertical_id IS NOT NULL;

-- RLS on with NO policies: writes come from the service client only, reads are
-- admin reporting through an API route. Same posture as event_change_requests.
-- A leaked anon key still reads nothing.
ALTER TABLE public.rule_refusals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rule_refusals IS
  'Every time the app refuses a user, counted by rule (mig 222). Exists to answer "which rules have never fired" (dead or unintended) and "which started firing" (a regression in flight) — the blindness that let multi-market checkout die in prod for three weeks in July 2026. NOT subject to retention pruning: long history is the point.';
COMMENT ON COLUMN public.rule_refusals.rule_key IS
  'Stable rule identity from src/lib/telemetry/refusal-registry.ts. NEVER rename a key — it resets that rule''s history to "never fired".';
COMMENT ON COLUMN public.rule_refusals.context IS
  'Small bounded detail to tell firings apart. Never a request payload.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── POST-APPLY VERIFICATION ──
--
--   SELECT to_regclass('public.rule_refusals');                    -- not null
--   SELECT count(*) FROM pg_indexes
--    WHERE tablename = 'rule_refusals';                            -- expect 4
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid = 'public.rule_refusals'::regclass;                 -- expect true
--
-- ── THE TWO REPORT QUERIES (keep these; they are the whole point) ──
--
-- 1. Which registered rules have NEVER fired? Compare this output against the
--    key list in refusal-registry.ts — a registered key missing here has either
--    never triggered or is not wired up.
--
--   SELECT rule_key, count(*) AS hits,
--          min(created_at) AS first_seen, max(created_at) AS last_seen
--     FROM rule_refusals
--    GROUP BY rule_key
--    ORDER BY hits DESC;
--
-- 2. Which rules changed rate? A step change with no commit behind it is a
--    regression in flight. Read down each rule's column for a sudden 0 -> N.
--
--   SELECT date_trunc('week', created_at)::date AS week, rule_key, count(*)
--     FROM rule_refusals
--    WHERE created_at > now() - interval '120 days'
--    GROUP BY 1, 2
--    ORDER BY 1 DESC, 3 DESC;
--
-- ── ROLLBACK ──
--
--   DROP TABLE IF EXISTS public.rule_refusals;
--   NOTIFY pgrst, 'reload schema';
