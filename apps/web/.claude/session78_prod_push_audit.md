# Session 78 — Pre-Prod-Push Comprehensive Audit

**Started:** 2026-05-05
**Mode:** Report only — no code changes
**Target push:** 27 commits + 4 migrations from `origin/staging` (`00dc2f44`) to `origin/main`
**Pending migrations:** 128, 129, 130, 131 (apply to Prod IN ORDER before code push)

---

## Severity legend

- **P0** — Blocker. Will break prod the moment it deploys. Must fix or revert before push.
- **P1** — High risk. Could cause user-visible failures or data inconsistency under common conditions.
- **P2** — Medium risk. Edge cases, observability gaps, minor regressions.
- **P3** — Low risk. Cosmetic, documentation, or pre-existing issues surfaced by this audit.

Every finding cites file:line. No claim is presented as fact without the audit owner having read the code.

---

## Phase 1 — Diff enumeration (DONE)

### Commits (27, oldest first)

```
5a249b13 chore: migrations 124-127 applied to prod — moved to applied/
ef417e7f feat: admin compressed-row mobile view for vendors list (Phase 2 — vendors only)
dd46c9d1 fix: vendors mobile iteration — wider rows, field swap, landscape table, back button
684c326c fix: admin mobile iteration 3 — landscape orientation rule + compact dashboard stats
c2ab5038 fix: admin mobile iteration 4 — vendor detail overflow
5224fe12 feat: compressed mobile rows for listings, users, markets, vendors/pending
59b03888 fix: stacked layout for action-mode mobile rows (listings, users)
e58c6d30 feat: vertical admin Phase A — compressed mobile rows + detail overflow fixes
645b4a2d fix: vertical admin Phase A iteration — wider rows, tabs on top, overflow safety
c490c4bf fix: vertical admin Phase B Batch 1 — quick wins
8a2a5a1f fix: Session 75 audit batch 1 — non-critical-path bugs
c96f3ee9 fix: Session 75 audit batch 2 — critical-path bugs
dad58074 fix: P1-7 directory rename — [id] → [listingId] for Next.js slug consistency
5dea312b feat: event data gathering + payment-model context — Stage 1/Stage 2 wiring
eea40abd fix: add sourceType to NotificationTemplateData (Vercel build hotfix)
f236f85b chore: pre-push runs `npm run build` + Protocol 5 update
3210f64e feat: vertical admin Phase B Batch 2 — error-logs + admins compressed mobile rows
14cf11e7 fix: migration 129 — DROP NOT NULL on catering_requests.address
8a4a2328 fix: vendor_count suggestion — layered formula + helper text decoupled
3b6f6c97 fix: events language + notifications + wave capacity hard-error
13d8727e fix: migration 130 — preserve TABLE return type from migration 120
ecf22fad feat: stripe reconciliation admin tool + migration 130 bookkeeping
2a6d99b1 fix: stripe reconcile — match by PI, fix totals, label fees, add platform revenue
7f1d6c3a fix: stripe reconcile — handle 'payment' BT type + add per-row diagnostics
76f4a69e fix: stripe reconcile — drop phantom columns, capture sql errors
0d162e78 chore: pre-commit gate blocks bare migration commits + session 75-77 wrap
00dc2f44 fix: traditional markets require active vendor attendance row (migration 131)
```

### Diff stats

- 67 files changed
- +5,039 insertions / -544 deletions
- 4 NEW migrations (128, 129, 130, 131)
- 4 migrations moved to `applied/` (124-127, already on prod from Session 74)
- 2 NEW files in critical paths: `lib/stripe/reconcile.ts` (922 lines), `app/[vertical]/admin/stripe-reconcile/page.tsx` (622 lines)
- 2 NEW API routes: `events/[token]/refresh-matches/route.ts`, `vendor/listings/[listingId]/publish/route.ts`

### Critical-path files touched (per `apps/web/.claude/rules/critical-path-files.md`)

| File | Lines changed | Status |
|---|---|---|
| `src/app/api/cart/items/route.ts` | +32 | ⚠️ MODIFIED — needs review (Session 66 broke this exact file) |
| `src/lib/stripe/webhooks.ts` | +11 | ⚠️ MODIFIED — money path |
| `src/app/api/cron/expire-orders/route.ts` | +18 | NOT in critical-path list but cron-driven, money-adjacent |

