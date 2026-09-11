# Design: mig 248 (function lockdown) + mig 249 (order money-column guard) + checkout diff

**Status: DESIGN FOR OWNER REVIEW — nothing written to `supabase/migrations/`, no code edited.**
Source findings: `launch_fix_plan_2026-09-10.md` → "Stage A results" A-1 and A-2 (live PROD catalog
queries, 2026-09-11). Owner: "yes" to designing both + the checkout diff (2026-09-11).

Schema gate: `user_profiles` columns read from `SCHEMA_SNAPSHOT.md` immediately before drafting the
`ensure_user_profile` body below (user_id, email, display_name, role, roles, created_at, updated_at
all present). `order_items` / `orders` sections will be read immediately before drafting 249.

---

## Ordering (why two migrations and a code change, in this sequence)

```
1. CODE  skip route → calls vendor_skip_week with the SERVICE client after its own ownership check
2. CODE  checkout/session → the two inserts (orders, order_items) use the SERVICE client   ⚠ protected
   → one staging push, owner smoke: skip a week as a vendor; complete one checkout
3. DB    mig 248 on Dev → Staging   (function lockdown; after step 1 is live, nothing user-facing changes)
4. DB    mig 249 on Dev → Staging   (money-column guard trigger; after step 2 is live, checkout unaffected)
   → owner smoke again: checkout, vendor confirm/ready/fulfill, buyer confirm-pickup, buyer cancel
5. PROD  same order: deploy code FIRST, then paste 248, then 249 (window 21:00–07:00 CT)
```
If 248 is pasted before step 1 is deployed, vendor skip-week breaks (user client loses EXECUTE).
If 249 is pasted before step 2 is deployed, EVERY checkout fails at the orders insert. Hence code first.

---

## mig 248 — `20260911_248_revoke_public_execute_write_functions.sql`

**Apply class: ⛔ DIFFERENTIAL — DO NOT PASTE until the skip-route code change is deployed to that env.**
Mirrors mig 152 (`REVOKE EXECUTE … FROM PUBLIC`), which is proven live: anon lost access, service-role
callers kept working. Explicit `GRANT … TO service_role` added as belt-and-braces (no-op if present).

### Pre-check (run BEFORE pasting; expect `true` on every row = the hole is open)
```sql
SELECT proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('vendor_skip_week','ensure_user_profile','cleanup_cart_items_invalid_schedules',
                  'refresh_vendor_location','refresh_all_vendor_locations','scan_vendor_activity')
ORDER BY 1;
```

### Body
```sql
-- ============================================================================
-- Migration 248: Revoke PUBLIC EXECUTE on five write-capable SECURITY DEFINER
--                functions that no caller check protected (launch review A-1)
-- ============================================================================
-- Found 2026-09-11 by has_function_privilege('anon', …) on PROD. Each function
-- below writes data as its owner and never inspects auth.uid(); anyone holding
-- the public anon key could call it over PostgREST /rpc/. Pattern = mig 152.
--
-- vendor_skip_week          — skips any market-box pickup + extends the subscription  (HIGH)
-- ensure_user_profile       — inserts a user_profiles row for an ARBITRARY user_id     (MEDIUM)
-- cleanup_cart_items_invalid_schedules — deletes cart items platform-wide, returns user ids (MEDIUM)
-- refresh_all_vendor_locations / refresh_vendor_location — wipe + rebuild the location cache (MEDIUM)
-- scan_vendor_activity      — runs the vendor-activity scan, writes flags/logs         (MEDIUM)
--
-- App impact after the code deploy that precedes this file:
--   skip route      → service client (route already verifies vendor owns the pickup)
--   cancel-date-cascade, cron scan → already service client
--   login page      → still calls ensure_user_profile with the USER client → stays
--                     EXECUTE-able by authenticated, but the body now refuses any
--                     p_user_id that is not auth.uid()
--   cleanup_* / refresh_* → no app callers
-- ============================================================================

-- 1. Revoke the default PUBLIC grant (anon + authenticated lose EXECUTE)
REVOKE EXECUTE ON FUNCTION public.vendor_skip_week(uuid, text)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_cart_items_invalid_schedules()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_all_vendor_locations()                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.scan_vendor_activity(text)                     FROM PUBLIC;
-- mig 005 granted these two to authenticated explicitly — remove that too
REVOKE EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_all_vendor_locations()                 FROM authenticated;

-- 2. Service role keeps everything (explicit; harmless if already implied)
GRANT EXECUTE ON FUNCTION public.vendor_skip_week(uuid, text)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_cart_items_invalid_schedules()          TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_vendor_locations()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.scan_vendor_activity(text)                      TO service_role;

-- 3. ensure_user_profile: same signature (login page keeps working), but the
--    caller may only ensure THEIR OWN profile. Body otherwise = mig 085b verbatim.
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_display_name TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- 248: refuse to act for anyone but the authenticated caller. auth.uid() is
  -- NULL for anon and for service-role sessions; neither has a legitimate use.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ensure_user_profile: caller may only ensure their own profile'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, email, role, roles INTO v_profile
  FROM public.user_profiles
  WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'exists', 'profile_id', v_profile.id);
  END IF;

  INSERT INTO public.user_profiles (user_id, email, display_name, role, roles, created_at, updated_at)
  VALUES (p_user_id, p_email, COALESCE(NULLIF(p_display_name, ''), split_part(p_email, '@', 1)),
          'buyer'::user_role, ARRAY['buyer']::user_role[], NOW(), NOW())
  RETURNING id INTO v_profile;

  RETURN jsonb_build_object('status', 'created', 'profile_id', v_profile.id);

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status', 'exists', 'profile_id', v_profile.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.ensure_user_profile(UUID, TEXT, TEXT) IS
'Lazy profile creation for the AUTHENTICATED CALLER ONLY (mig 248: p_user_id must equal auth.uid()). Called from the login flow when the profile row is missing. Returns {status: "exists"|"created", profile_id}.';

GRANT EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text) TO authenticated;

-- No NOTIFY pgrst needed: grants/body changes do not alter the schema cache.
```

