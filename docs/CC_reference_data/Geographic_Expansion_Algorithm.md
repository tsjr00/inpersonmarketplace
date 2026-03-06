# Geographic Expansion Algorithm — Spreadsheet Design

## Research-Backed Benchmark Data

### Average Transaction Amounts

| Metric | Value | Source |
|--------|-------|--------|
| **FM avg customer spend per visit** | $31-35 | [Penn State Extension 2024 FM Assessment](https://extension.psu.edu/analysis-of-the-2024-farmers-market-assessment-survey), [SeenMarkets 2025](https://seenmarkets.com/blog/statistical-analysis-of-farmers-markets-and-craft-fairs) |
| **FM spend distribution** | 38% spend $26-50, 32% spend $10-25 | [Penn State Extension Survey](https://extension.psu.edu/inside-pa-farmers-markets-spending-shopping-and-trends) |
| **FT avg customer spend** | $12.76 (2026) | [FoodTruckProfit 2026 Survey](https://www.foodtruckprofit.com/food-truck-statistics) |
| **FT urban vs suburban** | Urban $12-15, Suburban $8-10 | [Toast POS 2025](https://pos.toasttab.com/blog/on-the-line/how-much-do-food-trucks-make) |
| **FM vendor avg weekly sales** | $200-900 (small market), $1,100-1,600 (large market) | [Permies FM Forum](https://permies.com/t/32042/talk-farmer-market-sales-statistics), [LocalLine](https://www.localline.co/blog/is-selling-at-farmers-markets-worth-it) |
| **FT avg annual revenue** | $250K-500K ($346K avg) | [FoodTruckProfit 2026](https://www.foodtruckprofit.com/food-truck-statistics) |

### Industry Scale

| Metric | Value | Source |
|--------|-------|--------|
| **US farmers markets** | ~8,700 (USDA directory) | [USDA AMS Directory](https://www.ams.usda.gov/local-food-directories/farmersmarkets), [USDA ERS Chart](https://ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=104402) |
| **US food trucks** | ~48,000-92,000 | [IBISWorld 2025](https://www.ibisworld.com/united-states/industry/food-trucks/4322/), [Toast POS](https://pos.toasttab.com/blog/on-the-line/food-truck-industry-trends-and-statistics) |
| **FT industry size (US)** | $2.8B (2026) | [IBISWorld 2025](https://www.ibisworld.com/united-states/industry/food-trucks/4322/) |
| **FT South region share** | 35.8% of US revenue | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/united-states-food-truck-market) |
| **FT independent operators** | 85.6% market share | [SmallBizGenius](https://www.smallbizgenius.net/by-the-numbers/food-truck-industry-stats/) |

### Consumer Adoption

| Metric | Value | Source |
|--------|-------|--------|
| **% households buying local produce** | 82% | [USDA ERS](https://www.ers.usda.gov/amber-waves/2010/december/varied-interests-drive-growing-popularity-of-local-foods) |
| **% using farmers markets for 25%+ of produce** | 33% | [Choices Magazine](https://www.choicesmagazine.org/magazine/article.php?article=109) |
| **Prefer local food (age 50-64)** | 42% | [Statista](https://www.statista.com/topics/2123/local-foods-statistics-and-facts/) |
| **Prefer local food (age 18-29)** | 33% | [Statista](https://www.statista.com/topics/2123/local-foods-statistics-and-fact/) |
| **Digital payment uplift** | +$2.28 credit card, +$5.02 other digital | [Wiley/JAAEA](https://onlinelibrary.wiley.com/doi/10.1002/jaa2.96) |

### Key Data Sources for Lookup Tables

| Data | Source | URL |
|------|--------|-----|
| **Farm count by county** | USDA Census of Agriculture 2022 | [nass.usda.gov/AgCensus](https://www.nass.usda.gov/AgCensus/) — County Profiles |
| **Farmers market count by state** | USDA AMS National FM Directory | [usdalocalfoodportal.com](https://www.usdalocalfoodportal.com/fe/fdirectory_farmersmarket/) |
| **Median household income by county** | US Census Bureau ACS | [data.census.gov](https://data.census.gov) |
| **Population by city/county** | US Census Bureau | [census.gov/quickfacts](https://www.census.gov/quickfacts) |
| **Growing season (frost-free days)** | NOAA NCEI / Old Farmer's Almanac | [ncei.noaa.gov](https://www.ncei.noaa.gov/news/last-spring-freeze), [almanac.com/gardening/frostdates](https://www.almanac.com/gardening/frostdates) |
| **Food truck regulations by state** | WorldPopulationReview | [worldpopulationreview.com](https://worldpopulationreview.com/state-rankings/food-truck-regulations-by-state) |
| **University enrollment by city** | NCES IPEDS | [nces.ed.gov/ipeds](https://nces.ed.gov/ipeds/) |

---

## Spreadsheet Structure — 6 Tabs

### TAB 1: Market Input (User fills yellow cells)

| Column | Field | Type | Notes |
|--------|-------|------|-------|
| A | Market ID | Auto | Sequential (M-001, M-002...) |
| B | Region | Dropdown | New England, Mid-Atlantic, South-East, South-West, Rocky Mountain, Pacific Coast, Midwest |
| C | State | Dropdown | 50 states |
| D | City/County Name | **User input** | Yellow |
| E | Population | **User input** | Yellow — from Census QuickFacts |
| F | Median Household Income | **User input** | Yellow — from Census ACS |
| G | Community Type | Dropdown | Rural / Suburban / Urban / College Town |
| H | Economy Type | Dropdown | Agricultural / Industrial / Technical / Service / Tourism / Mixed |
| I | City Size | Auto-calc | Micro (<25K) / Small (25-100K) / Medium (100-250K) / Large (250K-1M) / Metro (1M+) |
| J | Existing FM Count | **User input** | Yellow — from USDA FM Directory |
| K | Existing FT Count | **User input** | Yellow — estimate from Google/Yelp |
| L | Farm Count (county) | **User input** | Yellow — from USDA Census of Ag |
| M | Growing Season (days) | **User input** | Yellow — from NOAA/Almanac |
| N | University Enrollment | **User input** | Yellow — 0 if none |
| O | Competition Level | Dropdown | None / Weak / Moderate / Strong |
| P | Local Champion | Dropdown | None / Contact Only / Active Advocate / Partner |
| Q | FT Regulatory Climate | Dropdown | Very Friendly / Friendly / Moderate / Restrictive / Very Restrictive |
| R | Tourism Level | Dropdown | None / Low / Moderate / High / Destination |

### TAB 2: Scoring Engine (All calculated — no user input)

This tab pulls from Tab 1 and Reference Data to calculate scores.

#### FM Market Potential Score (0-100)

| Factor | Weight | Scoring Logic |
|--------|--------|---------------|
| Population score | 15% | Micro=5, Small=15, Medium=30, Large=50, Metro=40 (peaks at Large — Metro has more competition) |
| Income score | 15% | Below $40K=5, $40-60K=20, $60-80K=40, $80-100K=60, $100K+=50 (diminishing — ultra-wealthy skip FMs) |
| Existing FM density | 15% | (FM count / population × 100K). Sweet spot = 3-8 per 100K. Below 2 = unproven (10pts). 3-5 = growing (30pts). 5-8 = proven demand (40pts). 8+ = saturated (20pts) |
| Farm density | 15% | Farms per county: <100=5, 100-500=20, 500-1000=35, 1000+=40 |
| Growing season | 10% | <120 days=10, 120-180=25, 180-240=35, 240+=40 (but year-round markets exist indoors) |
| Community fit | 10% | Rural+Agricultural=40, Suburban+Mixed=35, Urban+Service=25, College Town=30 |
| Economy type | 5% | Agricultural=40, Mixed=30, Service=25, Tourism=30, Industrial=15, Technical=20 |
| Tourism boost | 5% | None=0, Low=10, Moderate=25, High=35, Destination=40 |
| Competition penalty | 5% | None=40, Weak=30, Moderate=15, Strong=5 |
| Local champion bonus | 5% | None=5, Contact=15, Advocate=30, Partner=40 |

#### FT Market Potential Score (0-100)

| Factor | Weight | Scoring Logic |
|--------|--------|---------------|
| Population score | 20% | Micro=5, Small=10, Medium=25, Large=45, Metro=50 (FT scales with density) |
| Income score | 10% | Below $40K=15, $40-60K=25, $60-80K=35, $80-100K=40, $100K+=40 (FT is less income-dependent) |
| Existing FT density | 10% | FT count / population × 100K. <1=10 (unproven). 1-5=25. 5-15=40 (strong). 15+=30 (saturated) |
| University enrollment | 15% | 0=0, <5K=10, 5-15K=25, 15-30K=35, 30K+=40 |
| FT regulatory climate | 10% | Very Friendly=40, Friendly=30, Moderate=20, Restrictive=10, Very Restrictive=0 |
| Tourism boost | 10% | None=0, Low=10, Moderate=25, High=35, Destination=40 |
| Community fit | 10% | Urban=40, College Town=38, Suburban=25, Rural=10 |
| Competition penalty | 5% | None=40, Weak=30, Moderate=15, Strong=5 |
| Local champion bonus | 5% | None=5, Contact=15, Advocate=30, Partner=40 |
| Climate/season | 5% | <120 days=10, 120-180=20, 180-240=30, 240+=40 (outdoor dining season) |

### TAB 3: Vendor & Revenue Projections

#### Vendor Count Estimation

**FM Vendors:**
```
FM_vendor_pool = Farm_count × 0.15 × Platform_adoption_rate
```
- 15% of farms in a county do direct-to-consumer (USDA Census benchmark)
- Platform_adoption_rate starts at 5% Year 1, scales to 15-25% by Year 3
- Minimum floor: 5 vendors (below this, market isn't viable)
- Adjusted by FM_Potential_Score: multiply by (score/50) — score of 75 = 1.5x multiplier

**FT Vendors:**
```
FT_vendor_pool = Existing_FT_count × Platform_adoption_rate
```
- If no existing FT count entered, estimate: Population / 5,000 (national avg ~1 FT per 5K people)
- Platform_adoption_rate starts at 3% Year 1, scales to 10-20% by Year 3
- University bonus: add (enrollment / 10,000) × 2 vendors
- Adjusted by FT_Potential_Score: multiply by (score/50)

#### Revenue Tiers (per vendor per week)

**FM Revenue Model:**

| Seller Tier | % of Vendors | Avg Txns/Week | Avg Txn $ | Weekly GMV | Platform Take (Blended) | Weekly Platform Revenue |
|-------------|-------------|--------------|-----------|-----------|------------------------|------------------------|
| High volume | 15% | 25 | $35 | $875 | 12.1% | $105.88 |
| Moderate | 50% | 12 | $30 | $360 | 12.1% | $43.56 |
| Low volume | 35% | 5 | $25 | $125 | 12.1% | $15.13 |

*FM blended rate: 70% platform (13% = buyer 6.5% + vendor 6.5%) + 30% external (10% = buyer 6.5% + vendor 3.5%) = 12.1%*
*Transaction amounts based on Penn State Extension 2024 data ($31-35 avg). Higher than your $12.50 estimate — FM customers buy multiple items per visit.*

**FT Revenue Model:**

| Seller Tier | % of Vendors | Avg Txns/Week | Avg Txn $ | Weekly GMV | Platform Take (Blended) | Weekly Platform Revenue |
|-------------|-------------|--------------|-----------|-----------|------------------------|------------------------|
| High volume | 20% | 40 | $14 | $560 | 12.55% | $70.28 |
| Moderate | 45% | 20 | $13 | $260 | 12.55% | $32.63 |
| Low volume | 35% | 8 | $11 | $88 | 12.55% | $11.04 |

*FT blended rate: 85% platform (13%) + 15% external (10%) = 12.55%*
*Transaction amounts based on FoodTruckProfit 2026 data ($12.76 avg). Urban skews higher.*

**Platform Fee Structure (from pricing.ts):**
- Buyer fee: 6.5% on all transactions
- Vendor fee (platform/Stripe): 6.5%
- Vendor fee (external/cash): 3.5%
- Flat fee: $0.15 per order (buyer side)
- Total platform take: 13% (platform txns) or 10% (external txns)

#### Subscription Revenue (per vendor per month)

| Vertical | Free | Basic/Standard | Premium/Pro | Featured/Boss |
|----------|------|---------------|-------------|---------------|
| FM | $0 | $10 | $25 | $50 |
| FT | $0 | $10 | $25 | $50 |

Assumption: Year 1 tier distribution = 40% free, 35% basic, 20% premium, 5% featured

#### Seasonality Multiplier (FM only)

| Month | Multiplier | Notes |
|-------|-----------|-------|
| Jan | 0.15 | Winter — minimal for most regions |
| Feb | 0.20 | |
| Mar | 0.35 | Early spring |
| Apr | 0.55 | Spring ramp-up |
| May | 0.80 | Growing season starts |
| Jun | 1.00 | Peak season |
| Jul | 1.00 | Peak |
| Aug | 0.95 | Late summer |
| Sep | 0.85 | Harvest season |
| Oct | 0.65 | Fall market |
| Nov | 0.35 | Holiday markets |
| Dec | 0.25 | Holiday/indoor markets |

*Multiply by (Growing_Season_Days / 240) to adjust for region. Warm climates get flatter curves.*

FT seasonality is flatter — use 0.6 minimum in winter, 1.0 in summer, for regions with <180 growing days.

### TAB 4: Cost & ROI Analysis

**Rep Compensation Model: Percentage-based with small base**

| Field | Value | Type |
|-------|-------|------|
| Weekly Base Pay | **User input** | Yellow — small fixed weekly amount |
| Bonus per Vendor Signed ($) | **User input** | Yellow — one-time commission per new vendor |
| Revenue Share % (of market rev) | **User input** | Yellow — ongoing % of platform revenue from their market |
| Target Vendors per Month | **User input** | Yellow — expected signups per rep per month |
| Monthly Marketing Budget | **User input** | Yellow — per-market ad spend, flyers, events |
| Monthly Travel/Expense | **User input** | Yellow — gas, meals, supplies |

#### Calculated Outputs

```
Monthly Base Pay = Weekly Base × 4.33 weeks/month
Monthly Signup Bonuses = Bonus per Vendor × Target Vendors Signed/Month
Monthly Fixed Cost (per market) = Base Pay + Signup Bonuses + Marketing + Travel
Monthly Total Cost (per market) = Fixed Cost + (Market Revenue × Revenue Share %)
Monthly Net = Market Revenue - Total Cost
12-Month ROI = (12mo_Net) / (12mo_Cost) × 100
```

*Revenue share makes cost variable per market — higher-revenue markets cost more but generate more net profit. This aligns rep incentives with market performance.*

### TAB 5: Priority Dashboard

Sorted table of all evaluated markets with:

| Column | Calculation |
|--------|-------------|
| Market Name | From Tab 1 |
| FM Score | From Tab 2 |
| FT Score | From Tab 2 |
| Combined Score | (FM_Score × 0.5) + (FT_Score × 0.5) — adjustable weights |
| Projected FM Vendors (Y1) | From Tab 3 |
| Projected FT Vendors (Y1) | From Tab 3 |
| Projected Annual Revenue | From Tab 3 |
| Projected Annual Cost | From Tab 4 |
| Est. Break-even (months) | From Tab 4 |
| 12-Month ROI | From Tab 4 |
| **Priority Rank** | Auto-sorted by Combined_Score × ROI |
| Go/No-Go | =IF(Combined_Score>=50 AND ROI>0, "GO", IF(Combined_Score>=35, "MAYBE", "NO")) |

### TAB 6: Reference Data (Lookup tables)

Pre-populated lookup tables for:
1. City size classification thresholds
2. Income bracket scoring
3. FM density benchmarks by region
4. Seasonality multipliers
5. Tier distribution assumptions
6. Platform fee structure
7. Region → state mapping

---

## Variables You Had vs What's Added

### Your Original Variables (kept)
- Region, Community Type, Economy Type, City Size, City Name, Population
- Seller type tiers (High/Moderate/Low)
- Avg sales per week, avg sale amount, # of sellers

### Corrections to Your Original Data
- **Avg sale amount**: Your $12.50 is closer to FT, not FM. FM average is $30-35 per visit (customers buy multiple items). This is a significant difference for revenue projections.
- **Vendor %**: Rather than % of total population, the algorithm uses % of existing vendors/farms who adopt the platform — more defensible and realistic.
- **# of sellers distribution**: Your 2/4/6 split (High=few, Low=many) is correct directionally. Research confirms ~15-20% are high performers, ~50% moderate, ~30-35% low.

### New Variables Added
1. State (for lookup tables)
2. Median Household Income (Census data)
3. Existing FM Count (USDA directory)
4. Existing FT Count (Google/Yelp estimate)
5. Farm Count per county (USDA Census of Ag)
6. Growing Season days (NOAA)
7. University Enrollment (NCES)
8. Competition Level
9. Local Champion status
10. FT Regulatory Climate
11. Tourism Level
12. Separate FM and FT scoring (different weights)
13. Seasonality curve
14. Cost/ROI analysis
15. Break-even timeline
16. Priority ranking with Go/No-Go

---

## What Makes a Region Receptive to Local/In-Person Commerce

Based on the research, the variables that combine to create receptivity are:

1. **Agricultural heritage** — Areas with farming tradition already value local food
2. **Income + education** — Higher income AND education correlate with FM/local food spending (82% of households buy local produce, but frequency correlates with income)
3. **Existing market density** — Markets attract markets. A county with 5+ FMs has proven cultural receptivity
4. **Community cohesion** — Suburban and small-city communities with strong "shop local" identity
5. **Tourism economy** — Tourist areas drive demand for authentic/local food experiences
6. **Young + educated population** — College towns and young professional areas drive FT demand
7. **Digital payment adoption** — Markets accepting digital payments see +$2-5 per transaction uplift (your platform provides this)
8. **Food culture** — Hard to quantify, but proxied by: restaurant density, organic grocery stores, CSA programs, craft brewery count. These all indicate a population that values food quality over price.

The strongest single predictor: **Existing farmers market count relative to population**. If an area already supports multiple farmers markets, the culture is proven. Your platform then adds value by making those markets more accessible and efficient.
