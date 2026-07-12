# Phase B Vendor Agreement Loop — Implementation Plan

**Date:** 2026-05-15
**Session:** 82 continuation
**Author:** Claude (with TSJR direction)
**Status:** Awaiting user sign-off; mig 138 application in progress on Dev

This plan covers ONLY the agreement-at-join loop. Booking and payment are Phase C. Survey/share are Phase E. See `market_manager_v2_plan.md` for the full strategic picture.

---

## 1. Goal

Ship the full vendor-side agreement-acceptance loop for invite-flow vendors. Four user states all handled, agreement captured at every join, no orphan flows.

**Success criteria:**
- Any vendor reaching a market's affiliation (via invite link or self-join) has an `vendor_market_agreement_acceptances` row written before/with the `market_vendors` row.
- The invite link delivers the correct UX to each of the 4 user states.
- Existing buyer/vendor invite flows work without manual workarounds.

---

## 2. Out of scope (explicit)

- Migration 139 (`weekly_booth_rentals`) — Phase C
- Booking flow (pick week → pick size → price → checkout)
- Payment integration (Stripe Connect for managers)
- Re-acceptance prompt-on-next-load UX — schema supports `agreement_version` bumps; UI deferred to a later session
- Save-and-resume for half-completed signups — deferred
- Vendor notification on manager approval — separate session

---

## 3. Decisions already locked (from session 82 conversation)

| Topic | Lock |
|---|---|
| Agreement display position on signup page | After form fields, before submit |
| Agreement density | Single "I agree to this market's agreement" checkbox, statements visible/listed |
| Existing vendor self-join via invite | `approved=false` (manager always reviews) |
| Path 1 (new vendor) decline checkbox | Signup proceeds; no `market_vendors` row created at that market |
| Path 2 (existing vendor adding managed market) gate | Soft — market added, agreement banner persists |
| Re-acceptance on version bump | Prompt on next dashboard load (non-blocking) |
| Filter UX in manager dashboard | Split into "Pending — signed" and "Pending — unsigned" (Section 5.6 below) |
| Manager invite link availability | Gated on manager onboarding complete (Section 5.7 below) |
| Save/resume | Deferred |
| New decision (added tonight) | Existing vendor self-join via invite **must** capture agreement — same rule as new vendor |

---

## 4. Migration 138 application

**File:** `supabase/migrations/20260512_138_vendor_market_agreement_acceptances.sql`

**Order:**
1. Dev (in progress by user as of plan-doc write time)
2. Staging
3. Production

