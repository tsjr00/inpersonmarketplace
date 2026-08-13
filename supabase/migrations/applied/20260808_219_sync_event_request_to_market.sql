-- ============================================================================
-- Migration 219: propagate event edits from catering_requests to its market
-- Date: 2026-08-08
-- ============================================================================
-- WHY
--
-- Approving an event COPIES the request's facts into two other rows
-- (lib/events/event-actions.ts):
--
--   markets           <- address, city, state, zip, event_date -> event_start_date,
--                        event_end_date, headcount
--   market_schedules  <- event_start_time, event_end_time, and a weekday DERIVED
--                        from event_date
--
-- Nothing ever synced them back. That INSERT was the only write to
-- market_schedules anywhere in the events code path. From approval onward there
-- were two copies of every fact and no rule about which one wins, and each
-- surface had been wired to whichever copy was convenient at the time:
--
--   organizer dashboard  -> catering_requests
--   admin console        -> catering_requests
--   VENDOR event page    -> BOTH. Date/address/headcount from markets, times and
--                           setup notes from catering_requests, on one screen
--   attendee shop        -> catering_requests for DISPLAY, market_schedules for
--                           the schedule_id the order is actually booked against
--
-- Live consequence: an organizer moves their start time, the attendee page shows
-- the new hours and books the order into the old window, the vendor sees the new
-- time beside the old date, and an admin correcting the address fixes everybody
-- except the vendor. Nobody is violating a rule; there is no rule.
--
-- OWNERSHIP RULE (owner decision, 2026-08-08): the request is the source of
-- truth and markets/market_schedules are derived copies. Self-service events
-- auto-approve at submit and have no admin in the loop, so propagation has to be
-- structural — there is nobody to notice a desync.
--
-- WHY A TRIGGER AND NOT A SHARED HELPER
--
-- The times slipped through precisely BECAUSE a route was written that did not
-- know it had to sync. A helper can be forgotten by the next route; a trigger
-- cannot be bypassed by one. Same reasoning and same shape as mig 215
-- (clear tax verification on address change) and mig 121
-- (cleanup_cancelled_event) — both already trigger on this problem class, and
-- mig 121 is on this very table.
--
-- WHAT IS DELIBERATELY *NOT* SYNCED
--
--   markets.name — approval builds it from company_name plus a suffix that comes
--   from per-vertical AND per-locale application config (there is a Spanish
--   variant). SQL cannot resolve that without duplicating locale config into the
--   database, so `company_name` stays frozen post-approval in the route's
--   PRE_APPROVAL_ONLY_FIELDS. If the name ever needs to move, do it in app code.
--
--   cutoff_hours / event_allow_day_of_orders — copied at approval, but no route
--   lets anyone edit them on the request today, and approval CLAMPS cutoff_hours
--   to 12..168. Syncing them would be untestable speculation. Add them here at
--   the same time an editor for them is added, clamp included.
--
--   markets.day_of_week / start_time / end_time — these legacy columns exist on
--   `markets` and approval never populates them. Verified 2026-08-08 that no
--   application code selects them. They are NOT a third copy; left untouched.
--
-- CASCADE ANALYSIS — every trigger on the two target tables was read first
--
--   trigger_cart_cleanup_on_schedule_change   market_schedules  NOT fired: gated
--       on active true->false or DELETE. We only change times/weekday.
--   trigger_auto_add_schedule_to_vendors_update  market_schedules  NOT fired:
--       WHEN (NEW.active = true AND OLD.active = false).
--   trigger_market_schedule_deactivation      market_schedules  NOT fired:
--       WHEN (NEW.active IS DISTINCT FROM OLD.active).
--   trg_vlc_market_coords_change              markets  NOT fired: AFTER UPDATE OF
--       latitude, longitude — untouched here.
--   trg_vlc_market_status_change              markets  NOT fired: AFTER UPDATE OF
--       active, status — untouched here.
--   set_markets_updated_at / update_markets_updated_at  markets  fires; benign.
--   trg_clear_tax_jurisdiction_verification   markets  ** DOES FIRE ** on an
--       address/city/state/zip change, clearing tax_jurisdiction_verified_at and
--       KEEPING tax_jurisdictions (mig 215). This is correct — the address really
--       did change. Verified it gates nothing: the stamp is read only by
--       api/admin/markets/[id]/tax-jurisdictions as display status, while tax
--       math reads tax_jurisdictions, which mig 215 preserves. An admin sees
--       "re-verify"; no checkout is blocked.
--
-- NULLABILITY (verified against PROD and STAGING information_schema 2026-08-08;
-- both identical — the SCHEMA_SNAPSHOT structured tables are STALE and were NOT
-- trusted for this)
--
--   catering_requests: event_date NOT NULL, city/state/zip/headcount NOT NULL,
--                      address NULLABLE, event_start_time/event_end_time NULLABLE
--   market_schedules:  start_time/end_time NOT NULL, day_of_week NOT NULL,
--                      active NULLABLE
--   markets:           address/city/state/zip/headcount/event_*_date NULLABLE
--
-- Two consequences encoded below: the times are COALESCEd against the existing
-- schedule row so a NULL request time can never violate the NOT NULL columns,
-- and the weekday recompute is unconditional because event_date can never be
-- NULL.
--
-- WHY `active = true` AND NOT `COALESCE(active, true)`
--
-- Deliberate: sync exactly the row set the BUYER reads. lib/events/shop-data.ts
-- selects the schedule with `.eq('active', true)`, so an active-NULL row is
-- already invisible to buyers and must not be treated as the live schedule here
-- either. Matching that filter is what keeps the two in step.
--
-- ADDITIVE / NON-DESTRUCTIVE: no columns, no tables. One function, one trigger,
-- and a one-time backfill of events already out of sync.
-- ============================================================================