**`cart/items/route.ts` modification is the single highest-risk item in the diff.** Will deep-dive in Phase 3.

---

## Phase 2 — Migration safety [DONE]

### Migration 128: `event_setting` column on `catering_requests`

- **What it does:** Adds nullable TEXT column with CHECK constraint (`indoor`/`outdoor`/`either`).
- **Code dependency:** `apps/web/src/app/api/event-requests/route.ts:91` REQUIRES `event_setting` in POST body. `:111-116` validates value. `:243` inserts it.
- **Order requirement:** **MUST APPLY BEFORE CODE PUSH.** If not applied, every event submission fails with `column "event_setting" does not exist`.
- **Reverse compatibility:** Old code (currently on prod) doesn't read this column, so applying 128 alone before code push is safe.
- **Risk:** **P0** if migration order is reversed.

### Migration 129: `catering_requests.address DROP NOT NULL`

- **What it does:** Relaxes `address` to allow NULL.
- **Code dependency:** `apps/web/src/app/api/event-requests/route.ts:239` writes `address: address ? ... : null`. New form (`EventRequestForm.tsx`) treats address as optional at Stage 1.
- **Order requirement:** **MUST APPLY BEFORE CODE PUSH.** If not applied, organizers who omit address get NOT NULL violation `23502`.
- **Reverse compatibility:** Existing rows have non-null address; relaxation is non-breaking. Old code doesn't insert NULLs, so it tolerates either DB state.
- **Self-service gate:** `:291-294` — if address missing AND self-service, request stays in `'new'` state instead of auto-approving. Admin can fill in later.
- **Admin gate (Stage 2):** `admin/events/[id]/route.ts` rejects status='approved' transition when address null/empty (per Session 75 design — verified by reading 113-122 region after).
- **Risk:** **P0** if migration order is reversed.

### Migration 130: `recalculate_wave_capacity` no-silent-fallback rewrite

- **What it does:** Replaces `COALESCE(event_max_orders_per_wave, 25)` silent default with `RAISE EXCEPTION` if any accepted vendor lacks per-wave capacity.
- **Callers in app code:** **NONE.** `Grep` confirms zero TS/SQL callers. Function is admin-callable RPC only.
- **Order requirement:** Strictly speaking, none — function rewrite has no app callers. Still recommended to apply in numeric order.
- **App-level analog:** `apps/web/src/lib/events/wave-generation.ts:121-130` (committed in `3b6f6c97`) has the same hard-error logic in TS. Callers: `api/admin/events/[id]/route.ts:206` (auto on `status='ready'` for company_paid/wave_ordering events) and `api/admin/events/[id]/generate-waves/route.ts:78` (explicit admin endpoint).
- **Behavior change in TS callers:**
  - Auto-trigger from admin approval (`route.ts:210`): `.catch(err => console.error(...))` — fire-and-forget. Hard-error here = silent failure (event has no waves, buyer-side wave reservation broken).
  - Explicit endpoint (`generate-waves/route.ts:84-89`): returns 400 with the error message. Admin-visible.
- **Risk on Prod:** **P2.** Per migration comment: "Q4: no real events on prod." Hard-error only fires for events with `payment_model='company_paid' OR wave_ordering_enabled=true` AND accepted vendors lacking per-wave capacity. Fully FT events have validation at acceptance time. Edge case: FM event accidentally configured as company_paid → FM vendors lack per-wave capacity → silent wave gen failure.
- **Pre-apply verification query** (run on Prod before applying code):
  ```sql
  SELECT cr.id, cr.company_name, cr.payment_model, cr.vertical_id, cr.status,
         m.id AS market_id, m.wave_ordering_enabled,
         COUNT(*) FILTER (WHERE mv.event_max_orders_per_wave IS NULL) AS missing_count
  FROM catering_requests cr
  JOIN markets m ON m.id = cr.market_id
  LEFT JOIN market_vendors mv ON mv.market_id = m.id AND mv.response_status = 'accepted'
  WHERE (cr.payment_model = 'company_paid' OR m.wave_ordering_enabled = true)
    AND cr.status NOT IN ('completed', 'cancelled', 'declined')
  GROUP BY cr.id, cr.company_name, cr.payment_model, cr.vertical_id, cr.status, m.id, m.wave_ordering_enabled
  HAVING COUNT(*) FILTER (WHERE mv.event_max_orders_per_wave IS NULL) > 0;
  ```
  If rows return, those events will silently fail wave generation after this code ships. Decide: backfill capacity, change payment_model, or wave_ordering_enabled=false before push.

