# Session 83 — Self-Audit: Verified vs. Assumed

**Trigger:** User flagged that the BookBoothForm price display shows base + markup on separate lines, contrary to the codebase convention of always-combined pricing. They invoked verification-discipline Rule 1 (cite the code or mark UNVERIFIED) and asked for an honest audit of everything I shipped this session.

**Method:** For each fix, list (a) what I actually read with `path:line` citation, (b) what I assumed without verifying, and (c) whether the assumption is load-bearing for correctness.

---

## Fix-2: BookBoothForm price display — **THIS IS THE FAILURE**

**File:** `src/components/vendor/BookBoothForm.tsx:373-419`

### What I verified
- The existing display showed only base price at `BookBoothForm.tsx:373-385` (read).
- `calculateBoothRentalFees` returns `vendorPaysCents` (read `pricing.ts:318-337`).

### What I assumed (without verifying)
- **That a breakdown layout (Booth fee / Platform fee / Total on separate lines) was the right UX.**
- **I did not open any other price-display component to check the codebase convention.** Should have read at least one of: `src/components/cart/CartDrawer.tsx`, the checkout success page, the product detail page on `/[vertical]/listings/[id]`, the buyer order summary.

### Load-bearing
- Math correctness: ✓ Not affected. Stripe charges the right amount per `pricing.ts`. Tests pass 62/62.
- UX correctness: ✗ Wrong vs. codebase convention. User confirmed "the price the user sees is the price they pay" — combined total only.

### Action
Rewrite Fix-2 to show the combined total only with a disclosure note. Read the existing pricing-display patterns FIRST. Cite specific files before redesigning.

---

## Fix-8: Doc — mig 140 row in current_task.md

**File:** `apps/web/.claude/current_task.md:69-71`

### What I verified
- The migration table location in current_task.md (read).
- `dashboard/page.tsx:61` selects `logo_url` — proved Staging has mig 140 applied (otherwise staging would crash).

### What I assumed
- That mig 140 is applied to Dev (inferred from same logic, but no direct DB check).

### Load-bearing
- ✓ Acceptable. The inference is sound — the staging dashboard would error out without 140 applied.

---

## Fix-3: Booth-inventory delete (23503 + truthful confirm)

**Files:** `src/app/api/market-manager/[marketId]/booth-inventory/[inventoryId]/route.ts:148`, `src/components/market-manager/BoothInventoryManager.tsx:492`

### What I verified
- `weekly_booth_rentals.inventory_id` is `ON DELETE RESTRICT` — confirmed `supabase/migrations/20260512_139_weekly_booth_rentals.sql:64`.
- `market_booth_placeholders.inventory_id` is `ON DELETE SET NULL` — confirmed `mig 135 line 27`.
- Existing 23505 handling pattern at `booth-inventory/[inventoryId]/route.ts:119-122` — read.

### What I assumed
- PG SQLSTATE `23503` is the FK-violation code. Standard PostgreSQL — known from training, not from code. (Verifiable: it IS the standard PG code for foreign_key_violation.)

### Load-bearing
- ✓ Acceptable. Even if `23503` were wrong, the existing throw-fromSupabase fallback would still log the error. Only the friendly-message path depends on the code being right.

---

## Fix-4: MarketBrandingCard logo — ConfirmDialog

**File:** `src/components/market-manager/MarketBrandingCard.tsx`

### What I verified
- ConfirmDialog usage in `BoothInventoryManager.tsx` and `BoothPlaceholderManager.tsx` — read both.
- Memory file confirms `window.confirm()/prompt()/alert() blocked on mobile`.
- Same import path used as those two siblings.

### What I assumed
- Nothing of consequence.

### Load-bearing
- ✓ Clean.

---

## Fix-5: VendorBoothList — Revoke button

**File:** `src/components/market-manager/VendorBoothList.tsx`

### What I verified
- `vendor-approval` API supports `approved: false` — `route.ts:17-19, 67-74` (read).
- VendorBoothList state shape — read.

