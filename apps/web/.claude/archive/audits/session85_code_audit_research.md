# Session 85 Code Audit — Last 2-3 Sessions

**Started:** 2026-05-23
**Scope:** Sessions 82-84 (commits 488973fa..04af4f9b, ~37 commits)
**Rule:** Read actual code, no assumptions, cite path:line for every claim.

---

## Methodology

1. Migrations first (DDL is the foundation)
2. Lib files (pure logic — easiest to verify)
3. API routes (read each endpoint)
4. UI components + pages
5. Cross-reference and flag inconsistencies

Findings written incrementally below.

---

## Section 1 — Migrations 138-147 (verified by reading each .sql)

### Mig 138 — `vendor_market_agreement_acceptances`
- Table created (`mig 138:25-41`). PK uuid, FK vendor_profiles + markets both `ON DELETE CASCADE`.
- `statements_snapshot JSONB NOT NULL` — self-contained snapshot of statements at acceptance time (`mig 138:33`).
- `agreement_version TEXT` nullable; manager-controlled (`mig 138:36`).
- UNIQUE `(vendor_profile_id, market_id, agreement_version)` with `NULLS NOT DISTINCT` — so NULL version is treated as a single row, accept-once mode (`mig 138:40`).
- RLS enabled, NO policies. Default-deny (`mig 138:59`).

### Mig 139 — `weekly_booth_rentals`
- Table created (`mig 139:59-84`). Primary booking table.
- `vendor_profile_id` FK `ON DELETE RESTRICT` (`mig 139:61`) — prevents deleting vendor while bookings exist.
- `market_id` FK `ON DELETE CASCADE` (`mig 139:62`) — delete market deletes rentals.
- `inventory_id` FK `ON DELETE RESTRICT` (`mig 139:64`) — can't drop a tier with bookings.
- `booth_number TEXT` nullable (manager-assigned post-booking, or auto-assigned by mig 144 RPC) (`mig 139:66`).
- `price_cents INTEGER NOT NULL CHECK >= 0` — **snapshot** at booking time, not live link (`mig 139:69`). Comment line 39 confirms this is intentional.
- `status TEXT` CHECK in `('pending_payment','paid','cancelled','completed')` (`mig 139:70-71`).
- `agreement_acceptance_id UUID REFERENCES vendor_market_agreement_acceptances(id)` — nullable FK, no cascade rule = NO ACTION (default) (`mig 139:76`).
- UNIQUE `(vendor_profile_id, market_id, week_start_date)` (`mig 139:83`).
- Same-market integrity trigger `check_weekly_booth_rental_inventory_market` BEFORE INSERT OR UPDATE OF `market_id, inventory_id` (`mig 139:106-126`).
- `updated_at` trigger (`mig 139:129-144`).
- RLS enabled, NO policies (`mig 139:147`).

### Mig 140 — `markets.logo_url`
- Single column add: `logo_url TEXT` nullable (`mig 140:23-24`).
- No new tables/triggers/indexes.

### Mig 141 — `markets.stripe_*` Connect fields
- 4 columns added (`mig 141:41-45`):
  - `stripe_account_id TEXT` nullable
  - `stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE`
  - `stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE`
  - `stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE`
- Partial index `idx_markets_stripe_account_id WHERE stripe_account_id IS NOT NULL` (`mig 141:53-55`) — for webhook resolution.
- Mirrors `vendor_profiles.stripe_*` shape per file comment (line 38-39).

### Mig 142 — `book_weekly_booth_atomic` RPC (v1)
- **SUPERSEDED by mig 144 + 146**. Original signature: 5 args, returns 4 cols (id, price, status, week).
- Acquires `pg_advisory_xact_lock` on `hash(market_id:inventory_id:week)` (`mig 142:74-78`).
- Inventory existence + same-market check (`mig 142:82-90`).
- Recount placeholders + active rentals (`mig 142:93-103`).
- Capacity check (`v_remaining <= 0` → `RAISE 'OVERBOOKED' P0001`) (`mig 142:107-109`).
- INSERT pending_payment; `unique_violation` → `RAISE 'DUPLICATE' P0002` (`mig 142:114-135`).
- `INVENTORY_NOT_FOUND` → P0003 (`mig 142:89`).
- SECURITY DEFINER (`mig 142:60`).

### Mig 143 — `replace_market_optin_selections` RPC
- Atomic DELETE-then-INSERT inside a single SECURITY DEFINER function (`mig 143:31-80`).
- Validates `p_selections` is a JSONB array (`mig 143:48-50`), else `RAISE P0001`.
- DELETE all selections for `p_market_id`, then if array non-empty INSERT rows from elements (`mig 143:56-72`).
- Returns rows ordered by `selected_at ASC` (`mig 143:74-78`).
- **NOTE:** This is the pattern Session 83 flagged in `code-stability.md` Rule 5 — but here the table `market_optin_selections` is reviewed for safety. *Will verify in component pass that this is genuinely a "current state" table without history dependencies.*

### Mig 144 — Auto-assignment + same-week booth-# uniqueness
- Adds `markets.booth_label_start TEXT` + `markets.booth_label_end TEXT` (`mig 144:85-87`). Both nullable. Comments at lines 89-93 explain semantics: if both set & prefix matches, RPC generates sequence. If NULL → defaults to `""..<sum of inventory.count>`.
- Partial UNIQUE index `idx_wbr_market_week_booth (market_id, week_start_date, booth_number)` WHERE `booth_number IS NOT NULL AND status <> 'cancelled'` (`mig 144:99-101`). Excludes cancelled so freed labels reusable.
- **DROPS then RECREATES** `book_weekly_booth_atomic` because return shape changes from 4→5 columns (`mig 144:120-122`).
- New RPC body (`mig 144:122-307`):
  - Same locking + capacity logic as mig 142.
  - Reads `markets.booth_label_start/end` (`mig 144:198-201`).
  - `SELECT COALESCE(SUM(count), 0) FROM market_booth_inventory WHERE market_id = ...` to compute total (`mig 144:203-205`).
  - Defaults: `prefix=''`, `start=1`, `end=GREATEST(total, 1)` (`mig 144:208-210`).
  - Parses both labels with regex `^(.*?)(\d+)$` (`mig 144:224-225`). Falls back to defaults silently if mismatch.
  - Picks SMALLEST unused label from `generate_series`, excluding active rentals this week + ALL placeholders for the market (`mig 144:246-260`). Note: at this stage does NOT exclude `market_vendors.booth_number` — that's mig 146.
  - `LABELS_EXHAUSTED` → P0004 (`mig 144:266-268`).
- All other behaviors carry over.

### Mig 145 — `market_vendors.inventory_id` + onboarding acks
- `market_vendors.inventory_id UUID NULL REFERENCES market_booth_inventory(id) ON DELETE SET NULL` (`mig 145:63-65`). Existing rows get NULL.
- Partial index `idx_market_vendors_inventory WHERE inventory_id IS NOT NULL` (`mig 145:71-73`).
- Same-market integrity trigger `check_market_vendor_inventory_market` BEFORE INSERT OR UPDATE OF `market_id, inventory_id` (`mig 145:79-104`). Mirrors mig 135.
- `markets.onboarding_no_existing_vendors_ack BOOLEAN NOT NULL DEFAULT FALSE` (`mig 145:111`).
- `markets.onboarding_no_placeholders_ack BOOLEAN NOT NULL DEFAULT FALSE` (`mig 145:112`).

### Mig 146 — Cross-table booth_number uniqueness
- New trigger function `check_booth_number_uniqueness()` `BEFORE INSERT OR UPDATE OF booth_number, market_id` mounted on **all three** tables: `market_vendors`, `market_booth_placeholders`, `weekly_booth_rentals` (`mig 146:70-154`).
- Logic:
  - NULL booth_number = no conflict, returns NEW (`mig 146:79-81`).
  - (a) Conflict with any `market_vendors` row at same `market_id` and booth_number, excluding self when firing on `market_vendors` (`mig 146:84-92`). Raises BOOTH_CONFLICT P0005.
  - (b) Same check vs `market_booth_placeholders` (`mig 146:95-103`).
  - (c) If trigger NOT firing on `weekly_booth_rentals`: check vs active rentals (status IN paid/pending_payment) where `week_start_date >= CURRENT_DATE` (`mig 146:111-122`). Means market_vendors/placeholders cannot collide with future-week active rentals.
  - Note: trigger on weekly_booth_rentals doesn't repeat (c) — mig 144's partial UNIQUE index handles rental-vs-rental same-week.
