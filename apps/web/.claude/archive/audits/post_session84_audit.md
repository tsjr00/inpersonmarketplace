# Post-Session 84 Code Audit — pre-prod-push review

**Date started:** 2026-05-27
**Scope:** All 44 commits between `c7d0b3ec` (prod tip, Session 81) and `b08bf524` (current local HEAD = origin/staging)
**Method:** Read each new/changed file at HEAD, cite path:line for every claim. Backlog items at `.claude/backlog.md` filtered out.
**Migration assumption:** Migrations 138–148 will be applied to prod BEFORE the code push. Items in the audit assume the migrations land first.

## Severity ladder
- **P0 — Will break in prod:** runtime error, silent data loss, financial mismatch, security hole. Fix BEFORE pushing.
- **P1 — Will misbehave in prod:** wrong-but-recoverable output, UX-broken-but-no-data-loss, missing-but-not-critical guard. Fix BEFORE pushing or within first cycle.
- **P2 — Suspect / verify:** likely a bug but needs runtime confirmation. Flag for testing.
- **P3 — Opportunity:** non-bug improvements to function/utility/usability.

## Files in scope
164 files changed. Areas:
- 11 new migrations (138–148)
- Market Manager v1 (Phase C + Phase B + onboarding + intake + surveys + invitations + verification docs)
- New API routes for market-manager surface, surveys, vendor invitations, intake, vendor docs viewer
- Webhook + stripe changes (Phase C payment lifecycle)
- Cron additions (surveys hourly)
- Vertical admin pending-intake surfacing

## Filter list (from backlog — DO NOT re-surface)
Items already known and tracked:
- Schedule-changed notification gap for booth renters (P1)
- Refund policy notice on BookBoothForm (P1)
- Booth label drift after inventory mutation (P1.5)
- Tier-selection on placeholders/vendors → DONE (mig 145)
- Structured docs upload → DONE (mig 148)
- Existing-vendors required step → DONE (mig 145)
- Manager invitation revoke (P2)
- Broadcast to existing market vendors (P2)
- R29/R30 schedule reader gaps (P1.5)
- Admin dashboard 9-orders banner vs vendor-activity zeros (P1.5)
- $16.01 vendor payout stuck "processing" (P0.5)
- Stage 3 amount reconciliation (P1)
- `account.updated` webhook (P1)
- processMarketBoxPayout silent return points + catch-all swallow (P0/P0.5)
- Order-side cron retry missing source_transaction (P0.5)
- Stripe metadata order_number (P0)
- Standalone market box checkout doesn't support biweekly (P0.5)
- Refund-on-RPC-failure wrong amount (P0.5)
- Buyer dashboard pickup progress bar (P0.5)
- Vendor analytics top-products/tax-summary (P0.5)
- All Session 72 H1/H2/M1/M2 etc. (P1)

---

## Findings — ranked summary

### P0 — Confirmed live in staging testing (2026-05-27)
| ID | File | One-line |
|---|---|---|
| **USER-1** | `src/app/api/vendor/markets/[id]/schedules/route.ts:232-288, 482-529` | FM vendor blocked from accepting invitation / setting attendance when ANY schedule time overlaps another market. Conflict-check assumes "vendor is a single physical entity" — FT-think applied to FM where it doesn't fit. User wants: skip the block for FM; let downstream listing-availability logic enforce real conflicts at listing time. |
| **USER-4** | `src/app/[vertical]/markets/page.tsx:46-160` + `src/components/markets/MarketsWithLocation.tsx:160-167` + `/api/markets/nearby` | Markets listing page shows markets with zero published-listing vendors. Both the server-rendered fetch and the location-prompted client fetch attach `vendor_count` but never filter `vendor_count > 0`. Violates the longstanding rule "if nothing is purchasable, market should not show." |

### P1 — Will misbehave in prod. Fix before push or in first cycle.
| ID | File | One-line |
|---|---|---|
| P1-A | `src/app/api/cron/surveys/route.ts:170-176` | Survey cron outer dedup check blocks resumption after partial failure → vendors/buyers can be permanently skipped if Vercel times out mid-market |
| P1-B | `src/app/api/vendor/markets/[id]/respond/route.ts:196-212` | Manager gets the WRONG notification template (`catering_vendor_responded`) when vendor accepts/declines a standard-market invitation — copy refers to a "catering event" that never happened |
| P1-C | `src/app/[vertical]/admin/markets/page.tsx:336, 706, 253` | Editing a `market_type='private_pickup'` market in the vertical-admin form silently flips it to 'traditional' on save. Dropdown also lacks 'private_pickup' as an option |
| P1-D | `src/lib/stripe/webhooks.ts:1172-1180` + `cron/expire-orders/route.ts:2356-2367` | Late-arriving Stripe webhook can promote a cron-cancelled booth rental to `status='paid'` while `cancelled_at` is still populated → phantom hybrid state, vendor charged with no fix-up |

