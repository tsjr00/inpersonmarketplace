# Phase D — Vendor Market-Day Check-Ins (Design Doc)

**Created:** 2026-06-17. **Status:** Design, pre-build (awaiting build approval). **Source:** `growth_build_plan.md` Phase D + `session92_events_mm_growth_research.md` §J.8. Mode target: Fix (hybrid).

## Goal
Let vendors check in (start) and check out (end) at a market/park on a market day. Self-attestation primary; opt-in browser geolocation as advisory corroboration. Value: attendance proof + occupancy data for FM managers & FT park owners; report data + weekly attendance monitoring; forward-prep for state compliance.

## User decisions (2026-06-17)
- **Entry point:** NOT a new card — a prompt/button on the existing **"My Locations" card** on the vendor dashboard: "Check in to your market / park now."
- **Capture booth/space #:** YES.
- **Manager visibility:** check-in/out data visible to managers/event planners, **scoped to their market + only vendors associated with their market**. Add the columns + populate. Build a manager attendance UI where it fits (read/report + weekly monitoring). *(Interpretation: this is manager VIEW access, not manager counter-sign. I'll add `manager_confirmed*` columns forward-compat but ship NO counter-sign UI — flag if you actually wanted counter-sign.)*
- **Who can check in:** ALL — traditional scheduled vendors + booth renters + event vendors.
- **Geolocation:** "as you see fit for reliability without being intrusive / slow / complex." → one-shot `getCurrentPosition` (opt-in, like the existing `LocationPrompt`), advisory only, never blocks, no continuous tracking.

## Verified facts (cite-or-verify)
- `markets.latitude`/`.longitude` exist (numeric, nullable), indexed `idx_markets_coordinates` (SCHEMA_SNAPSHOT:286-287, 1949). → distance-from-market computable.
- Geolocation precedent: `components/location/LocationPrompt.tsx`, `LocationSearchInline.tsx`, `hooks/useLocationAreaName.ts` use `navigator.geolocation.getCurrentPosition` with permission handling. Reuse pattern.
- Attendance model: `cron/surveys/route.ts:353-378` — attended = `market_vendors.approved=true` ∩ active `vendor_market_schedules` for the `day_of_week`. Booth renters = `weekly_booth_rentals` status='paid' for the week. Events = `market_vendors.response_status`.
- Haversine (miles) duplicated in `api/vendors/nearby`, `api/markets/nearby`, `api/vendor/markets/route.ts:679`. Add meters variant for geofence.
- Attestation-snapshot precedent: `vendor_market_agreement_acceptances` (text + version hash). Mirror for `attestation_text`/`attestation_version`.
- `market_day_checkins` does NOT exist — net-new table.
- Manager routes pattern: service client + `isMarketManager` gate (broadcast GET, schedules route). Reuse for the attendance GET.

## Schema — mig 160 `market_day_checkins`
```
id                      UUID PK default gen_random_uuid()
market_id               UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE
vendor_profile_id       UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE
market_date             DATE NOT NULL
checked_in_at           TIMESTAMPTZ NOT NULL DEFAULT now()
checked_out_at          TIMESTAMPTZ NULL
method                  TEXT NOT NULL DEFAULT 'self_attest'
                          CHECK (method IN ('self_attest','geolocation','manager','qr'))
self_attested           BOOLEAN NOT NULL DEFAULT true
attestation_text        TEXT NULL
attestation_version     TEXT NULL
booth_number            TEXT NULL
captured_latitude       NUMERIC NULL
captured_longitude      NUMERIC NULL
location_accuracy_m     NUMERIC NULL
distance_from_market_m  NUMERIC NULL          -- computed server-side at check-in
within_geofence         BOOLEAN NULL          -- advisory; null if no market coords / no location
checkout_latitude       NUMERIC NULL
checkout_longitude      NUMERIC NULL
manager_confirmed       BOOLEAN NOT NULL DEFAULT false   -- forward-compat; no UI v1
manager_confirmed_by    UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
manager_confirmed_at    TIMESTAMPTZ NULL
notes                   TEXT NULL
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (market_id, vendor_profile_id, market_date)
INDEX (market_id, market_date)            -- manager attendance query
INDEX (vendor_profile_id, market_date)    -- vendor "did I check in"
```
- RLS enabled. Vendor own-row policies: SELECT/INSERT/UPDATE where `vendor_profile_id IN user_vendor_profile_ids()`. Manager/admin reads go through service client (gate enforced in route) — mirrors broadcast/schedule pattern. updated_at trigger (existing `update_updated_at_column`). `NOTIFY pgrst`.
- Derived (not stored): `duration_minutes` = checkout − checkin (compute on read).

## Eligibility (server-validated before insert)
Vendor may check in to `marketId` for **today's market-local date** only (no backdating) when associated via ANY of:
1. Traditional: `market_vendors.approved=true` + active `vendor_market_schedules` for today's day_of_week.
2. Booth renter: `weekly_booth_rentals.status='paid'` for the week containing today.
3. Event: `market_vendors` row with accepted `response_status` for the event date.
`booth_number` auto-filled from the assignment if present (market_vendors.booth_number / weekly_booth_rentals).

## Geolocation approach (reliable, non-intrusive, simple)
- Client: one `getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })`, opt-in via browser prompt. Denied/timeout → proceed `self_attest`, location null. NO `watchPosition`.
- Server: compute `distance_from_market_m` via meters-haversine vs market coords; `within_geofence = distance <= RADIUS_M` (const **250 m** per user 2026-06-17 — covers GPS jitter ~10-20 m + venue footprint ~100-200 m; "at the venue", not "at the pin"; null if either coord missing). Advisory — never blocks check-in. `method='geolocation'` when coords present, else `'self_attest'`. Keep RADIUS_M a single tunable constant.
- Attestation statement (default, version `checkin-2026-06-v1`): "I confirm I am present and operating at {market} on {date} in accordance with my applicable permits/licenses and the {brand} vendor terms."

## Routes
- `POST /api/vendor/markets/[marketId]/checkin` — vendor auth, eligibility check, compute distance, upsert row (insert or set check-in fields). Body: `{ lat?, lng?, accuracy?, attestation_version }`.
- `POST /api/vendor/markets/[marketId]/checkout` — set `checked_out_at` (+ optional end coords). Vendor own-row.
- `GET /api/market-manager/[marketId]/attendance?date=YYYY-MM-DD` — `isMarketManager` gate, service client; returns rows for market+date scoped to associated vendors (name, in/out, duration, location flag, method).

## UI
- **Vendor — "My Locations" card** (`[vertical]/vendor/dashboard/page.tsx`): when a market the vendor is associated with operates today, show "Check in to your market / park now" → geolocation prompt + attestation → POST. After check-in shows "Checked in HH:MM · Check out". Multiple eligible markets today → one prompt row each.
- **Manager — attendance card** (manager dashboard): "Today's attendance" (date selector for weekly monitoring) — associated vendors with in/out time, duration, location flag (✓ within / ⚠ far / — none), method. Read-only. CSV export as fast-follow (reuse `lib/export-csv.ts`, mirrors survey export).

## Build steps (multi-step) — BUILT 2026-06-17 (gates green: tsc/lint/vitest 1493)
1. ✅ mig 160 `20260617_160_market_day_checkins.sql` (table + indexes + 3 RLS policies + trigger + NOTIFY). NOT applied.
2. ✅ `lib/markets/checkin-eligibility.ts` — meters-haversine + eligibility helper + market-local date/dow.
3. ✅ `api/vendor/checkins/route.ts` — GET today's eligible+status; POST checkin/checkout.
4. ✅ `components/vendor/MarketCheckInPrompt.tsx` wired into dashboard "Manage Locations" card.
5. ✅ `api/market-manager/[marketId]/attendance/route.ts` + `components/market-manager/MarketAttendanceCard.tsx` wired into manager dashboard.
6. ⬜ (fast-follow) attendance CSV export.
7. ⬜ SCHEMA_SNAPSHOT changelog (after mig 160 applied), commit, push staging.
**SEQUENCING:** mig 160 → Dev+Staging BEFORE the code push (routes read/write the table + PostgREST FK embed).

## Resolved (2026-06-17)
- Manager counter-sign: columns added, **UI OFF** (user: not needed for now).
- Geofence: **250 m**, advisory-only.
- Check-in: **today-only** (market-local date, no backdating).
- Notifications: none in v1 (vendor-initiated). "Vendor checked in" manager ping = possible later add.
