# Session 90 — Full Code & Systems Review (gaps / conflicts)

**Started:** 2026-06-05
**Mode:** Report (review only — NO code changes authorized)
**Goal:** Re-establish context after Windows-interrupted session; scan whole codebase for actual gaps/conflicts (not opportunities). Priorities: 1) Security 2) Data integrity 3) Efficiency 4) UI/UX.

**Method:** Search agents FIND candidates (file:line) → Claude READS & VERIFIES each → present with citation. Unverified items flagged. Schema snapshot is STALE/has phantom columns → not authoritative for data claims.

---

## Checklist (recovery points)

- [ ] S1. Auth gaps on API routes (missing getUser / admin / ownership checks → IDOR)
- [ ] S2. Service-role client misuse (RLS bypass in user-facing paths)
- [ ] S3. Anon-executable SECURITY DEFINER fns (known: validate_cart_item_schedule, mig 153 pending)
- [ ] S4. Rate-limit gaps
- [ ] S5. Input validation / injection
- [ ] S6. Secrets in repo
- [ ] D1. Phantom column refs (known: orders.market_id etc.)
- [ ] D2. Delete-and-replace where soft-delete intended
- [ ] D3. Inventory race / non-atomic decrements
- [ ] D4. Payout double-processing / idempotency
- [ ] D5. Cross-vertical isolation gaps (missing .eq vertical_id)
- [ ] E1. N+1 / sequential-where-parallel
- [ ] U1. window.confirm/alert/prompt on mobile
- [ ] U2. Known carryover bugs (3 vendor routes single() — Session 70)

---

## VERIFIED FINDINGS

### DATA INTEGRITY — market_schedules hard-delete cascades vendor attendance (HIGH)
Schema facts (verified from migrations, snapshot is stale):
- `market_schedules.active BOOLEAN DEFAULT true` — soft-delete column EXISTS (`20260114_001_phase_k1_markets_tables.sql:42`)
- `vendor_market_schedules.schedule_id ... REFERENCES market_schedules(id) ON DELETE CASCADE` (`20260128_001_vendor_market_schedules.sql:13`)
- `cart_items.schedule_id` + `order_items.schedule_id ... ON DELETE SET NULL` (`20260205_001_pickup_scheduling_schema.sql:27,61`)

Three hard-delete sites (enumerated via grep):
- **2A `admin/markets/[id]/route.ts:153-174`** — blanket `.delete().eq('market_id')` then re-insert ALL schedules with new UUIDs. NO guard. Every admin edit of market hours cascade-deletes ALL vendor_market_schedules attendance opt-ins for that market + nulls order_items/cart_items.schedule_id. Exact Session-83 Schema-Intent-Gate pattern. HIGH.
- **2B `vendor/markets/[id]/route.ts:184-209`** — same blanket delete-and-replace. Has a partial guard (blocks if *removed* windows have pending orders, :161-182) but still hard-deletes ALL schedules including KEPT ones → cascades attendance opt-ins + breaks FK linkage even for unchanged windows. HIGH.
- **2C `markets/[id]/schedules/[scheduleId]/route.ts:157-162`** — single-row delete. Auth+admin OK, guards active orders (:143-155). BUT still hard-deletes → cascades that schedule's vendor_market_schedules. Self-contradicting: error msg at :152 says "Deactivate it instead" yet code deletes. MEDIUM.

### SECURITY — events/[token]/select POST unauthenticated + low-entropy token (MEDIUM)
- `events/[token]/select/route.ts:166` POST — no `auth.getUser()`, only rate-limit + token possession (:169). Mutates event: flips status→ready, sets selected/backup vendors, overwrites organizer contact, triggers notifications.
- Token = `company-slug` + `Date.now().toString(36).slice(-6)` (`lib/events/event-actions.ts:97-98`) — NOT a crypto-random secret; last-6 base36 of a ms timestamp + guessable company name. Affects whole `events/[token]/*` bearer surface. Design intent = "organizer may have no account." MEDIUM (state mutation behind weak gate).

### SECURITY — market-boxes list leaks across verticals when ?vertical= omitted (LOW)
- `market-boxes/route.ts:55-60` — `.eq('active', true)` then `if (verticalId) query.eq('vertical_id', ...)`. No param → returns offerings across ALL verticals. Sibling `browse/page.tsx` always filters. No current in-app caller hits it param-less, but endpoint is reachable. LOW (latent).

### KNOWN GAP STILL OPEN — validate_cart_item_schedule not REVOKEd (carryover, confirmed)
- mig 152 (`applied/20260602_152...:190-198`) REVOKEs PUBLIC on validate_cart_item_inventory + _market but NOT validate_cart_item_schedule (defined `20260205_002_pickup_scheduling_functions.sql`). mig 153 not yet created. Matches current_task.md lingering note 1. (Live prod ACL per Session 87 advisor — not re-queried.)