### P2 — Suspect / verify in testing
| ID | File | One-line |
|---|---|---|
| P2-A | `src/app/api/surveys/respond/route.ts:104-117` | Buyer path doesn't verify `row.kind === 'buyer'` before accepting token. Defense-in-depth gap; one schema/test change away from being a real auth bypass |
| P2-B | `src/app/api/surveys/respond/route.ts:146-156` | Race-lost survey submit returns `success: true` even when 0 rows updated |
| P2-C | `src/app/api/market-manager/intake/route.ts:41-44, 187-244` | Docstring promises 409 on duplicate email that the code never returns. No CAPTCHA, no email-verify → abuse vector for spam pending markets |
| P2-D | `supabase/migrations/20260524_148_market_documents.sql:63` | Hard-deleting a market orphans its storage objects in the `market-documents` bucket |
| P2-E | `src/app/api/market-manager/[marketId]/vendor-invitations/route.ts:270-282` | Per-vendor `auth.admin.getUserById` is N+1 — 50-vendor invite = 50 admin API calls |
| P2-F | `src/app/[vertical]/admin/markets/page.tsx:208-227` | Edit form requires lat/lng on save but pending-intake markets may have null geocoded values → admin blocked from editing pending markets |
| P2-G | `src/lib/stripe/webhooks.ts:1293-1310` | Booth-paid manager notification silently skipped when `manager_user_id` is null |
| P2-H | `src/app/api/market-manager/[marketId]/schedules/route.ts:400-419` | Schedule fanout: same N+1 pattern as P2-E |
| P2-I | `src/app/api/market-manager/[marketId]/schedules/route.ts:376-380` | "This week's Sunday" computed in server-local time → Saturday-evening-CT schedule changes miss current-week booth renters |
| P2-J | `src/app/api/cron/expire-orders/route.ts:2434-2437` | Cron Phase 16 notification: same N+1 pattern as P2-E |
| P2-K | `src/app/api/market-manager/[marketId]/vendor-docs/[vendorProfileId]/route.ts:118-122` | `coi_documents` URLs returned raw — if the underlying bucket is private, manager clicks will fail (verify on staging) |

### P3 — Cleanups / observability gaps (non-blocking)
P3-A: Survey cron Vercel timeout risk at scale.
P3-B: Vendor invitation fanout swallows errors with `console.error`.
P3-C: Duplicate-detection fetch silent-catch on vertical admin.
P3-D: Booth rental RPC error matching by message text (brittle vs SQLSTATE).
P3-E: Vendor-docs viewer signed-URL gap (test on staging).
P3-F: Phase 16 sweep errors logged to console only.
P3-G: `isMarketManager` silently treats DB errors as "not a manager".

### P3 — Opportunities for improvement (function/utility/usability)
- **Shared helper for batch email lookup**: closes P2-E + P2-H + P2-J + P3-B in one PR (~40 LOC).
- **Survey cron parallelization**: Promise.all per-market to scale past ~15 markets.
- **Vertical-admin pending market UX**: inline row-level Approve button per current_task.md option A.

## Cross-cutting themes
1. **N+1 `auth.admin.getUserById` for email lookup** appears in 4+ places. One shared helper fixes all simultaneously.
2. **`console.error` instead of `logError`** appears in 5+ places — observability gap that compounds (Vercel logs expire, no error_logs trail).
3. **Timezone arithmetic via server-local Date()** in schedules route (P2-I); the booking route uses the correct `toLocaleString({timeZone})` pattern. Worth a global sweep.
4. **Edit-form/data-shape mismatches** (P1-C, P2-F): the vertical-admin form and the intake route + DB schema have drifted apart. A type-safe form sourced from the same enums + columns as the DB would prevent silent coercion.

## Out of scope (not reviewed this pass)
- Pricing/financial math (`calculateBoothRentalFees`) — only spot-checked, no obvious bugs.
- Vendor profile / listing / browse / checkout pages — not in the 44-commit diff for new functionality.
- Test files in `__tests__/` — assumed to track code changes per Test Integrity rules.
- UI component look-and-feel — focused on logic, not styling.
- 11 migrations beyond schema/RLS sanity check on 138/139/147/148 (others read for sibling references only).
- Note: backlog item "Booth-renter notification gap on schedule changes" (P1) is **already fixed in code** at `schedules/route.ts:369-396` but not crossed off `backlog.md`.

