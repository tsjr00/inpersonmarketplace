# Vendor Signup — Impact Review for Part A (Vendor Product Categories)

**Created:** 2026-06-16. **Purpose:** Comprehensive understanding of every code path that touches vendor signup, before building the Part A front-gate + `/api/submit` category recording. Read-only investigation. Cite-or-verify: every claim has a `path:line` or is marked UNVERIFIED.

## The changes being assessed (from `vendor_categories_and_survey_export_plan.md`)
1. **Front-gate** in `[vertical]/vendor-signup/page.tsx`: a qualifying category question asked BEFORE the detailed form. Cat 1/2 → existing form; cat 3/4 → block screen (no vendor profile created; existing buyer stays a buyer).
2. **`/api/submit`** records `production_category` (TEXT[]) + computes `sell_eligible` (bool) on the `vendor_profiles` insert.
3. **mig 159** (committed, NOT applied): adds `production_category TEXT[] NULL` + `sell_eligible BOOLEAN NOT NULL DEFAULT TRUE` + element CHECK constraint.
4. **Inert backstop gates** (already committed `5a634414`): `publish/route.ts:158`, `market-boxes` POST.

---

## CHECKLIST (component areas to investigate)
- [x] `/api/submit` data-write path — vendor_profiles insert + vendor_verifications
- [ ] `[vertical]/vendor-signup/page.tsx` — the signup form structure, steps, where category Qs live now
- [ ] `vendorSignupSchema` (Zod validation) — will new fields fail validation?
- [ ] vendor_profiles row creation — other creation paths besides /api/submit?
- [ ] vendor_verifications auto-creation trigger + requested_categories
- [ ] Buyer↔vendor role model — what "stays a buyer" actually means
- [ ] Existing "qualifying questions" the user referenced — where are they?
- [ ] Onboarding status route — what gates does it compute
- [ ] Downstream consumers of vendor_profiles (selects with `*`, breakage risk from new cols)
- [ ] mig 159 constraint risk (NOT NULL DEFAULT on existing rows; CHECK)
- [ ] Multi-vertical implications (FM vs FT category meaning)
- [ ] Notification / admin-notify path
- [ ] Manager-invite signup variant (?market= deep link)

---

## FINDINGS

### 1. `/api/submit` POST — vendor_profiles creation (VERIFIED)
File: `src/app/api/submit/route.ts`
- Entry: `kind === "vendor_signup"`, Zod-validated by `vendorSignupSchema` (`:26-34`).
- Auth: if `user_id` provided, must match `auth.getUser()` (`:40-50`).
- Ensures `user_profiles` row exists (upsert w/ buyer_tier 'standard') (`:54-82`).
- **Duplicate guard:** rejects if a `vendor_profiles` row already exists for `(user_id, vertical_id)` (`:85-97`).
- **Insert** (`:116-140`): `vertical_id`, `profile_data: data` (JSONB blob — the whole form), `status` = `submitted` (if user_id) or `draft`, optional `user_id`, `referred_by_vendor_id`. **`production_category`/`sell_eligible` would be added here.**
- After insert, sets `vendor_verifications.requested_categories` from `data.vendor_type || data.categories` (`:144-160`) — array or string. This is the EXISTING category field (the doc-requirement categories, NOT the new production_category).
- FT: initializes permit `category_verifications` (`:163-172`).
- prohibited-items ack (`:176-182`); referral credit (`:185-194`); manager-invite market_vendors upsert + agreement acceptance (`:201-286`); admin notify `new_vendor_application` (`:297-313`).
- **KEY:** `vendor_verifications` row is NOT inserted here → must be created by a TRIGGER on vendor_profiles insert. VERIFY the trigger.

### 2. Non-vertical `/vendor-signup` (VERIFIED)
`src/app/vendor-signup/page.tsx` — just redirects to `/${verticalId}/vendor-signup` based on domain. No logic.

### 3. Success page (VERIFIED)
`src/app/[vertical]/vendor-signup/success/page.tsx` — kept as fallback; primary flow shows step 2 inline. Reads `?type=` for tax notice. No category logic. Low impact.

### 4. Second vendor_profiles insert path — `lib/db/vendors.ts` (VERIFIED — DEAD CODE)
- `createVendorProfile()` (`vendors.ts:12-33`) and `submitVendorForVerification()` (`:97-126`) both insert vendor_profiles/vendor_verifications, BUT a grep for their names finds **no imports anywhere in app code** — only `scripts/seed-data.ts` has its own local `createVendorProfiles` (plural). **So `/api/submit` is the SOLE live production path that creates a vendor_profiles row.** → Part A only needs to touch `/api/submit` + the front-gate page. (Seed scripts insert directly and would just default `sell_eligible=TRUE` / NULL `production_category` — acceptable for seeds; optional cleanup.)
- These two helpers return `VendorProfile` (the canonical type) — see finding 7.