### UI/UX — native dialogs blocked on mobile PWA (LOW-MED, admin-only)
- `[vertical]/admin/vendor-activity/VendorActivityClient.tsx:402` — `confirm(...)` gating bulk-dismiss; silent no-op on mobile. Verified client component.
- `[vertical]/admin/users/UsersTableClient.tsx:101,104` + `admin/users/UsersTableClient.tsx:130,133` — `alert(...)` error feedback; invisible on mobile. (per agent; pattern matches verified one)

## SOLUTION PROPOSALS (Session 90 deep-dive)

### Item 1 — market_schedules soft-delete fix
WHY it was built with delete-and-replace: admin route + vendor route predate the Session-83 Schema Intent Gate. The CORRECT pattern was built later in `market-manager/[marketId]/schedules/route.ts` (PUT) — per-day soft-upsert, never DELETE, relies on trigger `trigger_market_schedule_deactivation` (`20260128_001:151-172`) which sets `vendor_market_schedules.is_active=false` when `market_schedules.active` flips true→false. Infrastructure already exists (active column + trigger).
- Fix = port the manager route's load-existing→update-in-place-or-insert→deactivate-absent logic into admin/markets/[id] (2A) and vendor/markets/[id] (2B); convert single-delete 2C to `update({active:false})`.
- UX impact: ZERO for all roles (backend-only). Actually IMPROVES vendor UX — kept/edited windows keep attendance instead of losing it.
- Design choice to surface: key by day_of_week (manager's one-slot-per-day, preserves attendance across time-edits) vs composite day+start+end (preserves multi-window-per-day for private_pickup but time-edits deactivate+recreate). Vendor route currently keys composite (`vendor/markets/[id]/route.ts:152-154`) = supports multi-window/day.

### Item 2 — event token security
Current: organizer routes (select/cancel/details PATCH) gated only by `event_token` = company-slug + Date.now().toString(36).slice(-6) (low entropy, guessable). access_code already exists on catering_requests (attendee ordering secret, `verify-code/route.ts:44`, rate-limited 5/min).
- Primary fix (zero friction, highest leverage): make event_token crypto-random (crypto.randomUUID / randomBytes) — keep human slug prefix + append strong secret. Closes brute-force across ALL events/[token]/* with no UX change (organizer still clicks email link, no account). Migration: new tokens strong; existing emailed tokens stay valid OR backfill+dual-read.
- Defense-in-depth: prefer organizer_user_id ownership when logged in (cancel already does); never log tokens.

### Item 3 — market-boxes vertical filter
Fix: require `?vertical=` (400 if absent) or always apply filter. NO in-app caller of list route (grep: zero) → safe. Impact of bug: param-less call returns active offerings across all verticals incl. joined vendor profile_data; vertical-isolation breach, no PII. Severity LOW (reachable, no current caller).

### Item 4 — native dialogs
- `confirm()` VendorActivityClient:402 → ConfirmDialog (28-file precedent, drop-in, supports danger variant). WORKS.
- `alert()` UsersTableClient (both) → Toast-state pattern. Exact sibling ListingsTableClient already does this (`:85,97-104`) at the same suspend/unsuspend error sites. WORKS (same fix, same file family). ConfirmDialog alone is NOT the right tool for error feedback — Toast is.

### Doc corrections
- CLAUDE_CONTEXT.md:451 stale (3 vendor routes already fixed) → edit/remove the bullet. Scope: 1 doc line. Risk: none. Impact: prevents future session re-investigating a non-issue.
- validate_cart_item_schedule REVOKE → draft mig 153 (REVOKE EXECUTE FROM PUBLIC+anon+authenticated, DO-block env-safe), apply 3 envs, move to applied/. Scope: 1 migration. Risk: low (permission-only, ROLLBACK block). Impact: closes anon-executable SECURITY DEFINER advisor warning.

## RULED OUT / STALE-DOC CORRECTIONS
- **Session 70 carryover FIXED**: cover-image/stripe-onboard/stripe-status now all use `getVendorProfileForVertical` (verified cover-image:21, onboard:28, status:26). CLAUDE_CONTEXT.md:451 entry is STALE.
- Phantom orders columns (market_id, vendor_payout_cents, buyer_fee_cents, service_fee_cents): CLEAN in app code (agent verified, events/cancel comment documents prior fix).
- Inventory decrements: CLEAN — checkout/session:780 + checkout/external:331 use atomic_decrement_inventory RPC.
- Stripe idempotency keys: CLEAN — all deterministic.
- Rate-limit coverage: CLEAN — all public mutation routes call checkRateLimit; 14 exempt routes all have stronger gates (HMAC/CRON_SECRET).
- Committed secrets: CLEAN (only known settings.local.json, being rotated).
- listing_markets delete-and-replace: OK — pure junction table, no soft-delete column.

---

## CANDIDATES (from agents — UNVERIFIED until I read)

---

## RULED OUT / NOT AN ISSUE

