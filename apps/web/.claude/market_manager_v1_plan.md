# Market Manager v1 — Build Plan

**Status:** Drafted 2026-05-05 (Session 78 wrap-up). Awaiting validation with friendly market managers before kickoff.
**Vertical:** `farmers_market` only for v1. FT park operator is a separate persona, deferred.

---

## Goal

Give farmers market managers a partner role with the platform: a manager dashboard accessible from the buyer dashboard (same human, different email — like event organizer), so they can see vendor attendance, booth assignments, aggregate market activity, and refer new vendors to us. Net effect: the platform becomes "operational software for running their market," not a competitor.

The pitch to managers: **vendor vetting + show-up tracking + aggregate market data, in exchange for routing their vendor onboarding through us.**

---

## Decisions locked (Session 78 dialog)

| Decision | Value |
|---|---|
| Vertical scope | FM only for v1; FT deferred |
| Manager-to-market relationship | 1:1 (one manager per market). Migrate to N:M only if real demand emerges. |
| Auth pattern | Same human, different email — mirrors event organizer (`catering_requests.organizer_user_id` + `contact_email` dual-key) |
| Manager dashboard access | Card on **buyer dashboard** (NOT vendor dashboard) — same as "My Events" card |
| Manager URL | `/[vertical]/market-manager/[marketId]/dashboard` |
| Public info page | `/[vertical]/market-manager-program` — marketing + contact/signup CTA |
| Manager assignment | Admin assigns via market admin UI. Invite email goes through Supabase like vendor onboarding. |
| Booth # location | Per-market on `market_vendors` (junction). Vendor self-sets initially; manager can override. Last-write-wins, no metadata. |
| Vendor financial data | **NEVER visible to managers.** Privacy boundary is non-negotiable. |
| Aggregate transactions | Order-count-level only (e.g. "47 pickup transactions this week at this market"). No per-vendor breakdown. |
| Manager-as-vendor | Different email = different login. No dual-role UX. |
| Multi-market managers | Out of scope for v1. |
| Pricing / wedge model | **Free for managers in v1.** Value exchange is non-monetary: manager promotes the platform to their vendors and the public. No paid tier. Revenue model deferred until adoption proves the value. |
| Invite path | **Mirror event organizer flow exactly.** Implementation should read `src/app/[vertical]/events/...` invite/auth code as the spec — don't invent a parallel mechanism. |

---

## Dashboard scope (priority order, all 5 ship in v1)

1. **Vendor list** — business name, booth #, attendance status (active/inactive), upcoming pickup count, optional category filter
2. **Aggregate transactions** — count of distinct orders with pickup at this market, selectable window (last 7 days / last 30 days / season)
3. **"Invite a vendor" link** — generates a market-prefilled signup URL (no token bookkeeping; matches the event organizer prefill pattern)
4. **Market schedule view** — read-only display of `market_schedules` rows for this market
5. **Support card** — link to KB article + support email

UX defaults (override during build if better idea emerges):
- Vendor list: filter toggle, defaults to active-only
- Date range: selectable (7/30/season)
- Booth # edit: inline single text field per row
- Vendor invite: market-prefilled URL (no token)
- Support: KB article link + email link

---

## Schema changes

One migration. Pre-launch numbering tbd (132+).

```sql
-- markets: add manager assignment + audit
ALTER TABLE markets
  ADD COLUMN manager_email TEXT,
  ADD COLUMN manager_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN manager_invited_at TIMESTAMPTZ,
  ADD COLUMN manager_accepted_at TIMESTAMPTZ;

-- Lookup indexes (manager_email queried by buyer dashboard card on every load,
-- manager_user_id queried by auth helper on every dashboard hit)
CREATE INDEX idx_markets_manager_email
  ON markets(LOWER(manager_email))
  WHERE manager_email IS NOT NULL;
CREATE INDEX idx_markets_manager_user_id
  ON markets(manager_user_id)
  WHERE manager_user_id IS NOT NULL;

-- Optional: single-manager-per-email constraint (loose, partial unique)
-- Skip if N:M is anticipated soon; harmless to add later.
CREATE UNIQUE INDEX uniq_markets_manager_email_active
  ON markets(LOWER(manager_email))
  WHERE manager_email IS NOT NULL;

-- market_vendors: per-market booth number
ALTER TABLE market_vendors
  ADD COLUMN booth_number TEXT;

-- No constraint on length/format — markets vary wildly (12, A3, Pavilion-North-12, etc).
-- Application layer can sanitize to ~50 chars.

NOTIFY pgrst, 'reload schema';
```