### What I assumed
- Button placement (next to Save). UX choice without checking other "destructive actions on a row" patterns elsewhere.

### Load-bearing
- ✓ Functional behavior correct. Placement is a UX call; can be adjusted.

---

## Fix-6: Book route — delete orphan rental on Stripe-fail

**File:** `src/app/api/vendor/markets/[id]/book/route.ts`

### What I verified
- Existing Stripe try/catch — read at `book/route.ts:396-410` pre-change.
- UNIQUE `(vendor, market, week)` constraint — `mig 139:83`.
- Cron Phase 16 30-min orphan sweep model — described in `current_task.md`.

### What I assumed
- That my defensive WHERE clause (`.eq('id', rental.id).eq('status', 'pending_payment').is('stripe_checkout_session_id', null)`) prevents collision with concurrent retries. Logically sound.

### Load-bearing
- ✓ Clean.

---

## pricing.ts — adding $0.15 flat fee (CRITICAL-PATH)

**File:** `src/lib/pricing.ts:291-337`

### What I verified
- Existing function structure + comment block — read.
- The pre-existing comment explicitly stated "booth rental is pure percentage on both sides, no flat fees" (line 278-279). I knew I was changing this.
- $0 booth zero-out logic preserved.

### What I assumed
- User's intent for $0.15: that they wanted a flat fee added to vendor-side math, applied on top of base. I asked them explicitly ("Are you saying you want to ADD a $0.15 flat fee?") and they said yes.
- That the flat fee should not affect the manager-side math (manager still gets `base × 0.935`). Asked and confirmed.

### Load-bearing
- ✓ Math is correct; user confirmed both decisions.

---

## pricing.test.ts — updated 13 cases

**File:** `src/lib/__tests__/pricing.test.ts`

### What I verified
- Existing test structure — read.
- Five golden-path cases ($25, $50, $100, $1, $0) + 3 invariant tests + 1 zero/negative case + 1 constants test.
- Recomputed every expected value using the new formula.

### What I assumed
- Nothing — math was recomputed by hand from the new formula.

### Load-bearing
- ✓ 62/62 tests pass against the new business rule.

---

## No-offline-mode cleanup — book/page.tsx, BookBoothForm.tsx, book/route.ts

### What I verified
- The dual-mode `if (stripeAccountId && stripeChargesEnabled === true)` code path — read.
- The market query selected `stripe_charges_enabled` — verified.
- User's intent: explicitly stated "no offline mode."

### What I assumed
- That removing the offline-mode `else` branch is non-breaking for any existing orphan `pending_payment` rows. Those rows still get swept by cron Phase 16; we just don't create NEW ones.

### Load-bearing
- ✓ Correct. The cron sweep handles legacy rows.

---

## landing page math example fix

**File:** `src/app/[vertical]/market-manager-program/page.tsx:289-292`