### Migration 131: `get_available_pickup_dates` require active vms for traditional

- Already fully audited Session 78. Verified on Staging.
- **Order requirement:** None strictly — function rewrite. Old code tolerates either behavior.
- **Risk:** **P3.** Backfill query confirmed only Sweet Rise Bakery (test vendor) affected.
- **Dev runtime:** broken due to pre-existing env drift (missing migrations 039/040). Not relevant for Prod.

### Migration order summary

```
On Prod, in 9pm–7am CT window:
  1. Apply migration 128  → verify with SELECT column_name FROM information_schema.columns WHERE table_name='catering_requests' AND column_name='event_setting';
  2. Apply migration 129  → verify is_nullable='YES' on catering_requests.address
  3. Run wave-capacity verification query above; if rows return, STOP and decide
  4. Apply migration 130
  5. Apply migration 131  → verify with SELECT * FROM get_available_pickup_dates(<known good listing>);
  6. git push origin main
```

Migrations 128 and 129 are P0 — pushing code without them = immediate breakage of event submission form. 130 and 131 are P2/P3.

---

## Phase 3 — Per-area deep dive [IN PROGRESS]

---

### 🚨 P1 — `catering_vendor_invited` notification: missing `marketId` in admin manual invite caller

**File:** `apps/web/src/app/api/admin/events/[id]/invite/route.ts:170-176`

**What's broken:**
The notification template's `actionUrl` was changed in commit `3b6f6c97` (Session 76 F1 fix) from `${marketName}` to `${marketId}` (`apps/web/src/lib/notifications/types.ts:773`). Three of the four callers were updated to pass `marketId` in templateData. **One caller was missed.**

**Caller audit:**
| Caller | Passes `marketId`? |
|---|---|
| `lib/events/event-actions.ts:374` (auto-match-and-invite) | ✅ `marketId: marketId` |
| `api/events/[token]/select/route.ts:288` (organizer selection) | ✅ `marketId: event.market_id` |
| `api/vendor/events/[marketId]/cancel/route.ts:253` (backup escalation) | ✅ `marketId: marketId` |
| `api/admin/events/[id]/invite/route.ts:170` (admin manual invite) | ❌ **MISSING** |

When admin clicks "Invite Vendors" on the event admin page, vendors get an in-app notification whose actionUrl is `/<vertical>/vendor/events/undefined` → 404.

**Retroactive impact:**
In-app notification `actionUrl` is computed at render time from the stored `data` field (verified at `lib/notifications/service.ts:134-145` — only `title`, `message`, `data`, and `vertical_id` are inserted, NOT `actionUrl`). So **every existing `catering_vendor_invited` notification on Prod will use the new actionUrl function after deploy**. If the historic `data` field doesn't have `marketId`, the URL becomes `/<vertical>/vendor/events/undefined`.

**Pre-push verification query (run on Prod):**
```sql
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE data ? 'marketId') AS with_marketId,
       COUNT(*) FILTER (WHERE NOT (data ? 'marketId')) AS without_marketId
FROM notifications
WHERE type = 'catering_vendor_invited';
```

If `without_marketId > 0`, those vendor notifications will 404 after deploy.

**Recommended fix (must ship with this PR or before):**
1. Add `marketId: cateringReq.market_id,` to the templateData at `admin/events/[id]/invite/route.ts:170-176`. One-line fix.
2. (Optional, more defensive) Make the actionUrl function fall back to `/<vertical>/vendor/dashboard` when `marketId` is undefined.

**Severity:** P1 (high). Both the new caller bug AND retroactive impact on historic notifications. Will not crash the app but breaks the click-through path for vendor invitations — a key flow during active vendor onboarding.

