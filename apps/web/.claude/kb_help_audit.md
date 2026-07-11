# Knowledge Base / Help Audit (2026-07-11)

> **STATUS: ✅ EXECUTED via mig 187** (`20260711_187_kb_help_cleanup.sql`, applied Dev+Staging 2026-07-11, Prod PENDING) + legacy `FOOD_TRUCK_FAQ_SEED.sql` deleted. Decisions taken: retire FAQ (Q2✓), delete file (Q3✓), FT prices→Upgrade page (Q4✓), no cash/all-Stripe (Q5✓), add all gap articles (Q6✓). UNCOMMITTED pending user go. All 6 open decisions resolved.

Scope (user-set): `knowledge_articles` + KB seed files ONLY (migs 013 schema, 062, 183, FOOD_TRUCK_FAQ_SEED). NOT marketing/how-it-works pages (later). Changes ship as a **data-only migration**. Report-first, then edits on go. Both verticals, all audiences.

Sources: mig 013 (schema), mig 062 (52 buyer/vendor articles), mig 183 (29 manager/operator, applied), FOOD_TRUCK_FAQ_SEED.sql (16 FT, legacy loose file). Full inventory gathered by agent; key items verified against source below.

## Schema facts (verified — mig 013)
- Columns: id, vertical_id (NULL = global), category (free text, **no CHECK**), title, body, sort_order, is_published, timestamps.
- **No audience/role column** — audience is implied by category name only.
- Rendered at `/[vertical]/help` filtered by vertical (global OR match) + category. Admin-editable at `/[vertical]/admin/knowledge`.

## ★ STRUCTURAL LANDMINE (verified — FOOD_TRUCK_FAQ_SEED.sql:1-6)
- Header: "Run this against Staging (and later Production) to populate the help page for food_trucks." Loose file, NOT in the numbered chain, NOT idempotent (bare INSERTs).
- **Line 6: `DELETE FROM knowledge_articles WHERE vertical_id = 'food_trucks';`** — wipes ALL FT articles (062's Chef Boxes + FT vendor-plan, ALL of 183's Park Operator / Booking-a-Spot) before inserting its 16.
- If ever re-run after 062/183 it destroys their FT content. It is the source of the FT duplicates + the content CONFLICTS below.
- **UNKNOWN (must confirm on live DB):** is the legacy FAQ set currently coexisting with 062/183 in staging/prod, or was it wiped? → **User check:** on staging `/food_trucks/help`, is there BOTH "What is this platform?" (062) AND "What is Food Truck'n?" (FAQ) under "Getting Started"? If yes → they coexist (duplicates live). Either way the remediation migration will be written to converge to a single canonical set.

## A) DUPLICATES / OVERLAP (primary: 062-global vs legacy FAQ-FT)
Most FT duplication is 062's global (vertical_id NULL, shows on FT help) vs the legacy FAQ's FT-specific copies of the same topic:
- "What is this platform?" (062) vs "What is Food Truck'n?" (FAQ)
- "How do I find vendors near me?" (062) vs "…food trucks near me?" (FAQ)
- "Do I need an account to browse?" (062) vs "Do I need to create an account?" (FAQ)
- "How do I place an order?" (062) vs (FAQ)
- "Order from multiple vendors/trucks" (062) vs (FAQ)
- "Payment methods accepted" (062) vs (FAQ)
- "How does pickup work?" (062) vs (FAQ) — **also a conflict, see B**
- "Cancel my order" (062) vs "Cancel or modify" (FAQ) — **also a conflict**
- "Enable notifications" (062 ×2) vs (FAQ)
- "Update account information" (062) vs (FAQ)
- Vendor: "sign up as a vendor"/"create listings"/"get paid"/"service fees" (062) vs FAQ "list my food truck"/"manage menu"/"get paid"/"fees"
- **Category-name collision:** FAQ reuses "Getting Started" + "Account & Settings" (same names 062 uses globally) → on FT help the groups merge and show both sets.
- Intra-183 two-sided pairs (weekly holds, compliance docs, season prepay) told from operator + vendor sides — INTENTIONAL, keep.

**Recommendation:** retire the legacy FAQ set entirely; keep 062 (global) + 183 (manager/operator) as the single source. FT buyers already get 062's global articles. Net removal ~16 FT dupes, resolves the collisions + the DELETE landmine.