### 5. Auto-create trigger (VERIFIED)
`applied/20260210_012_vendor_onboarding.sql:79-93`: `auto_create_vendor_verification()` — AFTER INSERT on vendor_profiles, inserts `vendor_verifications(vendor_profile_id)` ON CONFLICT DO NOTHING, SECURITY DEFINER. Reads only `NEW.id` → **mig 159's new columns do NOT affect this trigger.** Confirms /api/submit's pattern (insert profile → trigger makes verification row → /api/submit UPDATEs it with requested_categories).

### 6. Zod schema will NOT block the new field (VERIFIED — important)
`src/lib/validation/vendor-signup.ts`:
- `profileDataSchema` ends with `.passthrough()` (`:24`) → unknown keys inside `data` survive. So `data.production_category` passes validation untouched.
- Outer `vendorSignupSchema` (`:26-32`) is a plain `z.object` (NOT `.strict()`) → extra TOP-LEVEL keys don't fail validation (Zod strips them from `parsed.data`, but does not error).
- **The route reads the RAW `body`, not `parsed.data`** (`route.ts:36` destructures `body`; `body.referral_code` `:102`; `body.market_id_from_invite` `:201`). So whichever way `production_category` is sent (top-level or in `data`), the route can read it. `sell_eligible` is computed server-side, never trusted from client. **No schema change strictly required, but adding `production_category` to `profileDataSchema` explicitly is cleaner.**

### 7. Canonical `VendorProfile` type is incomplete but harmless (VERIFIED)
`src/lib/supabase/types.ts:110-120` — does NOT list `production_category`/`sell_eligible`. Used as return type of the (dead) `vendors.ts` helpers. The live insert in `/api/submit` uses an inline `insertData` type (`route.ts:116-122`), not `VendorProfile`. The live gates read `sell_eligible` via `getVendorProfileForVertical<{...sell_eligible...}>` with an explicit inline generic (`publish/route.ts:67-72`). **→ Adding DB columns breaks NO TypeScript. Updating this interface is optional cleanup (so future reads via the canonical type can see the cols).**

### 8. New-column blast radius = LOW (agent-surveyed, spot-verified)
- `SELECT *` on vendor_profiles: only count-only `head:true` queries (admin dashboards) → new cols not materialized, no impact.
- `getVendorProfileForVertical` callers (~40) all pass explicit column lists → no leak.
- Update paths (`api/vendor/profile/route.ts`, event-readiness) build explicit field objects → won't accidentally write new cols.
- CHECK constraint `vendor_profiles_production_category_valid` (mig 159) only fires when production_category is set to something outside {'1','2','3','4'}; NULL passes → grandfathered rows safe; `DEFAULT TRUE` on sell_eligible backfills existing rows with no rewrite risk (boolean default, additive).

### 9. Buyer↔vendor role model (VERIFIED — partial; confirm in next reads)
- `/api/submit` does NOT modify `user_profiles.role` — it only creates a `vendor_profiles` row. So "becoming a vendor" = having a vendor_profiles row for that (user, vertical); "stays a buyer" = no row created. The front-gate's "cat 3/4 stay buyers" = simply don't POST to /api/submit. **Confirm:** how the app decides "is a vendor" (presence of vendor_profiles row vs a role flag) — TODO in signup-page read.

---

### 10. Signup page structure (VERIFIED — `[vertical]/vendor-signup/page.tsx`, 2019 lines)
**Config-driven form.** `fields` come from `GET /api/vertical/[vertical]` → `cfg.vendor_fields` (`:279-299`). The existing "category" question is one of those config fields — key `vendor_type` (FT) or `categories` (FM), rendered as select/multi_select (`:1298-1373`). **This existing category axis = DOC-REQUIREMENT categories** (drives `requested_categories`, step-2 permit/doc uploads via `getCategoryRequirement`/`requiresDocuments` `:1859-1916`, tax notice `:1702`). **It is NOT the same axis as the new `production_category` (1–4 production method).** The front-gate adds a NEW, separate question.

**Render cascade (early returns, in order) — the front-gate must slot in AFTER all of these but BEFORE the step-1 form:**
1. `authLoading` (`:688`)
2. `marketLimitInfo.atLimit` (`:707`) — returning vendor at market cap; new vendors (0 profiles) never hit this
3. Phase B **State C/D** (`:766-1013`) — EXISTING vendor in this vertical via `?market=` invite (already has a profile → already past any gate / grandfathered)
4. `!user` (`:1026`) — login gate (signup REQUIRES login: `handleSubmit` bails to `/login` at `:434`)
5. `loading` / `error` (`:1114`, `:1133`)
6. **Step-1 form** (`:1193-1690`): config fields → acknowledgments (`:1418-1592`) → submit. **`handleSubmit` (`:423`) POSTs to `/api/submit`** with `data: {...values, acknowledgments}` (`:504-511`).
7. **Step-2** (`:1695`): post-submit onboarding (docs/Stripe). Reads `values.vendor_type` only — front-gate field doesn't interfere.

