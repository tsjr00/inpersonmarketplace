# VendorBoothList de-FM for FT parks — bug + fix plan (POST-COMPACTION task)

**Created:** 2026-07-04 (from FT staging testing). **Mode:** Report — documented, NOT built. User: "if this is deeply intertwined we need more context, tackle after compaction."

## The bug (verified, cited)
On the manager dashboard **"Food Trucks at this location"** card (component `src/components/market-manager/VendorBoothList.tsx`, rendered at `[vertical]/market-manager/[marketId]/dashboard/page.tsx:303`), the **FM booth-assignment editor is still active for FT parks.** Mig-176 only gated the two *labels* (`VendorBoothList.tsx:410` "needs spot #", `:415` "tier not set") on `!isFoodTruck` — but NOT:
- the **booth-# `<input>`** (`:454`, placeholder `${term(vertical,'booth')} #`),
- the **tier `<select>`** (`:473`),
- the Save/PATCH action (`:154-155` sends `booth_number` + `inventory_id` to `api/market-manager/[marketId]/vendor-booth`),
- the "needs booth" section (`needsBoothVendors`, `:261`).

**Why the Spot # is blank + won't record:** a park truck's spot lives in **`park_spot_bookings.spot_id`** (chosen at booking), NOT `market_vendors.booth_number`. The card reads `market_vendors.booth_number` (via `api/market-manager/[marketId]/vendors/route.ts`), which a park rental never sets → blank. Entering "1" + Save PATCHes the FM route → runs `src/lib/markets/booth-conflict-checks.ts`, which at **`:96-102`** queries **`weekly_booth_rentals`** for `booth_number=1` (status pending/paid, week ≥ today) and returns the error at `:107` ("Booth number 1 has an active paid booking for a current/upcoming week at this market" — FM verbiage). So the FM booth-assignment system collides with the FT park-spot system.

**The "1 already booked" that blocked the same vendor:** the check found a `weekly_booth_rentals` row with `booth_number=1` at this park — almost certainly a **stale/orphan FM row** from earlier testing (deferred "Sixth Street" data cleanup; park rentals don't write `weekly_booth_rentals`). Diagnostic/clear query available on request (user OK to clear to keep testing, but low priority).

## Proposed fix (needs the "more context" pass post-compaction)
For FT parks (`vertical==='food_trucks'`, or `park_mode==='paid'`), suppress the **entire** FM booth-#/tier editor — input, tier `<select>`, Save, and the needs-booth section — not just the labels (already done). The park manager does not assign booth#/tier; the spot is chosen at booking (`park_spot_bookings.spot_id`).
- **Minimal:** gate the editor block(s) on `!isFoodTruck` (like the labels). Card becomes read-only-ish for FT (name + approval + schedule status).
- **Fuller (recommended, more work):** for FT, show the truck's **actual booked spot(s) from `park_spot_bookings`** instead of the FM booth editor — the vendors route (`vendors/route.ts`) would need to join/lookup park_spot_bookings for the date, OR the card fetches it. The "why is Spot # blank" answer is "because it's in park_spot_bookings" — showing it there closes the loop.

## Why "deeply intertwined" (the context to gather)
`VendorBoothList` is one component serving FM booths + FT parks; the editor threads through `edits`/`tierEdits` state, the `/vendor-booth` PATCH, `/booth-inventory`, `booth-conflict-checks.ts`, and `needsBoothVendors`. Need to trace: which of those FT should keep (approval, schedule status) vs. drop (booth#/tier/conflict). Confirm no FM regression. Decide minimal-vs-fuller. Then build + gate green + staging-verify.

## Files in scope
`src/components/market-manager/VendorBoothList.tsx`, `api/market-manager/[marketId]/vendors/route.ts`, `api/market-manager/[marketId]/vendor-booth/route.ts` (leave FM path intact), `src/lib/markets/booth-conflict-checks.ts` (FT shouldn't reach it). No money path. No migration (unless the fuller version needs a query change only).