- RPC `book_weekly_booth_atomic` updated (`CREATE OR REPLACE`, return shape same): adds 3rd UNION arm `SELECT booth_number FROM market_vendors WHERE market_id = ... AND booth_number IS NOT NULL` (`mig 146:288-291`).
- **Behavioral change worth noting:** mig 144's inner `BEGIN/EXCEPTION` around INSERT is removed in mig 146; instead there's a top-level `EXCEPTION WHEN unique_violation THEN RAISE 'DUPLICATE'` (`mig 146:326-330`). Equivalent effect since only the INSERT can raise unique_violation here.

### Mig 147 — `market_surveys` + buyer opt-out
- Table `market_surveys` (`mig 147:68-118`):
  - `kind TEXT CHECK IN ('vendor','buyer')` (`mig 147:72`).
  - `vendor_profile_id UUID NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE` (`mig 147:73`).
  - `buyer_user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE` (`mig 147:74`).
  - XOR CHECK: vendor kind has vendor_profile_id, buyer kind has buyer_user_id (`mig 147:76-79`).
  - `market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE` (`mig 147:82`).
  - `market_date DATE NOT NULL` (`mig 147:83`).
  - `access_token TEXT NULL` (`mig 147:86`) — buyer only.
  - `expires_at TIMESTAMPTZ NOT NULL` (`mig 147:87`) — comment says 30 days from market_date.
  - Rating columns all `INTEGER NULL CHECK BETWEEN 1 AND 5`:
    - Shared: `rating_overall` (`mig 147:90`).
    - Vendor-only: `rating_foot_traffic`, `rating_sales`, `rating_market_organization`, `rating_manager_support` (`mig 147:93-96`).
    - Buyer-only: `rating_variety`, `rating_quality`, `rating_atmosphere`, `rating_layout`, `rating_accessibility` (`mig 147:99-103`).
  - `comment TEXT NULL`, `submitted_at TIMESTAMPTZ NULL` (`mig 147:106-107`).
  - `notified_at TIMESTAMPTZ NULL` (`mig 147:110`).
  - UNIQUE NULLS NOT DISTINCT `(vendor_profile_id, market_id, market_date)` (`mig 147:114-115`).
  - UNIQUE NULLS NOT DISTINCT `(buyer_user_id, market_id, market_date)` (`mig 147:116-117`).
- Indexes (`mig 147:137-162`):
  - `(market_id, market_date)` — aggregation.
  - `(vendor_profile_id, expires_at) WHERE submitted_at IS NULL AND kind = 'vendor'` — pending lookups.
  - `(buyer_user_id, expires_at) WHERE submitted_at IS NULL AND kind = 'buyer'`.
  - UNIQUE `(access_token) WHERE access_token IS NOT NULL`.
  - `(market_id, market_date, kind) WHERE notified_at IS NULL` — cron probe.
- RLS enabled, NO policies (`mig 147:168`).
- `user_profiles.survey_emails_opted_out BOOLEAN NOT NULL DEFAULT FALSE` (`mig 147:181-182`).

### Migration cross-cuts / risks
- **`book_weekly_booth_atomic` evolved twice** (142 → 144 → 146). Return shape: 4 cols → 5 cols → 5 cols. Apply order on Prod MUST be 142 → 144 → 146 (in 144 the DROP+CREATE; in 146 CREATE OR REPLACE). Confirmed in current_task.md migration order.
- **Cascade rules summary:**
  - Market deletion cascades to: weekly_booth_rentals, market_surveys (+ all market_* tables already cascading from prior migrations).
  - Vendor profile deletion: cascades to vendor_market_agreement_acceptances + market_surveys (vendor-kind); RESTRICTed by weekly_booth_rentals — can't delete vendor with bookings.
  - Auth user deletion: cascades to buyer-kind market_surveys (`mig 147:74`).
  - market_booth_inventory deletion: SET NULL on market_vendors.inventory_id (`mig 145:65`); RESTRICTed by weekly_booth_rentals (`mig 139:64`); cascade on market_booth_placeholders (existing from mig 135 — UNVERIFIED, not re-read).
- **RLS = default-deny everywhere.** All listed tables in 138/139/147 enable RLS with NO POLICIES. Every API route must use service client (verified per-route in sections below).
- **One concern from mig 143 (replace_market_optin_selections):** the underlying table `market_optin_selections` is a "current state" table. Need to confirm no historical dependents — Session 83's `current_task.md` line on Rule 5 specifically flagged a delete-and-replace pattern. Mig 143 was built BEFORE Rule 5 — was it audited? **TODO in component pass:** verify `market_optin_selections` has no soft-delete column or downstream history table that would be silently lost.

---

## Section 2 — Phase E surveys code (verified)

### `lib/surveys/types.ts`
- `SurveyKind = 'vendor' | 'buyer'` (`types.ts:15`).
- `MarketSurveyRow` interface matches mig 147 columns (`types.ts:22-55`).
- `CATEGORY_DEFINITIONS` array — 1 shared + 5 buyer + 4 vendor categories (`types.ts:75-151`).
- `getCategoriesForKind(kind)` returns kind-specific categories with `rating_overall` **last** ("anchors final headline rating") (`types.ts:159-165`).
- `validateSurveySubmission(kind, payload)` iterates required categories, returns string error or null (`types.ts:172-210`). Comment max 2000 chars (`types.ts:204`).
- `buildSubmissionUpdate(kind, payload)` sets `submitted_at`, `comment`, and NULLs out non-applicable category columns (`types.ts:218-230`).

### `lib/surveys/token.ts`
- `generateSurveyToken()` — 24 random bytes → 32-char URL-safe base64 (`token.ts:24-32`).
- `isWellFormedSurveyToken(t)` — regex `/^[A-Za-z0-9_-]{32}$/` (`token.ts:39-41`).

### `lib/surveys/cron-helpers.ts`
- `parseTimeToMinutes(t)` parses "HH:MM" or "HH:MM:SS" → minutes (`cron-helpers.ts:19-28`).
- `computeFireMomentLocal(date, endTime)`:
  - Returns `null` if endTime unparseable (`cron-helpers.ts:42-43`).
  - `closesEarly = minutes < 18*60` (`cron-helpers.ts:45`).
  - Fire date = same day if closesEarly else +1 (`cron-helpers.ts:49-53`).
  - Fire hour = 18 if closesEarly else 8 (`cron-helpers.ts:62`).
  - Returns `{ fireAtLocalIso, sameDay }` (`cron-helpers.ts:66-67`).
- `nowInTimezoneAsLocalIso(tz)` — **TZ trick**: `new Date(new Date().toLocaleString('en-US', { timeZone: tz }))`. Returns "YYYY-MM-DDTHH:MM:SS" with no offset (`cron-helpers.ts:75-85`). Works because server TZ is UTC on Vercel — the resulting Date's `getX()` methods return Chicago wall-clock values.
- `recentLocalDates(tz)` returns `{today, yesterday, todayDayOfWeek, yesterdayDayOfWeek}` (`cron-helpers.ts:91-106`).

### `lib/surveys/email.ts`
- Custom HTML email shell with market logo banner if uploaded (`email.ts:52-77`).
- `escapeHtml()` is the route's own inline helper, not imported (`email.ts:22-29`). Defensive against injection.
- Vendor subject: `"Quick survey — {marketName} on {dateDisplay}"` (`email.ts:99-101`).
- Buyer subject: `"How was your visit to {marketName} on {dateDisplay}?"` (`email.ts:129-131`).
- Both bodies include "Take the survey" button + prior-pending-note if count>0 + close date (`email.ts:103-127`, `133-158`).
- Buyer-only footer adds "Don't email me surveys" with `unsubscribeUrl` (`email.ts:148-151`).
- `sendSurveyEmail()` — uses Resend, returns `{ok, error?}`, NEVER throws (`email.ts:165-188`). From address: `Farmers Marketing <updates@mail.farmersmarketing.app>` (`email.ts:178`).

### `api/cron/surveys/route.ts`
- GET handler. CRON_SECRET via `Authorization: Bearer ...` checked with `timingSafeEqual` (`route.ts:50-65`).
- Loads active markets only: `.eq('active', true).eq('status', 'active')` (`route.ts:100-101`).
- For each market: pulls market_schedules for today+yesterday day_of_week, both `active=true` (`route.ts:140-145`).
- Candidates list of (marketDate, dayOfWeek) for any matching schedule (`route.ts:154-160`).
- For each candidate: computes fire moment, **skips if `nowLocal < fire.fireAtLocalIso`** (`route.ts:167`) — string comparison works because both are in same local TZ format.
- **Dedup**: HEAD-count probes `market_surveys` for any row matching (market_id, market_date) — if any exists, skip (`route.ts:170-176`). So if cron generates 5 vendor surveys then fails before buyer block, re-run won't generate buyers either. **Worth flagging.**
- Vendor selection (`route.ts:197-221`):
  - Pulls `vendor_market_schedules` where `market_id`+`day_of_week`+`is_active=true` (`route.ts:198-202`). Set of `vendor_profile_id`s.
  - Pulls `market_vendors` where `market_id` + `approved=true` with vendor_profiles embed (`route.ts:208-217`).
  - Intersects: vendor must be `approved` AT market AND `is_active` on schedule for this day.