Each step verified via:
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'vendor_market_agreement_acceptances'
) AS applied;
```

**After each environment confirms `applied=true`:**
- User reports back; Claude moves to next env or proceeds to code build.

**After all 3 envs confirmed:**
- Move file from `supabase/migrations/` → `supabase/migrations/applied/`
- Update `SCHEMA_SNAPSHOT.md` Change Log: "Mig 138 applied to all 3 envs 2026-05-15"
- Schema snapshot structured Tables/Columns sections will NOT be regenerated tonight (per `migration-workflow.md`, that's a separate REFRESH_SCHEMA.sql run; backlogged as part of R4 mitigation)

---

## 5. The 4 user states + UI per state

### 5.1 State A — Anonymous user with `?market=<id>`

**Renders:** Co-branded landing inside `vendor-signup/page.tsx` `!user` branch:
- Heading: `"<Market Name> invited you"` (fallback `"You're invited to join a market"` if market name not yet loaded)
- Subhead: explains they need to create an account to sign up as a vendor at this market
- Agreement block: same component as logged-in branches (renders statements + single checkbox, but checkbox is **informational only** — the actual acceptance write happens after they complete buyer signup and return to vendor-signup)
- **Login button** — preserves `?market=<id>` via `returnTo` (requires Section 5.5 login page change)
- **Create Account button** — preserves `?market=<id>` via `returnTo` (existing buyer-signup page already honors returnTo)

**Acceptance row:** Not written here. Written downstream when they return logged in and submit the vendor-signup form (Path 2 → State B).

**Decision note:** We show the agreement block to anonymous users so they can preview what they're agreeing to before committing. This is honesty/transparency over friction-minimization. If the agreement looks heavy and they bail, we'd rather know now than capture a bad-faith acceptance later.

### 5.2 State B — Logged-in buyer (no vendor profile) with `?market=<id>`

**Renders:** Existing vendor-signup form (current flow) PLUS:
- Banner above form (already exists in current code at `marketName` render block, lines ~665-691)
- Agreement block above submit button (new)
- Submit button gated on agreement checkbox checked

**Acceptance row:** Written by `/api/submit` when it processes the signup (Section 5.4 below).

**Existing limitation:** If the vendor declines the checkbox, submit is blocked. They can still sign up without market context by navigating to `/[vertical]/vendor-signup` directly (without `?market=`). Per earlier decision #7.

### 5.3 State C — Logged-in vendor, NOT at this market, with `?market=<id>`

**Renders:** New branch in `vendor-signup/page.tsx` (currently falls through to "Back to Dashboard" — that's the bug):
- Heading: `"<Market Name> invited you to join their market"`
- Subhead: confirms they're already a vendor on the platform and explains they just need to accept this market's agreement
- Agreement block (same as other states)
- **Join button** — POSTs to `/api/vendor/markets/[marketId]/join` (Section 5.4 new endpoint)
- Cancel/back link

**Acceptance row:** Written by the new join endpoint atomically with the `market_vendors` row.

### 5.4 State D — Logged-in vendor, ALREADY at this market

**Renders:** Friendly "you're already at [Market]" message:
- "You're a vendor at <Market Name>" + brief status info (approved / pending)
- Link to vendor dashboard
- If `agreement_version` for this market has bumped since their acceptance: show "Market manager has updated their agreement — please re-accept" with agreement block + re-confirm button (deferred polish — for tonight, just show the friendly message and skip the re-acceptance prompt)

**Acceptance row:** None written. The existing one (if present) stands.

---

## 6. Code changes — 5 touchpoints

### 6.1 NEW: `GET /api/markets/[id]/optin-public`

**Path:** `src/app/api/markets/[id]/optin-public/route.ts`

**Auth:** None (public read).

**RLS handling:** Default-deny on `market_optin_selections` (mig 137). Use `createServiceClient()` server-side.

**Returns:**
```json
{
  "market_id": "<uuid>",
  "market_name": "Westgate",
  "statements": [
    {
      "id": "producer-only",
      "category": "product_quality",
      "category_label": "Product & Quality",
      "rendered_text": "I produce, grow, or hand-craft all items I sell at this market..."
    },
    // ... more statements
  ]
}
```

**Behavior:**
1. Read `markets` row by id; 404 if not found.
2. Read `market_optin_selections` for this market.
3. Read `market_optin_statement_catalog` joined on selection IDs.
4. Substitute placeholders using `renderOptinStatement()` from `optin-types.ts`.
5. Group by category using `groupStatementsByCategory()`.
6. Return flat array (callers can group client-side if they want).

**Empty-statements case:** If manager hasn't selected any statements, return `{ statements: [] }`. UI handles by skipping the agreement block (degrades gracefully per Decision §6.4 logic).

**Rate limiting:** Standard `api` preset.

### 6.2 NEW: `POST /api/vendor/markets/[marketId]/join`

**Path:** `src/app/api/vendor/markets/[marketId]/join/route.ts`

**Auth:** Must be authenticated + must have a vendor profile.

**Body:**
```json
{
  "agreement_accepted": true,
  "agreement_version": null  // optional, for future re-acceptance flow
}
```

**Behavior:**
1. Auth check + `vendor_profiles` lookup for the user.
2. Validate market exists.
3. If `agreement_accepted !== true`, return 400.
4. Fetch market opt-in statements (reuse internal helper from `optin-public`).
5. Build `statements_snapshot` JSONB from current statements.
6. Service client:
   - Upsert `market_vendors` row with `approved=false` (idempotent on `(market_id, vendor_profile_id)`)
   - Insert `vendor_market_agreement_acceptances` row with the snapshot
7. If acceptance insert fails after market_vendors upsert, log inconsistency (don't roll back; vendor can be re-prompted via dashboard load).

**Returns:**
```json
{
  "success": true,
  "market_vendor_id": "<uuid>",
  "acceptance_id": "<uuid>",
  "approved": false
}
```

**Rate limiting:** Standard `api` preset.

### 6.3 MODIFY: `POST /api/submit`

**Path:** `src/app/api/submit/route.ts` lines ~196-230

**Change:** Extend the existing auto-association block to also write `vendor_market_agreement_acceptances` row when:
- `body.market_id_from_invite` is set AND
- `body.market_agreement_accepted === true`

**Flow:**
1. Existing market_vendors upsert (unchanged)
2. NEW: after market_vendors upsert succeeds, fetch statements snapshot, insert acceptance row.
3. Non-blocking: if acceptance insert fails, log and continue (matches existing pattern).

**Acceptance:** Treated same as Section 6.2 — non-atomic but logged inconsistency is recoverable via dashboard re-prompt.

### 6.4 MODIFY: `src/app/[vertical]/vendor-signup/page.tsx`

**Changes:**
1. **`!user` branch (lines ~553-580):** Rewrite to handle State A. Render co-branded heading + agreement block + Login/Create Account with returnTo preserving market_id. If no `?market=<id>`, fall back to current "Login Required" copy (unchanged behavior for non-invite traffic).
2. **Vendor profile exists branch (lines ~520-550):** Rewrite to handle States C and D. Check if vendor is at this market:
   - If yes → State D: "You're at this market" message.
   - If no AND `?market=<id>` → State C: "Join this market" landing with agreement block + Join button calling new endpoint.
   - If no AND no `?market=<id>` → existing "Back to Dashboard" (unchanged for non-invite).
3. **Main form branch (logged-in non-vendor):** Add agreement block above submit button. Submit gated on checkbox.
4. **Submit handler:** Pass `market_agreement_accepted: true` to `/api/submit` when the checkbox was checked.
5. **Add useEffect to check "is vendor at this market":** New query against `market_vendors` for `(vendor_profile_id, market_id)`.

**New shared component (probably):** `<MarketAgreementBlock marketId={...} onAcceptedChange={...} />` — fetches statements via `optin-public`, renders them grouped by category, shows single "I agree" checkbox. Lives in `src/components/market-manager/MarketAgreementBlock.tsx`.

### 6.5 MODIFY: `src/app/[vertical]/login/page.tsx` lines 34-37

**Current:**
```ts
const isEventRef = searchParams.get('ref') === 'event'
// returnTo is intentionally NOT read here — existing users should always
// go to their dashboard. Only the confirm-email page uses returnTo (for
// new accounts via user_metadata). See vendor-signup login wall for the
// only place that links to /login?returnTo=...
const dashboardSuffix = isEventRef ? '?section=events' : ''
```

**Change:** Narrow the rule — honor `returnTo` only when it's a `/[vertical]/vendor-signup?market=` URL.

```ts
const returnToParam = searchParams.get('returnTo')
const isMarketInviteReturn = returnToParam &&
  returnToParam.startsWith(`/${vertical}/vendor-signup`) &&
  returnToParam.includes('market=')