**Reversal path:**
```sql
ALTER TABLE markets
  DROP COLUMN manager_email, DROP COLUMN manager_user_id,
  DROP COLUMN manager_invited_at, DROP COLUMN manager_accepted_at;
ALTER TABLE market_vendors DROP COLUMN booth_number;
```

**RLS:** No new policies needed in v1. Auth enforced at route layer via `isMarketManager(marketId, user)` helper. Reads use `serviceClient`. RLS expansion is a follow-up if/when we expose any client-side queries directly to the manager.

---

## Files to add / modify

### New files (8)

| Path | Purpose |
|---|---|
| `supabase/migrations/[date]_NNN_market_manager_v1.sql` | Schema migration (above) |
| `src/lib/markets/manager-auth.ts` | `isMarketManager(marketId, user)` helper — checks `user.id == manager_user_id` OR `user.email == manager_email` (case-insensitive) |
| `src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx` | Manager dashboard (server component, fetches vendor list + schedule, hydrates transactions client-side via API for date selector) |
| `src/app/[vertical]/market-manager/[marketId]/dashboard/MarketManagerDashboardClient.tsx` | Client island for transaction date selector + booth edit |
| `src/app/[vertical]/market-manager-program/page.tsx` | Public info / marketing page |
| `src/app/api/market-manager/[marketId]/vendors/route.ts` | GET vendor list — joined `market_vendors` + `vendor_profiles` + attendance + pickup count + booth # |
| `src/app/api/market-manager/[marketId]/transactions/route.ts` | GET aggregate transaction count for `from`/`to` window |
| `src/app/api/market-manager/[marketId]/booth/route.ts` | PATCH `{ vendorProfileId, boothNumber }` — manager-only, updates `market_vendors.booth_number` |
| `src/components/market-manager/MarketManagerCard.tsx` | Buyer dashboard card — appears if user has assigned market(s) |

### Modified files (3-4)

