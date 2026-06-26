# Phase E — Season Payment-Safety Plan (Recommended tier)

**Created:** 2026-06-26. **Mode:** Report (plan only — no code written yet).
**Source review:** `apps/web/.claude/comprehensive_review_research.md` (findings F1/F2/F3).
**Status:** Phase E is staging-only (NOT prod). Fix BEFORE the Phase E prod push.

## Goal
Make the season-booth payment-confirmation path safe against slow / failed / missing
Stripe webhooks, and stop the existing cron from cancelling in-flight or paid season
bookings. Closes F1 (HIGH), F2 (MEDIUM), F3 (MEDIUM) as one coherent change.

## Design principle (the rule the whole fix enforces)
**Season children follow their GROUP's payment lifecycle, and a group that has a Stripe
session is never cancelled without asking Stripe whether it was paid.** Group status
transitions become atomic (one RPC each way) so children can never diverge from the group.

## What closes what
| Finding | Fix |
|---|---|
| F1 — cron cancels paid/in-flight season children (expire-orders Phase 16) | C4: exclude grouped rows from Phase 16; C5: group-aware Phase 18 replaces it for grouped rows |
| F2 — webhook child-flip failure is permanent (group/children diverge) | C1+C3: atomic `confirm_season_paid` RPC; webhook throws on real error → Stripe retries → idempotent converge |
| F3 — no recovery if webhook never arrives | C5: Phase 18 reconciliation asks Stripe and confirms-or-cancels pending groups |

---

## C1 — Migration `20260626_167_season_settlement_rpcs.sql` (NEW; you apply Dev→Staging)

Two SECURITY DEFINER functions. Both lock the group row `FOR UPDATE` (serializes concurrent
webhook deliveries) and refuse to act against the wrong terminal state. Grants mirror mig 165
(REVOKE PUBLIC+anon, GRANT service_role). Schema verified against mig 164 (groups) + mig 139
(rentals).

```sql
-- ROLLBACK: DROP FUNCTION IF EXISTS confirm_season_paid(uuid, text);
--           DROP FUNCTION IF EXISTS cancel_season_group(uuid, text);

-- Atomically flip a season group + all its pending children to paid.
-- Idempotent: a redelivery on an already-paid group is a no-op.
CREATE OR REPLACE FUNCTION confirm_season_paid(p_group_id uuid, p_payment_intent text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM booth_booking_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND group_id=%', p_group_id;
  END IF;
  IF v_status = 'paid' THEN
    RETURN 'already_paid';
  END IF;
  IF v_status = 'cancelled' THEN
    -- Paid in Stripe but cancelled in DB: do NOT silently re-activate
    -- (children may have been freed/re-booked). Caller logs for manual handling.
    RETURN 'cancelled_conflict';
  END IF;

  -- v_status = 'pending_payment'
  UPDATE booth_booking_groups
    SET status = 'paid', stripe_payment_intent_id = p_payment_intent
    WHERE id = p_group_id;
  UPDATE weekly_booth_rentals
    SET status = 'paid', stripe_payment_intent_id = p_payment_intent, paid_at = NOW()
    WHERE group_id = p_group_id AND status = 'pending_payment';

  RETURN 'confirmed';
END;
$$;

-- Atomically cancel a season group + its still-pending children.
-- Refuses to cancel a PAID group (DB-level guard against the F1 class of bug).
CREATE OR REPLACE FUNCTION cancel_season_group(p_group_id uuid, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM booth_booking_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND group_id=%', p_group_id;
  END IF;
  IF v_status = 'paid' THEN
    RETURN 'already_paid';      -- never cancel a paid group
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN 'already_cancelled';
  END IF;

  UPDATE booth_booking_groups SET status = 'cancelled' WHERE id = p_group_id;
  UPDATE weekly_booth_rentals
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE group_id = p_group_id AND status = 'pending_payment';

  RETURN 'cancelled';
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_season_paid(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_season_paid(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION confirm_season_paid(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION cancel_season_group(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cancel_season_group(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION cancel_season_group(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
```