### Post-check (expect `anon_can_exec = false` for all six; `authenticated` true ONLY for ensure_user_profile)
```sql
SELECT proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('vendor_skip_week','ensure_user_profile','cleanup_cart_items_invalid_schedules',
                  'refresh_vendor_location','refresh_all_vendor_locations','scan_vendor_activity')
ORDER BY 1;
```

### Rollback
```sql
GRANT EXECUTE ON FUNCTION public.vendor_skip_week(uuid, text)            TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text)   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_cart_items_invalid_schedules()  TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)           TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_all_vendor_locations()          TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_vendor_activity(text)              TO PUBLIC;
-- and re-apply mig 085b lines 56-86 to restore the unguarded ensure_user_profile body
```

### Tests to ADD (new cases only)
- `flow-integrity.test.ts` style guard: the skip route's `.rpc('vendor_skip_week'` call must be on a
  service client (grep-pinned like the existing "webhook-only paid-writer" contracts).
- `db-constraints.integration.test.ts` (runs against Dev): `has_function_privilege('anon', …)` is false
  for the six functions — so the lockdown cannot silently regress when a future migration
  `CREATE OR REPLACE`s one of them (a replace does NOT reset grants, but a DROP + CREATE would).

---

## Code change 1 — skip route (NOT protected): `src/app/api/vendor/market-boxes/pickups/[id]/skip/route.ts`
```diff
-import { createClient } from '@/lib/supabase/server'
+import { createClient, createServiceClient } from '@/lib/supabase/server'
 …
   // Call the database function to handle the skip
-  const { data: result, error } = await supabase.rpc('vendor_skip_week', {
+  // 248: vendor_skip_week is service-role-only now; ownership was verified above
+  // (offering.vendor_profile_id === vendor.id), so the elevated call is safe.
+  const { data: result, error } = await createServiceClient().rpc('vendor_skip_week', {
     p_pickup_id: pickupId,
     p_reason: reason
   })
```
Everything else in the route (reads, notification) stays on the user client. Lines: import `:2`,
call `:102-105`.

## Code change 2 — checkout/session (⚠ PROTECTED — separate per-file approval at build time)
File: `src/app/api/checkout/session/route.ts`. Risk: if this is wrong, orders are not created after
Stripe sessions are minted → paid sessions with no order (the failure mode the success/webhook path
already refunds, but still). `serviceClient` is already in scope (`:132`).
```diff
@@ line 1112
-    const { error: orderError } = await supabase
+    const { error: orderError } = await serviceClient
       .from('orders')
       .insert({
         id: orderId,
         buyer_user_id: user.id,
@@ line 1144
-      const { error: itemsError } = await supabase.from('order_items').insert(
+      const { error: itemsError } = await serviceClient.from('order_items').insert(
```
Two tokens. The route sets `buyer_user_id: user.id` itself (`:1116`), so the RLS `WITH CHECK
buyer_user_id = auth.uid()` that the user client relied on is preserved by construction.
**Test to ADD:** `money-authorization.test.ts`-style contract: checkout/session's orders + order_items
inserts go through the service client (grep-pinned), so a refactor cannot move them back.