**"Become a vendor" = creating a vendor_profiles row.** No `user_profiles.role` flip anywhere in /api/submit or the page. So a cat-3/4 person who is blocked simply never POSTs → they keep their existing buyer auth account + user_profiles row, with NO vendor_profiles row. CONFIRMS the "stays a buyer" model is purely "don't create the profile."

**Thematic overlap to keep consistent:** the existing **"Locally Produced Products" acknowledgment** (`:1447-1450`) already asserts "handmade/homemade/home-grown… not reselling mass-produced retail… not a flea market." That is conceptually the SAME promise the production-category gate enforces — the new upfront question and this checkbox must not contradict each other.

---

## KEY IMPLICATIONS & RISKS FOR THE BUILD

**R1 — Server-side enforcement is the real decision (HIGH).** The front-gate is client-side; `/api/submit` is the trust boundary. A direct POST could bypass the UI. The build must decide what `/api/submit` does with a cat-3/4 declaration:
  - (a) **Hard-reject** the submission (no profile created) → matches the Phase-1 locked decision ("cat 3/4 never create a profile"; "every created vendor is sell_eligible=true"). Cleanest. Recommended.
  - (b) Create with `sell_eligible=false` → contradicts Phase 1 (that's Option B / Phase 3 lite accounts). Do NOT do this now.
  → So `/api/submit` should: read `production_category`, compute `sell_eligible`, and if NOT all ∈ {1,2} → return a 4xx with the block copy; otherwise insert with `production_category` + `sell_eligible=true`.

**R2 — Multi-vertical scope is an OPEN QUESTION (HIGH).** The 1–4 categories + the block copy ("Farmers Marketing is built for homemade, handmade, homegrown…") are **FM-framed**. Food trucks already have a different gating acknowledgment ("freshly prepared food… not reselling pre-packaged retail" `:1447-1448`) and a permit-based category model. Applying production-category 1–4 to `food_trucks` may not map. **Must decide: front-gate is FM-only, or both verticals with vertical-specific copy/categories.** mig 159's column + CHECK are vertical-agnostic, so the DB doesn't force a choice — the UX does.

**R3 — Invite-flow interaction (MED).** A NEW vendor (logged-in buyer, no profile) arriving via a manager invite `?market=<id>` falls through to the step-1 form, so the front-gate applies to them too. For cat 3/4 the block screen ("rent booth space via a market manager") is actually coherent — the manager who invited them can still rent them booth space; they just can't sell. But the build must place the gate so it does NOT break States A/C/D (existing vendors) or the `market_id_from_invite` / agreement-acceptance plumbing in `handleSubmit` (`:518-533`) and `/api/submit` (`:201-286`).

**R4 — `production_category` must reach the route (LOW, solved).** Zod won't block it (finding 6). Send it as a distinct key (NOT colliding with `vendor_type`/`categories`). `sell_eligible` is computed server-side, never trusted from client.

**R5 — Onboarding-status advisory vs enforcement (LOW now, MED for Option B).** Enforcement lives in publish + market-boxes (+ event path TBD). `onboarding/status` (the dashboard's "can I publish?" source) does NOT yet read `sell_eligible`. In Phase 1 everyone is eligible so there's no UI/enforcement mismatch. If Option B lite accounts ever exist, the dashboard would say "ready to publish" while publish blocks — add `sell_eligible` to onboarding/status then.

**R6 — Event-selling backstop not yet placed (MED).** Plan A3 calls for a `sell_eligible` backstop at the event-vendor selling entry (`event_approved` path). publish + market-boxes are done (`5a634414`); the event entry point still needs locating + gating. Covered transitively in Phase 1 (event sales require vendor + published listing), but the explicit backstop is the plan's intent.

**R7 — Dead helpers + stale type + seed scripts (LOW/cleanup).** `lib/db/vendors.ts` helpers are unused (finding 4); `VendorProfile` type omits the new cols (finding 7); `scripts/seed-data.ts` + `seed-production.ts` insert vendor_profiles without the new cols (defaults apply). None break anything; optional cleanup.

**Overall:** blast radius is genuinely LOW (explicit-column codebase, additive migration, single live write path). The real work is **two decisions** (R1 server enforcement approach, R2 vertical scope), not breakage risk.

---

## RESOLVED DECISIONS (2026-06-16)
- **R1 → Option A (server hard-reject).** `/api/submit` reads `production_category`, computes `sell_eligible = all declared ∈ {1,2}`; if not eligible → 4xx with block copy, NO profile created; if eligible → insert with `production_category` + `sell_eligible=true`. No `sell_eligible=false` rows in Phase 1.
- **R2 → FM-only.** Front-gate renders only for `farmers_market`. `food_trucks` signup is unchanged (no production_category sent → `sell_eligible` defaults TRUE). Block copy stays FM-framed.