Notes: `updated_at` is omitted from both UPDATEs because the existing BEFORE-UPDATE triggers
(`trg_booth_groups_updated_at` mig 164:149-152, `trg_wbr_updated_at` mig 139) set it
automatically. `cancel_season_group` only touches `pending_payment` children, so a paid child
under a (wrongly) pending group is never clobbered.

---

## C2 — `src/lib/markets/season-notifications.ts` (NEW; non-protected)

Extract the webhook's vendor+manager "season paid" notification block into one best-effort
helper, callable from both the webhook (C3) and the reconciliation cron (C5). Single source =
no drift; isolates the protected file from the cron's needs.

```ts
// sendSeasonPaidNotifications(serviceClient, groupId): re-reads the group + vendor + market,
// fires booth_season_paid_vendor + booth_season_paid_manager. try/caught internally — NEVER
// throws (a notification failure must not cause a Stripe retry of an already-paid group).
```
Body = the current webhooks.ts:1415-1493 logic, parameterized by groupId (re-query group fields).

---

## C3 — `src/lib/stripe/webhooks.ts` (PROTECTED CRITICAL-PATH — per-file approval + exact diff)

`handleSeasonBoothCheckoutComplete` (currently 1333-1493). Keep the groupId resolution
(1336-1348) and the group-existence guard (1350-1363, trimmed to `select('id')`). Replace the
flip block (1365-1410) and the inline notification block (1412-1493) as follows:

**BEFORE (1365-1410, condensed):** early-return if `group.status==='paid'`; UPDATE group
(log+return on error); UPDATE children (log but continue on error). → leaves children stuck on
a paid group; redelivery skips via the group guard.

**AFTER:**
```ts
  const paymentIntentId = (session.payment_intent as string) || null

  const { data: confirmResult, error: confirmErr } = await supabase
    .rpc('confirm_season_paid', { p_group_id: groupId, p_payment_intent: paymentIntentId })

  if (confirmErr) {
    // Throw → /api/webhooks/stripe returns 500 → Stripe retries. RPC is idempotent.
    throw new TracedError('ERR_WEBHOOK_013',
      `confirm_season_paid failed for group ${groupId}: ${confirmErr.message}`,
      { route: '/webhooks/stripe', method: 'POST' })
  }
  if (confirmResult === 'cancelled_conflict') {
    await logError(new TracedError('ERR_WEBHOOK_014',
      `booth_season group ${groupId} paid in Stripe but CANCELLED in DB — manual reconciliation (payment_intent ${paymentIntentId})`,
      { route: '/webhooks/stripe', method: 'POST' }))
    return
  }
  if (confirmResult === 'already_paid') {
    crumb.stripe(`booth season ${groupId} already paid — idempotent skip`)
    return
  }
  // confirmResult === 'confirmed'
  crumb.stripe(`booth season ${groupId} flipped to paid (payment_intent ${paymentIntentId ?? 'unknown'})`)
  await sendSeasonPaidNotifications(supabase, groupId)
```
Add `import { sendSeasonPaidNotifications } from '@/lib/markets/season-notifications'`.
`TracedError`/`logError` already imported. Net effect: group+children flip atomically; any DB
error retries; idempotent on redelivery; notifications fire once (only on `confirmed`).

**Why a protected-file change is unavoidable here:** the webhook IS the season payment
confirmation point. Alternatives (a separate handler) can't intercept the same Stripe event.
The change is additive to season handling only; product/market-box/one-off booth paths in this
file are untouched. Exact line-anchored diff provided at edit time for sign-off.

---

## C4 — `src/app/api/cron/expire-orders/route.ts` Phase 16 (F1; not a protected file)

Add `.is('group_id', null)` to BOTH cohort queries so the one-off sweep never touches season
children (one-offs carry their own session id on the row; grouped children never do):

- Cohort (a) orphans (after `.is('stripe_checkout_session_id', null)`, ~line 2371): `+ .is('group_id', null)`
- Cohort (b) stale (after `.not('stripe_checkout_session_id', 'is', null)`, ~line 2385): `+ .is('group_id', null)`

The false `booth_rental_payment_failed_vendor` notification for grouped rows disappears with
the rows — Phase 16 no longer cancels them.

---

## C5 — `src/app/api/cron/expire-orders/route.ts` Phase 18 (F3; NEW phase, after 17)