---

## mig 249 — `20260911_249_order_money_columns_service_only.sql`

**Apply class: ⛔ DIFFERENTIAL — DO NOT PASTE until code change 2 (checkout inserts → service client)
is deployed to that env. Pasting first makes EVERY checkout fail at the orders insert.**

### Blast radius (agent classification of all 86 files touching orders/order_items, money sites
re-read by Claude): zero DELETEs exist; **4 USER-client INSERTs** (checkout/session `:1112`, `:1144`;
checkout/external `:293`, `:314`) — the only writes this migration blocks once code change 2 lands;
**23 USER-client UPDATEs** — every one writes only status / timestamp / issue / lockdown /
`refund_amount_cents` / `cancellation_fee_cents` columns; **~35 SERVICE-client writes** unaffected.
Snapshot read (order_items line 1399, orders line 1459) confirms every column named below exists.

### Column split
**order_items — SERVICE-ONLY (protected):** order_id, listing_id, vendor_profile_id, quantity,
unit_price_cents, subtotal_cents, platform_fee_cents, vendor_payout_cents, market_id, schedule_id,
pickup_date, preferred_pickup_time, pickup_snapshot, wave_id, expires_at, tax_amount_cents,
taxable_amount_cents, tax_jurisdictions, tax_rate_version, tax_source, discount_cents, offer_id.
**order_items — user-writable (vendor/buyer routes write these today):** status, cancelled_at,
cancelled_by, cancellation_reason, refund_amount_cents, cancellation_fee_cents, buyer_confirmed_at,
vendor_confirmed_at, pickup_confirmed_at, confirmation_window_expires_at, lockdown_active,
lockdown_initiated_at, issue_reported_at, issue_reported_by, issue_description, issue_status,
issue_resolved_at, issue_resolved_by, issue_admin_notes, updated_at.
**orders — SERVICE-ONLY:** buyer_user_id, vertical_id, order_number, subtotal_cents, platform_fee_cents,
total_cents, stripe_checkout_session_id, payment_method, parent_order_id, order_suffix, tip_percentage,
tip_amount, tip_on_platform_fee_cents, small_order_fee_cents, payment_model, event_wave_reservation_id,
event_company_payment_id, chipin_amount_cents, chipin_beneficiary_id, tax_total_cents, reconfirm_token,
reconfirm_required_at, reconfirmed_at, reconfirm_reminder_sent_at, reconfirm_final_sent_at,
reconfirm_refunded_at, discount_cents, bundle_id, bundle_margin_cents, bundle_handed_off_at,
bundle_margin_transfer_id, bundle_buyer_ack_at.
**orders — user-writable:** status, external_payment_confirmed_at, external_payment_confirmed_by, updated_at.
(`status` stays user-writable in phase 1 because 7 vendor/buyer routes write it; faking `status='paid'`
DOES unlock a payout — **CORRECTED 2026-09-12**: the gate SKIPS the `payments` check when status is already paid (`fulfill/route.ts:100-115`); see `session_audit_2026-09-12.md` F-1 — the original claim below was wrong — fulfill also requires a `payments` row, `fulfill/route.ts:101-112`.)

