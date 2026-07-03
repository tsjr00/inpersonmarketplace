# P5 — FT Park Agreement Statements (draft for user review)

**Created:** 2026-07-02. **Mode:** FIX (building P5). Content drafted by Claude per user ("do your best; I'll flag in testing").
**Sources:** `ft_hb2844_licensing_plan.md` (Texas HB 2844 / Ch. 437B DSHS license + the added propane item) + general food-truck-park operating norms (fire code / NFPA 58, commissary, generator/power/wastewater, conduct).

## Structural decision (needs user OK — migration involved)
The live `market_optin_statement_catalog` (mig 136) has **NO `vertical_id`** and the catalog route (`optin/catalog/route.ts:51-56`) returns ALL active statements with no vertical filter. So seeding FT statements as-is would show propane/DSHS items to FM farmers markets (and FM's producer-only/local-sourcing to FT trucks).
- **Recommended:** add nullable `vertical_id TEXT` to the catalog (NULL = universal → existing 15 unaffected; `'food_trucks'` = FT-only), seed the FT statements as `food_trucks`, and filter the catalog route by the market's vertical (`vertical_id IS NULL OR vertical_id = <market vertical>`). Small additive migration + one query filter. Existing categories (5) are reused — no CHECK change.
- Alternative: global catalog (no migration) but FM/FT cross-pollution. Not recommended.

The ~8 relevant EXISTING universal statements already apply to FT (professional-conduct, vendor-risk, indemnification, liability-insurance, setup-teardown, no-show-forfeiture, vendor-sales-tax, accurate-pricing) — NOT duplicated below. These are the NEW FT-tagged additions.

---

## Drafted FT statements (vertical_id = 'food_trucks')

### Compliance — new-law (HB 2844 / DSHS) + fire/food safety
1. **ft-dshs-license** — "I hold a current Texas DSHS Mobile Food Vendor license for my unit as required by Chapter 437B, and I will keep it valid the entire time I operate at this park."
2. **ft-license-display** — "I will display my current DSHS license and inspection certificate on my unit where customers and inspectors can see them while I operate at this park."
3. **ft-license-lapse-notice** — "I will notify the park operator immediately if my DSHS license or any required inspection is suspended, revoked, expired, or otherwise lapses."
4. **ft-propane-inspection** — "I maintain a current LP-gas/propane system inspection for my unit and will provide proof on request. My propane tanks, lines, and connections meet applicable fire-code (NFPA 58) requirements." *(the item the user added)*
5. **ft-fire-suppression** — "I keep a current, properly rated fire extinguisher accessible on my unit at all times, and — if I cook with grease or open flame — a working, inspected automatic fire-suppression system."
6. **ft-food-certifications** — "I hold current food manager and food handler certifications for my staff as required for my classification, and I will provide copies on request."
7. **ft-commissary** — "I operate from an approved commissary or central preparation facility where required, and I will provide its information to the park operator on request."
8. **ft-location-list-consent** — "I authorize the park operator to include this location, and the dates I am scheduled here, in my required operating-location list and any location reporting to state authorities." *(HB 2844 §437B.154)*

### Conduct — park atmosphere / safety / good-neighbor
9. **ft-generator-quiet** — "If I run a generator, it will be a reasonably quiet unit positioned away from customers and neighboring trucks, and I will shut it down by {generator_curfew_time} or when the park closes." · placeholders: [generator_curfew_time]
10. **ft-power-draw** — "If I connect to park-provided power, I will not exceed {max_amps} amps at my spot, and I will use proper outdoor-rated cords and connections." · placeholders: [max_amps]
11. **ft-grease-wastewater** — "I will contain and dispose of all grease, gray water, and wastewater off-site. I will not pour, drain, or dump any liquids, grease, or waste onto the ground, into storm drains, or into park facilities."
12. **ft-cleanup** — "I will keep my spot and the area around it clean during service and leave it clean at the end of the day, removing all trash, packaging, and food waste I generate."
13. **ft-checkin** — "I will check in through the platform each day I operate at this park so my attendance and location are recorded."
14. **ft-spot-fit** — "My unit — including hitch, awnings, and service window — fits within my assigned spot. I will set up only in my assigned spot and will not block drive lanes, walkways, or neighboring trucks."

### Product / quality — variety & consistency (helps the operator curate)
15. **ft-menu-consistency** — "I will serve the menu and food type I represented to the park operator, and I will let the operator know before I make a significant change to what I sell."

### Insurance
16. **ft-auto-insurance** — "I maintain current commercial auto/vehicle insurance for my unit as required to legally operate it on public roads."

---

## BUILT (2026-07-02, UNCOMMITTED — user approved vertical_id approach). Gates: tsc 0, lint clean, vitest 1575/1575.
- Migration **175** `20260702_175_ft_optin_vertical_tag.sql` written (NOT applied — user applies Dev+Staging first, before the code push, or the catalog route's vertical_id query breaks on staging). Adds `vertical_id` + partial index + seeds 16 FT rows.
- `optin/catalog/route.ts` + `optin/selections/route.ts` filter by `(vertical_id IS NULL OR = market.vertical_id)`. `optin-public.ts` needs no change (renders by per-market selection). `optin-types.ts` unchanged (vertical_id not returned to client).
- SCHEMA_SNAPSHOT changelog added (marked NOT YET APPLIED).
- **Deploy order:** user applies mig 175 → Dev+Staging → THEN commit+push code to staging. No money path.

## Original build plan (superseded by BUILT above)
1. Migration (user applies): `ALTER TABLE market_optin_statement_catalog ADD COLUMN vertical_id TEXT NULL;` + seed the 16 FT rows (`vertical_id='food_trucks'`, ON CONFLICT DO NOTHING) with sort_order 200+. SCHEMA_SNAPSHOT changelog.
2. `optin/catalog/route.ts`: fetch market.vertical_id, filter `.or('vertical_id.is.null,vertical_id.eq.<vertical>')`.
3. Verify the public/selections routes don't need the filter (they key off per-market selections, vertical implicit).
4. Gates + present diff for commit approval (staging-first).