- For each attended vendor:
  - INSERT market_surveys row with kind=vendor, notified_at=now (`route.ts:237-248`). `expires_at` from `computeExpiresAt(marketDate)` = marketDate + 30 days (`route.ts:446-451`).
  - Skip silently on 23505 duplicate (`route.ts:252`).
  - HEAD-count "other pending vendor surveys for THIS vendor" excluding the just-inserted ID (`route.ts:263-270`).
  - `sendNotification(profile.user_id, 'survey_request_vendor', ...)` — in-app + standard email.
  - If `user_profiles.email` set: custom email via `sendSurveyEmail` with logo (`route.ts:301-326`).
  - Vendor email URL: `/${vertical}/vendor/survey/${inserted.id}` (`route.ts:290`).
  - Vendor prior-pending URL: `/${vertical}/vendor/surveys` (`route.ts:292`).
- Buyer selection (`route.ts:331-346`):
  - Pulls `order_items` with `market_id`, `pickup_date=marketDate`, status IN `fulfilled`/`completed`, joining orders for `buyer_user_id` (`route.ts:331-340`).
  - Dedups via `Set<string>`.
- For each buyer:
  - Generate fresh `accessToken` (`route.ts:349`).
  - INSERT market_surveys row with kind=buyer + access_token + notified_at (`route.ts:351-363`).
  - Same priors count logic (`route.ts:377-385`).
  - `sendNotification(buyerUserId, 'survey_request_buyer', ...)` — in-app fires REGARDLESS of opt-out (matches mig 147 design intent) (`route.ts:389-399`).
  - Email only if `userProfile.email` AND **NOT** `survey_emails_opted_out` (`route.ts:408`).
  - Buyer email URL: `/${vertical}/survey/${accessToken}` (`route.ts:410`).
  - Buyer prior-pending URL: `${baseUrl}/${vertical}/buyer/surveys` (`route.ts:413`).
  - Unsubscribe URL: `/${vertical}/account/email-preferences?unsub=surveys&token=${accessToken}` (`route.ts:411`).

### 🚩 BUG 1 — Buyer "See all pending surveys" link 404s
- The buyer email links to `/${vertical}/buyer/surveys` (`route.ts:413`) when there are other pending surveys.
- **Verified by glob:** no such page exists at `apps/web/src/app/[vertical]/buyer/surveys/*`.
- Only file referencing `buyer/surveys` in the entire src tree is the cron itself (grep result).
- Buyers reading the email will get a 404 (or app-shell 404) on clicking this link. They CAN still take the surveys via individual `/survey/[token]` links.
- **Severity:** medium — degrades the "manage all my surveys" UX. Either build the page or remove the link.

### `api/surveys/respond/route.ts`
- Rate-limited via `rateLimits.submit` (`route.ts:35-38`).
- Body must have **exactly one** of `surveyId` or `accessToken` (`route.ts:42-56`).
- Vendor path: `createClient()` for auth, then service client for vendor_profile lookup and survey lookup (`route.ts:62-98`). Ownership check: survey row's `vendor_profile_id === vp.id` (`route.ts:92-97`).
- Buyer path: token shape check, then service-client lookup by access_token (`route.ts:101-116`).
- Common guards: `submitted_at` non-null → 409 "already submitted" (`route.ts:124-129`); `expires_at < now` → 409 "closed" (`route.ts:130-135`).
- Validation via `validateSurveySubmission(kind, body)` (`route.ts:139-142`).
- Update via `buildSubmissionUpdate` with race-safe `.is('submitted_at', null)` filter (`route.ts:146-150`).
- **NOTE:** does NOT check `data` for rows affected. If two requests race and the second arrives after first commits, the second's update silently affects 0 rows but returns 200 success. Not a real bug (state is correct) but worth knowing.

### `[vertical]/survey/[token]/page.tsx` (anonymous buyer)
- Token validity → 404 (`page.tsx:31-33`).
- Loads survey by `access_token` with markets embed for name + logo_url (`page.tsx:36-47`).
- Renders market header (logo + name + date) + form OR submitted/expired states (`page.tsx:63-138`).
- Submitted/expired UI is the `ClosedState` subcomponent (`page.tsx:142-172`).
- Token-as-auth design: anyone with the token can submit. Per code comment, intentional ("buyers might not be signed in when they click the email link") (`page.tsx:13-17`).

### `[vertical]/vendor/survey/[surveyId]/page.tsx`
- Auth-gated: redirect to login if no user (`page.tsx:23-24`).
- Vendor profile must exist for this vertical (`page.tsx:26-33`).
- Survey row must belong to this vendor profile (`page.tsx:43-47`). Else `notFound()`.

### `[vertical]/vendor/surveys/page.tsx` (list)
- Same auth + vertical check as detail page (`page.tsx:26-37`).
- Loads ALL vendor surveys for this vendor profile (`page.tsx:40-48`).
- Buckets: `submitted_at != null` → submitted; else `expires_at < now` → expired; else pending (`page.tsx:64-68`).
- Only pending rows are linkable; submitted/expired are static (`page.tsx:207, 244-256`).

### `components/surveys/SurveyForm.tsx`
- Client component. State: `ratings`, `comment`, `submitting`, `error`, `submitted` (`SurveyForm.tsx:40-44`).
- Client-side guard: every category required (`SurveyForm.tsx:51-56`).
- Submits `{...ratings, comment, surveyId OR accessToken}` to `/api/surveys/respond` (`SurveyForm.tsx:60-72`).
- On success → `submitted=true` shows green confirmation (vendor sees "See my other surveys" button) (`SurveyForm.tsx:85-121`).
- Rating row = 5 buttons with selected-state styling (`SurveyForm.tsx:237-276`).

### `components/surveys/PendingSurveysCard.tsx`
- HEAD count of pending vendor surveys (`PendingSurveysCard.tsx:24-31`).
- Renders pending count + link to list (`PendingSurveysCard.tsx:34-75`).
- Empty state ("No pending surveys right now") still renders the card to keep grid stable.

### `components/market-manager/SurveyResultsCard.tsx`
- Server component, defaults to 30-day window (`SurveyResultsCard.tsx:37-40`).
- Single query for all survey rows in window (`SurveyResultsCard.tsx:52-65`).
- `computeStats` per kind: total notified, total submitted, response rate %, per-category averages of submitted responses (`SurveyResultsCard.tsx:153-179`).
- "Recent comments" — top 10 submitted-with-comment rows (`SurveyResultsCard.tsx:85-87`).
- Per-kind section renders categories with `rating_overall` first as emphasized headline (`SurveyResultsCard.tsx:220-287`).
- Empty state shown until any rows exist (`SurveyResultsCard.tsx:97-103`).
- **Comment in code (line 33-35) says component does NOT enforce auth itself; caller responsible.** Verified caller IS responsible.

### `[vertical]/account/email-preferences/page.tsx`
- Handles `?unsub=surveys&token=<accessToken>` only — other paths show a generic page (`page.tsx:36-50`).
- Validates token shape, looks up `market_surveys` by access_token, gets `buyer_user_id` + `kind` (`page.tsx:57-61`).
- Aborts if not buyer kind or no buyer_user_id (`page.tsx:63-74`).
- UPDATE `user_profiles.survey_emails_opted_out = true` (`page.tsx:77-80`). No verification of update success.

### Section 2 — Risks / observations
- 🚩 **BUG 1 (medium):** `/[vertical]/buyer/surveys` page referenced in buyer email but does not exist.
- ⚠️ Cron dedup is "any market_surveys row for (market_id, market_date)" — if vendor block succeeds and buyer block fails partway, re-running cron will skip the whole day. The errors array surfaces this in the cron summary but no auto-retry.
- ⚠️ Schedule lookups in cron use `vendor_market_schedules.is_active` — **UNVERIFIED** that this is the correct field. I'll verify when reading schedule code (Section 7).
- ⚠️ TZ idiom in `nowInTimezoneAsLocalIso` is fragile but works on Vercel (server TZ=UTC). Local-dev (non-UTC) would yield wrong results — flag for local cron testing.
- ⚠️ Race window in `/surveys/respond`: concurrent submits succeed with 200 each but only first writes data. Not a correctness bug, but a future "you submitted but it didn't save" support ticket could trace here.
- ⚠️ Vendor email/contact pulled from `user_profiles.email` (`route.ts:295-299`) — **UNVERIFIED** that user_profiles has `email` column. Will verify when reading user_profiles touchpoints.

