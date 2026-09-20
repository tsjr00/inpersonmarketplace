# Booth numbering — Option U design: numbers belong to sizes (owner ruling 2026-09-20)

**STATUS: DESIGN ONLY — nothing built. Owner: "U — all six action items, write the design first."**
**Owner answers 2026-09-20 (folded in below):** range per tier = yes · lettered tiers = yes (alphanumeric, numbers
rising, letters the manager's choice) BUT no cross-walk for markets with an existing scheme — see N-10 + §6 for how
the transition stays easy · legacy tiers on Dev/Staging are all test data → re-enter them, no backfill ceremony
(§6) · all six Action Items = agreed (incl. Stripe) · one vendor MAY rent two adjacent booths, especially at a
one-size market → §9. **Rule L refresh happens before any build work (owner).**
Origin: `booth_numbering_review.md` (F0–F4). Builds on `booth_model_design.md` (BR-1…13, migs 256/257) — nothing
there is reversed; this fixes the layer underneath it: *which* numbers exist and what size each one is.

**⛔ Sequencing constraint:** this needs migration **258**. Guardrail Rule L is at its owner-suspended allowance (6
migrations past the 251 stamp). The Rule L refresh (257 on Dev → scoped delta → rebuild → stamp 257 → allowance 5)
MUST land before the 258 file is created, or the commit is blocked again. Do the refresh first; it was already the
first job of the session.

---

## §0 Vocabulary (additions to booth_model_design.md §0)

- **Slot** — one physical booth, identified by its **label** ("5", "A5", "Booth-5"). Every slot belongs to exactly
  one **size tier**. Today slots are implicit (a flat range); after U each tier owns its labels.
- **Tier range** — the tier's first and last label (`market_booth_inventory.label_start / label_end`). Its length IS
  the tier's booth count. Same prefix on both ends, numeric suffix (the mig 144 parse rule, unchanged).
- **Legacy range** — `markets.booth_label_start/end` (mig 144). Kept as the fallback for markets that have not set
  tier ranges. Hidden in the UI once every tier has a range.
- **Occupant** — anything holding a slot: a booking (week-specific), a placeholder (every week), a pin (a hold,
  not capacity — BR-6). Unchanged.
- **Free label (for a size, for a week)** — a label in the tier's range that no placeholder holds, no booking holds
  for that week, and no OTHER vendor pins as an assignment. A soft pin does not make a label un-free for a booking
  (BR-6 yield) but DOES for another pin or a placeholder (unchanged from mig 256).

## §1 Numbering rules (N-1 … N-9) — these are what the tests assert

| # | Rule | Replaces / extends |
|---|---|---|
| N-1 | **A label implies a size.** When a tier has a range, every row carrying that label — booking, pin, placeholder — carries that tier's `inventory_id`. The size is never typed separately from the number again. | mig 145 optional tier on pins (the source of "N occupants without a size tier") |
| N-2 | **Auto-assign picks inside the booked size.** `book_weekly_booth_atomic` candidates = the booked tier's range (own pin → smallest free label in the tier → smallest SOFT pin in the tier). LABELS_EXHAUSTED means "this size is full", which now equals OVERBOOKED — one message for the vendor. | mig 256 market-wide candidates |
| N-3 | **A vendor's pin must match the size they book.** Already BR-4 (tier lock). New corollary: a pin's label decides the tier, so a manager cannot pin a vendor to "#7 as Small" if #7 is a Large slot — the picker never offers it. | BR-4 |
| N-4 | **Every manager number entry is a pick, not a type.** Roster hold, approval, placeholder, weekly override: choose the size, then choose from that size's free labels (taken labels shown greyed with who holds them). Free text is gone. | 4 free-text inputs |
| N-5 | **Tier ranges never overlap within a market**, and a tier's `count` = its range length while a range is set. Enforced in the DB (trigger) and the API (friendly message). | none |
| N-6 | **Changing a range never moves anyone.** Shrinking a range that would orphan an occupied label is refused with the names; the manager frees the slot first (cancel the week / clear the pin / remove the placeholder). | none |
| N-7 | **Ranges are required, not optional.** After 258 a tier is not bookable until it has its labels (the inventory card asks for them on every save; the grid and Action Items say "set your booth numbers" until done). No dual mode — the only markets in the app today are test markets and the owner re-enters them (§6). | replaces the legacy-fallback idea |
| N-8 | **One story, four cards.** One helper paragraph (§3.7) rendered verbatim wherever a number is set or shown. | four eras of copy |
| N-9 | **Season = one label for every week** (unchanged, BR/§6-1) — now inside the booked tier's range. | mig 256 |
| N-10 | **Lettered tiers are the assumed scheme; an existing scheme is kept verbatim — decided ONCE per market.** Early in setup the manager answers one question: *"Is this a new market, or does it already have booth numbers?"* (`markets.booth_numbering_scheme` = `lettered` \| `existing`). **Lettered** (new markets, the default): each tier's numbers are a range with a REQUIRED letter prefix, pre-filled A/B/C per tier, numbers rising — the list shape is not offered. **Existing** (transitioning market): the prefix is optional and the **explicit list** shape is available ("3, 5, 7" · "Pavilion, Corner") so the labels on the app are the labels on the ground — nothing to cross-walk. Hard rules in both: a label belongs to exactly one tier at the market; within a range the numbers rise. The answer can be changed in Booth inventory (re-validated against occupied labels, N-6). | owner 2026-09-20: "preferred / assumed… an indicator early on… then we know which options to offer / allow" |
| N-11 | **Multi-slot (one vendor, two adjacent booths) — DEFERRED.** Owner 2026-09-20: "revisit later if it touches Stripe" — it does (one checkout session for the group). Design parked in §9; nothing for it ships in 258 (no unused wrapper — anti-bloat). Backlog entry. | — |

Interaction with existing rules: BR-5/6/7 (soft hold → assignment on payment → freeze) unchanged. BR-11/12 unchanged.
The uniqueness trigger (mig 256) unchanged — it already spans the three tables.

## §2 Migration 258 — `20260920_258_booth_tier_label_ranges.sql` (PRE-CHECK FIRST; snapshot row at file creation)

Additive; two function bodies replaced (live fingerprint on Dev/Staging/Prod first — they should equal the mig 256
post-check hashes recorded in the snapshot: `book_weekly_booth_atomic b84e5419…/7391`, `book_season_atomic
b34c4fb3…/5063`, `booth_label_candidates 01a78c56…/1206`).

1. `market_booth_inventory` + `label_prefix TEXT NULL` (may be '' — "no letter"), `label_start INT NULL`,
   `label_end INT NULL`, `labels TEXT[] NULL` (explicit list, N-10). Exactly one shape per tier: range (prefix +
   start + end) OR list. COMMENT on each. `count` = range length or list length while labels are set (N-5).
2. **Trigger `enforce_booth_tier_labels`** (BEFORE INSERT/UPDATE on `market_booth_inventory`): one shape only
   (`TIER_LABELS_SHAPE`, P0009); range: `end >= start`, `count = end - start + 1`; list: distinct, non-empty,
   `count = cardinality`; **no label in two tiers of the same market** (materialize each tier's labels and intersect
   → `TIER_LABEL_OVERLAP <label>`, P0010). Shrinking/changing: refuse when an occupied label (placeholder any week ·
   booking pending/paid/completed with `week_start_date + 6 >= CURRENT_DATE` · any pin) would leave the tier →
   `TIER_LABEL_OCCUPIED <label>` (P0011) — N-6.
3. **`booth_label_candidates(p_market_id UUID, p_inventory_id UUID DEFAULT NULL)`** — DROP the 1-arg version, create
   the 2-arg one. With `p_inventory_id` → that tier's labels in order (range: prefix||n ascending; list: array
   order). Without → every tier's labels (tier order, then label order) — the grid uses this to draw all slots. A
   tier with no labels yet returns NO rows (N-7: not bookable → LABELS_EXHAUSTED → "this size has no booth numbers
   yet" to the vendor, and the Action Item tells the manager). `markets.booth_label_start/end` are no longer read
   (left in place; dropped in a later housekeeping migration). REVOKE/GRANT as mig 256 (Rule M).
4. **`booth_tier_for_label(p_market_id, p_label) RETURNS UUID`** — the tier whose labels contain the label; NULL if
   none. Used by the writers (N-1) and the trigger.
5. **`book_weekly_booth_atomic`** — the two `booth_label_candidates(p_market_id)` calls become
   `booth_label_candidates(p_market_id, p_inventory_id)`; the own-pin / forced-label branch adds: if
   `booth_tier_for_label(label) IS DISTINCT FROM p_inventory_id` → `TIER_MISMATCH` (P0012) (cannot happen through the
   UI after N-3; defence for a direct call). Everything else byte-identical (DROP + CREATE, return shape unchanged).
6. **`book_season_atomic`** — same two substitutions; the per-week loop already passes the label.
7. `markets` + `booth_numbering_scheme TEXT NULL CHECK (booth_numbering_scheme IN ('lettered','existing'))` (N-10).
   NULL = not yet answered → the inventory card asks before the first tier's numbers can be saved. The trigger in
   (2) enforces the scheme: `lettered` → range shape only, prefix non-empty and alphabetic (`TIER_LETTER_REQUIRED`,
   P0013); `existing` → either shape, any prefix.
8. Snapshot: changelog row, column rows (5), Functions rows (4), trigger row. Prod order: 252→…→257→258.

Rollback: DROP the trigger + the two helpers, restore mig 256's three function bodies (text in the file), DROP the
five columns. Safe only while no tier has labels.

## §3 Surfaces (each: what changes, what it reads, what it refuses)

### 3.1 Booth inventory card (`BoothInventoryManager.tsx`, `booth-inventory` routes)
- **The scheme question first** (N-10), shown at the top of the card while `booth_numbering_scheme` is NULL, and as
  the first onboarding-checklist step under "Booth inventory": *"Is this a new market, or does it already have booth
  numbers?"* → **New market — number booths by size (A1, A2… / B1, B2…)** [default] · **Existing market — keep the
  numbers we already use**. One PATCH; changeable later from the same card.
- Each tier row: size · dimensions · price · **Booth numbers**. Lettered scheme: letter (pre-filled with the next
  unused A/B/C, required, letters only) + first + last number. Existing scheme: a two-way control — **"Range"**
  (prefix optional; first; last) or **"List"** (comma-separated labels as painted on the ground). Count is derived and
  shown ("= 4 booths"); the count field disappears. Both add and edit forms.
- The market-level **"Booth numbering" section** (first/last for the whole market) is REMOVED; in its place the map
  of what was saved ("A1–A4 Small · B1–B3 Medium · Pavilion, Corner Large") + the one helper paragraph (§3.7). If any
  tier has no labels: an amber line "Small has no booth numbers yet — vendors can't book it" (also Action Item 3).
- Save per tier (existing PATCH shape + the four columns); API turns trigger errors into names: "A3 is already a
  Medium booth" · "Changing Medium to B1–B2 would orphan B3 — Valley Verde Farm has a paid week there".
- Allowed on purpose: gaps between tiers (1–4 / 10–12), different prefixes per tier, no prefix at all, lists.

### 3.2 Free-labels endpoint (new) `GET /api/market-manager/[marketId]/booth-labels?inventory_id=&week_start_date=&vendor_profile_id=`
Returns, for the size: `[{ label, state: 'free' | 'placeholder' | 'pinned' | 'assigned' | 'booked', holder?: name }]`
for the week (default: current week). "assigned" = pin backed by a paid current/upcoming week (frozen). Used by every
picker in 3.3–3.6. Same rules as the RPC (mig 256 arms), so what the picker offers is what the trigger accepts. Manager
auth as the sibling routes; service client.

### 3.3 Roster hold + approval (`VendorBoothList.tsx`, `vendor-booth` + `vendor-approval` routes)
- Size select first (required to enable the number picker), then **number picker** = free labels of that size; taken
  labels listed greyed with the holder ("#5 — Sunrise Bakery, paid through Oct 3"). Free text removed.
- Route validation: label ∈ tier range (`booth_tier_for_label`), else 400 `ERR_BOOTH_LABEL_NOT_IN_SIZE` with the size
  the label belongs to. Same-vendor and freeze rules unchanged.
- "needs booth #" badge and filter chip: only at markets that do NOT charge for booths (`market_charges_booths`);
  at charging markets the row says "gets a number when they book" (F2a).
- Locked row copy unchanged ("Locked — paid week on file…"). Hold copy unchanged.

### 3.4 Placeholders (`BoothPlaceholderManager.tsx`, `booth-placeholders` routes)
Size select then number picker (3.2). Tier already required (mig 145). `checkTierCapacity` becomes redundant (a free
label in the tier IS capacity) — retired once every writer goes through the picker.

### 3.5 Weekly bookings (`WeeklyBookingsList.tsx`, `weekly-rental/[rentalId]` route)
- PAID rows: number shown read-only + "Locked — paid week. Cancel the week to move them." (mirrors the roster; F2b).
- PENDING rows: number picker limited to the booking's size and that week (3.2). Route adds N-1 validation.
- Card description: "Bookings get their number automatically — the vendor's held number if they have one, else the
  lowest free number in their size. You only step in here to move an UNPAID booking or cancel a paid week."
- Empty copy: "Once vendors book, each week's roster shows up here with the number each one was given."

### 3.6 Occupancy grid (`BoothOccupancyGrid.tsx`)
Draw EVERY slot per tier (`booth_label_candidates(market, tier)`), each as occupant or "— free". Capacity line =
taken / total slots. The "without a size tier" box is replaced by "Small has no booth numbers yet" when a tier has
none (N-7) and otherwise disappears by construction (N-1). Legend adds "free". Description: "Is there room? Every
numbered booth in each size, this week…". Multi-slot groups (§9) show as adjacent occupants with the same name.

### 3.7 The one helper paragraph (verbatim on 3.1 · 3.3 · 3.4 · 3.5; short form in the vendor's book page)
> **How booth numbers work here.** Every booth has a number and a size — Small #1–4, Medium #5–7 (this market's
> map). When a vendor books, they get their held number if you gave them one, otherwise the lowest free number in
> the size they booked. Paying for a week makes that number theirs until they miss a week. You hold a number for a
> vendor from the roster; you record booths rented off the platform as placeholders; both take that number out of
> circulation. Numbers only change for unpaid weeks, or if you cancel a paid week.
(FM wording via `term()`; FT parks are not on this model and do not render it.)