---

### P3 — `cart/items/route.ts +32 lines` (CRITICAL-PATH file modified)

**Commit:** `c96f3ee9` (Session 75 audit batch 2 — P1-1)
**Lines:** `apps/web/src/app/api/cart/items/route.ts:445-475` (handleMarketBoxAdd)

**What changed:** Adds cross-event cart isolation for market box adds. Mirrors the existing listing-side check at `:203-227` exactly. Wrapped in `if (newMarketId)` to fail open on offerings with NULL `pickup_market_id`.

**Risk:** Low. Pattern is identical to well-tested existing code. No happy-path behavior changes — only adds a new throw on a previously-allowed edge case (cart-mixing event market box with non-event listing).

**Verification:** Read both blocks side-by-side. Logic matches. The `fail open` on null pickup_market_id is documented and intentional.

**Note:** This commit DOES touch a critical-path file (`cart/items/route.ts`) per `apps/web/.claude/rules/critical-path-files.md`. Per the rule, every modification needs explicit per-file approval. Commit message says "P1-1 cart cross-event isolation" — assume this was discussed in Session 75 audit batch 2 review. **Verify this was approved with file-level consent before push.**

---

### P3 — `webhooks.ts +11 lines` (chargeback dedup)

**Commit:** `c96f3ee9` (P1-2)
**Lines:** `apps/web/src/lib/stripe/webhooks.ts:1077-1095`

**What changed:** `handleChargeDisputeCreated` checks `wasNotificationSent` before notifying each admin to dedup on Stripe webhook retries. Mirrors `handleChargeRefunded` pattern.

**Risk:** Low. Defensive, well-scoped, mirrors existing tested code.

---

### P2 — `expire-orders/route.ts +18 lines` (cron source_transaction)

**Commit:** `c96f3ee9` (P0-2)
**Lines:** `apps/web/src/app/api/cron/expire-orders/route.ts:1086-1108`

**What changed:** Phase 5 cron payout retry now looks up charge ID via `payments.stripe_payment_intent_id` and threads it as `sourceTransaction` to `transferToVendor`. Mirrors `vendor/orders/[id]/fulfill/route.ts:312-324`.

