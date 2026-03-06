# Current Task: Session 50 — Multi-Fix Round + Geographic Expansion Algorithm

Started: 2026-03-05

## Goal
Fix multiple issues found during user's walkthrough video testing, then build geographic expansion planning tool.

## What's Been Completed This Session
1. ✅ Processes & Protocols system (commit `b7d4616`)
2. ✅ Tier pricing unification — FM Premium $25, FT Pro $25, FT annual billing (commit `b852836`)
3. ✅ 815 Enterprises hub pages — /terms, /privacy, /support for Stripe compliance (commit `e49cced`)
4. ✅ Fix /support middleware allowlist + combine terms & privacy on single /terms page (commit `ea27025`)
5. ✅ Input field visibility fix (inputBg design token) + Setup Guide page for notifications & PWA (commit `47fd0fd`)
6. ✅ Help & FAQ card added to buyer section of dashboard (commit `c4d1fc7`)
7. ✅ 5 bugs from user walkthrough testing (commit `8aaf808`)
8. ✅ Ready-for-pickup banner fix — exclude issue-reported + buyer-confirmed items (commit `184e895`)
9. ✅ Exclude validation errors (4xx) from Sentry reporting (commit `a0721da`)
10. ✅ Geographic Expansion Algorithm — spreadsheet design doc + Excel workbook generated

## Git State
- Main is **9 ahead** of origin/main
- Staging is synced with main (all 9 commits pushed to staging)
- Production NOT yet pushed (user hasn't approved)

## ACTIVE WORK: Geographic Expansion Excel Workbook

### Files Created
- `docs/CC_reference_data/Geographic_Expansion_Algorithm.md` — Full design doc with research, sources, formulas
- `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx` — 6-tab Excel workbook (generated)
- `docs/CC_reference_data/build-expansion-workbook.js` — Node.js script that generates the Excel file
- User's original screenshot: `docs/CC_reference_data/Images for CC/Algorythm start.png`

### Corrections Applied (User Feedback) ✅
1. **REVENUE FIXED**: Now includes BOTH buyer AND vendor fees:
   - FM blended rate: 70% platform (13%) + 30% external (10%) = 12.1% (was 6.5%)
   - FT blended rate: 85% platform (13%) + 15% external (10%) = 12.55% (was 6.5%)
   - Updated: `build-expansion-workbook.js` Tab 3 formulas + assumptions rows 11b-11d
   - Updated: `Geographic_Expansion_Algorithm.md` revenue tables + fee structure

2. **REP COMPENSATION FIXED**: Changed from hourly to percentage-based:
   - Weekly Base Pay (small fixed amount)
   - Bonus per Vendor Signed (one-time commission)
   - Revenue Share % (ongoing % of platform revenue from their market)
   - Monthly Cost per market = Fixed Cost + (Market Revenue × Rev Share %)
   - Updated: `build-expansion-workbook.js` Tab 4 inputs + calculated costs + ROI formulas
   - Updated: `Geographic_Expansion_Algorithm.md` cost section
   - Excel workbook regenerated

### Workbook Structure (6 Tabs)
1. **Market Input** — 18 columns, 20 market rows. Yellow = user input, Gray = dropdown, White = auto-calc
2. **Scoring Engine** — FM score (0-100) and FT score (0-100), separate weighted factors, letter grades
3. **Revenue Projections** — Editable assumptions + per-market vendor count & revenue projections
4. **Cost & ROI** — Rep costs, vendor acquisition cost, break-even, 12-month ROI
5. **Priority Dashboard** — Combined scores, GO/MAYBE/NO recommendations
6. **Reference Data** — Benchmarks, source URLs, seasonality multipliers, scoring weights

### Research Data Collected (with Sources)
- FM avg customer spend: $31-35/visit (Penn State Extension 2024)
- FT avg customer spend: $12.76 (FoodTruckProfit 2026 Survey)
- US farmers markets: ~8,700 (USDA AMS Directory)
- US food trucks: ~48,000-92,000 (IBISWorld / Toast POS)
- FT avg annual revenue: $250K-500K ($346K avg)
- Consumer local food adoption: 82% households buy local produce
- Digital payment uplift: +$2.28 credit card, +$5.02 other digital
- Key data sources: USDA Census of Ag (farms/county), Census ACS (income), NOAA (growing season), WorldPopulationReview (FT regulations)
- All sources with URLs in `Geographic_Expansion_Algorithm.md`

### Platform Fee Structure (from pricing.ts)
- Buyer: 6.5% on all transactions
- Vendor (platform/Stripe): 6.5%
- Vendor (external): 3.5%
- Flat fee: $0.15 per order (buyer side)
- Total platform take: 13% (platform) or 10% (external) + $0.15

### Key Decisions Made This Session
- inputBg token: FM = `#FFFEF5` (warm cream), FT = `#f5f8ff` (light blue-white)
- Setup guide at `/{vertical}/help/setup` (static page, not knowledge articles)
- Terms + Privacy combined on single `/terms` page per user request
- FM Premium: $25/mo, FT Pro: $25/mo, FM Premium annual: $208.15/yr
- Smoke test: 3-tier approach (Targeted 2min / Critical Path 5min / Full 30min)
- Sentry: only report 5xx errors, exclude 4xx validation/auth
- Dashboard ready-for-pickup: exclude items with issue_reported_at or buyer_confirmed_at
- Geographic algorithm: vendor % based on existing vendor/farm count × adoption rate, NOT % of total population
- Rep compensation: percentage-based with small base, NOT hourly

## Bug Fixes Summary (commits 8aaf808, 184e895, a0721da)
- Bug 1: Bell dropdown mobile positioning (fixed → position:fixed on <480px viewport)
- Bug 2: Notification click blocking (removed await on mark-as-read fetch)
- Bug 3: Bell badge color mismatch (changed from hardcoded #16a34a to primaryColor)
- Bug 4: My Orders showing all orders (added status filter for active only)
- Bug 5: Issue reporting messages (added payment/refund context to 4 locations)
- Bug 6: Ready-for-pickup banner persisting (exclude issue_reported_at + buyer_confirmed_at items)
- Sentry: 4xx validation errors excluded from reporting