## B) STALE / CONFLICTING CONTENT
1. **Legacy FAQ contradicts real flows (if live):**
   - Pickup: FAQ "give name/number, grab food" (no mutual confirmation) vs 062 mutual-confirm handoff. FAQ is WRONG per current flow.
   - Cancellation: FAQ "cancel before confirm; after, contact the truck directly" vs 062's real 25%-fee / 75%-refund policy. FAQ WRONG.
   - Fees: FAQ "no listing fees or monthly minimums" vs the real FT tiers ($10/$30/$50, 062:643-656). FAQ WRONG.
   → all resolved by retiring the FAQ set.
2. **Market Box / Chef Box "4-week"** (062:293,306,353 etc.) — boxes are **multi-term** now (mig 123: 4 AND 8 week; `selectBasePriceForTermWeeks`). "4-week" is stale/incomplete → generalize to "multi-week (e.g., 4 or 8 weeks)".
3. **Hard-coded FT tier prices** ($10/$30/$50, 062:643-656) — currently accurate but brittle; FM article already defers to the Upgrade page. Recommend softening FT to match (defer to Upgrade page) OR keep — user call.
4. **062:229 cash line** ("some vendors may accept cash in person — check with the vendor directly") — external-payment code is inactive (memory), but this only notes offline cash, doesn't promise app payment. Borderline. User call: keep, or drop the cash sentence.
5. **Numbers stated as fact to re-verify before trusting** (not necessarily wrong): mutual-confirm "30 seconds" (062:134), refund "5-10 business days" (062:275), payout "2-7 business days" (062:793), support "24-48 hours" (062:498), analytics "30/60/90-day" windows. Verify against code when editing; keep if accurate.

## C) COVERAGE GAPS (recent features with NO KB article)
1. **Becoming a manager/operator via public signup** — the new self-serve intake (`/[vertical]/market-manager-program`, FT park-operator + FM). 183 "Getting started…" assumes you're ALREADY assigned. Missing: "How do I sign up to run my market/park?" (buyer/prospect-facing). **New feature this session.**
2. **Events / catering** — NO "Events" category anywhere. Buyer event ordering (token link, waves/time slots) + organizer event requests are live with zero help. Gap (medium).
3. **Booth credits** — vendor-facing credit balance from cancelled days, auto-applied at checkout, expiry sweep. 183 mentions "vendors credited" but no "how booth credits work / where's my balance / do they expire" article. Gap (small).
4. **Season booking window enforcement** (Phase 2, this session) — booth booking + pickup now limited to the market's season window. 183:357 covers schedule+season setup; add a vendor/buyer note that availability is bounded by the season. Minor.
5. **Market follows** (follow a market → market-day/special-date notifications) — no article. Minor.

## PROPOSED REMEDIATION (one data-only migration, idempotent) — NOT YET BUILT
- **Dedup:** DELETE the legacy FAQ FT articles by (vertical_id='food_trucks', title) for the 16 known titles, keeping 062-global + 183. (Converges live state regardless of whether FAQ is currently present.) Optionally also delete the loose FAQ file from the repo so it can't be re-run.
- **Stale fixes:** UPDATE box "4-week" → multi-term wording; (optional) soften FT tier prices; (optional) drop cash sentence.
- **Gaps:** INSERT new articles (idempotent WHERE NOT EXISTS, mig-062/183 voice, no hard-coded thresholds per 183 convention): (a) "How do I sign up to run my market/park?" ×2 verticals; (b) an "Events" category (buyer ordering at an event + organizer requesting food trucks/vendors); (c) "How booth credits work"; (d) minor season-window + market-follows notes.
- All content-only; no logic/schema change. User applies the migration; Claude does snapshot bookkeeping after.

## OPEN DECISIONS FOR USER
- Q1: Confirm live-state via staging `/food_trucks/help` (coexist vs wiped) — determines nothing structurally (migration converges either way) but good to know.
- Q2: Retire the legacy FAQ set entirely? (recommended)
- Q3: Soften FT tier prices to "see Upgrade page" like FM? (recommended) — or keep exact prices.
- Q4: Keep or drop the 062 cash-in-person sentence?
- Q5: Which gap articles to add now — all of (1)-(5), or a subset? (Events is the biggest net-new.)
- Q6: Also delete the loose FOOD_TRUCK_FAQ_SEED.sql file from the repo (prevent re-run)?