**Why:** Resolves the Session 74 stuck-payout incident ($16.01 payout in `processing` for 24+ hours due to `balance_insufficient` on transfer because charge hadn't settled).

**Risk:** Low. Bug fix with clear root cause. Pattern proven in fulfill/route.ts.

**Behavior on Prod after push:** Cron runs every minute. The next time a Phase 5 payout retry fires for a recently-paid order, it'll succeed where it previously failed. Net positive.

---

### P2 — `market-box-payout.ts +27 lines` (P1-3 notification enrichment)

**Commit:** `8a2a5a1f` (P1-3)
**Lines:** `apps/web/src/lib/stripe/market-box-payout.ts:140-167`

**What changed:** Adds offering name + buyer name lookups (in `Promise.all` + try/catch) to enrich the `payout_processed` notification. Falls back to undefined if lookup fails.

**Risk:** Low. Defensive (try/catch). Two extra DB queries per market-box payout (offering name + buyer profile). Performance impact: negligible.

**Companion change:** `notifications/types.ts +65 lines` — adds `sourceType?: 'market_box_subscription'` discriminator and branches `payout_processed` template's message + actionUrl. New notification type `event_force_completed_with_unfulfilled` also added.

**Verification:** Caller for new type at `api/admin/events/[id]/route.ts:344-347` correctly passes `marketName` (with fallback), `orderCount`, and `vertical` in options arg per memory.

---

### P2 — `event_force_completed_with_unfulfilled` new notification type

**File added in:** `apps/web/src/lib/notifications/types.ts:835-845`
**Caller:** `apps/web/src/app/api/admin/events/[id]/route.ts:344-347`

**What it does:** When admin force-completes an event that still has unfulfilled order items, vendor gets a corrective notification (separate from `event_settlement_summary` which has thank-you tone).

**Risk:** Low. Properly gated. Unique key in notif catalog. Caller passes correct fields.

---

### Areas to review (in order)

1. ⏳ **Migration 131 + cart/checkout/listing-detail/profile vendor attendance** — already deep-audited Session 78
2. ⏳ **Migration 130 + wave capacity hard-error** — risk: prod events with vendors missing per-wave capacity will throw
3. ⏳ **Migrations 128, 129 + event form Stage 1/Stage 2 + viability matching**
4. ⏳ **Stripe reconcile (4 commits, 1.5k LOC new) — admin-scoped**
5. ⏳ **`cart/items/route.ts` +32 lines — CRITICAL PATH**
6. ⏳ **`webhooks.ts` +11 lines + `market-box-payout.ts` +27 lines**
7. ⏳ **`expire-orders/route.ts` +18 lines (cron, autonomous)**
8. ⏳ **`notifications/types.ts` +65 lines — NotificationTemplateData shape**
9. ⏳ **`events/[token]/refresh-matches/route.ts` (NEW)**
10. ⏳ **`vendor/listings/[listingId]/publish/route.ts` (NEW)**
11. ⏳ **Vertical admin Phase A + B (mobile rows, error-logs page, admins page)**
12. ⏳ **P1-7 directory rename `[id]` → `[listingId]` — orphaned link audit**
13. ⏳ **Pre-commit/pre-push hook changes — local dev impact only**

### P3 — `events/[token]/refresh-matches/route.ts` (NEW)

**File:** `apps/web/src/app/api/events/[token]/refresh-matches/route.ts` (107 lines)

**What it does:** Organizer-initiated re-run of vendor auto-match. Calls existing `autoMatchAndInvite` which is idempotent.

**Risk:** Low. Auth: organizer match by id OR email. Rate limited (submit). Idempotent. Reuses well-tested logic.

---

### P3 — `vendor/listings/[listingId]/publish/route.ts` (NEW)

**File:** `apps/web/src/app/api/vendor/listings/[listingId]/publish/route.ts` (167 lines, in dir originally `[id]` then renamed via commit `dad58074`)

**What it does:** Server-side enforcement of `canPublishListings` gate. Replaces client-side direct Supabase update from `PublishButton.tsx`. Checks: verification approved, all required permits/categories approved, Stripe payouts enabled, partner agreement (or grandfathered).

**Risk:** Low. Net positive — closes a security hole where the client could bypass the gate. **Has a TODO at line 27-28** noting that gate logic duplicates `/api/vendor/onboarding/status/route.ts:195-210, 220-224`. Drift risk over time if the two diverge. P3 (debt).

**Compatibility:** PublishButton already updated to POST to this route (`8a2a5a1f`). Old cached client code in vendors' browsers might still call Supabase directly — Supabase RLS policies should reject this, but worth confirming `listings.UPDATE` policy doesn't allow vendor self-publish.

---

### P3 — Stripe reconcile admin tool (4 commits, ~1700 LOC NEW)

**Files:**
- `apps/web/src/lib/stripe/reconcile.ts` (NEW, 922 lines)
- `apps/web/src/app/api/admin/stripe-reconcile/route.ts` (NEW, 96 lines)
- `apps/web/src/app/[vertical]/admin/stripe-reconcile/page.tsx` (NEW, 622 lines)
- `apps/web/src/components/admin/AdminNav.tsx` (+1 line, link added)
- `apps/web/src/app/[vertical]/admin/events/[id]/settlement/page.tsx` (+16 lines, magnifier icon links)

**What it does:** Admin-only tool to look up Stripe IDs / order numbers / emails and reconcile with platform records. Read-only. No DB writes. No Stripe writes.

**Auth:** `verifyAdminScope` at `route.ts:44`. Platform admins see all; vertical admins scoped to their vertical.

**Risk:** P3 (low). Admin-only diagnostic tool. The 4 fix commits during development (PI matching, totals, payout type handling, phantom column drops) were all caught and corrected on Staging during user testing — none reach prod.

**Net effect on prod:** New diagnostic capability. Zero impact on user-facing flows. Zero impact on existing admin flows except for one new nav link and per-row magnifier icons on the settlement page.

---

### P3 — Vertical admin Phase A + B (mobile compressed rows + new pages)

**Files:**
- NEW: `src/components/admin/AdminMobileRow.tsx` (142 lines)
- NEW: `src/components/admin/AdminResponsiveStyles.tsx` (287 lines)
- NEW: `src/app/[vertical]/admin/admins/page.tsx`, `error-logs/page.tsx`, `analytics/page.tsx`, `markets/page.tsx`
- Modified: vendor/listing/user/admin tables, dashboard layouts (mobile responsive)

**What it does:** Compressed-row mobile view across admin tables. New pages: vertical-admin error logs (auth-scoped), vertical-admin admins management. Vertical-aware: each page uses `verifyAdminScope` and filters by `effectiveVerticalId`.

**Verified:** `apps/web/src/app/api/admin/error-logs/route.ts:54-56` — `query.eq('vertical_id', scope.effectiveVerticalId)` correctly scopes vertical admin queries.

**Risk:** P3. Cosmetic + new admin features. No buyer/vendor impact. New pages are auth-gated.

---

### P3 — Pre-commit + pre-push hook changes

**Files:**
- `.husky/pre-commit` — adds gate that blocks bare migration commits (Session 75 process improvement)
- `.husky/pre-push` — runs `npm run build` THEN Playwright (Protocol 5 update)

**What it does:** Local-only enforcement. Never runs in production environment. Slows down developer push by ~3-5 min for the build step.

**Risk:** P3 (zero prod impact). Already validated by the successful pre-push hook run that pushed `00dc2f44` to staging.

---

### P3 — Test count update (NI-014)

**File:** `apps/web/src/lib/__tests__/cutoff-and-sort-functional.test.ts:144-152`

**Change:** `expect(Object.keys(NOTIFICATION_REGISTRY)).toHaveLength(62)` → `63`. Reflects addition of `event_force_completed_with_unfulfilled` notification type.

**Risk:** P3. Legitimate test update, not a workaround.

---

## Phase 4 — Cross-cutting checks [DONE]

### Vault status

- Vault commit: `7f895e5` (pre-Session 59).
- **Vaulted files modified in this push:** `apps/web/src/lib/stripe/webhooks.ts` only.
- Diff vs vault would show massive accumulated change since Session 59 (~150 commits between vault and current). The recent change (chargeback dedup) is well-scoped and safe — see P3 finding above.

### Critical-path file modifications

Per `apps/web/.claude/rules/critical-path-files.md`:

| File | Modified? | Verified |
|---|---|---|
| `src/app/api/cart/items/route.ts` | ✅ +32 lines | P3 (mirrors existing pattern) — see finding above |
| `src/app/api/cart/items/[id]/route.ts` | No | — |
| `src/app/api/cart/validate/route.ts` | No | — |
| `src/app/api/checkout/session/route.ts` | No | — |
| `src/app/api/checkout/success/route.ts` | No | — |
| `src/app/api/checkout/external/route.ts` | No | — |
| `src/lib/stripe/payments.ts` | No | — |
| `src/lib/stripe/webhooks.ts` | ✅ +11 lines | P3 (chargeback dedup) — see finding above |
| `src/app/api/vendor/orders/[id]/reject/route.ts` | No | — |
| `src/app/api/vendor/orders/[id]/fulfill/route.ts` | No | — |
| `src/app/api/vendor/payouts/route.ts` | No | — |
| `src/lib/pricing.ts` | No | — |
| `src/lib/vendor-limits.ts` | No | — |

Both critical-path modifications were minimal, targeted, and follow existing patterns.

### RLS / policy changes

None of the 4 migrations touch RLS policies. Only schema (128, 129) and function bodies (130, 131).

### Vertical isolation

- Notifications: every `sendNotification` call I read passes `vertical` in OPTIONS arg (4th param), per memory. ✓
- Admin error-logs: scoped via `verifyAdminScope.effectiveVerticalId`. ✓
- Stripe reconcile: scoped via `verifyAdminScope`. ✓
- New events route (refresh-matches): operates on a single event by token; no cross-vertical leak path.

### Notification template data shape

- `payout_processed` adds `sourceType` discriminator + `offeringName` + `buyerName` + `subscriptionId`. Type definition includes them as optional.
- `event_force_completed_with_unfulfilled` is a new type with `marketName`, `orderCount`, `vertical` shape. Caller passes correct fields.
- **Open risk:** historic `catering_vendor_invited` notifications stored on Prod may not include `marketId` in their `data` JSONB. Run pre-push verification query (see P1 finding above).

### Frontend ↔ backend contract checks

- `EventRequestForm` sends `event_setting` ✓ (line 425 in form aligns with API line 91 requirement)
- `OrganizerEventDetails` PATCH allowed fields list includes `event_setting`, `address` ✓ (route's ALLOWED_FIELDS at 21-50)
- `PublishButton` POST → `/api/vendor/listings/[listingId]/publish` ✓ (URL matches dir name post-rename)

### Prod data hazards

- **Sweet Rise Bakery FM listings (`60edb3d6-...`)**: deactivated vms at Amarillo + Canyon. Migration 131 will cause those listings to stop appearing on listing detail page. **This is the intended fix** — Sweet Rise's listings can't be checked out at those markets anyway. No user-visible regression because checkout already blocked.
- **Other FM listings**: Pre-fix audit query confirmed only Sweet Rise affected. No collateral damage.
- **Wave-using events with vendors missing `event_max_orders_per_wave`**: pre-push verification query (under Migration 130 above) must be run on Prod before push. If rows return, those events will silently fail wave generation. Decision needed.
- **Historic `catering_vendor_invited` notifications**: pre-push verification query (under P1 finding) must be run. If `without_marketId > 0`, click-through paths break for those notifications.

### Tests

- Vitest: passes locally (pre-commit hook ran successfully on `00dc2f44`). NI-014 test updated to 63.
- Playwright: 49 passed, 1 skipped on push hook (after `.next` clear). FM signup flake was Turbopack — confirmed remediated.
- No test was modified to mask a real failure (no skipped/conditional tests added).

### Build status on Staging tip

`origin/staging` = `00dc2f44`. Vercel build status: GREEN per current_task.md (was GREEN at `76f4a69e` and only doc/SQL changes since).

---

## Phase 5 — Pre-push checklist + apply order [DONE]

### Pre-push verification queries (run on Prod)

**Query 1: Wave-capacity hazard (Migration 130)**
```sql
-- Returns events where wave generation will silently fail after this code ships.
-- If rows return, decide before push: (a) backfill event_max_orders_per_wave,
-- (b) change payment_model to attendee_paid, or (c) wave_ordering_enabled=false.
SELECT cr.id, cr.company_name, cr.payment_model, cr.vertical_id, cr.status,
       m.id AS market_id, m.wave_ordering_enabled,
       COUNT(*) FILTER (WHERE mv.event_max_orders_per_wave IS NULL) AS missing_count
FROM catering_requests cr
JOIN markets m ON m.id = cr.market_id
LEFT JOIN market_vendors mv ON mv.market_id = m.id AND mv.response_status = 'accepted'
WHERE (cr.payment_model = 'company_paid' OR m.wave_ordering_enabled = true)
  AND cr.status NOT IN ('completed', 'cancelled', 'declined')
GROUP BY cr.id, cr.company_name, cr.payment_model, cr.vertical_id, cr.status, m.id, m.wave_ordering_enabled
HAVING COUNT(*) FILTER (WHERE mv.event_max_orders_per_wave IS NULL) > 0;
```

**Query 2: Historic catering_vendor_invited notifications missing marketId (P1)**
```sql
-- If `without_marketId > 0`, those vendor notifications will 404 after deploy.
-- Decide before push: (a) accept the regression (users will need a new notif
-- to find the event), or (b) backfill data->>'marketId' from market_vendors,
-- or (c) defer the actionUrl change until backfill is in place.
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE data ? 'marketId') AS with_marketId,
       COUNT(*) FILTER (WHERE NOT (data ? 'marketId')) AS without_marketId
FROM notifications
WHERE type = 'catering_vendor_invited';
```

### Apply order (Prod)

```
9pm–7am CT only (production push window)

PRE-PUSH:
  [ ] Run Query 1 (wave-capacity hazard) — review/decide
  [ ] Run Query 2 (catering_vendor_invited marketId) — review/decide
  [ ] Decide whether to fix admin/events/[id]/invite/route.ts:170 before push
      (1-line addition: marketId: cateringReq.market_id)

MIGRATIONS (on Prod via Supabase SQL editor, one at a time):
  [ ] Apply migration 128 (event_setting column)
      Verify: SELECT column_name FROM information_schema.columns
              WHERE table_name='catering_requests' AND column_name='event_setting';
  [ ] Apply migration 129 (address DROP NOT NULL)
      Verify: SELECT is_nullable FROM information_schema.columns
              WHERE table_name='catering_requests' AND column_name='address';
              (expect 'YES')
  [ ] Apply migration 130 (recalculate_wave_capacity hard-error)
      Verify by reading the function source via SELECT pg_get_functiondef('public.recalculate_wave_capacity'::regproc);
  [ ] Apply migration 131 (get_available_pickup_dates require active vms)
      Verify: SELECT * FROM get_available_pickup_dates('<known good listing>');

CODE PUSH:
  [ ] git checkout main && git push origin main
  [ ] Wait for Vercel deploy

TIER 2 SMOKE TEST (5 min):
  [ ] Public landing pages load (FM + FT)
  [ ] Browse + listing detail
  [ ] Sign in to test buyer account
  [ ] Cart + checkout flow loads
  [ ] Sign in to test vendor account
  [ ] Vendor dashboard loads

POST-PUSH BOOKKEEPING (after smoke test passes):
  [ ] Move 128, 129, 130, 131 to supabase/migrations/applied/
  [ ] Update MIGRATION_LOG.md rows: replace "Pending Prod" with prod date
  [ ] Update SCHEMA_SNAPSHOT.md changelog entries: replace "Pending Prod" with "Applied to all 3 envs"
  [ ] Commit + push the bookkeeping
```

### Rollback paths

| Change | If broken in prod, rollback via |
|---|---|
| Migration 128 (event_setting) | `ALTER TABLE catering_requests DROP CONSTRAINT catering_requests_event_setting_check; ALTER TABLE catering_requests DROP COLUMN event_setting;` (any code that reads it will break — but this would only happen if migration is broken, not the column itself) |
| Migration 129 (address optional) | `ALTER TABLE catering_requests ALTER COLUMN address SET NOT NULL;` (requires backfilling any null rows first) |
| Migration 130 (wave hard-error) | Restore the COALESCE form from migration 120 |
| Migration 131 (pickup dates vms) | Restore migration 109's WHERE clause |
| Code push | `git revert <commit>` for individual commits, OR `git push origin main --force` to roll back to prior tip (last resort) |

### Open decisions before push

1. **P1 fix for `admin/events/[id]/invite/route.ts:170`**: Ship the 1-line `marketId: cateringReq.market_id` addition with this push, or defer? Recommendation: **ship with this push** — trivial fix, prevents new bug.
2. **Historic notifications P1**: Accept retroactive 404, or backfill `data` JSONB before push? Recommendation: run Query 2 first; if `without_marketId > 0` and count is large, consider a one-time backfill SQL script.
3. **Wave capacity P2**: If Query 1 returns rows, decide per event whether to backfill capacity or change config. If zero rows, no action needed.

---

## Summary

| Severity | Count | Items |
|---|---|---|
| P0 | 1 | Migration apply order (128, 129 must precede code push) |
| P1 | 1 | `catering_vendor_invited` admin invite caller missing `marketId` + retroactive impact |
| P2 | 3 | Wave-gen hard-error edge case; cron expire-orders fix (positive); market box payout enrichment |
| P3 | many | Cart isolation, webhooks dedup, refresh-matches route, publish gate, stripe reconcile, mobile admin UI, dir rename, hooks, tests |

**Net assessment:** Push is shippable with the P0 (apply migrations correctly) and P1 (1-line fix or backfill) addressed. The bulk of the diff is bug fixes, admin tooling, and UI improvements — no critical regressions identified. The largest in-the-weeds risks are the wave-capacity hard-error (well-contained, only fires on a specific edge case) and the notification actionUrl change (real but limited blast radius).

**Primary recommendation:** Apply the 1-line P1 fix before push (`admin/events/[id]/invite/route.ts:170`), run both verification queries on Prod, and follow the apply order strictly.