---

## Section 3 — Booth-# uniqueness + tier capacity (mig 146)

### `lib/markets/booth-conflict-checks.ts`
- `checkBoothNumberAvailable(client, opts)` — runs 3 HEAD-count queries (`booth-conflict-checks.ts:44-113`):
  - (a) market_vendors with same market+booth, with self-exclusion (`booth-conflict-checks.ts:51-67`).
  - (b) market_booth_placeholders same (`booth-conflict-checks.ts:69-86`).
  - (c) weekly_booth_rentals with status IN paid/pending_payment AND week_start_date >= today — only when caller is NOT the rentals table (`booth-conflict-checks.ts:92-110`).
  - Today computed via local Date methods (`booth-conflict-checks.ts:93-94`) — server is UTC on Vercel so this returns the wrong day around 19:00-23:59 CT (UTC date already rolled over). **Worth flagging — could mean stale "current/upcoming" check at end-of-day.**
- `checkTierCapacity(client, opts)` (`booth-conflict-checks.ts:154-217`):
  - Loads tier from market_booth_inventory by `(id, market_id)` to confirm same-market (`booth-conflict-checks.ts:160-165`).
  - Parallel counts of placeholders + market_vendors in tier with self-exclusion (`booth-conflict-checks.ts:181-202`).
  - Rejects if `currentCount + 1 > tier.count` (`booth-conflict-checks.ts:204-214`). Returns rich message.

### `vendor-booth/route.ts` (PATCH only)
- Auth + rate-limit (`vendor-booth/route.ts:33-47`).
- Normalizes booth_number; empty → null; cap 50 chars (`vendor-booth/route.ts:55-60`).
- Reads `inventory_id` from body only if the field is **present** in payload (`vendor-booth/route.ts:66-76`).
- Loads existing market_vendors row for self-exclusion + prior tier (`vendor-booth/route.ts:83-95`).
- Calls `checkBoothNumberAvailable` if boothNumber non-null (`vendor-booth/route.ts:99-109`).
- Calls `checkTierCapacity` ONLY when inventory_id provided AND **changing** from prior (`vendor-booth/route.ts:114-124`).
- Updates market_vendors with booth_number + (optional) inventory_id (`vendor-booth/route.ts:126-141`).
- Error codes handled: P0001 cross-market (`vendor-booth/route.ts:145-150`), P0005 BOOTH_CONFLICT (`vendor-booth/route.ts:155-160`).
- ⚠️ Comment at lines 23-26 says "No uniqueness check across vendors at the same market" — **STALE / contradicts code below.** Mig 146 added the check; code lines 99-109 enforce it. Comment should be removed/updated but is not load-bearing.

### `booth-placeholders/route.ts` (GET + POST)
- POST trims input via `validateBoothPlaceholderInput` (`booth-placeholders/route.ts:99-102`).
- Mig 145 enforcement: `inventory_id` REQUIRED (`booth-placeholders/route.ts:107-112`).
- `checkBoothNumberAvailable` + `checkTierCapacity` both called (`booth-placeholders/route.ts:120-137`).
- Insert + error code handling: 23505 unique (`booth-placeholders/route.ts:154-159`), P0001 cross-market (`booth-placeholders/route.ts:161-166`), P0005 BOOTH_CONFLICT (`booth-placeholders/route.ts:168-173`).

### `booth-placeholders/[placeholderId]/route.ts` (PATCH + DELETE)
- PATCH: same shape as POST but with self-exclude (`booth-placeholders/[placeholderId]/route.ts:117-126`).
- PATCH capacity check ONLY when tier changing (`booth-placeholders/[placeholderId]/route.ts:128-140`).
- DELETE just drops the row (no soft-delete) — that's fine because mig 135 schema is "current state" and CASCADE on market deletion already covered (`booth-placeholders/[placeholderId]/route.ts:185-215`).

### `weekly-rental/[rentalId]/route.ts` (PATCH only — manager assigns booth_number)
- Auth + rate-limit (`weekly-rental/[rentalId]/route.ts:38-53`).
- Normalize boothNumber: trim, empty → null, cap 50 (`weekly-rental/[rentalId]/route.ts:58-62`).
- **NO pre-flight `checkBoothNumberAvailable` call** — relies on triggers + partial UNIQUE index.
- Update with both `id` and `market_id` to prevent cross-market spoof (`weekly-rental/[rentalId]/route.ts:70-79`).
- Error handling: 23505 (mig 144 partial UNIQUE same-week rental) → 409 friendly (`weekly-rental/[rentalId]/route.ts:85-94`).
- 🚩 **BUG 2:** Does NOT handle P0005 BOOTH_CONFLICT raised by mig 146 trigger. If manager assigns rental booth_number that collides with a market_vendor or placeholder, the trigger raises P0005 but route returns a generic 500-class error from `traced.fromSupabase`. **Severity: low-medium.** Cross-rental same-week dup is well-handled (most common case); cross-table dup hits the bug.

### `vendor-tier/route.ts` (PATCH — set/clear market_vendors.inventory_id)
- Auth + rate-limit (`vendor-tier/route.ts:28-43`).
- Body: `vendor_profile_id` + `inventory_id` (string or null) (`vendor-tier/route.ts:45-58`).
- Updates market_vendors directly (`vendor-tier/route.ts:62-72`).
- Error handling: P0001 cross-market (`vendor-tier/route.ts:74-81`).
- 🚩 **BUG 3:** **No tier-capacity check.** Manager can drop a vendor INTO a tier that's already at capacity. Inconsistent with `vendor-booth` PATCH and `booth-placeholders` routes which all enforce capacity. Mig 146 trigger doesn't catch this (only checks booth_number, not tier capacity). **Severity: medium** — managers will create over-capacity tiers via the per-row tier dropdown UI on `VendorBoothList`.
- 🚩 **BUG 4 (related to 3):** No `checkBoothNumberAvailable` call either — but since this route only updates `inventory_id` (not `booth_number`), this is OK. (vendor-booth route is for booth_number changes.)

### Section 3 — Risks / observations
- 🚩 **BUG 2:** `weekly-rental/[rentalId]` PATCH does not translate P0005 trigger errors to user-friendly 409s — cross-table conflict surfaces as generic 500.
- 🚩 **BUG 3:** `vendor-tier` PATCH bypasses `checkTierCapacity` — manager can push vendors into over-capacity tiers.
- ⚠️ `checkBoothNumberAvailable` (c) clause uses local `new Date()` for "today" — server is UTC so end-of-day in CT (after 19:00) could be wrong (already next day in UTC), missing rentals that are actually still "today" in the market's TZ. Edge case; date-comparison is `>=` so the impact is missing protection for the current local day's leftover rentals.
- ⚠️ Comment in `vendor-booth/route.ts` (lines 23-26) is stale; mig 146 added the uniqueness check and code below enforces it.

---

## Section 4 — Tier + onboarding acks (mig 145)

### `api/market-manager/[marketId]/onboarding-acks/route.ts`
- GET returns `{no_existing_vendors_ack, no_placeholders_ack}` from markets table (`onboarding-acks/route.ts:60-78`).
- PUT accepts either/both booleans, updates markets (`onboarding-acks/route.ts:81-128`).
- Validates at least one field provided (`onboarding-acks/route.ts:100-105`).
- Auth via `isMarketManager`.

### `lib/markets/onboarding-progress.ts`
- 6 parallel queries: 4 HEAD counts + 1 maybeSingle for ack flags (`onboarding-progress.ts:68-102`).
- `vendors_step_done = vendors_at_market_count > 0 || no_existing_vendors_ack` (`onboarding-progress.ts:116`).
- `placeholders_step_done = placeholders_count > 0 || no_placeholders_ack` (`onboarding-progress.ts:117`).
- `required_complete` = sum of: inventory_done + optin_done + vendors_step_done + placeholders_step_done (`onboarding-progress.ts:119-123`).
- `required_total: 4` hard-coded — mig 145 bumped from 2 (`onboarding-progress.ts:53, 136`).

### `components/market-manager/OnboardingChecklist.tsx`
- `allRequiredDone` requires all 4 (`OnboardingChecklist.tsx:33-37`).
- All-done state shows "Setup complete — all 4 required steps configured" (`OnboardingChecklist.tsx:54`).
- 4 list items rendered with ✓/○ symbols (`OnboardingChecklist.tsx:111-138`).
- Distinguishes "acknowledged none yet" (italicized phrasing) vs counts (`OnboardingChecklist.tsx:118-122, 128-132`).

