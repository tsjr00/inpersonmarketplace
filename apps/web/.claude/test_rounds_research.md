# Test rounds — the open items grouped by the SITUATION each needs (2026-10-09)

Owner 2026-10-09: no seed script; reuse the vendors and test data already on staging; short rounds (~5 tests) with
a report between; "Find a vendor with these characteristics … and do this" — a staging query supplies the names.
Source: TEST_REGISTRY rows not passed (108) as rendered in TEST_PROTOCOL v4.0 (read in full 2026-10-09).

## The situations (what a round needs to START from) → the items it can cover
| # | Situation on staging | Items (registry) | Hidden from the tester? |
|---|---|---|---|
| S1 | FT truck APPROVED at a park, days picked, NEVER paid a day, no hold | TR-136 (hold tab locked → unlocks after a paid day), TR-137 (My Park Bookings), TR-043 (strip "Standing spot hold"), TR-133 (Book now) | paid/hold: hidden → query |
| S2 | FT truck NEVER applied to that park | TR-133 (Apply now → Applied → Book now), TR-138 (card button "Manage"), TR-071 (agreement) | hidden → query |
| S3 | FT truck not on the park's roster (to invite) | TR-140 / TR-107 (Action Items counts invited vs pending) | hidden → query |
| S4 | A truck with an APPROVED hold on a weekday at a spot + another truck | TR-109 regression (other truck refused) | hidden → query |
| S5 | FM vendor who has NEVER been at a managed FEE market, 1 published listing, <3 markets | TR-119 TR-083 TR-086 TR-117 TR-084 TR-085 TR-087 TR-121 TR-075 TR-118 TR-089 TR-072 TR-088 TR-082 TR-071 TR-077 | hidden → query |
| S6 | FM manager of a fee market with a PENDING applicant | approval with size/number/note (TR-085), locked after paid (TR-089), "no paid week yet" (TR-072) | visible on the roster |
| S7 | Vendor with the multi-location box UNTICKED and ACTIVE at a market on weekday D; a second market meeting D with overlapping hours | TR-044 (refused on both verticals), TR-145 (approval skips the day — needs mig 262 on staging ✅), TR-147 (listing save notice — needs an UNMANAGED second market) | box + schedules: hidden → query |
| S8 | FM vendor with a booth NUMBER held and NO paid week | TR-123 (retry own unpaid week), TR-090 (moved-booth notice), TR-088 (hold yields) | hidden → query |
| S9 | FREE-tier FM vendor at exactly 3 traditional markets | TR-069 (limit copy + faded picker) | tier/count: hidden → query |
| S10 | FM manager with a season (pre-sale lapsed) + a market with two approved vendors (one pinned) | TR-122 (lapsed pill), TR-079 (season keeps number), TR-091/TR-099 (cancel a day → credit, strip), TR-092 (cancel paid week), TR-040 | seasons/paid weeks: hidden → query |
| S11 | Vendor with a market-box offering whose next pickup ≤ 7 days + a subscriber | TR-015 TR-125 TR-014 TR-096 | hidden → query |
| S12 | Market with an ACTIVE bundle + buyer + the bundle's vendors + manager | TR-010 TR-001 TR-005 TR-002 TR-003 | hidden → query |
| S13 | Event organizer + four event-approved vendors (one with box unticked) | TR-022 TR-064 TR-065 TR-066 TR-067 TR-068 TR-026 TR-025 TR-023 TR-024 TR-030 TR-032 TR-033 TR-035 TR-141 TR-143 | event-approved: hidden → query |
| S14 | A buyer + trucks: one at ≥2 pickup places, one open now, one closed now, one with "+N more" | TR-134 TR-135 TR-139 | open/closed: visible; places: visible |
| S15 | Platform admin (+ a vertical admin) · Amarillo codes · Valley Verde Farm | TR-110 TR-111 TR-112 TR-113 TR-114 TR-115 TR-132 TR-148 TR-143 TR-116 (owner curl) TR-041 (owner job) TR-094 TR-096 TR-146 | none (admin sees everything) |
| S16 | Amarillo manager | TR-101 TR-105 TR-106 TR-108 TR-120 TR-124 TR-104 TR-102 TR-098 TR-146 | none |
| S17 | Tax rehearsal (owner-gated) | TR-129 TR-130 TR-126 TR-127 | owner says when |