Group-aware reconciliation. Source of truth = Stripe for any group that has a session id.

```
PHASE 18: Reconcile pending season booth groups
  rows = booth_booking_groups WHERE status='pending_payment' ORDER BY created_at
  budget cap: process up to N (e.g. 25) Stripe lookups/run; log remainder (no silent cap)
  for g in rows:
    if g.stripe_checkout_session_id IS NULL:
      if g.created_at < now-30min: rpc cancel_season_group(g.id)   # API died pre-checkout
      continue
    sess = stripe.checkout.sessions.retrieve(g.stripe_checkout_session_id)
    if sess.payment_status === 'paid':
      pi = (string) sess.payment_intent ?? sess.payment_intent?.id ?? null
      res = rpc confirm_season_paid(g.id, pi)         # recovers missed webhook (F3) + F2 divergence
      if res === 'confirmed': await sendSeasonPaidNotifications(supabase, g.id)
      if res === 'cancelled_conflict': logError(ERR_RECONCILE: paid but cancelled — manual)
    else if sess.status === 'expired' OR g.created_at < now-24h:
      rpc cancel_season_group(g.id)                   # genuinely abandoned
    # else: still 'open' and <24h → vendor mid-checkout, leave it
```
- **Stripe client:** reuse the instance already imported for Phase 5 transfers (confirm exact
  import at build).
- **Budget cap:** keep Phase 18's Stripe calls bounded so the run stays within `maxDuration`
  (60s); `console.log` how many groups were left for the next run.
- **Notifications on reconcile:** uses the C2 helper so a webhook-missed-but-reconciled vendor
  still gets the "season paid" notice.

---

## Bookkeeping (after you confirm the migration applied Dev→Staging)
- `supabase/SCHEMA_SNAPSHOT.md` changelog entry for mig 167 (two new functions + grants).
- Functions/Triggers section: add `confirm_season_paid`, `cancel_season_group` descriptions.
- File stays in `supabase/migrations/` until Prod has it (apply 167 with the Phase E prod push,
  AFTER 164→165→166).

## Verification
- Gates: `tsc --noEmit`, `eslint`, `vitest run` (pre-commit) + build/Playwright (pre-push).
- Staging manual: (1) book a season, complete Stripe → group+children paid (webhook path).
  (2) book a season, do NOT pay, wait → next cron run cancels group+children (Phase 18 orphan/
  expired path), one-off rentals still expire via Phase 16. (3) simulate missed webhook: book +
  pay, block the webhook, run cron → Phase 18 confirms from Stripe; children paid. (4) confirm a
  one-off booth rental still expires normally (Phase 16 unchanged for `group_id IS NULL`).
- Flow-integrity test (season checkout→confirm→children paid; reconcile confirms/cancels) is the
  **Comprehensive** add-on — recommended but not in this tier.

## Rollout order + approvals
1. I draft mig 167 → **you apply Dev→Staging + confirm** → I do snapshot bookkeeping.
2. C2 helper + C4 + C5 (non-protected) → build + gates → present.
3. **C3 webhooks.ts (protected): exact line-anchored diff → your per-file sign-off → edit.**
4. Commit → push staging (your OK) → you run the 4 staging tests.
5. Phase E prod push: mig 164→165→166→**167** in order, then the code, in the 9 PM–7 AM CT
   window with your approval.

## Edge cases / risks
- Concurrent webhook + cron on the same group: both call `confirm_season_paid`; `FOR UPDATE`
  serializes; second caller gets `already_paid`. Safe.
- `cancelled_conflict` should be unreachable once C4/C5 ship (cancel only on Stripe-unpaid), but
  is logged loudly if it ever occurs (legacy/manual cancels).
- `cancel_season_group` never cancels a paid group (returns `already_paid`) — DB-level backstop
  even if a caller is wrong.
- Phase 18 cost: bounded pending set over time + per-run budget cap keep it inside maxDuration.

## One open question (your call before build)
On a webhook-missed-but-reconciled payment, fire the vendor/manager "season paid" notifications
from the cron too (via C2 helper) — yes (recommended, avoids a silent confirmation) or skip to
keep the cron quiet? Plan currently assumes **yes**.