### `components/market-manager/BoothOccupancyGrid.tsx`
- 4 parallel queries: tiers, placeholders, vendors (approved=true), paid rentals this-week (`BoothOccupancyGrid.tsx:72-99`).
- Week computed via `mondayOf(localToday)` (`BoothOccupancyGrid.tsx:373-381`).
- TZ trick again: `new Date(new Date().toLocaleString(...))` (`BoothOccupancyGrid.tsx:66`).
- Dedup logic: vendors with paid rentals THIS WEEK get pulled from on-platform list and shown only via the rental row (carries auto-assigned booth_number for the week) (`BoothOccupancyGrid.tsx:129-146`).
- Groups by inventory_id; NULL → unknown-tier warning bucket (`BoothOccupancyGrid.tsx:155-165`).
- Per-tier card: "Tier {idx+1}: {size_label}" prefix (`BoothOccupancyGrid.tsx:231-232`) — per Session 84 testing feedback.
- Over-capacity warning when `filled > total` (`BoothOccupancyGrid.tsx:212, 245`).
- Returns null if no tiers configured (`BoothOccupancyGrid.tsx:167-169`).

### `components/market-manager/VendorBoothList.tsx` (client)
- Loads vendors + tiers in parallel on mount (`VendorBoothList.tsx:97-100`).
- **Tier fetch reads `tierData.inventory`** (`VendorBoothList.tsx:124`) — fixed in commit `cc9d23ba` after Test 3 of Session 84 caught dropdown permanently disabled.
- 4 filter modes: active / needs_booth / pending_approval / all (`VendorBoothList.tsx:35, 254-261`).
- Save sends `{vendor_profile_id, booth_number, inventory_id}` together (`VendorBoothList.tsx:143-151`).
- Per-row dirty state checks BOTH booth + tier (`VendorBoothList.tsx:340-342`).
- "Tier not set" amber badge shown for approved vendors with NULL inventory_id (`VendorBoothList.tsx:386`).
- Revoke confirmation via `ConfirmDialog` not browser confirm (`VendorBoothList.tsx:312-320`).

### Section 4 — Risks / observations
- ⚠️ The tier `<select>` in VendorBoothList is `disabled={isSaving || tiers.length === 0}` (`VendorBoothList.tsx:441`) — if tiers query fails silently, the dropdown stays disabled with title "Set up booth inventory tiers first". User would think they need to configure inventory, but the underlying tiers may exist. Minor UX nit.
- ✅ `OnboardingChecklist` looks correct vs the data layer. Verified all 4 progress booleans flow into the UI.
- ✅ Mig 145 ack flow: route lets manager toggle, progress lib reads, checklist renders the ack state. End-to-end coherent.

---

## Section 5 — Stripe-only booth rentals (Phase C) — VERIFIED

### `lib/pricing.ts` (booth-rental section)
- `BOOTH_RENTAL_FEES` constants: 6.5% vendor markup + 6.5% manager markup + $0.15 vendor flat (`pricing.ts:295-299`).
- `calculateBoothRentalFees(weeklyPriceCents)`: pure function — vendor pays `round(base*1.065)+15`, manager fee `round(base*0.065)`, manager gets `base-fee`, platform keeps the spread (`pricing.ts:324-345`).
- Free booths ($0) return zero on all sides (`pricing.ts:325-332`).

### `api/vendor/markets/[id]/book/route.ts`
- Stripe-required gate at top: rejects if `market.stripe_charges_enabled !== true` with 409 + "manager hasn't finished payment setup" message (`book/route.ts:137-144`).
- Validates body: `agreement_accepted === true`, `week_start_date` parseable + Sunday + ≥ today-in-market-TZ, `inventory_id` belongs to market (`book/route.ts:96-194`).
- Approval gate REMOVED — comment at lines 156-167 explains booking does NOT require `market_vendors` row + `approved=true`. "Manager controls supply, demand routes automatically."
- Snapshot opt-in + compute deterministic version hash via `agreement-version.ts` (`book/route.ts:240-241`).
- Insert vendor_market_agreement_acceptances OR fetch existing on 23505 idempotent path (`book/route.ts:244-284`).
- Call mig 146 RPC `book_weekly_booth_atomic` with 5 args (`book/route.ts:289-298`).
- Maps RPC RAISE codes: OVERBOOKED→409, DUPLICATE→409, INVENTORY_NOT_FOUND→404 (`book/route.ts:305-328`).
- ⚠️ **Does NOT handle LABELS_EXHAUSTED (P0004)** raised by mig 144 RPC — falls through to generic 500. **Minor gap** because manager-configured label range > inventory total is rare.
- After successful RPC: calls `createBoothRentalCheckoutSession` (`book/route.ts:380-392`).
- Persists `stripe_checkout_session_id` to rental row (`book/route.ts:401-404`); logs but doesn't block on failure.
- On Stripe failure: DELETEs the orphan rental row scoped to `id` + `status='pending_payment'` + `stripe_checkout_session_id IS NULL` (`book/route.ts:417-422`). Returns 502.

### `lib/stripe/connect.ts`
- `createMarketConnectAccount(email, marketId)` — Stripe Express account with **deterministic idempotency key** `connect-account-market-${marketId}` (`connect.ts:14-32`). Prevents dupes on retry, distinct from vendor-side key `connect-account-${vendorProfileId}`.
- Re-uses generic `createAccountLink` + `getAccountStatus` helpers (`connect.ts:64-91`).

### `api/market-manager/[marketId]/stripe/onboard/route.ts`
- Auth via `isMarketManager` (`onboard/route.ts:58-61`).
- **Status gate**: 403 if `markets.status === 'pending'` with "Stripe Connect locked until admin approves" message (`onboard/route.ts:93-102`). Anti-fraud guard.
- Validates existing `stripe_account_id` against Stripe; if Stripe 404 → clear all 4 stripe_* columns and re-onboard (`onboard/route.ts:109-135`).
- Creates account if needed, persists `stripe_account_id` (`onboard/route.ts:138-151`).
- Returns hosted onboarding URL with refresh + return URLs to dashboard with `?stripe=complete` query (`onboard/route.ts:154-161`).

### `api/market-manager/[marketId]/stripe/status/route.ts`
- **Lazy-sync model**: every call hits Stripe + writes back `stripe_charges_enabled/payouts_enabled/onboarding_complete` (`status/route.ts:85-99`).
- On Stripe 404: clear all 4 columns + return `{connected: false}` (`status/route.ts:110-128`).

### `lib/stripe/webhooks.ts`
- Dispatcher `handleWebhookEvent` switches on event type (`webhooks.ts:71-125`).
- `handleCheckoutComplete` routes booth_rental sessions via `session.metadata?.type === 'booth_rental'` to `handleBoothRentalCheckoutComplete` BEFORE regular order handling (`webhooks.ts:146-149`).
- `handleBoothRentalCheckoutComplete` (`webhooks.ts:1124-1317`):
  - Resolves `rentalId` from `metadata.rental_id` OR `client_reference_id` prefixed `booth_rental_` (`webhooks.ts:1131-1134`).
  - Surfaces "charged but unmatched" to admin via TracedError when row missing (`webhooks.ts:1154-1161`).
  - Idempotency: early return if already `paid` (`webhooks.ts:1165-1168`), plus `.neq('status', 'paid')` belt-and-suspender (`webhooks.ts:1180`).
  - After status flip: fires `booth_rental_paid_vendor` + `booth_rental_paid_manager` notifications wrapped in try/catch so notification failure never causes Stripe retry (`webhooks.ts:1199-1316`).
  - Manager notification only fires if `market.manager_user_id` is non-null (`webhooks.ts:1293`) — manager_email-alone falls back silently. Comment line 1290-1292 confirms intentional.
- `handleAccountUpdated` (`webhooks.ts:803-814`): updates **`vendor_profiles`** matching `stripe_account_id` — does **NOT** update `markets`. The lazy-sync via `/stripe/status` is the canonical sync path for markets.

### `api/cron/expire-orders/route.ts` — Phase 16
- Orphan sweep (`expire-orders/route.ts:2342-2353`): cancels `pending_payment` rentals with NULL `stripe_checkout_session_id` older than 30 min.
- Stale sweep (`expire-orders/route.ts:2356-2367`): cancels `pending_payment` rentals with non-NULL session older than 24h.
- Fires `booth_rental_payment_failed_vendor` per cancelled row, wrapped in try/catch (`expire-orders/route.ts:2379-2457`).
- Cron skipped on non-production Vercel env (`expire-orders/route.ts:57-59`) — staging cron does nothing! ⚠️ Worth flagging for testing: orphan/stale sweep is prod-only.