### 3.8 Vendor side (`BookBoothForm`, book page) — minimal
Unchanged flow. The confirmation line "Your booth: #N" appears when the vendor has a pin (already); for an unpinned
vendor the size card says "You'll be given the lowest free number in this size." LABELS_EXHAUSTED and OVERBOOKED
translate to the same sentence: "This size is full for that week — pick another size or week."

### 3.9 Action Items — the six (`ManagerActionSummary.tsx` + `manager-dashboard-stats.ts`)
| # | Line | Data | Link |
|---|---|---|---|
| 1 | **N vendors pending your approval → Review** | existing `pendingApprovalCount` | `#roster` |
| 2 | **N active vendors need a booth number → Assign** | existing `activeVendorsNeedingBooth`, **only when the market does not charge for booths** (`market_charges_booths`); 0 at charging markets (F2a) | `#roster` |
| 3 | **A size has no booth numbers yet → Set them** (N-7) and, until the test markets are re-entered, **N held/placeholder numbers have no size → Set the size** | tiers with no labels; pins + placeholders with `inventory_id IS NULL` (0 by construction once every writer is a picker, N-1) | `#booths` / `#roster` |
| 4 | **Size X is over capacity this week → Fix** | per tier: placeholders + this week's active bookings > `count` (same math as the grid `:276`) | `#booths` |
| 5 | **Stripe needs more information → Finish** | `MarketStripeConnectCard` "needs the manager to act" condition (`:78-88`: requirements currently_due / a disabled_reason other than pending_verification) — lifted into the stats loader from the same Stripe read the card does | `#setup` |
| 6 | **N vendors owed a season settlement → Settle** | ended seasons, groups with `owedDays > 0` and no resolution (the settlement card's own query, `MarketSeasonSettlementCard.tsx:149`) | `#seasons` |
Empty copy lists all six kinds in one sentence. The card stays hidden while setup is incomplete (checklist owns that).
The stats loader gains 3 reads (over-capacity, untiered, settlement) + reuses the Stripe read; Stripe is the one call
that can be slow — read it with a short timeout and omit line 5 on failure (never block the dashboard on Stripe).

### 3.10 TabbedCard heading (`TabbedCard.tsx`)
New prop `heading: 'group' | 'card'` (default `'group'` = today, FT unchanged). FM passes `'card'`: title rendered
like a DashboardCard header (lg / semibold, no accent rail). Inner roster card title "Roster" stays.

## §4 Build order (one push at the end; each part committed locally)
0. **Rule L refresh** (owner runs the scoped delta on Dev) → stamp 257 → allowance 5 → commit. **Blocks everything.**
1. **Mig 258 file + snapshot row** → fingerprints on 3 envs → owner pastes on Dev (pre-check → post-check) → Staging.
2. **Part U-A — inventory ranges + backfill:** 3.1, `booth-labels` endpoint (3.2), `booth_tier_for_label` use in the
   conflict-check helper; unit tests for range parsing / overlap / derived count; pins.
3. **Part U-B — pickers:** 3.3, 3.4, 3.5 (free text → pickers; paid rows locked); "needs booth #" scoped to
   non-charging markets; N-1 validation in the four routes; helper paragraph (3.7) as one shared component.
4. **Part U-C — grid + vendor copy:** 3.6, 3.8.
5. **Part U-D — Action Items six + TabbedCard heading:** 3.9, 3.10; stats loader reads; notification count untouched
   (no new notification types — nothing here messages anyone).
6. Registry rows + printable list blocks in the same push; OBSERVATIONS OB-029 fix line. Owner answers the scheme
   question and re-enters the test markets' booth numbers on Staging before retesting (§6).
(Multi-slot booking — §9 — is NOT in this round; backlog.)

## §5 Guardrails / tests
- Rule L first (above). Rule G: snapshot row when the 258 file exists. Rule M: REVOKE/GRANT on the 2 new functions +
  the re-created 2-arg candidates. Rule J: `observed()` on every new read in `lib/`.
- Unit: `booth-label-ranges.test.ts` (parse, overlap, derived count, orphan detection, legacy fallback).
- Flow pins: (a) no `<input type="text"` for a booth number remains in `VendorBoothList` / `WeeklyBookingsList` /
  `BoothPlaceholderManager` (Rule 7: strip comments first); (b) the four cards render the shared helper component;
  (c) `ManagerActionSummary` links resolve (existing pin) and names all six signals; (d) the RPC file passes
  `p_inventory_id` to `booth_label_candidates` (both functions).
- Business-rule tests: N-2 ("Large booking never receives a Small label") as a SQL-shaped assertion in
  `guardrail-contracts` over the migration text is weak; the real check is the owner's retest with two tiers.
  No existing business-rule test changes — flagged CONFLICT-first if one turns up.

## §6 Transition (owner 2026-09-20: Dev/Staging tiers are test data — re-enter them; Prod is wiped before its push)
- **In the app today:** after 258 every existing tier has no labels → not bookable until the manager (the owner, on
  the test markets) opens Booth inventory and enters each tier's numbers. Existing pins/placeholders/bookings whose
  label falls outside the tier they carry are listed by the trigger when the labels are saved (N-6 message) — the
  owner clears or moves them by hand on the test markets. No backfill code.
- **A real market arriving with its own scheme (the pushback case):** they type what is already on the ground —
  a range with their prefix ("Row A" 1–12) or no prefix (1–20 Small, 21–40 Large), or the explicit list for
  irregular schemes ("Pavilion, Corner, East-1…"). The app never renumbers; the only thing it asks is that each
  label belongs to one size. If a real market's sizes are interleaved (#1 Small, #2 Large, #3 Small…), the list shape
  handles it: Small = "1, 3, 5", Large = "2, 4, 6". That is why there is no cross-walk to build.
- **Fresh market set up in-app:** answers "New market" → lettered ranges, the next letter pre-filled per tier
  (A, B, C) — the owner's preferred scheme, one click per tier. The "existing" options are never shown to them.

## §7 What the manager gives up
- Free-text numbers typed at assignment time ("5b" on the fly) — a label must exist in a tier first (add it to the
  list or the range).
- Pinning a vendor to a number of a different size than the one they will book (was a silent contradiction).
- Count as an independent knob (it becomes what the labels say).
- The market-level first/last label fields (replaced by per-tier numbers).

## §8 Open items — ALL RESOLVED 2026-09-20
Ranges per tier ✓ · letters = assumed scheme, enforced for NEW markets, optional for markets that answer "existing"
(N-10 — the one-question indicator early in setup decides which options are offered) ✓ · legacy = re-enter ✓ · six
Action Items incl. Stripe ✓ · multi-slot DEFERRED (touches Stripe) → §9 parked, backlog ✓. **Rule L refresh before any
build work** ✓. Nothing blocks the build once the refresh lands.

## §9 (PARKED — owner 2026-09-20, "revisit later if it touches Stripe"; it does) Multi-slot booking — one vendor, two (or more) adjacent booths in one size
**Shape:** one `weekly_booth_rentals` row per slot (each with its own label, price, status), sharing a `group_id`
(reusing the season grouping column; a new `booth_booking_groups.kind = 'multi_slot'`). Nothing downstream changes:
uniqueness (per label), freeze (per row), credits (per row — a cancelled day credits each slot's share), payment
write-back (pin = the vendor's existing pin, else the LOWEST label of the group). Checkout: one Stripe session for the
group total (the season path already does this — `book-season` route creates one session per group).
**Assignment:** wrapper `book_weekly_booths_atomic(quantity)` (§2.7): first slot = own pin → smallest free → soft pin
(today's rule); each next slot = the next label after the previous one in the tier's order if free, else the smallest
free label (adjacency preferred, never required — the confirmation names the labels). Capacity: quantity ≤ free slots
in the tier for that week, else OVERBOOKED with the count ("only 1 Large booth is free that week").
**Vendor UI (`BookBoothForm`):** a "How many booths?" stepper (1…free count, max 3) under the size; price line ×
quantity; confirmation "Booths A3 and A4". **Manager:** weekly list shows the two rows adjacent with a "×2" tag; the
roster hold stays one label (the home slot). **Notifications:** the existing paid confirmations gain the list of
labels — no new type. **Season × quantity:** §8-2.
**Cost:** wrapper function (in 258 or a follow-on 259), booking route quantity param + one session for the group,
form stepper, weekly-list tag, 3 pins. ~1 day. Ships as **U-E** after U-D.