const postLoginUrl = isMarketInviteReturn ? returnToParam : (dashboardUrl)
```

Use `postLoginUrl` instead of `dashboardUrl` after successful login.

**Critical:** The narrow predicate (`startsWith` + `includes`) means we ONLY honor returnTo for this specific invite case. Every other returnTo is ignored, preserving the original intent.

---

## 7. Acceptance write atomicity (Risk discussion)

The `market_vendors` row and `vendor_market_agreement_acceptances` row are NOT written in a single transaction in the proposed implementation. Two writes happen sequentially.

**Failure modes:**
- market_vendors succeeds, acceptance fails → vendor associated but no signed agreement on file. Recoverable via prompt-on-next-load (deferred polish from Section 2).
- market_vendors fails → 500 returned to client, no rows written. Clean.

**Why not a transaction?**
- Supabase `pg-meta` doesn't expose a clean transaction API for the JS client
- Using a Postgres function would couple this work to a new DB function (schema-snapshot bookkeeping + SQL migration)
- Current pattern in `/api/submit:213-222` is already non-atomic for the auto-association

**Mitigation:**
- Log any acceptance-write failure with severity `medium` via `traced.fromSupabase`
- The R5 backlog item ("automated test for §4.3 auto-create idempotency") should expand to cover this paired write

**Acceptable risk:** Vendor without acceptance row is a recoverable state (re-prompt). No data corruption.

---

## 8. Test plan

**Manual smoke (after staging push):**

| State | Steps | Pass criteria |
|---|---|---|
| A — Anonymous | Open invite link in true incognito (cookies cleared) | Co-branded "[Market] invited you" page; agreement block visible; Login/Create Account buttons have `returnTo=/farmers_market/vendor-signup?market=<id>` |
| B — Logged-in buyer | Log into a buyer-only account, paste invite URL | Banner + agreement block; submit gated on checkbox; after submit, manager dashboard shows new vendor in Pending Approval (after they sign in as manager); acceptance row exists in DB |
| C — Existing vendor not at market | Log in as a vendor account; paste invite URL for a market they're NOT at | "Join this market" landing + agreement block; click Join → row created in market_vendors (approved=false) AND acceptance row written |
| D — Existing vendor at market | Log in as a vendor; paste invite URL for a market they ARE at | "You're at <Market>" message + dashboard link; no writes |

**Automated:**
- Existing flow-integrity test (permission boundary on market_vendors delete) — should still pass; we're not adding DELETE.
- No new business-rule tests tonight (out of scope; full coverage in a later session).

**DB verification queries** (run after smoke):
```sql
-- Confirm acceptances are being written
SELECT vpa.id, vp.id AS vendor_id, m.name AS market_name, vpa.accepted_at,
       jsonb_array_length(vpa.statements_snapshot) AS statements_count