-- ── PRE-CHECK (run BEFORE applying; expect the count you are willing to fix) ──
--
-- How many approved events are currently desynced from their market?
--
--   SELECT count(*) FROM markets m
--     JOIN catering_requests cr ON cr.id = m.catering_request_id
--    WHERE m.market_type = 'event'
--      AND (m.address IS DISTINCT FROM cr.address
--        OR m.city    IS DISTINCT FROM cr.city
--        OR m.state   IS DISTINCT FROM cr.state
--        OR m.zip     IS DISTINCT FROM cr.zip
--        OR m.event_start_date IS DISTINCT FROM cr.event_date
--        OR m.headcount IS DISTINCT FROM cr.headcount);
--
-- And how many schedules disagree with their event's times?
--
--   SELECT count(*) FROM market_schedules ms
--     JOIN markets m ON m.id = ms.market_id
--     JOIN catering_requests cr ON cr.id = m.catering_request_id
--    WHERE m.market_type = 'event' AND ms.active = true
--      AND (ms.start_time  IS DISTINCT FROM COALESCE(cr.event_start_time, ms.start_time)
--        OR ms.end_time    IS DISTINCT FROM COALESCE(cr.event_end_time, ms.end_time)
--        OR ms.day_of_week IS DISTINCT FROM EXTRACT(DOW FROM cr.event_date)::int);

BEGIN;