## Which rounds CREATE state later rounds use (order, not setup)
- S2 (apply) → S6 (approve) → S1 (pay a day) → hold request → S4 (operator approves) → other truck refused. One park, four short rounds, each ends with a report.
- S5 (fresh FM vendor applies) → S6 (manager approves with size) → vendor pays a week → S8-type checks on the SAME vendor (locked number).
- S10 season: create → two vendors buy → cancel a day → close pre-sale — one manager, one round each.

## Visible-vs-hidden rule for writing a sheet
Visible on screen (the sheet may say "pick any …"): profile box ticked/unticked (profile edit page), Apply now /
Applied / Book now (market page), roster rows (manager), Open/Closed pills, listing counts.
Hidden (the sheet must NAME the account from the query): paid weeks, holds, declared days, tier + market count,
event-approved, box offerings, bundles, seasons, managed/fee flags, who has never applied where.

## Query design
ONE script, UNION ALL into (situation, vertical, who, where, detail), ordered — the Supabase editor shows only the
last result set. Read-only. Test-data names only (the owner's staging). Schema sections read before composing:
vendor_profiles · market_vendors · vendor_market_schedules · markets · market_schedules · weekly_booth_rentals ·
park_spot_bookings · park_standing_reservations · market_booth_inventory · listings · listing_markets ·
market_box_offerings · market_seasons · bundles · catering_requests · user_profiles.

## 2026-10-09 — staging state (owner's query result, build fbf26467) → `docs/testing/ROUNDS.md` v1
Key facts used: Sixth Street (parkmgr1): Fuego approved, Sat hold ACTIVE, 2 paid days; Smokestack approved, days Fri, NO paid day, no hold; Bao Down approved #2 Fri,Sat; Truck 4 Mojo + Drink Wagon never applied. River Road (marketmng1, charges, Sat only): Abuela's Kitchen (cottagevendor2, 5 listings, 2 markets, box unticked) never applied; Valley Verde has a paid week there (latest 2026-09-27 — visibility unknown → Round 5 branches). Unmanaged Saturday markets: Canyon 08-13, Lubbock 07-12 → Desert Bloom (unticked, 2 markets, 4 listings) for the conflict trio. Market 2 Test (mktmgr2): Jennifer Shea #16 paid (latest 10-04) · Valley Verde #17 · Hill Country Herbals #7 paid (09-27) · Sweet Rise. Amarillo (mktmgr1): holds #5 Sunrise, #6 Lone Star, #8 Happy Hens, #9 Sweet Rise, #10 Texas Honey (no paid weeks), #11 Valley Verde (paid 09-27). Pecan Creek Ranch = tier "standard" (legacy → FREE) at 3 traditional markets → TR-069 candidate. Market box "wonk" (Sweet Rise, Amarillo) 1 subscriber. Bundles at Amarillo both PAST pickup dates → owner must create a fresh one. Event: Space Camp Studios Vendor Event, ready, 2026-10-18, 4 vendor rows. Seasons: none open at Market 2 Test (River Road "Fall/Winter" draft; Westgate "summer 2 test" lapsed = TR-122 candidate).

## Round → registry mapping (Claude's bookkeeping)
R1  1→TR-133 TR-138 TR-071 · 2→TR-136 TR-137 · 3→TR-137 · 4→TR-136 · 5→TR-043(paid-day line)
R2  1→TR-107 TR-140 · 2→TR-107 TR-140 · 3→TR-133 · 4→TR-109(regression) · 5→TR-140
R3  1→TR-134 · 2→TR-135 · 3→TR-134 · 4→TR-139 · 5→TR-134
R4  1→TR-119 · 2→TR-083 TR-086 · 3→TR-117 · 4→TR-119 TR-084 TR-133(FM) TR-086 TR-071 · 5→TR-119 TR-085 TR-133(FM) · 6→TR-087 TR-086
R5  1→TR-118 · 2→TR-118 · 3→TR-118 · 4→TR-119 · 5→TR-089 TR-072 TR-121 TR-075 (visibility branch)
R6  1→(setup read) · 2→TR-044 · 3→TR-147 · 4→TR-145 · 5→TR-044 TR-145(rule intact)
Not yet scheduled: TR-123 TR-090 TR-088 TR-082 (Amarillo holds → R7) · TR-069 (Pecan Creek → R7 or own) · TR-079 TR-122 TR-091 TR-092 TR-099 TR-040 (R8) · TR-014 TR-015 TR-125 TR-096 (R9) · TR-110–115 TR-132 TR-148 TR-143 TR-094 (R10) · events (R11) · TR-146 (R12) · bundles (R13) · TR-041 TR-116 (owner-triggered) · W14 (owner-gated).