### What I verified
- Read the existing copy that said "vendor pays $26.63, you receive $23.38".
- Recomputed for $25 booth: vendor pays $26.78, manager receives $23.37 (which I'd previously verified via the new pricing.ts).

### Load-bearing
- ✓ Clean.

---

## Fix-7: optin selections RPC wiring (route + mig 143)

**Files:** `src/app/api/market-manager/[marketId]/optin/selections/route.ts`, `supabase/migrations/20260518_143_replace_market_optin_selections.sql`

### What I verified
- Existing PUT handler structure — read.
- mig 136 schema (catalog + selections tables) — read.
- Cleaned array shape from the route's input validation.

### What I assumed
- Supabase JS forwards JSONB arrays correctly via `.rpc({ p_selections: array })`. Standard Supabase behavior; not verified in this specific codebase.
- The return-column-renaming approach (selection_id, etc.) works as expected. Pattern from training, not from existing codebase RPCs.

### Load-bearing
- ⚠ Moderate. The error-mapping logic depends on Supabase's PG-exception forwarding format. Needs a live test on Dev.

---

## Fix-1: booking RPC wiring (route + mig 142)

**Files:** `src/app/api/vendor/markets/[id]/book/route.ts`, `supabase/migrations/20260518_142_book_weekly_booth_atomic.sql`

### What I verified
- Existing check-then-insert pattern — read.
- mig 134/135/139 schemas — read.
- Custom SQLSTATE handling design (P0001 OVERBOOKED, P0002 DUPLICATE, P0003 INVENTORY_NOT_FOUND).

### What I assumed
- **`pg_advisory_xact_lock` + `hashtextextended` are available on this Supabase deployment.** PG 12+. Almost certain (Supabase runs PG 15) but not directly verified for this project.
- **Error message string survives the rpc transport intact** so `msg.includes('OVERBOOKED')` works. Standard Supabase behavior but not verified for this codebase.
- The RPC return shape (`{ rental_id, rental_price_cents, ... }`) maps correctly to the route's local `rental` object. Code-checked manually but no live test.

### Load-bearing
- ⚠ Moderate. The error-mapping branches and the lock behavior are both load-bearing for the race-safety guarantee. Need a live test on Dev with simulated concurrent calls before pushing to Prod.

---

## Migrations 142 + 143 — SQL correctness

### What I verified
- mig 139 columns referenced in the booking function — confirmed every column exists.
- mig 136 columns referenced in the optin function — confirmed.
- PL/pgSQL syntax for `RAISE EXCEPTION USING ERRCODE` — standard.
- `RETURN QUERY` + `RETURN NEXT` semantics — standard.

### What I assumed
- `hashtextextended(text, bigint)` signature is correct (yes, PG 12+).
- `jsonb_array_elements` + `jsonb_typeof` are available (yes, PG 9.4+).
- `SECURITY DEFINER` + `SET search_path = public` is the right safety pattern. Matches existing codebase functions per Grep.

### Load-bearing
- ✓ Acceptable. Standard PG idioms. User already applied both successfully to Dev + Staging, so the SQL compiles.

---

## Summary table

| Item | Verification quality | Assumption risk | Action needed |
|---|---|---|---|
| Fix-2 price display | **Insufficient — I did not read other pricing displays** | **High — UX failure surfaced** | **Redo with codebase convention** |
| Fix-8 doc | Solid + light inference | None | None |
| Fix-3 23503 + copy | Solid | Standard SQLSTATE | None |
| Fix-4 ConfirmDialog | Solid | None | None |
| Fix-5 Revoke button | Solid | Placement is UX call | None unless user wants different placement |
| Fix-6 orphan delete | Solid | None | None |
| pricing.ts $0.15 | Solid (user confirmed) | None | None |
| pricing.test.ts | Solid | None | None |
| No-offline-mode cleanup | Solid (user-directed) | None | None |
| Landing page math | Solid | None | None |
| Fix-7 optin RPC | Solid SQL, untested integration | Moderate | Live Dev test before Prod |
| Fix-1 booking RPC | Solid SQL, untested integration | Moderate | Live Dev test before Prod |
| Migs 142/143 | Solid | Standard PG idioms | None — user already applied |

## What changes about my process going forward

The failure mode wasn't "didn't read code at all" — the audit doc earlier this session cited `path:line` for every gap. The failure was **switching mental modes from research to design without re-engaging verification discipline**. When designing a new UI element, the right move is the same as researching a bug: open the closest existing analog, cite it, mirror its conventions, then write new code. I skipped step 1 for Fix-2 because it "felt obvious." That's the exact instinct the rule exists to override.

## Recommended next steps

1. **Read the existing pricing-display patterns** (`CartDrawer.tsx` + checkout success + at least one product page) before redoing Fix-2. Cite the lines that establish "combined total" as the codebase convention.
2. **Rewrite Fix-2** to match — likely just show `$26.78` with a small footnote.
3. **Live-test Fixes 1 + 7 on Dev** before pushing to Staging — confirm the PG exception messages surface correctly through Supabase's rpc transport. (Already applied to Dev/Staging; just need to actually call the RPCs and see what happens.)
4. **Then ship the cleaned batch.**