---

## Findings — detail

### User-observed during 2026-05-27 testing

#### USER-1 — FM vendors blocked from accepting invitation by schedule-conflict check that should be FT-only
**Files:** `src/app/api/vendor/markets/[id]/schedules/route.ts:232-288` (PUT path) + `:482-529` (PATCH path) + `:13-20` (`isMultiTruckVendor` helper)
**Symptom (user-reported):** On `/farmers_market/vendor/markets`, accepting an invitation flows into the vendor's schedule-set call. Any overlap with another market the vendor already attends throws `ERR_SCHEDULE_CONFLICT` (409) and blocks the save. Vendor cannot accept until they deactivate the other market — even when, for FM, attending both simultaneously is operationally fine (different staff, different stand).
**Root cause:** The conflict block is gated by `isMultiTruckVendor` (lines 234, 484). That helper checks for `profile_data.multiple_trucks === true` — an FT-only profile flag (the toggle is rendered only when `vertical === 'food_trucks'` in `EditProfileForm.tsx:207`). FM vendors have no way to set `multiple_trucks=true`, so they ALWAYS hit the block.
**On wording:** the suffix at lines 277-279 / 513-515 IS vertical-aware (the FM branch reads "Deactivate that schedule first to add this one"; the FT branch mentions "Multiple Trucks"). What the user called "hardcoded to FT" is really the CONCEPT — the existence of the block itself is FT-think bleeding into FM. The schedule-overlap utility comment at `src/lib/utils/schedule-overlap.ts:1-12` confirms this design intent ("Schedule overlap detection for single-truck vendors").
**Recommended fix (matches user's stated intent):** Add `if (market.vertical_id !== 'food_trucks')` as an early-exit alongside `multiTruck` at both check sites. FM vendors skip the block entirely. The listing-availability layer already enforces per-product cross-market conflicts at listing-publish time (per user: "When they attempt to connect products to the market, that logic will catch the conflict"). For FT, leave behavior unchanged.
**Test path after fix:**
1. FM vendor with attendance at Market A (Sat 9-12) accepts invitation to Market B (Sat 10-13). Expected: save succeeds; both attendances live.
2. FT vendor same scenario without `multiple_trucks`: still blocked (409).
3. FT vendor with `multiple_trucks=true`: succeeds.

#### USER-2 — (working as designed, no change) — Vendor-cancel-attendance blocked by outstanding orders
**Files:** `src/app/api/vendor/markets/[id]/schedules/route.ts:290-330` (pending-order check before deactivation)
**User confirmation:** "this is good functionality and we want to keep it."
**No action needed.** Noted for completeness so a future change doesn't accidentally remove this guard.

#### USER-3 — Same as USER-1 (different repro of the same root cause)
**Symptom (user-reported):** After hitting USER-1's error, user added a new day to a market's schedule (presumably as a manager), then tried to accept again. Same `ERR_SCHEDULE_CONFLICT` error fired.
**Root cause:** Same as USER-1. Adding a new day to the market schedule didn't change what `isMultiTruckVendor` returns. The new day still overlaps an existing other-market attendance → conflict block still fires.
**Resolution:** Fixing USER-1 fixes USER-3 in one stroke.

#### USER-4 — Markets list shows markets with zero published-listing vendors
**Files:** `src/app/[vertical]/markets/page.tsx:46-56` (initial fetch) + `:146-160` (transform without filter) + `src/components/markets/MarketsWithLocation.tsx:155-179` (location-prompted client fetch) + `/api/markets/nearby` (server side of that)
**Symptom (user-reported):** 2 markets on `/farmers_market/markets` show but have no vendors or products. Buyers click in and find nothing to buy. Per user's longstanding rule: "It must have active vendors with active products that meet all other listing requirements."
**Root cause:** The page filters by `status='active' AND market_type='traditional' AND approval_status='approved'`. It fetches `vendor_count` via `getMarketVendorCounts` (which queries the `market_vendor_counts` view — counts distinct vendors with PUBLISHED listings per `src/lib/db/markets.ts:5`). But the result is only ATTACHED to each market for display; there is NO `vendor_count > 0` filter on the rendered list. Same in `MarketsWithLocation`.
**Side note:** The unpushed-diff `git log` shows `[vertical]/markets/page.tsx` was NOT touched in the 44 commits — this is preexisting code. The rule was either lost in an older refactor or never enforced in this code path. Not a regression from the unpushed work.
**Recommended fix (matches user's stated rule):**
1. Server path (`page.tsx:153-160`): After `transformedMarkets`, filter to `vendor_count > 0`. ~3 LOC.
2. Client path (`MarketsWithLocation.tsx:161-167`): Same filter on `mappedMarkets` before `setMarkets`. ~3 LOC.
3. (Defense in depth) Push the filter into `/api/markets/nearby` server-side so admin doesn't have to remember it in every consumer.
**One product question to settle before the fix:**
- Should event-type markets ALSO require vendor_count > 0? Events at lines 70-84 query separately. User's rule wording says "the market" generically. An event with zero approved vendors arguably shouldn't list either. Confirm before extending the fix to events.

### Surveys — `/api/cron/surveys/route.ts` + `/api/surveys/respond/route.ts`

#### P1-A — Survey cron: partial-failure recovery broken by outer dedup check
**File:** `src/app/api/cron/surveys/route.ts:170-176`
**What it does:** Before generating surveys for a (market, market_date), the cron runs a count query against `market_surveys`. If `count > 0`, it skips the entire `generateForMarketDay` for that day.
**The bug:** Per-row inserts at line 250-256 and 365-370 already handle Postgres unique-violation (`code === '23505'`) silently — clearly designed to be idempotent at the row level. But the outer count gate at line 170-176 prevents the function from ever reaching the per-row inserts on a re-run. If the first run inserts even one vendor survey row before something interrupts it (Vercel function timeout most likely, since the per-market loop runs serially inside a 60s budget), the next hourly run sees `count > 0` and skips the market for the day. Remaining vendors and ALL buyers for that market_date get no survey.
**Concrete failure mode:** Big market with 30 vendors + 200 buyers. Cron starts at 18:00, vendor loop completes (~5s), buyer loop is mid-way at 60s and Vercel terminates. 19:00 cron run sees existing rows, skips the market entirely. Buyers never receive surveys. Silent — only visible by querying `market_surveys` for that date and noticing buyer rows are zero.
**Recommended fix:** Remove the outer count check. The per-row 23505-skip handler is already enough. Alternative: add a `market_survey_runs(market_id, market_date, completed_at)` mini-table that gets written ONLY after the full generateForMarketDay finishes successfully, and dedup against that instead.

#### P2-A — Buyer survey path doesn't verify `row.kind === 'buyer'` before accepting token
**File:** `src/app/api/surveys/respond/route.ts:104-117`
**What it does:** Buyer path looks up `market_surveys` row by `access_token` and assigns it to `survey` without checking `row.kind`. Subsequent `validateSurveySubmission(survey.kind, body)` would apply whichever kind the row has.
**Why it matters:** If `access_token` is ever populated on a vendor-kind row (by mistake, by future schema change, or by accident in the cron), a leaked-token holder could submit a vendor survey as if they were the vendor. The cron at line 358 only sets `access_token` for buyer-kind rows today, so this is theoretical now — but it's a defense-in-depth gap that a small schema change could turn into a real vulnerability.
**Recommended fix:** Add `if (row.kind !== 'buyer') return 404` mirroring the vendor path's `if (row.kind !== 'vendor') return 404` at line 89-91. Also worth adding a DB-level constraint on `market_surveys`: `CHECK ((kind='buyer' AND access_token IS NOT NULL) OR (kind='vendor' AND access_token IS NULL))`.

#### P2-B — Race-lost submission returns `success: true`
**File:** `src/app/api/surveys/respond/route.ts:146-156`
**What it does:** Update uses `.is('submitted_at', null)` to be race-safe. If two POSTs land at the same time, only one actually updates a row — but the loser still gets `{ success: true, surveyId }` returned because the `.update()` call doesn't surface 0-rows-affected.
**Impact:** UX-only. Caller thinks their answers were saved when they were not. Next page load would correctly show "already submitted" state, but the user might walk away believing they submitted version B when version A is what's stored.
**Recommended fix:** Add `.select('id')` to the update and inspect the returned rows; if empty, return 409 with "Survey was just submitted in another tab — your latest answers were not saved."

### Manager intake — `/api/market-manager/intake/route.ts`

#### P2-C — Intake docstring promises 409 response that the code never returns
**File:** `src/app/api/market-manager/intake/route.ts:41-44, 187-244`
**What it claims (docstring):** "409 → email already has a market on the platform"
**What the code does:** No such check exists. After validation it goes straight to INSERT. Multi-market managers are supported (intentional, per line 189-194), so the 409 is impossible to trigger.
**Why it matters:** A spammer can POST up to 10 intakes per minute per IP (rate limit). Each creates a `markets` row in `status='pending'` plus an admin email plus a manager email. There's no email-rate-limit, captcha, or email-verify step. With rotating IPs, this could pollute the markets table arbitrarily, and admin gets spam alerts.
**Recommended fix (either):** (a) update the docstring to reflect that multi-market is allowed and there's no 409; (b) add either a Turnstile widget on the form (the codebase already uses it for signup per Session 72 backlog C2), or a soft per-email cap like "you've submitted 3+ markets in 24h — contact us if you need more"; (c) require email verification before the market row is INSERTed (more friction but kills spam dead).

### Documents — `/api/market-manager/[marketId]/documents/*` + admin mirror

#### P2-D — Storage objects orphan when a market is hard-deleted
**File:** `supabase/migrations/20260524_148_market_documents.sql:63` (cascade) + `src/app/api/market-manager/[marketId]/documents/[documentId]/route.ts:116-160` (manual delete path)
**What happens correctly:** The `DELETE /documents/[documentId]` API route removes the storage object FIRST then deletes the DB row (line 134-157). No orphans on manual deletion.
**What goes wrong:** `market_documents.market_id REFERENCES markets(id) ON DELETE CASCADE` (mig 148:63). If a market is deleted (admin cleanup, GDPR request, accidental DELETE), the `market_documents` rows cascade-delete but the storage objects DO NOT. Postgres can't reach Supabase Storage from a trigger.
**Impact:** Slow private-bucket bloat. Files become unreachable (no row → no signed URL → no way to find them via UI) but still consume Supabase Storage quota. Eventually a cost / audit issue.
**Severity P2 not P1 because:** Storage is PRIVATE — no security leak. Just dead bytes. But once-built-then-deleted markets will accumulate forever unless cleaned.
**Recommended fix:** Either (a) wrap market deletion in a service-layer function that enumerates `market_documents.storage_path` and deletes from bucket BEFORE the DB delete, or (b) periodic cleanup cron that lists `market-documents` bucket and removes any object whose `<market_id>/` prefix isn't in `(SELECT id FROM markets)`. Option (a) is cleaner if there's a single delete path; option (b) is the safety net.

### Vendor invitations + invite-response — `vendor-invitations` POST + `vendor/markets/[id]/respond` PATCH

#### P1-B — Manager gets the WRONG notification template when a vendor accepts/declines a market invitation
**File:** `src/app/api/vendor/markets/[id]/respond/route.ts:196-212`
**What it does:** When a vendor accepts/declines a manager-initiated standard-market invitation, the route fires the `catering_vendor_responded` notification template to the manager. The code itself acknowledges the mismatch at line 196-201: *"Reuse the existing catering_vendor_responded template — it's generic enough."*
**Why it's a bug:** That template targets the EVENT (catering) audience — its copy is "vendor X responded to your **catering event** invitation." The manager, who never invited the vendor to any catering event, receives nonsensical text in their inbox / push / SMS. This is the same incident class as backlog M2 (`events/[token]/cancel/route.ts:104` sends the same template for event cancellations and produces "grammatically broken" copy).
**Verification:** Grep `src/lib/notifications/types.ts` for `manager_vendor_invitation_responded` — does not exist (the file confirms `survey_request_vendor`, `booth_rental_paid_*`, and `market_vendor_invited` are registered, but no manager-side response template).
**Recommended fix:** Register a new notification type `manager_vendor_invitation_responded` with manager-specific copy ("[Vendor name] accepted/declined your invitation to [Market name]") and switch this route to use it. ~30 LOC, mirrors how `market_vendor_invited` was registered.

#### P2-E — Vendor invitations: per-vendor email lookup is N+1 against `auth.admin.getUserById`
**File:** `src/app/api/market-manager/[marketId]/vendor-invitations/route.ts:270-282`
**What happens:** The notification fanout loops vendor profiles and, for each, calls `serviceClient.auth.admin.getUserById(vp.user_id)` to get the email for the email-channel delivery. A 50-vendor bulk-invite makes 50 admin API calls.
**Why P2 not P1:** Functionally works for small batches. Supabase admin endpoints aren't tightly rate-limited but each call is a network round-trip. A bulk invite of 50 vendors takes 50× the latency of one. Also each call uses a service-role-elevated path — better to keep it cold.
**Recommended fix:** Batch email lookup. Replace the per-vendor call with a single `serviceClient.from('user_profiles').select('user_id, email').in('user_id', userIds)`, falling back to `auth.admin.listUsers()` paginated lookup if `user_profiles.email` isn't reliable. The codebase already does this pattern in other fanout sites — copy that.

#### P3-B — Vendor invitations: notification fanout swallows errors with `console.error`
**File:** `src/app/api/market-manager/[marketId]/vendor-invitations/route.ts:296-303`
**What happens:** Per-vendor notification call wrapped in try/catch with `console.error`. If sendNotification fails for any vendor, response returns `notified: X` (X < invited count) with no error_logs entry.
**Why P3:** sendNotification is contractually non-throwing, so this catch will rarely fire. But when it does, manager UI shows "invited: 10, notified: 7" and the manager has no way to find out why 3 didn't notify.
**Recommended fix:** Replace `console.error` with `logError(new TracedError('ERR_NOTIFY_001', ...))` so failures land in `error_logs`. Same shape as `processMarketBoxPayout`'s structured-error pattern.

### Vertical admin markets page — `/[vertical]/admin/markets`

#### P1-C — Editing a `market_type='private_pickup'` market silently flips it to 'traditional'
**File:** `src/app/[vertical]/admin/markets/page.tsx:336` (load-into-form) + `:706` (dropdown options) + `:253` (submit payload)
**What happens:**
1. Line 336 — when an admin clicks Edit on a market, the form initializer runs `market_type: (market.market_type === 'event' ? 'event' : 'traditional') as 'traditional' | 'event'`. That ternary coerces ANY value that isn't 'event' to 'traditional'. So `'private_pickup'` becomes `'traditional'` in the form state.
2. Line 706 — the dropdown only offers two options: 'traditional' and 'event'. Private pickup is not an option for the admin to re-select.
3. Line 253 — submit handler sends `market_type: formData.market_type` to the PUT endpoint. The previously-private_pickup market is updated with `market_type: 'traditional'`.
**Impact:** Silent data corruption. Any admin who opens a private_pickup market in the vertical admin edit modal and saves ANY field (lat/lng tweak, season dates, status change) will downgrade the type. The market remains visible in browse but loses its private-pickup-specific cutoff behavior (10 hr vs traditional FM 18 hr per `CLAUDE_CONTEXT.md`).
**Verification:** Per `CLAUDE_CONTEXT.md` lines 159-164, `private_pickup` is one of two valid market_type values. The platform admin form has a parallel bug already flagged in `current_task.md:46-67` (`MarketForm.tsx:40` uses `market?.type` against the wrong column name) — DIFFERENT failure mode but same root: the admin forms don't faithfully represent the full set of market types.
**Recommended fix:** Three-part:
1. Add `'private_pickup'` to the formData type at line 85 and to the dropdown options at line 706.
2. Fix line 336 to preserve `market.market_type` faithfully: `market_type: (['traditional','event','private_pickup'].includes(market.market_type) ? market.market_type : 'traditional')`.
3. Confirm the PUT endpoint accepts 'private_pickup' (it should — that's the live value already in the DB for many markets).

#### P2-F — Edit form requires lat/lng on save but pending-intake markets may have null geocoded values
**File:** `src/app/[vertical]/admin/markets/page.tsx:208-227` + `src/app/api/market-manager/intake/route.ts:202-213`
**What happens:** The intake route geocodes the ZIP best-effort and inserts the market with `latitude: geocodedLat, longitude: geocodedLng` — both can be null if Census + Nominatim both fail or the geocode call throws. The admin edit form rejects submit at line 208-212 if `formData.latitude` or `formData.longitude` is empty.
**Result:** Admin opens a pending market that lacks coordinates → tries to save (after, say, fixing a typo in the address or pressing "Approve & activate") → blocked by "Latitude and Longitude are required" warning → has to look up coords manually and paste them in.
**Mitigating:** `ApproveStatusButton` (line 670) calls a separate API path that bypasses the form-validate, so basic approval flow works. The bug only bites when admin tries to ALSO edit a field.
**Recommended fix:** Either (a) auto-geocode on form open if lat/lng are null (call `/api/admin/geocode` or similar with the address+city+zip), or (b) make lat/lng required-only-when-the-existing-row-had-them — so saves on pending markets that were never geocoded don't get blocked. Option (b) is simpler; (a) is a better UX win.

#### P3-C — fetchDuplicates silent-catch on the vertical admin edit modal
**File:** `src/app/[vertical]/admin/markets/page.tsx:126-145`
**What happens:** If the duplicates fetch network-errors or the response isn't OK, the banner just doesn't render. Admin doesn't know the check ran.
**Recommended fix:** Either show an inline error banner ("Couldn't check for duplicates — refresh to retry") or skip silently but write a `console.warn` so the page isn't completely opaque. Low priority.

### Booth rental — `/api/vendor/markets/[id]/book` + Stripe webhook handler

#### P2-G — Webhook silently skips manager notification when `manager_user_id` is null
**File:** `src/lib/stripe/webhooks.ts:1293-1310`
**What happens:** When a booth rental is paid, the handler tries to notify the manager via `sendNotification(market.manager_user_id, 'booth_rental_paid_manager', ...)`. Wrapped in `if (market?.manager_user_id)`. If null, no notification fires at all — silent skip.
**Why this could fire:** The manager-intake flow can set `manager_email` BEFORE the user signs up. If a market got approved (and Stripe Connect set up under the same email pre-signup somehow), a booth rental could land before `manager_user_id` got back-filled by the email-to-user-id sync. In practice the Stripe Connect onboard route REQUIRES `user.email` from `auth.getUser()`, so by the time `stripe_charges_enabled=true`, the manager IS signed up. But the back-fill of `manager_user_id` happens separately on the dashboard's first load — there's a window between Stripe-Connect-completion and dashboard-visit where Connect could be live but `manager_user_id` is NULL.
**Recommended fix:** When skipping, `logError(new TracedError('ERR_NOTIFY_002', 'Manager paid-rental notification skipped — manager_user_id null for market <id>', ...))` so admin can find these and back-fill. Or, since `manager_email` is always set, fall back to a Resend-only direct email instead of sendNotification (mirrors the intake-route pattern).

#### P3-D — Booth rental RPC error message matching is brittle
**File:** `src/app/api/vendor/markets/[id]/book/route.ts:304-345`
**What it does:** The book route translates RPC errors by `msg.includes('OVERBOOKED')`, `msg.includes('DUPLICATE')`, etc. If the RPC's RAISE message text ever changes, the translation falls through to the generic `throw` at line 346 and the vendor sees a generic error instead of the friendly one.
**Recommended fix:** Switch to `error.code` matching where possible. The RPC uses P0001-P0005 SQLSTATE codes per the migrations — those are stable. Use the message includes only as a tiebreaker since multiple things RAISE P0001.

### Schedule changes — `/api/market-manager/[marketId]/schedules` PUT

NOTE — Backlog item "Booth-renter notification gap on schedule changes" (P1, dated Session 83) is **already fixed in code at lines 369-396 but NOT crossed off the backlog**. Recommend updating `backlog.md` to mark resolved.

#### P2-H — Schedule notification: per-recipient `auth.admin.getUserById` is N+1
**File:** `src/app/api/market-manager/[marketId]/schedules/route.ts:400-419`
**Same shape as P2-E (vendor invitations).** A schedule change with 20+ recipients (approved vendors + paid booth renters combined) fires 20+ admin API calls in parallel inside the Promise.all. At small scale fine; will get rate-limited at bigger markets.
**Recommended fix:** Same as P2-E — batch email lookup via `user_profiles` or paginated `auth.admin.listUsers()`.

#### P2-I — Schedule fanout: "this week's Sunday" computed in server-local time, not market timezone
**File:** `src/app/api/market-manager/[marketId]/schedules/route.ts:376-380`
**The bug:** `localNow = new Date()` is UTC on Vercel. `localNow.getDay()` then `setDate(localNow.getDate() - dayIdx)` computes Sunday relative to UTC, not relative to the market's timezone. At ~7 PM Saturday Chicago time it's already Sunday in UTC, so `thisWeekStartStr` becomes the UPCOMING Sunday instead of the current week's Sunday. The `>= thisWeekStartStr` filter then EXCLUDES booth renters whose week_start_date is the current Sunday (because the current Sunday is now "last week" by UTC arithmetic).
**Concrete failure mode:** A manager edits the schedule at 9 PM CT Saturday. Renters who paid for the just-finished market week don't get notified. Renters with a current-week paid rental for a market that meets Wednesday → also excluded if the manager saves on weekend evenings UTC.
**Recommended fix:** Use the same canonical timezone pattern as the booking route — `new Date(new Date().toLocaleString('en-US', { timeZone: marketTz }))`. The market's timezone is already loaded via `marketInfo` at line 339-343.

### Vendor docs viewer — `/api/market-manager/[marketId]/vendor-docs/[vendorProfileId]`

#### P3-E — `coi_documents` and `category_verifications.documents` returned as-is without signed-URL handling
**File:** `src/app/api/market-manager/[marketId]/vendor-docs/[vendorProfileId]/route.ts:118-122`
**What it does:** Returns the JSONB blobs from `vendor_verifications` directly — these contain URLs that the admin verification flow originally captured. The route's docstring at line 25 says "Storage URLs are public-ish (signed via Supabase Storage policy)."
**Why it might bite:** If `vendor-documents` storage bucket policies require authentication (most private buckets do), the manager clicking these URLs from the rendered HTML will fail. The market_documents bucket (mig 148) uses signed-URL-only access — if the older vendor-document bucket uses a similar pattern, this view is broken.
**Recommended fix:** Test manager-clicks-on-vendor-COI-URL on staging and confirm the file actually opens. If it doesn't, add a sibling `/vendor-docs/[vendorProfileId]/file?path=<storage-path>` endpoint that mints signed URLs, like the market_documents pattern. Until then this is a P2 functional gap rather than P3.

### Cron Phase 16 (booth rental cleanup) — `/api/cron/expire-orders/route.ts:2319-2462`

#### P1-D — Booth-rental webhook can re-promote a cron-cancelled row to 'paid' (creates phantom state)
**Files:** `src/lib/stripe/webhooks.ts:1172-1180` + `src/app/api/cron/expire-orders/route.ts:2356-2367`
**Race window:** A vendor opens Stripe Checkout for a booth rental. The 24-hour expiry passes. Cron Phase 16 runs at minute 0 and flips status from `pending_payment` → `cancelled` + sets `cancelled_at`. Vendor's Stripe Checkout payment completes JUST before expiry (e.g., at hour 23:59:30 — Stripe gave them ~30s of grace). The `checkout.session.completed` webhook arrives a few seconds later, AFTER the cron sweep.
**What happens:** The webhook's `.eq('id', rentalId).neq('status', 'paid')` matches the cancelled row (status='cancelled' ≠ 'paid'). It UPDATEs to `status='paid', paid_at=<now>`. But `cancelled_at` is still populated from the cron. The row is now a hybrid: `status='paid'` AND `cancelled_at` IS NOT NULL. Manager sees paid in the dashboard, vendor got both a "failed payment" notification (from cron) AND no second notification (no notification was wired here since we're past the 30-day cancelled window). Buyer (vendor) was charged.
**Recommended fix:** Webhook update should be `.eq('status', 'pending_payment')` instead of `.neq('status', 'paid')`. That way a cron-cancelled row is NOT eligible for promotion — the late webhook becomes a no-op and we log to handle the charge separately (e.g., admin issues refund manually via Stripe dashboard).

#### P2-J — Phase 16 notification fanout: same N+1 `auth.admin.getUserById` pattern
**File:** `src/app/api/cron/expire-orders/route.ts:2434-2437`
**Same shape as P2-E + P2-H.** When the cron cancels a batch of expired bookings (e.g., a manager pulls a market from the schedule and 30 future-week paid rentals all cancel at once), each rental triggers one admin API call. Inside a cron with a 60s budget across many phases.
**Recommended fix:** Same as the others — batch the email lookup.

#### P3-F — Phase 16 sweep errors logged with `console.error` only
**File:** `src/app/api/cron/expire-orders/route.ts:2350, 2364, 2456, 2460`
**Pattern:** Cron-internal sweep failures go to `console.error`. Cron failures often span Vercel-log retention windows; without `logError` they vanish.
**Recommended fix:** Switch to `logError(traced.fromSupabase(err, {...}))` so persistent + searchable in `error_logs`.

### Manager auth — `lib/markets/manager-auth.ts`

#### P3-G — `isMarketManager` silently treats DB errors as "not a manager"
**File:** `src/lib/markets/manager-auth.ts:28-32`
**What happens:** If the `markets` query errors (RLS misfire, network, etc.), `data` is undefined → `market` is null → returns false. Caller can't distinguish "DB error" from "not the manager."
**Why P3 not higher:** RLS errors here are very rare (markets is public-readable). But a transient DB blip would manifest as random 403s instead of 5xx — confusing for the manager and harder to debug from logs.
**Recommended fix:** Inspect `error`, log if present, and return false explicitly (current behavior) but with a structured trace so support can see "manager-auth failed due to query error."

### Surveys (cont.)

#### P3-A — Vercel timeout risk on cron for large market counts
**File:** `src/app/api/cron/surveys/route.ts:108-117`
**What it does:** Iterates active markets serially. Each market does multiple SELECTs + INSERTs + sendNotification + sendSurveyEmail calls.
**Why a P3 not a P1:** With ~15 markets and zero traffic, this is fine. With many markets and surveys generated only once per market_date, it's bounded — but Resend email calls are network I/O and can drag. A particularly slow `sendSurveyEmail` call on a market early in the loop could push later markets past Vercel's function budget.
**Recommended fix when scale hits:** Promise.all() the per-market processing, OR move email send to a queue (e.g., a follow-up `/api/cron/surveys-deliver` that processes `market_surveys WHERE notified_at IS NULL`).