### Section 5 — Risks / observations
- ⚠️ **Stripe `account.updated` doesn't sync markets** (`webhooks.ts:803-814`). After manager finishes Stripe onboarding, `markets.stripe_charges_enabled` stays FALSE until someone polls `/stripe/status`. The Stripe return URL `?stripe=complete` triggers the card's auto-refetch on mount, which syncs it — but a vendor trying to book BEFORE the manager re-visits the dashboard sees a "manager hasn't finished payment setup" 409 error. **Severity: medium.** Worth confirming the dashboard card auto-fetches on `?stripe=complete` return.
- ⚠️ **Phase 16 cron is prod-only** (`expire-orders/route.ts:57-59`). On staging, orphan/stale booth-rental rows accumulate. Manual cleanup needed if testing booking failures.
- 🚩 **BUG 5 (minor):** book route doesn't handle `LABELS_EXHAUSTED` (P0004) — if manager's booth label range is shorter than inventory count, vendor sees 500 instead of friendly message. **Severity: low** (manager-config edge case).
- ✅ Idempotency keys deterministic — Stripe Connect account creation safe to retry.
- ✅ Race-safe rental insert via mig 142/144/146 RPC + UNIQUE constraints.
- ✅ Orphan cleanup on Stripe session creation failure.
- ✅ Webhook handler idempotent — `paid` rows are no-ops on retry.

---

## Section 6 — Intake + admin approve flow — VERIFIED

### `api/market-manager/intake/route.ts`
- Public POST, no auth, rate-limited via `rateLimits.submit` (`intake/route.ts:54-61`).
- Validates: name 2-100, email regex, market_name 3-100, city 2-100, state 2-letter, address 3-200, ZIP 5-digit or ZIP+4 (`intake/route.ts:89-172`).
- Content moderation on text fields via `checkFields` (`intake/route.ts:175-185`).
- **Multi-market managers supported** — comment line 189-194 says removed the email-uniqueness 409 in Session 84.
- Geocodes ZIP5 (non-fatal on failure) (`intake/route.ts:201-213`).
- INSERTS markets with: `vertical_id='farmers_market'`, `market_type='traditional'`, `status='pending'`, address fields, geocoded lat/lng, `manager_email` (lowercased), `manager_invited_at` (`intake/route.ts:222-236`).
- **Fuzzy duplicate check** (`intake/route.ts:259-283`): normalizes name (strip non-alphanum + lowercase) + same city, returns matches.
- Sends 2 emails via Resend in parallel: admin notification (with duplicate warning block if matches) + manager confirmation (with signup URL) (`intake/route.ts:289-309`).
- Returns 200 + `{success, market_id, message}`.

### `components/landing/ManagerIntakeForm.tsx`
- Client form. 50-state dropdown (`ManagerIntakeForm.tsx:20-72`).
- Client validates required fields + email format + ZIP format before submit (`ManagerIntakeForm.tsx:113-148`).
- States: idle / submitting / success / error with field hint (`ManagerIntakeForm.tsx:74-78`).
- Success state shows confirmation with sign-in link (`ManagerIntakeForm.tsx:193-228`).

### Platform admin: `apps/web/src/app/admin/markets/[id]/page.tsx`
- Loads market with embedded vendors + schedules (`admin/markets/[id]/page.tsx:21-46`).
- **Possible-duplicate check** (`admin/markets/[id]/page.tsx:73-115`): only runs when `status === 'pending'`. Same normalize-then-compare logic as intake route.
- Yellow banner with duplicate list + verification checklist + links to each duplicate (`admin/markets/[id]/page.tsx:138-190`).
- Status badge separate from `active` boolean — surfaces `markets.status` when not 'active' (`admin/markets/[id]/page.tsx:223-234`).
- `ApproveStatusButton` rendered next to "Edit Market" link (`admin/markets/[id]/page.tsx:238`).

### `ApproveStatusButton.tsx`
- Returns `null` when `status !== 'pending'` (`ApproveStatusButton.tsx:30`).
- POSTs `PUT /api/admin/markets/[id]` with `{status: 'active'}` (`ApproveStatusButton.tsx:37-41`).
- `router.refresh()` on success (`ApproveStatusButton.tsx:48`).

### `api/admin/markets/[id]/route.ts` PUT handler
- Extracts `status` from body (`api/admin/markets/[id]/route.ts:58`).
- Updates field in DB if present (`api/admin/markets/[id]/route.ts:119`).
- Validation: admin auth required (`api/admin/markets/[id]/route.ts:53, 76`).

### Vertical admin: `apps/web/src/app/[vertical]/admin/markets/page.tsx`
- Client component, list-with-edit-modal pattern (`[vertical]/admin/markets/page.tsx:57+`).
- **Approval workflow checks `approval_status`** (not `status`):
  - `pendingCount = markets.filter(m => m.approval_status === 'pending').length` (`[vertical]/admin/markets/page.tsx:438`).
  - "Pending approval" banner counts `approval_status === 'pending'` (`[vertical]/admin/markets/page.tsx:438, 505-520`).
  - "Approve" button only renders when `approval_status === 'pending'` (`[vertical]/admin/markets/page.tsx:1414`).
  - `handleApprove` PUTs `{approval_status: 'approved'}` (`[vertical]/admin/markets/page.tsx:382`).

### 🚩 BUG 6 (HIGH — already known per current_task.md but now code-verified)
- Intake form creates markets with **`status='pending'`** — `intake/route.ts:226`.
- Vertical admin's approval workflow checks **`approval_status='pending'`** — `[vertical]/admin/markets/page.tsx:438, 1414`.
- These are **different columns**. Markets created via intake will NEVER appear in vertical admin's "pending approval" badge/filter/button.
- Manager creates a market via intake → admin email sent + platform admin sees pending banner — but **vertical admin sees nothing**.
- To approve, admin must go to `/admin/markets/[id]` (platform admin) and click the Approve button. The vertical admin is blind to intake-pending markets.
- **Severity: high.** This is the gap the user flagged. Current_task.md describes this as the urgent next-session priority.

### Section 6 — Risks / observations
- 🚩 **BUG 6:** Vertical admin doesn't surface `status='pending'` markets from intake. Confirmed by reading both routes.
- ⚠️ The duplicate banner on platform admin loads via `ilike(city)` which depends on consistent capitalization. Normalize at intake stored "Westgate Mall" but admin search uses ilike of `market.city`. Probably fine, but worth verifying behavior with case mismatches.
- ✅ Intake validation thorough — server re-validates after client.
- ✅ Idempotent admin email send (Resend handles retries by design — single emails).
- ✅ Fuzzy duplicate normalization in JS catches "Farmer's" vs "Farmers", whitespace, punctuation variation.

---

## Section 7 — Editable schedule + branding + booth-label drift + share button — VERIFIED

### `api/market-manager/[marketId]/schedules/route.ts` (Session 83 Rule 5 incident)
- GET returns schedule rows + market.season_start/end (`schedules/route.ts:101-141`).
- PUT requires `acknowledged === true` body field — server hard gate (`schedules/route.ts:167-172`). Comment says manager confirms responsibility for vendor outreach + refunds.
- Validates: day_of_week 0-6, no dup days, `HH:MM` time format, start < end (`schedules/route.ts:174-212`).
- Validates season dates: YYYY-MM-DD format, start ≤ end (`schedules/route.ts:214-234`).
- **SOFT-DELETE PATTERN** (Session 83 incident): NEVER DELETEs market_schedules rows. Per-day soft-upsert — loads existing rows by day_of_week, UPDATEs in place or INSERTs new (only when active=true) (`schedules/route.ts:248-331`).
- Comment at lines 35-48 explains why: `market_schedules.active` is the soft-delete signal, 3 FKs CASCADE/SET NULL would destroy/orphan data on row delete. Trigger `handle_market_schedule_deactivation` cascades `is_active=false` to `vendor_market_schedules` when `active` flips true→false.
- After save: notifies all approved vendors + paid booth renters this week via `market_schedule_changed` notification (`schedules/route.ts:333-425`).
- ⚠️ "This week's Sunday" calculation uses server-local `new Date()` (`schedules/route.ts:376-380`) — UTC on Vercel — could be off by a day for paid-renter notification audience during late evening CT.
- ✅ Wrapped in try/catch so notification failure doesn't fail the save response (`schedules/route.ts:421-425`).

### `lib/markets/booth-label-drift-server.ts`
- `reconcileBoothLabelsAfterInventoryChange` reads `markets.booth_label_start/end` + sums `market_booth_inventory.count` (`booth-label-drift-server.ts:24-48`).
- Calls pure `detectBoothLabelDrift` from `lib/markets/booth-labels.ts:129-147`.
- If drift detected: clears both label fields + returns warning message (`booth-label-drift-server.ts:54-63`).
- Auto-clear instead of blocking the mutation per file comment line 11-14 — "lets inventory edit succeed and tells them to re-save labels next."