| Path | Change |
|---|---|
| `src/app/[vertical]/dashboard/page.tsx` | Query `markets` for `manager_user_id = user.id OR manager_email = user.email`. If results, render `<MarketManagerCard />` |
| `src/app/[vertical]/admin/markets/[id]/...` (or wherever market admin edit lives) | Add manager-email input + "Send Invite" button. POST hits a new admin endpoint or extends existing market PATCH |
| `src/app/[vertical]/vendor/markets/page.tsx` (vendor's market list) | Add booth # field on the vendor's own row for self-set |
| `src/app/api/admin/markets/[id]/route.ts` (or new endpoint) | PATCH support for `manager_email` field; "Send Invite" sub-action triggers Supabase magic link email |

### Tests to add

- `src/lib/markets/__tests__/manager-auth.test.ts` — verify dual-key auth (id match OR email match, case-insensitive)
- Flow integrity: assert `MarketManagerCard` only renders when user is assigned, dashboard 403's for non-managers
- Business rule: assert manager API endpoints never expose `vendor_payout_cents`, `platform_fee_cents`, or any per-order financial column

---

## Build order (phased — each phase independently mergeable)

### Phase 1 — Schema + admin assignment + invite (no manager visibility yet)
- Migration
- Admin UI: "Manager Email" input on market admin page + "Send Invite" button
- Invite triggers Supabase magic link email (or signup link if user doesn't exist)
- Test on Dev → Staging
- **Smoke test:** admin can assign, email arrives, user signs up, `manager_user_id` populates on first auth via trigger or webhook

### Phase 2 — Auth helper + buyer dashboard card + dashboard skeleton
- `isMarketManager(marketId, user)` helper
- `MarketManagerCard` component
- Modify buyer dashboard to query and render card
- Manager dashboard page exists but shows placeholder ("Coming soon — vendors, schedule, transactions")
- **Smoke test:** invited user signs up, sees card on their buyer dashboard, clicks → lands on dashboard

### Phase 3 — Vendor list (priority #1)
- `GET /api/market-manager/[marketId]/vendors`
- Returns: `[{ vendor_profile_id, business_name, booth_number, is_active, upcoming_pickup_count, categories[] }]`
- Active = exists in `vendor_market_schedules` with `is_active = true` for this market
- Upcoming pickup count = `COUNT(order_items)` joined to vendor + market with `pickup_date >= today` and not in terminal status
- UI: filterable table, default active-only

### Phase 4 — Booth # editing (both sides)
- Vendor self-edit on `/[vertical]/vendor/markets/page.tsx` (their own row)
- Manager inline edit on vendor list
- PATCH `/api/market-manager/[marketId]/booth` (manager) and existing vendor markets PATCH (vendor)
- Last-write-wins on `market_vendors.booth_number`

### Phase 5 — Aggregate transactions (priority #2)
- `GET /api/market-manager/[marketId]/transactions?from=...&to=...`
- Returns: `{ order_count: number, item_count: number, window_start, window_end }`
- Query: `SELECT COUNT(DISTINCT order_id), SUM(quantity) FROM order_items WHERE market_id = $1 AND created_at BETWEEN $2 AND $3 AND status NOT IN ('cancelled', 'refunded')`
- UI: date range selector (7d / 30d / season), card shows headline number

### Phase 6 — Vendor invite link (priority #3)
- "Invite a Vendor" button on dashboard
- Generates URL: `/[vertical]/vendor-signup?market=[marketId]&ref=manager`
- Vendor signup page (existing) reads `market` query param and pre-selects market on the signup form
- No tokens, no expiry — vanilla deep link

### Phase 7 — Schedule view (priority #4)
- Read-only display of `market_schedules` rows for this market
- Calendar or simple list — whichever is cleaner

### Phase 8 — Support card (priority #5)
- Static card with KB article link + support email
- KB article authored separately (or stub for now)

### Phase 9 — Public info page
- Marketing copy describing the program
- CTA: "Contact us to onboard your market" (email form or static mailto)
- Linked from main nav or footer when feature is announced

---

## Out of scope (deferred)

- FT park operator equivalent (separate persona, separate plan)
- Per-vendor performance metrics or rankings (vendor financial privacy)
- Drag-and-drop booth layout editor (text field is sufficient)
- Vendor compliance reports / no-show automation
- Multi-market managers / N:M relationship
- Custom vetting criteria per market
- Comparative benchmarks across markets
- Manager-set custom vendor invitation tokens with expiry
- Pricing model (free in v1; revenue model is a separate decision)

---

## Open questions to validate before kickoff

1. **Market manager feedback** — user (tsjr00) will gather feedback from real market managers before kickoff. Plan should be revisited if feedback materially shifts priorities. Status: pending.
2. **`manager_user_id` auto-populate vs explicit claim** — copy the event organizer's mechanism exactly (whatever it does for `organizer_user_id`). Resolved: mirror event organizer flow (locked decision).
3. **Admin UI placement for "Manager Email" field** — new tab on market detail page, or just a section on the existing edit form? Default: section on existing form. Confirm at build time.

---

## Estimated scope

- **1 migration** (4 columns on markets, 1 column on market_vendors, 2-3 indexes)
- **~9 new files** (lib, API routes, pages, components)
- **~3-4 file modifications** (buyer dashboard, vendor markets page, admin market edit)
- **~3-5 tests** (auth helper, flow integrity, business rule for financial-data exclusion)

Probably **2 development sessions** for end-to-end MVP if scoped tightly. One session if focused and most decisions stay locked.

---

## Validation plan

User (tsjr00) will gather feedback from market managers before kickoff. Walk through the v1 dashboard surfaces 1-5 and ask which would actually address their pain. If feedback shifts priorities, revisit this plan and update before building.

**Pitch framing for those conversations:** the platform helps run their market — vendor vetting, attendance tracking, aggregate market activity — and is free in exchange for them promoting the platform to their vendors and the public. No subscription, no per-vendor fees from the manager.

---

## When this gets picked up

Read in order:
1. This file
2. `apps/web/.claude/session78_prod_push_audit.md` (for context on the current prod state)
3. The event organizer code as reference: `src/app/[vertical]/events/...`, `src/app/api/events/[token]/...`, the buyer dashboard "My Events" card

The event organizer flow is the closest analog and most patterns can be copied directly.