### OPTION A (recommended) — column-level privileges, declarative, no trigger
Postgres checks column privileges before RLS. Revoke the blanket table UPDATE/INSERT the Supabase
default handed anon+authenticated, then grant UPDATE back on ONLY the user-writable columns.
Nothing in app code can bypass it, and no later `CREATE OR REPLACE` can silently drop it (a trigger can
be dropped; a privilege set survives until someone explicitly re-grants).
```sql
-- ============================================================================
-- Migration 249: order money columns are service-role-only (launch review A-2)
-- ============================================================================
-- Query C on PROD (2026-09-11) showed order_items_update / order_items_insert /
-- orders_update let the ORDER'S BUYER write any column of their own rows, and
-- fulfill/route.ts transfers exactly orderItem.vendor_payout_cents. RLS decides
-- WHICH ROWS; this migration decides WHICH COLUMNS, using column privileges —
-- checked by Postgres before RLS, unbypassable from app code.
-- PRECONDITION: checkout/session inserts run on the service client (code deploy
-- precedes this file). checkout/external (inactive external-payments flow) also
-- inserts with the user client and WILL be blocked — owner decision recorded in
-- mig_248_249_design.md.
-- ============================================================================

-- 1. INSERT: nobody but the service role creates orders or items
REVOKE INSERT ON public.orders      FROM anon, authenticated;
REVOKE INSERT ON public.order_items FROM anon, authenticated;

-- 2. UPDATE: drop the blanket grant, re-grant only the columns user routes write
REVOKE UPDATE ON public.order_items FROM anon, authenticated;
GRANT  UPDATE (status, cancelled_at, cancelled_by, cancellation_reason,
               refund_amount_cents, cancellation_fee_cents,
               buyer_confirmed_at, vendor_confirmed_at, pickup_confirmed_at,
               confirmation_window_expires_at, lockdown_active, lockdown_initiated_at,
               issue_reported_at, issue_reported_by, issue_description, issue_status,
               issue_resolved_at, issue_resolved_by, issue_admin_notes, updated_at)
       ON public.order_items TO authenticated;

REVOKE UPDATE ON public.orders FROM anon, authenticated;
GRANT  UPDATE (status, external_payment_confirmed_at, external_payment_confirmed_by, updated_at)
       ON public.orders TO authenticated;

-- 3. DELETE/TRUNCATE were never used by any client — remove the default grant too
REVOKE DELETE, TRUNCATE ON public.orders, public.order_items FROM anon, authenticated;

-- 4. Hygiene: the buyer INSERT policy is now unreachable; drop it so the policy
--    list tells the truth. UPDATE policies stay (they still scope ROWS).
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "orders_insert"      ON public.orders;

NOTIFY pgrst, 'reload schema';  -- privilege changes affect PostgREST's column exposure
```
**Pre-check** (expect rows for INSERT/UPDATE/DELETE on both tables for both roles = hole open):
```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('orders','order_items')
  AND grantee IN ('anon','authenticated') ORDER BY 1,2,3;
```
**Post-check** (expect: SELECT only at table level; column_privileges lists exactly the user-writable set):
```sql
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('orders','order_items') AND grantee IN ('anon','authenticated');
SELECT table_name, column_name FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name IN ('orders','order_items')
  AND grantee='authenticated' AND privilege_type='UPDATE' ORDER BY 1,2;
```
**Rollback:** `GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.orders, public.order_items TO anon,
authenticated;` + recreate the two policies from mig 011:65-93 verbatim.
**Caveat to verify on Dev first:** PostgREST returns 42501 "permission denied for column" when a
user-client `.update({...})` includes a non-granted column — the 23 user-client updates listed above
include none, but a `select('*')` after update is unaffected (SELECT stays table-level).

### OPTION B — BEFORE trigger (fallback if column privileges interact badly with anything on Dev)
`guard_order_money_columns()` BEFORE INSERT OR UPDATE on both tables: if `current_user IN
('anon','authenticated')` then RAISE on INSERT, and on UPDATE RAISE when any protected column
`IS DISTINCT FROM` OLD. SECURITY DEFINER RPCs run as their owner, so they pass. Weaker than A only in
that a future migration could DROP the trigger without anyone noticing; a guardrail test would pin it.

### Phase 2 (after launch, separate migration): move `refund_amount_cents`, `cancellation_fee_cents`
and `orders.status` behind the service client too (7 route edits, 3 of them protected), then revoke
them from authenticated. Today they only feed reports/display (`admin/reports/route.ts`,
`buyer/orders/[id]/route.ts:219`), never a Stripe amount.

### Tests to ADD
- `db-constraints.integration.test.ts`: `information_schema.role_table_grants` shows no INSERT/DELETE
  for anon/authenticated on orders/order_items, and `column_privileges` for authenticated UPDATE on
  `order_items` excludes `vendor_payout_cents`, `subtotal_cents`, `quantity`, `listing_id`,
  `vendor_profile_id` (pins the invariant, not the incident).
- `money-structure.test.ts`-style contract: every `.from('orders'|'order_items').insert(` in
  `src/app/api` is on a service client (self-policing allowlist, expected empty).

## Decisions needed from the owner
1. **Option A (column privileges) vs Option B (trigger)** — recommendation: A.
2. **checkout/external** inserts with the user client and is the inactive external-payments flow
   (memory: "never use or change that code"). Under A/B it will be blocked. Choose: (a) accept — the
   flow is historical and this makes it inert at the DB too; (b) switch its two inserts to the service
   client (touches "never change" code, protected file). Recommendation: (a), recorded in decisions.md.
3. **Go to write** the two migration files into `supabase/migrations/`, the skip-route change, and
   present the protected checkout diff — in that order, one push for the code, then you apply 248 →
   249 on Dev → Staging.