### `lib/markets/booth-labels.ts`
- `parseBoothLabel(label)` — regex `^(.*?)(\d+)$`, rejects "-N" leading sign, returns `{prefix, number}` or null (`booth-labels.ts:38-60`).
- `validateBoothLabelRange(start, end, ctx)` — same prefix + end ≥ start + range count === inventory total. Returns null on success or human-readable error (`booth-labels.ts:80-109`).
- `detectBoothLabelDrift` — returns `{rangeCount, totalCount}` when counts differ (`booth-labels.ts:129-147`).
- `generateBoothLabelSequence` — pure UI preview helper (`booth-labels.ts:156-168`).

### `api/market-manager/[marketId]/booth-labels/route.ts`
- GET returns both label columns (`booth-labels/route.ts:51-81`).
- PUT either both-null (clears) or both-set (validates range count == inventory total via `validateBoothLabelRange`) (`booth-labels/route.ts:83-176`).
- Rejects mixed null/non-null (`booth-labels/route.ts:125-130`).
- Rejects when totalCount=0 with "set up tiers first" message (`booth-labels/route.ts:146-151`).

### `api/market-manager/[marketId]/branding/route.ts` (description only)
- PATCH on `markets.description`, max 1000 chars, empty→null (`branding/route.ts:24-78`).
- Auth via `isMarketManager` (`branding/route.ts:40-43`).

### `api/market-manager/[marketId]/logo/route.ts`
- POST: multipart `image` field, 3MB cap, JPG/PNG/GIF/WebP allowed (`logo/route.ts:66-73`).
- Filename: `${marketId}-logo-${Date.now()}.${ext}` in `vendor-images/market-logos/` (`logo/route.ts:75-77`).
- Image moderation via `moderateStorageImage` AFTER upload; deletes the file if moderation fails (`logo/route.ts:101-106`).
- Updates `markets.logo_url` via service client (`logo/route.ts:110-122`).
- DELETE just clears `logo_url`; storage file left behind by design (`logo/route.ts:128-153`).

### `lib/markets/agreement-version.ts`
- `computeAgreementVersion(ids)` — FNV-like 32-bit hash, format `v1:<count>:<hex8>` (`agreement-version.ts:27-46`).
- `computeAgreementVersionFromSnapshot` — filters synthetic IDs (starts with `_`) BEFORE hashing (`agreement-version.ts:51-56`). So info-sharing-consent-only changes don't trigger re-acceptance.
- `getVendorAgreementStaleness` — compares latest acceptance.agreement_version against current computed version; uses service client because mig 138 is default-deny (`agreement-version.ts:103-142`).
- No acceptance row → `is_stale=true, has_any_acceptance=false` — caller distinguishes between "manager changed terms" and "you've never accepted" (`agreement-version.ts:127-134`).

### `app/[vertical]/markets/[id]/page.tsx` — share button market-day awareness
- Computes `localNow` from market.timezone via the same TZ trick (`markets/[id]/page.tsx:80-82`).
- `isMarketDayToday = !isEvent && schedulesArr.some(s => s?.active !== false && s?.day_of_week === todayDayOfWeek)` (`markets/[id]/page.tsx:86-88`).
- Three share-text templates (`markets/[id]/page.tsx:323-334`):
  1. Event with start date → "Check out X on Aug 12"
  2. Market-day today + has vendors → "X is open today! Featuring A, B, C and N more vendors. Come stop by."
  3. Generic → "Check out X — find local vendors, see what's in season, and pre-order."

### `components/vendor/BookBoothForm.tsx`
- Submit POSTs to `/api/vendor/markets/[id]/book` with `{week_start_date, inventory_id, agreement_accepted: true}` (`BookBoothForm.tsx:95-103`).
- On success: redirects to `data.checkout_url` (`BookBoothForm.tsx:115-118`).
- **No fallback path** for offline payment — Stripe-only model (`BookBoothForm.tsx:119-124`). If API doesn't return checkout_url, shows generic error.
- Return-from-Stripe states: `?session=success` → confirmation card with "View my bookings" link (`BookBoothForm.tsx:135-178`); `?session=cancel` → "You stepped away" with Try again / Back to dashboard (`BookBoothForm.tsx:180-238`).

### `lib/stripe/payments.ts` (booth-rental Checkout)
- `createBoothRentalCheckoutSession` (`payments.ts:283-349`):
  - Idempotency key `booth-rental-${rentalId}` — deterministic (`payments.ts:308`).
  - Payment methods: card, cashapp, amazon_pay, link (`payments.ts:312`).
  - One line item with `unit_amount = vendorPaysCents` (`payments.ts:313-323`).
  - `client_reference_id = booth_rental_${rentalId}` (`payments.ts:327`) — webhook fallback if metadata is stripped.
  - `payment_intent_data.transfer_data.destination = managerStripeAccountId`, `amount = managerReceivesCents` — Stripe Connect direct transfer (`payments.ts:328-334`).
  - Metadata: `type=booth_rental`, rental_id, market_id, week_start_date, base_price_cents, vendor_pays_cents, manager_receives_cents (`payments.ts:335-343`).

### `lib/markets/manager-queries.ts`
- `getMarketsManagedBy(supabase, user)` — two parallel queries (id-match + email-match), dedup by id (`manager-queries.ts:28-71`).
- Filter `vertical_id='farmers_market'` for v1 (`manager-queries.ts:42, 54`).
- Email matches lowercased value to hit functional index `idx_markets_manager_email`.
- **No filter on `status`** — returns markets in ANY status (pending, active, suspended). Manager sees pending market immediately after intake.

### `lib/markets/optin-public.ts`
- `fetchMarketOptinForVendor(marketId)` — joins `market_optin_selections` + `market_optin_statement_catalog` (`optin-public.ts:66+`).
- Returns 2 shapes: `rendered` (placeholders substituted, UI) and `snapshot` (raw + values, for acceptance row).
- Empty result on missing market / no selections / all inactive (`optin-public.ts:56-64`).

### Section 7 — Risks / observations
- ⚠️ Schedule notification audience: "this week's Sunday" computed via server-local Date (`schedules/route.ts:376-380`). Server-UTC on Vercel means "this week" rolls over at 19:00 CT (UTC midnight). Edge case — late-evening saves could miss a paid renter whose week_start_date is the just-past Sunday.
- ⚠️ Schedule save fires `market_schedule_changed` to EVERY approved vendor — including those who aren't scheduled for the changed day. Manager changes Saturday only → Tuesday-only vendors get a notification too. Cosmetic — they're not affected but get pinged. Worth verifying user-facing copy is generic enough.
- ✅ Soft-delete pattern correctly preserves `vendor_market_schedules.is_active` cascade via DB trigger — no DELETE in app layer.
- ✅ Booth-label drift auto-clear is non-blocking — inventory edits don't fail due to label mismatch.
- ✅ Logo moderation post-upload, deletes file on rejection.
- ✅ Idempotency keys deterministic across Stripe operations.
- ✅ Share button computes once at render — no client hydration mismatch.
- ✅ `getMarketsManagedBy` doesn't filter status → pending markets visible to manager immediately.

---

## Section 8 — Cross-cutting risks / Bug summary

### 🚩 Bugs flagged (in order of severity)

**🚩 BUG 6 (HIGH) — Vertical admin doesn't surface intake-pending markets**
- Intake creates `status='pending'`; vertical admin approval workflow checks `approval_status='pending'`.
- Different columns. Markets from intake are invisible to vertical admin's pending bucket.
- `app/[vertical]/admin/markets/page.tsx:438, 1414` vs `app/api/market-manager/intake/route.ts:226`.
- Already documented in current_task.md as urgent.

**🚩 BUG 3 (MEDIUM) — `vendor-tier` route skips capacity check**
- Manager can drop vendors into over-capacity tiers via `VendorBoothList` per-row dropdown.
- `app/api/market-manager/[marketId]/vendor-tier/route.ts` — no `checkTierCapacity` call.
- All other booth-mutation routes do enforce this; only vendor-tier doesn't.

**🚩 BUG 1 (MEDIUM) — Buyer survey email link to nonexistent page**
- Cron sends `${baseUrl}/${vertical}/buyer/surveys` for "see all pending" link.
- No such page exists. Single survey via `/[vertical]/survey/[token]` works fine.
- `app/api/cron/surveys/route.ts:413`.

**🚩 BUG 2 (LOW-MEDIUM) — `weekly-rental/[rentalId]` PATCH doesn't translate P0005**
- Mig 146 trigger raises BOOTH_CONFLICT (P0005) when manager assigns a rental booth_number that collides with market_vendor or placeholder.
- Route only handles 23505; P0005 falls through to generic 500.
- `app/api/market-manager/[marketId]/weekly-rental/[rentalId]/route.ts:85-95`.