FROM vendor_market_agreement_acceptances vpa
JOIN vendor_profiles vp ON vp.id = vpa.vendor_profile_id
JOIN markets m ON m.id = vpa.market_id
ORDER BY vpa.accepted_at DESC LIMIT 5;
```

---

## 9. Commit sequence

**Recommendation: ONE bundled commit** for the loop, plus a separate small commit for the migration bookkeeping.

**Order:**
1. **Commit A (after mig 138 applied to all 3 envs):** Migration bookkeeping
   - Move `20260512_138_*.sql` → `supabase/migrations/applied/`
   - Update `SCHEMA_SNAPSHOT.md` Change Log
   - Subject: `chore(db): mig 138 applied to all envs — vendor_market_agreement_acceptances`
2. **Commit B (the loop):** All 5 code touchpoints
   - Subject: `feat(market-manager): vendor agreement-acceptance loop (Phase B)`
   - Body lists each touchpoint + the 4 user states fixed.

**Why bundled (not split per-touchpoint):**
- The 5 touchpoints depend on each other. Shipping any subset breaks the loop.
- One smoke verification covers them all.
- Easier to revert if something breaks in prod.

---

## 10. Push sequence

1. After Commit A: not pushed (just local bookkeeping). Or pushed independently to keep the staging diff smaller.
2. After Commit B: full chain to staging — `git checkout main && git add . && git commit && git checkout staging && git merge main --ff-only && git push origin staging && git checkout main`.
3. Pre-push hook runs (build + Playwright). Should pass with the new playwright config testing against `npm run start`.
4. Smoke test on staging Vercel preview (Section 8 checklist).
5. After smoke passes: `git push origin main`. Pre-push hook runs again. Verify prod tip.
6. Tier 2 prod smoke (abbreviated since staging covered most).

**Push window:** 9 PM – 7 AM CT. Hook will block outside the window.

---

## 11. Risks

| | |
|---|---|
| Service-client `optin-public` API exposes market opt-in data to anonymous users | Acceptable — market itself is already public; the manager curated these statements specifically for vendor visibility |
| Non-atomic write of `market_vendors` + acceptance row | Mitigated by logging + dashboard re-prompt fallback (see §7) |
| Login page narrow `returnTo` exception adds code path | Mitigated by clear inline comment + the predicate is narrow enough not to leak into other flows |
| 4-state UI in vendor-signup adds complexity | Mitigated by extracting the agreement block to a shared component (§6.4) |
| Mid-build context compaction | Mitigated by this plan doc + the audit doc from earlier in the session |

---

## 12. Time estimate (updated as we go)

| Task | Estimate | Actual |
|---|---|---|
| Plan doc write | 10 min | _filling in as I go_ |
| Mig 138 application (3 envs) | 10 min | in progress on Dev |
| Schema snapshot bookkeeping | 5 min | TBD |
| Code build (5 touchpoints) | 50-70 min | TBD |
| Pre-commit hook + push staging | 5 min | TBD |
| Smoke verification on staging | 15 min | TBD |
| Push prod + verification | 10 min | TBD |
| **Total** | **~110 min** | TBD |

---

## 13. Resume point (for future-Claude after compaction)

If conversation gets compacted mid-build, read this file + `current_task.md` + the latest commit history (`git log -10 main`) to reconstruct state. The build is at one of these phases:

- [x] Phase 0: Plan doc reviewed by user (this file)
- [x] Phase 1: Mig 138 applied to Dev + Staging (Prod pending)
- [x] Phase 2: Initial bookkeeping commit (snapshot update; file still in supabase/migrations/, not yet in applied/)
- [x] Phase 3: Build the 5 original code touchpoints (commit `488973fa` on staging)
- [x] Phase 4: First stage push + initial smoke (staging tip `488973fa`)
- [ ] Phase 5: Staging review feedback follow-ups (Section 14)
- [ ] Phase 6: Apply mig 138 to Prod
- [ ] Phase 7: Prod push + Tier 2 smoke
- [ ] Phase 8: End-of-session checkpoint (update current_task.md, etc.)

---

## 14. Staging review follow-ups (2026-05-16)

User reviewed staging build (`488973fa`) and flagged 13 items spanning copy fixes, landing rewrites, geographic filtering, and a co-branding UI. **All approved to ship.** Order of execution + scope summary below.

### Quick copy fixes (Group 1 — ~15 min)
- **A/B** Top of vendor-signup: change "Farmers Market — Vendor Signup" header to make it clearly the **app account** signup. Subtext: "Fill out the form below to register as a vendor on the Farmers Marketing app."
- **C** Below acknowledgments / between sections: "Fill out the form below to register as a vendor at {market name}, where you will sell your items in-person."
- **D** Tax statement final line: "Texas tax laws" → "tax laws for your state".
- **I** `/vendor/markets` page reorder: Private pickups should NOT be at bottom. Events SHOULD be at bottom. (Section order: traditional markets → private pickups → events.)

### Landing rewrites (Group 2 — ~45 min)
- **J** Anonymous invite landing — full rewrite with:
  - Welcoming headline + congrats
  - Market details (location, hours, description) pulled from `markets` table via extended `optin-public` API
  - Two clear paths (existing vendor: Login; new vendor: Create Account)
  - Opt-in agreement BELOW the introduction
- **M** Existing vendor invite landing — full rewrite:
  - Welcoming language tailored to existing vendor
  - Mention fast-track via existing onboarding docs
  - Authorization framing: "your authorization to share onboarding info with the market manager"
  - Two checkboxes (see N)

### Info-sharing acceptance (Group 3 — ~30 min)
- **N** New checkbox on existing-vendor landing for **info-sharing authorization** (in addition to the market opt-in agreement).
  - Both checkboxes must be checked to enable Join button.
  - Forward-looking authorization — actual manager-side document visibility is deferred; this commit lays the consent groundwork.
  - DB: extend `vendor_market_agreement_acceptances.statements_snapshot` JSONB to carry a special record indicating info-sharing consent (no new column), OR add a small boolean column. Decide based on code review.

### Geographic filtering (Group 4 — ~60-90 min)
- **G** Vendor onboarding market selection — filter to 100-mile radius from vendor's home location (or current location).
- **H** "Events to attend" shown to new vendors — same 100-mile filter.
- Implementation: use existing geocoding helpers + Haversine distance.

### Co-branding UI (Group 5 — ~120 min)
- **K** Add branding fields to `markets` table — at minimum `logo_url`; possibly `description` if not already there (need to check schema). Reuse storage bucket pattern from vendor profile images.
- Manager dashboard: new section to upload logo + edit description.
- Market profile page (`/markets/[id]`) — render the logo + description.
- Extended `optin-public` API returns `logo_url` + `description` so the invite landing can use them.
- Migration if needed: `20260516_140_market_branding.sql` (or similar).

### Research findings (E, F — answers fold into Group 2 + 3 copy)
- **E** Baked goods doc handling — uploaded via category-document upload; reviewed by **app admins only** (not yet shared with market managers).
- **F** COI sharing — uploaded as part of 3-gate vendor onboarding; reviewed by **app admins only**. The text "your market manager may require insurance" is aspirational, not reflective of actual data flow.
- **Implication:** The "share onboarding info with mgr" feature in N is forward-looking. Tonight's commit can capture consent; actual sharing UI happens in a future session.

### Out of scope (still — even with expanded list)
- Manager-side view of vendor onboarding documents (the actual "share with mgr" infrastructure)
- Migration 139 (booking)
- Booking flow
- Payment integration
- Re-acceptance prompt-on-next-load UX
- Save and resume

### Resumed phase checklist for follow-ups
- [ ] G1: Copy fixes (A/B/C/D/I)
- [ ] G2: Landing rewrites (J/M) + extend `optin-public` API
- [ ] G3: Info-sharing checkbox (N)
- [ ] Commit + push staging — checkpoint 1
- [ ] G4: Geographic filtering (G/H)
- [ ] G5: Co-branding UI (K) — likely with a new migration
- [ ] Commit + push staging — checkpoint 2
- [ ] Smoke test full updated flow
- [ ] Apply mig 138 + new mig (if added) to Prod
- [ ] Push code to Prod
- [ ] Tier 2 smoke on Prod
