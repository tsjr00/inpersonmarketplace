# Plan: Cart Isolation — Move to DB Trigger (Option C)

**Created:** 2026-04-17 (Session 72)
**Status:** Planning — not yet implemented
**Priority:** Before event volume increases
**Critical-path file affected:** `cart_items` table (every add-to-cart INSERT)

---

## What this solves

`api/cart/items/route.ts:205-219` has an app-level check that prevents mixing event and non-event market items in the same cart. It has two problems:
1. **Race condition:** check and insert are not atomic. Two simultaneous requests could both pass the check and both insert, creating a mixed cart.
2. **Silent bypass:** the check doesn't handle Supabase query errors. If either query fails, the check is skipped entirely and the item is added without validation.

The fix: replace the app-level check with a BEFORE INSERT trigger on `cart_items` that enforces the same rule atomically inside the transaction.

---

## Elements involved

### Element 1: Trigger function creation

**What:** `CREATE OR REPLACE FUNCTION enforce_cart_event_isolation()` — BEFORE INSERT trigger function on `cart_items`.

**Logic:**
1. Query `cart_items` for any existing item in the same cart (`NEW.cart_id`) with a different `market_id` than `NEW.market_id`
2. If found: query `markets` for both market IDs to check if either has `market_type = 'event'`
3. If event conflict detected: `RAISE EXCEPTION` with error code and message
4. Otherwise: `RETURN NEW` (allow the insert)

**Risk:** Function body references `markets` table. If not SECURITY DEFINER, the query goes through `markets_select` RLS, which subqueries `order_items`, which has no recursive policies now (migration 122 dropped them) — but future RLS changes could re-introduce recursion.

**Mechanism of risk:** A future migration adds an RLS policy on `cart_items` or `markets` that creates a cycle with this trigger function's queries. Postgres raises "infinite recursion detected," every add-to-cart fails.

**Indicator of failure:** All add-to-cart operations return 500. Error in Postgres logs: `"infinite recursion detected in policy for relation..."`. Zero items being added to any cart.

**Rollback:** `DROP TRIGGER IF EXISTS trg_cart_event_isolation ON cart_items;` — one SQL statement in Supabase SQL Editor. The trigger is removed, inserts work immediately. The app-level check (if still present) continues to provide partial protection. If app-level check was removed, there is NO isolation enforcement until the trigger is re-created or app code is restored.

**Mitigation:** Use `SECURITY DEFINER SET search_path = public` on the function. This bypasses ALL RLS on the tables it queries, eliminating recursion risk entirely. The function runs with elevated privileges — scope it to read only `cart_items.market_id` and `markets.market_type`, nothing else.

---

### Element 2: Trigger attachment to cart_items table

**What:** `CREATE TRIGGER trg_cart_event_isolation BEFORE INSERT ON cart_items FOR EACH ROW EXECUTE FUNCTION enforce_cart_event_isolation();`

**Risk:** The trigger fires on EVERY `cart_items` INSERT — not just event-related ones. If the function errors for any reason (null market_id, missing cart_id, unexpected data type), ALL add-to-cart operations fail.

**Mechanism of risk:**
- `NEW.market_id` is NULL (listing-only cart items without a market selected yet) → the function queries `markets WHERE id IN (NULL, ...)` → returns empty → no conflict → `RETURN NEW`. Safe IF the function handles NULL correctly. If it doesn't (e.g., `NULL != NULL` is NULL in Postgres, not true), the query could behave unexpectedly.
- `NEW.cart_id` doesn't exist in `carts` table (orphaned insert) → the function queries `cart_items WHERE cart_id = non_existent_id` → returns empty → no conflict → `RETURN NEW`. Safe.
- Market box items (`item_type = 'market_box'`) — these also insert into `cart_items`. The trigger would fire on them too. Market boxes always have a `market_id`. If the market is not type='event', no conflict. If somehow a market box is at an event market, the trigger would block mixing with non-event items. Need to verify this is desired behavior.

**Indicator of failure:** HTTP 500 on POST `/api/cart/items`. Error in Supabase response: the Postgres exception message from `RAISE EXCEPTION`. In error_logs (if withErrorTracing catches it): `ERR_CART_*` or a raw Postgres error.

**Rollback:** Same as Element 1 — `DROP TRIGGER IF EXISTS trg_cart_event_isolation ON cart_items;`. Immediate effect, no deploy needed.

---

### Element 3: Error handling in app code

**What:** The app code at `cart/items/route.ts` needs to catch the Postgres exception from the trigger and translate it to a user-friendly error message.

**Current behavior:** The app-level check throws `traced.validation('ERR_CART_010', 'Your cart has items from a different location...')`. This produces a clean JSON error response.

**Post-trigger behavior:** The Supabase client returns the trigger's `RAISE EXCEPTION` as an error object. The app needs to detect this specific error and return the user-friendly message.

**Risk:** If the error detection is wrong (checks wrong error code, or the trigger's exception format doesn't match what the app expects), the user sees a generic "Failed to add item" instead of the helpful "Event orders cannot be combined" message.

**Mechanism of risk:** Postgres `RAISE EXCEPTION` with a custom error code (e.g., `ERRCODE 'P0001'` for raise_exception) and message. Supabase client returns this in `error.code` and `error.message`. The app code needs to check `error.code === '23514'` (check_violation) or `error.message.includes('event isolation')` — whichever the trigger uses. If the trigger uses a custom ERRCODE and the app checks for a different one, mismatch.

**Indicator of failure:** User adds event item to cart with existing non-event items → gets generic error "Failed to add item to cart" instead of the specific cross-event message. The item IS correctly blocked (trigger worked), but the UX is bad.

**Rollback:** No rollback needed — this is a UX issue, not a data integrity issue. Fix the error code matching in a subsequent code deploy.