-- ── The sync function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_event_request_to_market()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Pre-approval events have no market yet; nothing to propagate to.
  IF NEW.market_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── markets ──
  -- IS DISTINCT FROM throughout so NULL->value and value->NULL both count.
  IF NEW.address        IS DISTINCT FROM OLD.address
  OR NEW.city           IS DISTINCT FROM OLD.city
  OR NEW.state          IS DISTINCT FROM OLD.state
  OR NEW.zip            IS DISTINCT FROM OLD.zip
  OR NEW.event_date     IS DISTINCT FROM OLD.event_date
  OR NEW.event_end_date IS DISTINCT FROM OLD.event_end_date
  OR NEW.headcount      IS DISTINCT FROM OLD.headcount
  THEN
    UPDATE markets
       SET address          = NEW.address,
           city             = NEW.city,
           state            = NEW.state,
           zip              = NEW.zip,
           event_start_date = NEW.event_date,
           -- Mirrors approval: a single-day event stores start as end.
           event_end_date   = COALESCE(NEW.event_end_date, NEW.event_date),
           headcount        = NEW.headcount
     WHERE id = NEW.market_id;
  END IF;

  -- ── market_schedules ──
  -- This is the row the attendee shop hands the cart as schedule_id, so it is
  -- what a buyer's pickup window is actually derived from.
  IF NEW.event_start_time IS DISTINCT FROM OLD.event_start_time
  OR NEW.event_end_time   IS DISTINCT FROM OLD.event_end_time
  OR NEW.event_date       IS DISTINCT FROM OLD.event_date
  THEN
    UPDATE market_schedules
       -- COALESCE against the existing row: both columns are NOT NULL while the
       -- request's times are nullable, so a cleared time holds the last known
       -- hours rather than violating the constraint.
       SET start_time  = COALESCE(NEW.event_start_time, start_time),
           end_time    = COALESCE(NEW.event_end_time, end_time),
           -- event_date is NOT NULL, so this is always computable. EXTRACT(DOW)
           -- and market_schedules.day_of_week agree: 0=Sun..6=Sat (confirmed by
           -- mig 211's changelog note).
           day_of_week = EXTRACT(DOW FROM NEW.event_date)::int
     WHERE market_id = NEW.market_id
       AND active = true;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_event_request_to_market IS
  'Propagates an event edit from catering_requests into its derived markets row and active market_schedules row (mig 219). The request is the source of truth; the market and schedule are copies. A trigger rather than a helper because the copies desynced when a route was written that did not know to sync them. Does NOT sync markets.name (locale-aware app config) or cutoff_hours/event_allow_day_of_orders (no editor exists).';

DROP TRIGGER IF EXISTS trg_sync_event_request_to_market ON public.catering_requests;
CREATE TRIGGER trg_sync_event_request_to_market
  AFTER UPDATE OF address, city, state, zip, event_date, event_end_date,
                  event_start_time, event_end_time, headcount
  ON public.catering_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_event_request_to_market();

-- Note on approval: approveEventRequest creates the market with correct values
-- and then updates catering_requests SET status, market_id, event_token. None of
-- those are in the column list above, so the trigger does not fire and does no
-- redundant work at approval time.

-- ── One-time backfill of events already out of sync ──────────────────────────
--
-- A trigger only fixes edits from now on. The events that are broken TODAY were
-- broken by edits that already happened, so without this the known-bad events
-- stay bad. Consistent with the ownership rule: the request wins.
--
-- Scoped to market_type = 'event' so no traditional market is touched. Cancelled
-- events are included — only their data is refreshed, never `active`, so a
-- cancelled event stays cancelled.
--
-- This fires mig 215 on every event market whose address actually differs,
-- clearing tax_jurisdiction_verified_at (jurisdictions preserved). Intended.

UPDATE markets m
   SET address          = cr.address,
       city             = cr.city,
       state            = cr.state,
       zip              = cr.zip,
       event_start_date = cr.event_date,
       event_end_date   = COALESCE(cr.event_end_date, cr.event_date),
       headcount        = cr.headcount
  FROM catering_requests cr
 WHERE cr.id = m.catering_request_id
   AND m.market_type = 'event'
   AND (m.address          IS DISTINCT FROM cr.address
     OR m.city             IS DISTINCT FROM cr.city
     OR m.state            IS DISTINCT FROM cr.state
     OR m.zip              IS DISTINCT FROM cr.zip
     OR m.event_start_date IS DISTINCT FROM cr.event_date
     OR m.event_end_date   IS DISTINCT FROM COALESCE(cr.event_end_date, cr.event_date)
     OR m.headcount        IS DISTINCT FROM cr.headcount);

UPDATE market_schedules ms
   SET start_time  = COALESCE(cr.event_start_time, ms.start_time),
       end_time    = COALESCE(cr.event_end_time, ms.end_time),
       day_of_week = EXTRACT(DOW FROM cr.event_date)::int
  FROM markets m
  JOIN catering_requests cr ON cr.id = m.catering_request_id
 WHERE ms.market_id = m.id
   AND m.market_type = 'event'
   AND ms.active = true
   AND (ms.start_time  IS DISTINCT FROM COALESCE(cr.event_start_time, ms.start_time)
     OR ms.end_time    IS DISTINCT FROM COALESCE(cr.event_end_time, ms.end_time)
     OR ms.day_of_week IS DISTINCT FROM EXTRACT(DOW FROM cr.event_date)::int);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── POST-APPLY VERIFICATION (both should return 0) ───────────────────────────
--
--   SELECT count(*) FROM markets m
--     JOIN catering_requests cr ON cr.id = m.catering_request_id
--    WHERE m.market_type = 'event'
--      AND (m.address IS DISTINCT FROM cr.address
--        OR m.city    IS DISTINCT FROM cr.city
--        OR m.state   IS DISTINCT FROM cr.state
--        OR m.zip     IS DISTINCT FROM cr.zip
--        OR m.event_start_date IS DISTINCT FROM cr.event_date
--        OR m.headcount IS DISTINCT FROM cr.headcount);
--
--   SELECT count(*) FROM market_schedules ms
--     JOIN markets m ON m.id = ms.market_id
--     JOIN catering_requests cr ON cr.id = m.catering_request_id
--    WHERE m.market_type = 'event' AND ms.active = true
--      AND ms.day_of_week IS DISTINCT FROM EXTRACT(DOW FROM cr.event_date)::int;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
--
-- Drops the propagation only. The backfill is NOT reversible and should not be:
-- it moved the copies onto the values the request already held, which is the
-- correct state under the ownership rule. Reverting the trigger just returns the
-- system to "edits stop propagating".
--
--   DROP TRIGGER IF EXISTS trg_sync_event_request_to_market ON public.catering_requests;
--   DROP FUNCTION IF EXISTS public.sync_event_request_to_market();
--   NOTIFY pgrst, 'reload schema';
--
-- If rolled back, RESTORE the app-side stopgap in
-- api/events/[token]/details/route.ts (removed in the same commit that added
-- this migration) or event times will silently desync again.
