-- ============================================================================
-- Migration 252: check_subscription_completion() runs as its owner
-- ============================================================================
-- ✅ PASTE-AND-GO CLASS — function replace only. No tables, columns, policies,
--    triggers or privileges change. Same body, same name, one clause added.
--    Safe in any order relative to code deploys. Apply Dev → Staging → Prod.
--
-- THE HOLE (owner test TR-014, 2026-09-13; cause confirmed 2026-09-15)
--
--   `trigger_check_subscription_completion` (AFTER UPDATE on market_box_pickups)
--   calls this function to write `market_box_subscriptions.weeks_completed` and,
--   at the end of a term, `status = 'completed'`. The function was SECURITY
--   INVOKER, so its UPDATE ran with the permissions of whoever confirmed the
--   pickup — a buyer or a vendor session. `market_box_subscriptions` has ONLY
--   INSERT (buyer) and SELECT (buyer/vendor) policies (live pg_policies read on
--   Staging 2026-09-15): no UPDATE policy at all. RLS therefore filtered the
--   trigger's UPDATE to zero rows, silently, on every pickup ever confirmed
--   through the app. Live evidence: subscription 5416f7d9-… on Staging has
--   pickup 1 `picked_up` and `weeks_completed = 0`.
--
-- THE CHANGE — one clause
--
--   SECURITY DEFINER + SET search_path = public. The bookkeeping write now runs
--   as the function owner and is not subject to the caller's row policies. The
--   function never inspects current_user/auth.uid(), so the mig-251 concern
--   (DEFINER changes who `current_user` is) does not apply here.
--
-- EXEC-GRANT-EXEMPT — Rule M exemption, with reason: this function RETURNS
--   trigger. Trigger functions cannot be invoked over PostgREST /rpc/ and are
--   fired only by the table trigger, so an EXECUTE revoke closes nothing and a
--   revoke against the invoking role could interfere with trigger firing. Left
--   with default grants, deliberately.
--
-- BODY PROVENANCE: byte-identical `pg_get_functiondef` on Dev, Staging AND Prod
--   (owner-run 2026-09-15). This file reproduces that body verbatim.
--
-- ============================================================================
-- PRE-CHECK (run before pasting; expect prosecdef = false)
-- ============================================================================
-- SELECT proname, prosecdef, proconfig FROM pg_proc
-- WHERE proname = 'check_subscription_completion'
--   AND pronamespace = 'public'::regnamespace;
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_subscription_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  completed_count INTEGER;
  total_required INTEGER;
BEGIN
  IF NEW.status IN ('picked_up', 'missed', 'skipped') AND OLD.status != NEW.status THEN
    -- Count ALL pickups for this subscription (base + extensions)
    SELECT COUNT(*) INTO total_required
    FROM market_box_pickups
    WHERE subscription_id = NEW.subscription_id;

    -- Count resolved pickups
    SELECT COUNT(*) INTO completed_count
    FROM market_box_pickups
    WHERE subscription_id = NEW.subscription_id
      AND status IN ('picked_up', 'missed', 'skipped', 'rescheduled');

    IF completed_count >= total_required THEN
      UPDATE market_box_subscriptions
      SET status = 'completed',
          weeks_completed = completed_count,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = NEW.subscription_id;
    ELSE
      UPDATE market_box_subscriptions
      SET weeks_completed = completed_count, updated_at = NOW()
      WHERE id = NEW.subscription_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- POST-CHECK (expect prosecdef = true, proconfig = {search_path=public})
-- ============================================================================
-- SELECT proname, prosecdef, proconfig FROM pg_proc
-- WHERE proname = 'check_subscription_completion'
--   AND pronamespace = 'public'::regnamespace;
--
-- BEHAVIOURAL CHECK (the real proof, on Staging, by the owner): confirm a
-- market-box pickup through the app as buyer + vendor, then:
--   SELECT weeks_completed FROM market_box_subscriptions WHERE id = '<sub id>';
-- → increments by 1 for the first time. (The SQL editor runs as postgres and
--   bypasses RLS, so an editor-side UPDATE cannot reproduce the old failure.)
--
-- BACKFILL (separate, owner-run, optional): existing subscriptions keep their
-- stale 0 until their next pickup event. To true them up once:
--   UPDATE market_box_subscriptions s
--   SET weeks_completed = (SELECT COUNT(*) FROM market_box_pickups p
--                          WHERE p.subscription_id = s.id
--                            AND p.status IN ('picked_up','missed','skipped','rescheduled'))
--   WHERE s.status = 'active';
--
-- ROLLBACK: re-run this file with the two clauses (SECURITY DEFINER / SET
-- search_path) removed — that is the pre-252 definition on all three envs.
-- ============================================================================