**🚩 BUG 5 (LOW) — book route doesn't handle LABELS_EXHAUSTED**
- Mig 144 RPC raises P0004 when label range < inventory total. Route doesn't translate.
- `app/api/vendor/markets/[id]/book/route.ts:305-328` — handles P0001/P0002/P0003 but not P0004.

### ⚠️ Risks / observations (not bugs, but worth knowing)

**TZ idioms on UTC server**
- `new Date(new Date().toLocaleString('en-US', {timeZone: tz}))` works on Vercel UTC, but local Date methods (`new Date()`, `.getDay()`) return UTC values where they SHOULDN'T:
  - `lib/markets/booth-conflict-checks.ts:93-94` — "today" for current/upcoming rental check
  - `app/api/market-manager/[marketId]/schedules/route.ts:376-380` — "this week's Sunday" for renter notification audience
- Edge case is late-evening CT (19:00-23:59) when UTC date has rolled over.

**Stripe `account.updated` doesn't sync markets**
- Webhook updates `vendor_profiles` matching account_id; doesn't touch `markets`.
- Manager-to-market Stripe sync relies on lazy poll via `/stripe/status` endpoint.
- Vendor trying to book BEFORE manager re-visits dashboard sees "manager hasn't finished payment setup" 409.
- `lib/stripe/webhooks.ts:803-814`.

**Cron Phase 16 is prod-only**
- `app/api/cron/expire-orders/route.ts:57-59` returns early on non-production VERCEL_ENV.
- Booth-rental orphan/stale cleanup never runs on staging. Manual cleanup needed there.
- Phase E survey cron (`/api/cron/surveys`) is NOT gated this way and runs everywhere.

**Cron Phase E dedup is coarse**
- Cron skips a (market_id, market_date) entirely if ANY market_surveys row already exists.
- Partial failure (vendors generated, buyers errored) → next run won't backfill buyers.
- `app/api/cron/surveys/route.ts:170-176`.

**Surveys respond race window**
- `.update().eq(id).is('submitted_at', null)` updates 0 rows on a second submit but returns 200.
- No actual data integrity issue, but "I clicked submit and it didn't save" support tickets would trace here.
- `app/api/surveys/respond/route.ts:146-150`.

**Schedule notification fanout**
- Fires `market_schedule_changed` to ALL approved vendors regardless of which day changed.
- Tuesday-only vendor gets pinged when manager changes Saturday hours.

**Comment staleness in vendor-booth route**
- Docstring at `app/api/market-manager/[marketId]/vendor-booth/route.ts:23-26` says "No uniqueness check across vendors" but code below does check (mig 146 added). Comment is misleading but not load-bearing.

### ✅ Things verified solid

- All 10 migrations have rollback scripts + dependency notes.
- Mig 146 trigger is the canonical correctness gate; app-layer pre-flight is a friendly-error layer.
- Mig 142→144→146 RPC chain coherent; return shape changes managed via DROP+CREATE (144) then CREATE OR REPLACE (146).
- Survey kind XOR CHECK + audience uniqueness via NULLS NOT DISTINCT.
- Survey response race-safe via `.is('submitted_at', null)` filter on update.
- Stripe idempotency keys deterministic across all 3 transaction types (booth-rental, vendor-connect, market-connect).
- Stripe-only booth booking gate at top of route prevents writing rentals against an un-onboarded market.
- Orphan rental cleanup on Stripe session creation failure.
- Webhook handler idempotent + handles missing rentals via TracedError.
- Soft-delete pattern in schedules route after Session 83 incident.
- Booth-label drift auto-clear is non-blocking.
- Logo upload moderation post-upload with cleanup.
- Onboarding checklist 4-step model with ack flags coherent end-to-end.
- Phase E surveys: cron → notify → form → results card path complete.
- Fuzzy duplicate detection in intake + admin banner uses normalize-then-compare consistently.

### Files read in this audit
Migrations 138-147 (all 10); lib files: surveys/{types,token,cron-helpers,email}, markets/{booth-conflict-checks,booth-label-drift-server,booth-labels,onboarding-progress,agreement-version,optin-public,manager-queries}, stripe/{connect,webhooks,payments}, pricing; API routes: surveys/respond, cron/surveys, cron/expire-orders (Phase 16 section), vendor/markets/[id]/book, market-manager/{intake, [marketId]/{vendor-booth, booth-placeholders, booth-placeholders/[placeholderId], weekly-rental/[rentalId], vendor-tier, onboarding-acks, schedules, branding, logo, booth-labels, stripe/onboard, stripe/status}}, admin/markets/[id] (partial — main page + ApproveStatusButton), admin/markets/[id] route status field check; components: surveys/{SurveyForm,PendingSurveysCard,SurveyResultsCard}, market-manager/{BoothOccupancyGrid,OnboardingChecklist,VendorBoothList,MarketScheduleCard,MarketBrandingCard}, landing/ManagerIntakeForm, vendor/BookBoothForm; pages: [vertical]/{survey/[token],vendor/survey/[surveyId],vendor/surveys,account/email-preferences,markets/[id]} (share section), admin/markets/[id], [vertical]/admin/markets (relevant sections).

### New findings from 2026-05-24 staging testing (post-Commit 2)

Commit 1 (de475770) and Commit 2 (29f5abff) verified working on staging.
Bug 6 Tests A1+A2+A3 all passed (modulo NEW-13 UI nit).

The following are NEW bugs discovered during testing — separate from
Bugs 1-6 already fixed. NOT in scope of this session's commits.

| ID | Severity | Issue |
|---|---|---|
| NEW-7 | HIGH | **No doc upload UI** for manager identity verification. Manager can't upload ownership/LLC docs; admin has no review surface. The DuplicateMarketBanner explicitly asks admin to "request LLC docs / COI / signed letter" but there's no in-app path to receive/review them. Currently the workflow falls back to off-platform email coordination. |
| NEW-8 | HIGH | **Vendor-invitation UI missing from manager dashboard.** Manager can only invite via the existing `/api/market-manager/[marketId]/invite-link` (one-by-one with the link). Should support browsing on-platform vendors (e.g., within N miles) and inviting them. Was reportedly designed earlier; needs investigation of whether the code exists but isn't wired into nav. |
| NEW-9 | MEDIUM | **Schedule preloaded on admin/markets/[id]/edit for intake markets.** Manager didn't provide a schedule via intake form, but admin edit page shows a preloaded schedule (Saturday 8am-1pm default?). Assumption. Should preload empty for status=pending intakes; preserve schedule for pre-existing markets that had one before manager assignment. |
| NEW-10 | MEDIUM | **Market schedule card placement on manager dashboard.** Current location asks manager to set schedule AFTER onboarding. Should be part of onboarding step 1 (with address confirmation) per user's UX intent. |
| NEW-11 | MEDIUM | **`/admin/markets/[id]/edit` contact email empty** even when `manager_email` is set on the market row. Edit form's "Contact Email" field reads from `markets.contact_email`, not `markets.manager_email`. Either auto-populate from manager_email when contact_email is NULL, or show manager_email separately. |
| NEW-12 | MEDIUM | **market_type display inconsistency** — list view (`/admin/markets`) renders all rows as "Private Pickup" badge regardless of `market_type` value, while the detail dropdown (`/admin/markets/[id]/edit` MarketForm) correctly reads as "Traditional". This is the secondary bug already noted in current_task.md (private_pickup default). |
| NEW-13 | LOW | **ApproveStatusButton stuck-grey after click on vertical admin.** After successful approval, button remains in "Approving…" disabled state until manual page refresh. `router.refresh()` doesn't propagate the new `editingMarket.status` back to the parent component's state on the vertical admin edit form, so the button keeps its busy state. Platform admin detail page works fine because it's a server component. Cosmetic only — the approval itself succeeds. |

### Files NOT read in this audit (could matter for testing)
- `WeeklyBookingsCard.tsx`, `WeeklyBookingsList.tsx` (manager booking views)
- `MarketAgreementBlock.tsx`, `MarketDetailBlock.tsx`, `ManagerSupportCard.tsx`, `MarketTransactionsCard.tsx`, `InviteVendorLink.tsx`
- `BoothInventoryManager.tsx`, `BoothPlaceholderManager.tsx`, `OptinManager.tsx`
- `markets/[id]/book/page.tsx` server-side wrapper (the page that wraps `BookBoothForm`)
- `vendor/bookings/page.tsx` (vendor's My Bookings list)
- `where-today/page.tsx` and `api/trucks/where-today/route.ts` changes
- `lib/vendor/tax-notice.ts` (new file)
- Various smaller modified files: `lib/markets/manager-dashboard-stats.ts`, `lib/events/shop-data.ts`, test files