**Mitigation:** Use a unique, greppable string in the trigger's RAISE EXCEPTION message (e.g., `'CART_EVENT_ISOLATION: ...'`). Check for that string in the app code with `error.message?.includes('CART_EVENT_ISOLATION')`. This is more robust than matching on Postgres error codes, which vary by exception type.

---

### Element 4: Remove app-level check (optional, recommended)

**What:** Delete lines 203-227 of `cart/items/route.ts` (the current app-level cross-event isolation check).

**Risk:** If the trigger is later dropped or broken without anyone noticing, there is NO isolation enforcement. Mixed carts can be created.

**Mechanism of risk:** A future migration accidentally drops the trigger (e.g., recreation of the `cart_items` table, or a `DROP TRIGGER` in a cleanup migration). The app-level check is gone. No enforcement exists.

**Indicator of failure:** Users can add event items and non-event items to the same cart. This would only be caught by a checkout validation or by a user reporting unexpected behavior.

**Rollback:** Restore the app-level check from git history: `git show <commit>:apps/web/src/app/api/cart/items/route.ts` → re-add lines 203-227. Or re-create the trigger.

**Mitigation:** Two options:
- **Keep both:** leave the app-level check as a defense-in-depth layer. It runs first (fast, non-blocking if it errors per Option A). The trigger is the hard gate. Belt and suspenders. Downside: two places to maintain the same rule.
- **Remove app check + add integration test:** delete the app code, add a test that verifies the trigger blocks mixed-market event carts. The test catches trigger removal in CI before it reaches prod.

**Recommendation:** Keep both during initial deployment. Remove app check in a later session after the trigger has been verified working on prod for at least one full event cycle.

---

### Element 5: Migration file

**What:** `supabase/migrations/YYYYMMDD_NNN_cart_event_isolation_trigger.sql`

**Risk:** Migration applied to one environment but not others (e.g., dev but not staging/prod). Code expects the trigger, but it doesn't exist on that environment.

**Mechanism of risk:** Standard migration drift. Dev has the trigger, staging doesn't. Testing passes on dev, fails on staging. Or: trigger applied to prod DB but code change not deployed yet → trigger blocks inserts with raw Postgres errors, app code doesn't translate them.

**Indicator of failure:** Different behavior across environments. App-level check works on staging (no trigger), trigger fires on prod (with trigger). Or: staging tests pass but prod breaks because trigger exists but error handling code isn't deployed.

**Rollback:** `DROP TRIGGER IF EXISTS trg_cart_event_isolation ON cart_items; DROP FUNCTION IF EXISTS enforce_cart_event_isolation();` — run on whichever environment has the issue.

**Mitigation:** Apply migration to ALL THREE environments in the same session, BEFORE deploying the app code change. The app-level check (still present) handles isolation until the trigger is in place. Once all 3 envs have the trigger AND the code is deployed, the transition is seamless.

---

### Element 6: Existing cart data

**What:** Any carts that ALREADY have mixed event + non-event items before the trigger is installed.

**Risk:** None for the trigger itself — BEFORE INSERT triggers only fire on new inserts, not existing rows. Existing mixed carts are unaffected.

**However:** if checkout validation also checks for cross-event isolation, existing mixed carts could fail at checkout with a confusing error (user added items before the trigger existed, now they can't checkout).

**Mechanism of risk:** User has a mixed cart from before the trigger was installed. They go to checkout. If checkout validates cart consistency, it rejects the order. User doesn't understand why — they were "allowed" to add both items.

**Indicator of failure:** Checkout returns error about mixed event items for a cart that was created before the trigger existed.

**Rollback:** Not applicable — this is a data consistency issue, not a trigger issue.

**Mitigation:** Before installing the trigger, run a cleanup query:
```sql
-- Find carts with mixed event + non-event market items
SELECT DISTINCT ci.cart_id
FROM cart_items ci
JOIN markets m ON ci.market_id = m.id
WHERE m.market_type = 'event'
AND ci.cart_id IN (
  SELECT ci2.cart_id FROM cart_items ci2
  JOIN markets m2 ON ci2.market_id = m2.id
  WHERE m2.market_type != 'event'
);
```
If any results: either clear those carts or notify affected users. At current volume, likely zero results.

---

## Implementation sequence

| Step | What | Requires | Rollback |
|------|------|----------|----------|
| 1 | Run cleanup query (Element 6) on all 3 envs | DB access | N/A |
| 2 | Write migration file (Element 5) | Code | Delete file |
| 3 | Apply migration to Dev → Staging → Prod (Elements 1+2) | DB access per env | DROP TRIGGER + DROP FUNCTION |
| 4 | Update app code error handling (Element 3) | Code change | Revert file |
| 5 | Deploy code to staging → test → prod | Git push | Revert commit |
| 6 | Verify trigger works on all envs | Manual test (add event item, then non-event item) | N/A |
| 7 | (Later) Remove app-level check (Element 4) | Code change after trigger proven stable | Restore from git |

---

## Testing checklist (per environment)

- [ ] Add regular item to empty cart → succeeds
- [ ] Add second regular item from same market → succeeds
- [ ] Add regular item from different non-event market → succeeds (no event involved)
- [ ] Add event item to empty cart → succeeds
- [ ] Add second event item from same event market → succeeds
- [ ] Add event item, then try regular item → blocked with clear message
- [ ] Add regular item, then try event item → blocked with clear message
- [ ] Add event item from Event A, then try event item from Event B → blocked with clear message
- [ ] Add market box item → succeeds (not affected by isolation)
- [ ] Cart item with NULL market_id → succeeds (NULL handled safely)
- [ ] Verify error message is user-friendly, not raw Postgres exception
