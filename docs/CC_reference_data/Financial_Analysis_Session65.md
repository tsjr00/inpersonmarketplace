# 815 Enterprises — Financial Analysis & Scenario Planning
**Prepared:** 2026-03-30 | **Starting Market:** Amarillo, TX | **Platform:** farmersmarketing.app + foodtruckn.app

---

## Revenue Model Summary

### Revenue Streams

| Stream | Source | Rate | Applies To |
|--------|--------|------|-----------|
| **Buyer Fee** | % markup on orders | 6.5% of subtotal | All orders |
| **Vendor Fee** | % deducted from payout | 6.5% of subtotal | All orders |
| **Flat Fee** | Per-order processing | $0.15 buyer + $0.15 vendor = $0.30/order | All orders |
| **Small Order Fee** | Below-threshold surcharge | $0.50 (FT <$5) / $1.00 (FM <$10) | ~20% of orders |
| **Vendor Subscriptions** | Monthly/annual tiers | Pro $25/mo, Boss $50/mo | Paid vendors |
| **Buyer Premium** | Monthly subscription | $9.99/mo | Premium buyers |
| **Managed Event Fee** | Per-vendor event coordination | $75/vendor/event | Managed events |
| **Market Box Platform Fee** | 13% on recurring box subscriptions | 13% of box price | Market Box/Chef Box orders |

### Effective Platform Take Rate
- **Standard order:** 13% + $0.30 (before Stripe processing ~2.9% + $0.30)
- **Net after Stripe:** ~10% + ~$0.00 per order
- **Market Box:** 13% + $0.30 (same structure)
- **Managed Event:** $75/vendor + 13% on any pre-orders placed through the event page

### Cost Structure

| Category | Item | Monthly Cost | Notes |
|----------|------|-------------|-------|
| **Infrastructure** | Vercel Pro | $20 | Hosting + edge functions |
| | Supabase Pro | $25 | Database + auth + storage |
| | Upstash Redis | $10 | Rate limiting |
| | Resend | $0-20 | Email (free tier covers ~3k/mo) |
| | Sentry | $0-26 | Error monitoring |
| | Twilio | $0-50 | SMS (pending A2P approval) |
| **Payments** | Stripe fees | ~2.9% + $0.30/txn | Pass-through, deducted before our take |
| **Domain/Brand** | Domain renewals | ~$5 | 3 domains amortized |
| **Operations** | Admin labor | Variable | Managed events, vendor approvals, support |
| **Marketing** | Vendor outreach | Variable | Farmer's market visits, social, flyers |
| | Event sponsorship | Variable | Community events for visibility |
| **Legal/Tax** | TX sales tax filing | $0-35/filing | TaxJar or manual |
| | Marketplace facilitator registration | One-time | TX Comptroller |

**Fixed infrastructure:** ~$80-150/month (scales with usage tiers)

---

## Market Sizing — Texas Geographic Expansion

### Phase 1: Amarillo (Population ~200k metro)

| Metric | FM Estimate | FT Estimate |
|--------|------------|------------|
| Total vendors in area | ~40-60 cottage food/farm vendors | ~15-25 food trucks |
| Addressable (will use tech) | ~15-25 | ~8-15 |
| Active farmers markets | 3-5 weekly markets | N/A (location-based) |
| Events/month potential | 2-4 | 3-6 |
| Population (buyers) | ~200,000 | ~200,000 |
| Buyer adoption (Y1) | 0.5-1.5% = 1,000-3,000 | 0.25-0.75% = 500-1,500 |

### Phase 2: Texas Expansion Targets (by market attractiveness)

| Market | Metro Pop | FM Opportunity | FT Opportunity | Priority |
|--------|-----------|---------------|----------------|----------|
| **Amarillo** | 200k | Medium (3-5 markets) | Medium (15-25 trucks) | **Live** |
| **Lubbock** | 320k | Medium (4-6 markets) | Medium (20-30 trucks) | High — similar demo, 2hr drive |
| **Midland-Odessa** | 350k | Low-Med (2-3 markets) | High (oil field events) | High — event-heavy |
| **San Angelo** | 120k | Medium (2-3 markets) | Low (8-12 trucks) | Medium — small but low competition |
| **Wichita Falls** | 150k | Medium (2-4 markets) | Low-Med (10-15 trucks) | Medium |
| **Abilene** | 175k | Medium (3-4 markets) | Low-Med (12-18 trucks) | Medium |
| **DFW** | 7.6M | Very High (50+ markets) | Very High (500+ trucks) | Deferred — requires ops scale |
| **Austin** | 2.3M | Very High (25+ markets) | Very High (200+ trucks) | Deferred — heavy competition |
| **San Antonio** | 2.5M | High (20+ markets) | High (150+ trucks) | Deferred — moderate competition |
| **Houston** | 7.1M | Very High (40+ markets) | Very High (400+ trucks) | Deferred — requires ops scale |

**Expansion Strategy:** Stay in West Texas (Amarillo → Lubbock → Midland-Odessa) for 6-12 months. Prove the model, refine ops, build case studies. Then evaluate Tier 2 cities (Abilene, San Angelo, Wichita Falls). Major metros (DFW, Austin, SA, Houston) require dedicated local admin staff — defer until revenue supports it.

### Phase 3: Beyond Texas (Future — 18+ months)

Adjacent states with similar regulatory environment: Oklahoma, New Mexico, Kansas, Arkansas. Texas cottage food law is favorable (no license required under $50k/yr) — other states vary. FT regulations vary by city.

---

## Scenario Analysis

### Key Assumptions (all scenarios)

| Assumption | Value | Source |
|-----------|-------|--------|
| Avg FT order value | $13.50 | Platform constant `AVG_MEAL_PRICE_CENTS` |
| Avg FM order value | $18.00 | Higher basket (multiple items: produce + baked goods + pantry) |
| Avg Market Box price | $35.00/week (4-week term) | Platform typical offering |
| Platform net take (after Stripe) | ~10% | 13% gross - 2.9% Stripe |
| Managed event fee | $75/vendor | Per your specification |
| Self-service event fee | $0 (currently) | Free — drives vendor adoption |
| Orders per active buyer/month | 2.5 (FT), 1.5 (FM) | FT = impulse/convenience, FM = planned weekly |
| Vendor churn/month | 5% (free), 3% (paid) | Industry benchmark |
| Buyer retention | 40% month-over-month | Marketplace benchmark |

---

### SCENARIO A: Conservative / Organic Growth
**"Amarillo Only, Word of Mouth, No Marketing Spend"**

Assumes: Slow vendor onboarding, minimal events, no paid marketing. This is the floor.

**Year 1 — Amarillo Only**

| Metric | Q1 | Q2 | Q3 | Q4 | Year Total |
|--------|-----|-----|-----|-----|-----------|
| **FM Vendors (active)** | 5 | 10 | 14 | 16 | — |
| **FT Vendors (active)** | 3 | 6 | 8 | 10 | — |
| **FM Buyers (cumulative)** | 50 | 200 | 500 | 800 | — |
| **FT Buyers (cumulative)** | 30 | 100 | 250 | 400 | — |
| **FM Orders/month** | 20 | 100 | 300 | 500 | 3,400 |
| **FT Orders/month** | 25 | 80 | 200 | 350 | 2,400 |
| **Managed Events** | 0 | 1 | 2 | 3 | 6 |
| **Self-Service Events** | 1 | 3 | 5 | 8 | 17 |
| **Vendors per managed event** | — | 2 | 2.5 | 3 | avg 2.5 |
| **Market Box Subs (active)** | 0 | 5 | 15 | 25 | — |
| | | | | | |
| **REVENUE** | | | | | |
| FM Transaction Fees | $36 | $180 | $540 | $900 | **$5,520** |
| FT Transaction Fees | $34 | $108 | $270 | $473 | **$3,240** |
| Flat Fees ($0.30/order) | $14 | $54 | $150 | $255 | **$1,740** |
| Managed Event Fees | $0 | $150 | $375 | $675 | **$1,200** |
| Vendor Subscriptions | $0 | $50 | $175 | $300 | **$1,575** |
| Market Box Fees (13%) | $0 | $91 | $273 | $455 | **$2,730** |
| Buyer Premium | $0 | $0 | $30 | $60 | **$270** |
| **TOTAL REVENUE** | **$84** | **$633** | **$1,813** | **$3,118** | **$16,275** |
| | | | | | |
| **COSTS** | | | | | |
| Infrastructure | $100 | $100 | $120 | $150 | **$1,410** |
| Marketing/Outreach | $0 | $50 | $100 | $100 | **$750** |
| Admin labor (part-time) | $0 | $0 | $200 | $400 | **$1,800** |
| Legal/Tax | $100 | $50 | $50 | $50 | **$750** |
| **TOTAL COSTS** | **$200** | **$200** | **$470** | **$700** | **$4,710** |
| | | | | | |
| **NET** | **($116)** | **$433** | **$1,343** | **$2,418** | **$11,565** |

**Scenario A Summary:** Breakeven in Q2. ~$11.5k net Year 1. Proves model but doesn't fund growth. Subscription revenue stays low because free tier is generous enough for small vendors.

---

### SCENARIO B: Moderate Growth / Active Outreach
**"Amarillo + Lubbock by Q3, Targeted Vendor Outreach, 1-2 Events/Month"**

Assumes: Active farmer's market visits, local Facebook/Instagram presence, chamber of commerce partnerships. Lubbock expansion in Q3.

**Year 1 — Amarillo (Q1-Q4) + Lubbock (Q3-Q4)**

| Metric | Q1 | Q2 | Q3 | Q4 | Year Total |
|--------|-----|-----|-----|-----|-----------|
| **FM Vendors** | 8 | 18 | 30 | 40 | — |
| **FT Vendors** | 5 | 10 | 18 | 25 | — |
| **FM Buyers** | 100 | 500 | 1,200 | 2,000 | — |
| **FT Buyers** | 50 | 200 | 600 | 1,000 | — |
| **FM Orders/month** | 50 | 300 | 800 | 1,400 | 9,200 |
| **FT Orders/month** | 40 | 200 | 500 | 900 | 5,800 |
| **Managed Events** | 1 | 3 | 5 | 8 | 17 |
| **Self-Service Events** | 2 | 6 | 12 | 18 | 38 |
| **Vendors/managed event** | 2 | 2.5 | 3 | 3 | avg 2.75 |
| **Market Box Subs** | 3 | 15 | 40 | 70 | — |
| **Pro Subscribers** | 0 | 2 | 6 | 12 | — |
| **Boss Subscribers** | 0 | 0 | 1 | 3 | — |
| | | | | | |
| **REVENUE** | | | | | |
| FM Transaction Fees | $90 | $540 | $1,440 | $2,520 | **$16,560** |
| FT Transaction Fees | $54 | $270 | $675 | $1,215 | **$7,830** |
| Flat Fees | $27 | $150 | $390 | $690 | **$4,500** |
| Managed Event Fees | $150 | $563 | $1,125 | $1,800 | **$3,638** |
| Vendor Subscriptions | $0 | $50 | $200 | $550 | **$2,700** |
| Market Box Fees | $55 | $273 | $728 | $1,274 | **$7,800** |
| Buyer Premium | $0 | $20 | $100 | $200 | **$960** |
| Small Order Fees | $10 | $50 | $130 | $230 | **$1,500** |
| **TOTAL REVENUE** | **$386** | **$1,916** | **$4,788** | **$8,479** | **$45,488** |
| | | | | | |
| **COSTS** | | | | | |
| Infrastructure | $120 | $150 | $200 | $250 | **$2,160** |
| Marketing | $200 | $300 | $500 | $500 | **$4,500** |
| Admin labor | $0 | $500 | $1,000 | $1,500 | **$9,000** |
| Legal/Tax | $200 | $100 | $100 | $100 | **$1,500** |
| Travel (Lubbock expansion) | $0 | $0 | $300 | $200 | **$1,500** |
| **TOTAL COSTS** | **$520** | **$1,050** | **$2,100** | **$2,550** | **$18,660** |
| | | | | | |
| **NET** | **($134)** | **$866** | **$2,688** | **$5,929** | **$26,828** |

**Scenario B Summary:** ~$27k net Year 1. Events become meaningful revenue ($3.6k). Market boxes are the sleeper hit ($7.8k — recurring, predictable). Lubbock expansion adds ~30% volume in Q3-Q4. Subscription conversion starts slowly — most vendors stay on free tier until they hit limits.

---

### SCENARIO C: Aggressive Growth / Events-Led
**"3 Markets by EOY, Events as Primary Driver, Part-Time Admin Hire"**

Assumes: Events are the growth engine — each event introduces the platform to new buyers and vendors. Amarillo → Lubbock (Q2) → Midland-Odessa (Q3). Hire part-time admin/event coordinator in Q2.

**Year 1 — Amarillo + Lubbock + Midland-Odessa**

| Metric | Q1 | Q2 | Q3 | Q4 | Year Total |
|--------|-----|-----|-----|-----|-----------|
| **FM Vendors** | 10 | 25 | 50 | 70 | — |
| **FT Vendors** | 8 | 18 | 35 | 50 | — |
| **FM Buyers** | 200 | 1,000 | 3,000 | 5,000 | — |
| **FT Buyers** | 100 | 500 | 1,500 | 2,500 | — |
| **FM Orders/month** | 100 | 600 | 2,000 | 3,500 | 22,000 |
| **FT Orders/month** | 80 | 400 | 1,200 | 2,200 | 13,600 |
| **Managed Events** | 2 | 6 | 12 | 18 | 38 |
| **Self-Service Events** | 3 | 10 | 25 | 40 | 78 |
| **Vendors/managed event** | 2.5 | 3 | 3.5 | 4 | avg 3.25 |
| **Market Box Subs** | 5 | 30 | 80 | 140 | — |
| **Pro Subscribers** | 1 | 5 | 15 | 25 | — |
| **Boss Subscribers** | 0 | 1 | 4 | 8 | — |
| | | | | | |
| **REVENUE** | | | | | |
| FM Transaction Fees | $180 | $1,080 | $3,600 | $6,300 | **$39,600** |
| FT Transaction Fees | $108 | $540 | $1,620 | $2,970 | **$18,360** |
| Flat Fees | $54 | $300 | $960 | $1,710 | **$10,680** |
| Managed Event Fees | $375 | $1,350 | $3,150 | $5,400 | **$10,275** |
| Vendor Subscriptions | $25 | $175 | $575 | $1,025 | **$5,850** |
| Market Box Fees | $91 | $546 | $1,456 | $2,548 | **$15,600** |
| Buyer Premium | $10 | $100 | $300 | $500 | **$2,730** |
| Small Order Fees | $20 | $100 | $320 | $570 | **$3,600** |
| **Event Pre-Order Fees** | $50 | $300 | $1,000 | $2,000 | **$10,050** |
| **TOTAL REVENUE** | **$913** | **$4,491** | **$12,981** | **$23,023** | **$116,745** |
| | | | | | |
| **COSTS** | | | | | |
| Infrastructure | $150 | $200 | $300 | $400 | **$3,150** |
| Marketing | $500 | $750 | $1,000 | $1,000 | **$9,750** |
| Admin/Event Coord (PT) | $0 | $1,500 | $2,000 | $2,500 | **$18,000** |
| Legal/Tax | $300 | $200 | $200 | $200 | **$2,700** |
| Travel (expansion) | $200 | $400 | $500 | $300 | **$4,200** |
| Event supplies/materials | $50 | $150 | $300 | $400 | **$2,700** |
| **TOTAL COSTS** | **$1,200** | **$3,200** | **$4,300** | **$4,800** | **$40,500** |
| | | | | | |
| **NET** | **($287)** | **$1,291** | **$8,681** | **$18,223** | **$76,245** |

**Scenario C Summary:** ~$76k net Year 1. Events generate $20k+ (managed fees + pre-order commissions). Market boxes contribute $15.6k recurring. Requires part-time hire ($18k/yr) but the leverage is massive — each managed event creates 3-4 vendor relationships and exposes 50-200 buyers to the platform.

---

### SCENARIO D: Best Case / Viral Adoption
**"Events Go Viral, Corporate Contracts, 5 Markets by EOY"**

Assumes: A few corporate events create word-of-mouth. One large employer signs a recurring weekly truck/vendor program. Local media coverage. Expansion to 5 West Texas markets. Full-time admin hire in Q3.

**Year 1 — 5 West Texas Markets**

| Metric | Q1 | Q2 | Q3 | Q4 | Year Total |
|--------|-----|-----|-----|-----|-----------|
| **FM Vendors** | 12 | 35 | 75 | 120 | — |
| **FT Vendors** | 10 | 25 | 55 | 80 | — |
| **FM Buyers** | 300 | 2,000 | 6,000 | 10,000 | — |
| **FT Buyers** | 200 | 1,000 | 3,000 | 5,000 | — |
| **FM Orders/month** | 150 | 1,200 | 4,000 | 7,000 | 44,000 |
| **FT Orders/month** | 120 | 800 | 2,500 | 5,000 | 29,000 |
| **Managed Events** | 3 | 10 | 20 | 30 | 63 |
| **Self-Service Events** | 5 | 15 | 40 | 60 | 120 |
| **Vendors/managed event** | 3 | 3.5 | 4 | 4.5 | avg 3.75 |
| **Recurring Corp Programs** | 0 | 1 | 3 | 5 | — |
| **Market Box Subs** | 10 | 50 | 150 | 300 | — |
| **Pro Subscribers** | 2 | 10 | 25 | 45 | — |
| **Boss Subscribers** | 0 | 2 | 8 | 15 | — |
| | | | | | |
| **REVENUE** | | | | | |
| FM Transaction Fees | $270 | $2,160 | $7,200 | $12,600 | **$79,200** |
| FT Transaction Fees | $162 | $1,080 | $3,375 | $6,750 | **$39,150** |
| Flat Fees | $81 | $600 | $1,950 | $3,600 | **$21,900** |
| Managed Event Fees | $675 | $2,625 | $6,000 | $10,125 | **$19,425** |
| Vendor Subscriptions | $50 | $350 | $1,025 | $1,900 | **$10,575** |
| Market Box Fees | $182 | $910 | $2,730 | $5,460 | **$31,200** |
| Buyer Premium | $20 | $200 | $600 | $1,000 | **$5,460** |
| Small Order Fees | $30 | $200 | $650 | $1,200 | **$7,300** |
| Event Pre-Order Fees | $100 | $600 | $2,500 | $5,000 | **$24,600** |
| Recurring Corp Programs | $0 | $500 | $2,000 | $5,000 | **$22,500** |
| **TOTAL REVENUE** | **$1,570** | **$9,225** | **$28,030** | **$52,635** | **$261,310** |
| | | | | | |
| **COSTS** | | | | | |
| Infrastructure | $150 | $250 | $400 | $500 | **$3,900** |
| Marketing | $1,000 | $1,500 | $2,000 | $2,000 | **$19,500** |
| Admin (FT hire Q3) | $0 | $2,000 | $3,500 | $3,500 | **$27,000** |
| Event Coord (PT) | $500 | $1,000 | $1,500 | $2,000 | **$15,000** |
| Legal/Tax/Insurance | $500 | $300 | $300 | $300 | **$4,200** |
| Travel (5 markets) | $300 | $600 | $800 | $600 | **$6,900** |
| Event supplies | $100 | $300 | $500 | $700 | **$4,800** |
| **TOTAL COSTS** | **$2,550** | **$5,950** | **$9,000** | **$9,600** | **$81,300** |
| | | | | | |
| **NET** | **($980)** | **$3,275** | **$19,030** | **$43,035** | **$180,010** |

**Scenario D Summary:** ~$180k net Year 1. Recurring corporate programs are the game-changer ($22.5k) — a single employer with 200+ employees ordering weekly food trucks generates ~$1k/month in platform fees alone. Market boxes at scale ($31.2k) provide predictable MRR. Requires significant investment in people ($42k labor) but ROI is 3:1.

---

## Revenue Mix Comparison (Year 1 Totals)

| Revenue Stream | Scenario A | Scenario B | Scenario C | Scenario D |
|---------------|-----------|-----------|-----------|-----------|
| Transaction Fees (FM+FT) | $8,760 | $24,390 | $57,960 | $118,350 |
| Flat Fees | $1,740 | $4,500 | $10,680 | $21,900 |
| Managed Events | $1,200 | $3,638 | $10,275 | $19,425 |
| Vendor Subscriptions | $1,575 | $2,700 | $5,850 | $10,575 |
| Market Boxes | $2,730 | $7,800 | $15,600 | $31,200 |
| Buyer Premium | $270 | $960 | $2,730 | $5,460 |
| Event Pre-Orders | — | — | $10,050 | $24,600 |
| Corp Recurring | — | — | — | $22,500 |
| Small Order Fees | — | $1,500 | $3,600 | $7,300 |
| **TOTAL** | **$16,275** | **$45,488** | **$116,745** | **$261,310** |
| **Costs** | **$4,710** | **$18,660** | **$40,500** | **$81,300** |
| **NET** | **$11,565** | **$26,828** | **$76,245** | **$180,010** |
| **Net Margin** | 71% | 59% | 65% | 69% |

---

## Key Metrics & Targets

### Vendor Targets by Market

| Market | FM Vendors (Y1 Target) | FT Vendors (Y1 Target) | When to Enter |
|--------|----------------------|----------------------|---------------|
| Amarillo | 20-40 | 10-25 | **Live now** |
| Lubbock | 15-30 | 10-20 | Q2 (when Amarillo has 15+ FM vendors) |
| Midland-Odessa | 10-20 | 8-15 | Q3 (if Lubbock is growing) |
| San Angelo | 8-15 | 5-10 | Q4 or Year 2 |
| Wichita Falls | 8-15 | 5-10 | Q4 or Year 2 |

### Unit Economics

| Metric | Value | Formula |
|--------|-------|---------|
| Avg revenue per FM order | $2.10 | $18 × 10% + $0.15 |
| Avg revenue per FT order | $1.65 | $13.50 × 10% + $0.15 |
| Avg revenue per Market Box/week | $4.55 | $35 × 13% |
| Avg revenue per managed event | $300 | $75 × 3 vendors + $75 pre-order commissions |
| Vendor acquisition cost | $0-20 | Organic/market visits |
| Buyer acquisition cost | $0-5 | Via vendor promotion + events |
| LTV per active buyer (12mo) | $25-60 | 2 orders/mo × 12 × $1.50 avg fee |
| LTV per Pro vendor (12mo) | $300+ | $25/mo × 12 |
| LTV per Boss vendor (12mo) | $600+ | $50/mo × 12 |

### Subscription Conversion Assumptions

| Scenario | Free→Pro Rate | Pro→Boss Rate | Timeline |
|----------|-------------|-------------|----------|
| Conservative | 5% | 10% of Pro | 6+ months in |
| Moderate | 10% | 15% of Pro | 4-6 months |
| Aggressive | 15% | 20% of Pro | 3-4 months |
| Best Case | 20% | 25% of Pro | 2-3 months |

Conversion drivers: hitting free tier limits (20 listings, 3 markets, 3 market boxes), wanting priority placement, needing SMS/push notifications, analytics export.

---

## Growth Levers (Ranked by Impact)

1. **Events** — Each event is a customer acquisition channel. 1 managed event → 3 vendors + 50-200 buyers exposed to the platform. Self-service events cost nothing to operate.

2. **Market Boxes** — Recurring revenue with 4-week commitment. $4.55/week per sub × 52 weeks = $236/year per active subscription. At 100 subs = $23,600/year.

3. **Corporate Recurring Programs** — A single employer with weekly food trucks = ~$12k/year in platform fees. These are the holy grail — recurring, predictable, high-value.

4. **Geographic Expansion** — Each new market is a copy of the Amarillo playbook. Fixed cost of expansion is ~$500-1,000 (travel + local marketing). Revenue scales linearly.

5. **Vendor Tier Upgrades** — Natural conversion as vendors grow. Each Pro upgrade = $300/year. Each Boss = $600/year. Low-touch revenue.

---

## Decision Points

| Decision | When | Criteria |
|----------|------|---------|
| Expand to Lubbock | Amarillo has 15+ FM vendors, 8+ FT vendors | Prove the model works |
| Hire PT admin | Monthly revenue > $3,000 | Revenue justifies $1,500/mo |
| Expand to 3rd market | Lubbock growing within 60 days of entry | Velocity > Amarillo's first 60 days |
| Hire FT admin | Monthly revenue > $8,000 | Need dedicated event coordination |
| Consider DFW/Austin | 5 West Texas markets running, $15k+/mo revenue | Operational playbook proven |
| Re-enable trial system | Vendor signup rate > 10/month | Trials accelerate conversion |
| Raise managed event fee | Demand exceeds capacity | Currently $75/vendor — could be $100-150 |

---

## Risk Factors

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Low vendor adoption | No supply → no buyers | In-person market visits, free tier is generous |
| Seasonal FM slowdown | Q4-Q1 revenue dip (winter) | FT + events are less seasonal; market boxes bridge gaps |
| FT competition (existing apps) | Vendors already on other platforms | Differentiate on events + local focus |
| Stripe fees eating margin | 2.9% + $0.30 is significant on small orders | Small order fee partially offsets; encourage larger orders |
| Single-admin bottleneck | You can't manage 5 markets alone | Hire before you're overwhelmed, not after |
| TX cottage food law changes | Could restrict online sales | Monitor TX legislature; diversify to FT/events |

---

## Vendor Value Proposition — How the App Helps Vendors Make More Money

### The Vendor's Core Question
*"You're taking 6.5% of my sales. Why would I use this?"*

The answer has to be grounded in real numbers. Below are scenarios for both FT operators and FM vendors showing net impact — including the platform fee as a cost, but also the new revenue the platform creates that they wouldn't have otherwise.

### Key Assumptions

| Factor | Value | Rationale |
|--------|-------|-----------|
| **Existing customer migration** | 5-15% of current customers start ordering through the app | Some regulars adopt the convenience; vendor still serves them in person too |
| **Platform fee on migrated sales** | 6.5% deducted | This is the "cost" of the app on existing business |
| **Net loss on migrated sales** | ~6.5% on 5-15% of revenue = 0.3-1.0% of total revenue | Small — most customers still pay at the truck/booth |
| **New customers from platform** | 10-30% incremental | Discovery via browse page, location search, event invitations |
| **Pre-order rate** | 20-40% of app orders | Buyers order ahead, vendor preps with certainty |
| **Food waste reduction (FT)** | 5-15% of current waste | Pre-orders = known demand. Average FT wastes 8-15% of prep |
| **No-show reduction (FM)** | Market box subs guarantee buyers | Weekly commitment, 4-week term |
| **Event revenue** | 100% incremental | Vendor wouldn't have been at the event without the platform |
| **Avg tip on app orders (FT)** | 15-20% | Digital payment increases tip rate vs cash (industry data: 15-18% digital vs 8-12% cash) |

---

### FOOD TRUCK OPERATOR SCENARIOS

#### Baseline: FT Operator WITHOUT the App

| Metric | Small Operator | Mid Operator | Established Operator |
|--------|---------------|-------------|---------------------|
| Weekly revenue | $2,000 | $4,500 | $8,000 |
| Monthly revenue | $8,000 | $18,000 | $32,000 |
| Locations served/week | 2-3 | 4-5 | 5-7 |
| Avg customers/day | 40-60 | 80-120 | 120-180 |
| Avg order value | $13.50 | $13.50 | $13.50 |
| Food waste (% of COGS) | 12% | 10% | 8% |
| COGS (% of revenue) | 35% | 32% | 30% |
| Monthly food waste ($) | $336 | $576 | $768 |
| Cash payment % | 40% | 35% | 25% |
| Avg tip (cash) | 10% | 10% | 10% |
| Avg tip (card/digital) | 17% | 17% | 17% |

#### FT Scenario 1: Small Operator + App (Free Tier)

| Impact Area | Calculation | Monthly $ |
|-------------|------------|----------|
| **COSTS (app-related)** | | |
| Migrated customer fee | 10% of $8,000 migrated × 6.5% | **($52)** |
| Subscription | Free tier | $0 |
| **Subtotal costs** | | **($52)** |
| | | |
| **NEW REVENUE** | | |
| New customers (discovery) | 15% incremental = $1,200 new sales | **+$1,200** |
| After platform fee on new sales | $1,200 × 93.5% (vendor keeps) | Net: **+$1,122** |
| Pre-order waste reduction | 25% of app orders pre-ordered → 8% waste reduction on those | **+$67** |
| Event revenue (1 event/month avg) | $500 gross × 93.5% | **+$468** |
| Higher tips (digital shift) | 10% of customers shift cash→digital: +7% tip on ~$800 | **+$56** |
| **Subtotal new revenue** | | **+$1,713** |
| | | |
| **NET IMPACT** | | **+$1,661/month** |
| **Annual impact** | | **+$19,932/year** |
| **ROI on platform fees** | $1,661 gained ÷ $130 in fees (total) | **12.8x return** |

#### FT Scenario 2: Mid Operator + App (Pro Tier, $25/mo)

| Impact Area | Calculation | Monthly $ |
|-------------|------------|----------|
| **COSTS** | | |
| Migrated customer fee | 12% of $18,000 × 6.5% | **($140)** |
| Subscription | Pro tier | **($25)** |
| **Subtotal costs** | | **($165)** |
| | | |
| **NEW REVENUE** | | |
| New customers (discovery + priority placement) | 20% incremental = $3,600 | Net after fee: **+$3,366** |
| Pre-order waste reduction | 30% pre-order rate → 10% waste cut | **+$162** |
| Events (2/month avg) | $1,000 gross × 93.5% | **+$935** |
| Chef Box subscriptions (3 active) | 3 × $35/week × 4 weeks × 87% (after 13% fee) | **+$366** |
| Higher tips | 15% of customers shift: +7% on $2,700 | **+$189** |
| **Subtotal new revenue** | | **+$5,018** |
| | | |
| **NET IMPACT** | | **+$4,853/month** |
| **Annual impact** | | **+$58,236/year** |
| **ROI** | $4,853 ÷ $399 fees | **12.2x return** |

#### FT Scenario 3: Established Operator + App (Boss Tier, $50/mo)

| Impact Area | Calculation | Monthly $ |
|-------------|------------|----------|
| **COSTS** | | |
| Migrated customer fee | 15% of $32,000 × 6.5% | **($312)** |
| Subscription | Boss tier | **($50)** |
| **Subtotal costs** | | **($362)** |
| | | |
| **NEW REVENUE** | | |
| New customers (full platform benefits) | 25% incremental = $8,000 | Net: **+$7,480** |
| Pre-order waste reduction | 35% pre-order, 12% waste cut | **+$403** |
| Events (3/month avg) | $1,500 gross × 93.5% | **+$1,403** |
| Chef Box subscriptions (6 active) | 6 × $40/week × 4 × 87% | **+$836** |
| Corporate recurring (1 weekly program) | $1,200/month gross × 93.5% | **+$1,122** |
| Higher tips | 20% shift: +7% on $6,400 | **+$448** |
| SMS/push notifications → fewer missed orders | 5% order recovery | **+$120** |
| **Subtotal new revenue** | | **+$11,812** |
| | | |
| **NET IMPACT** | | **+$11,450/month** |
| **Annual impact** | | **+$137,400/year** |
| **ROI** | $11,450 ÷ $674 fees | **17x return** |

#### FT Summary: What the Vendor Actually Sees

| Tier | Monthly Fee Cost | Total Platform Fees | New Revenue | Net Gain | ROI |
|------|-----------------|-------------------|-------------|----------|-----|
| Free | $0 | $130 | $1,713 | **+$1,661** | 12.8x |
| Pro ($25) | $25 | $399 | $5,018 | **+$4,853** | 12.2x |
| Boss ($50) | $50 | $674 | $11,812 | **+$11,450** | 17x |

**The pitch:** *"The app costs you about $130/month in fees. It brings you $1,700+ in new business you wouldn't have otherwise. That's a 13x return. And you keep 93.5 cents of every dollar — we just help more dollars find you."*

---

### FARMERS MARKET VENDOR SCENARIOS

#### Baseline: FM Vendor WITHOUT the App

| Metric | Cottage Food Startup | Established FM Vendor | Multi-Market Vendor |
|--------|---------------------|----------------------|-------------------|
| Markets attended/week | 1 | 2 | 3-4 |
| Weekly revenue | $400 | $1,200 | $3,000 |
| Monthly revenue | $1,600 | $4,800 | $12,000 |
| Avg transaction | $18 | $18 | $18 |
| Customers/market day | 15-25 | 30-50 | 50-80 |
| Unsold product waste | 15% | 10% | 8% |
| COGS (% of revenue) | 40% | 35% | 32% |
| Monthly waste ($) | $96 | $168 | $307 |
| Repeat customer rate | 30% | 50% | 60% |
| Cash payment % | 60% | 45% | 30% |

**FM-specific dynamics:**
- FM vendors often can't take digital payments easily at the booth (poor cell signal, line friction)
- Product is perishable — unsold inventory = lost money
- Market boxes solve the "bake too much / harvest too much" problem
- Events are purely incremental — cottage food vendors don't typically get invited to corporate events

#### FM Scenario 1: Cottage Food Startup + App (Free Tier)

| Impact Area | Calculation | Monthly $ |
|-------------|------------|----------|
| **COSTS** | | |
| Migrated customer fee | 5% of $1,600 × 6.5% | **($5)** |
| Subscription | Free tier | $0 |
| **Subtotal costs** | | **($5)** |
| | | |
| **NEW REVENUE** | | |
| New customers (discovery) | 12% incremental = $192 | Net: **+$180** |
| Pre-order waste reduction | 20% pre-ordered → 10% waste cut | **+$10** |
| Market Box (1 offering, 5 subs) | 5 × $30/week × 4 × 87% | **+$522** |
| Event revenue (1 every 2 months) | $200 gross × 93.5% ÷ 2 | **+$94** |
| **Subtotal new revenue** | | **+$806** |
| | | |
| **NET IMPACT** | | **+$801/month** |
| **Annual impact** | | **+$9,612/year** |
| **ROI** | $801 ÷ $17 fees | **47x return** |

**The market box is the game-changer for FM startups.** A cottage food vendor making $1,600/month who adds just 5 Market Box subscribers at $30/week suddenly has $600/month in guaranteed recurring revenue — a 37% revenue increase with zero customer acquisition cost after the first sale.

#### FM Scenario 2: Established FM Vendor + App (Free Tier)

| Impact Area | Calculation | Monthly $ |
|-------------|------------|----------|
| **COSTS** | | |
| Migrated customer fee | 8% of $4,800 × 6.5% | **($25)** |
| Subscription | Free tier | $0 |
| **Subtotal costs** | | **($25)** |
| | | |
| **NEW REVENUE** | | |
| New customers (discovery + browse page) | 18% incremental = $864 | Net: **+$808** |
| Pre-order waste reduction | 25% pre-ordered → 12% waste cut | **+$50** |
| Market Box (2 offerings, 15 total subs) | 15 × $32/week × 4 × 87% | **+$1,670** |
| Events (1/month) | $400 gross × 93.5% | **+$374** |
| Private pickup location revenue | New channel, $300/month incremental | Net: **+$281** |
| **Subtotal new revenue** | | **+$3,183** |
| | | |
| **NET IMPACT** | | **+$3,158/month** |
| **Annual impact** | | **+$37,896/year** |
| **ROI** | $3,158 ÷ $81 fees | **39x return** |

#### FM Scenario 3: Multi-Market Vendor + App (Pro Tier, $25/mo)

| Impact Area | Calculation | Monthly $ |
|-------------|------------|----------|
| **COSTS** | | |
| Migrated customer fee | 12% of $12,000 × 6.5% | **($94)** |
| Subscription | Pro tier | **($25)** |
| **Subtotal costs** | | **($119)** |
| | | |
| **NEW REVENUE** | | |
| New customers (priority + 5 markets) | 25% incremental = $3,000 | Net: **+$2,805** |
| Pre-order waste reduction | 30% pre-ordered → 15% waste cut | **+$138** |
| Market Box (4 offerings, 40 total subs) | 40 × $35/week × 4 × 87% | **+$4,872** |
| Events (2/month) | $800 gross × 93.5% | **+$748** |
| Private pickup locations (3) | $800/month incremental | Net: **+$748** |
| Seasonal subscription retention | Boxes keep revenue steady in slow months | **+$200** (winter avg) |
| **Subtotal new revenue** | | **+$9,511** |
| | | |
| **NET IMPACT** | | **+$9,392/month** |
| **Annual impact** | | **+$112,704/year** |
| **ROI** | $9,392 ÷ $337 fees | **28x return** |

#### FM Summary: What the Vendor Actually Sees

| Tier | Monthly Fees | New Revenue | Net Gain | ROI | Key Driver |
|------|-------------|-------------|----------|-----|-----------|
| Startup (Free) | $17 | $806 | **+$801** | 47x | Market Boxes |
| Established (Free) | $81 | $3,183 | **+$3,158** | 39x | Market Boxes + discovery |
| Multi-Market (Pro) | $337 | $9,511 | **+$9,392** | 28x | Boxes + events + locations |

**The pitch:** *"Your Market Box subscriptions alone will generate more new revenue in a month than you'll pay in platform fees all year. Five subscribers at $30/week = $600/month guaranteed — your baking and harvesting is pre-sold before market day."*

---

### The Real Cost of NOT Using the Platform

This is the flip side — what vendors lose by staying offline:

| What They Miss | FT Monthly Value | FM Monthly Value |
|---------------|-----------------|-----------------|
| Customers who search "food trucks near me" | $500-2,000 | $200-800 |
| Pre-orders (reduced waste) | $67-403 | $10-138 |
| Event invitations | $468-1,403 | $94-748 |
| Market Box/Chef Box recurring revenue | $0-836 | $522-4,872 |
| Corporate/recurring programs | $0-1,122 | N/A |
| Digital tip uplift | $56-448 | N/A |
| **Total missed opportunity** | **$1,091-6,212/mo** | **$826-6,558/mo** |

---

### Sensitivity Analysis — "What If the App Underperforms?"

Even in a worst case where the app delivers half the projected benefits:

| Vendor Type | Half-Performance Revenue | Platform Fees | Still Net Positive? |
|------------|------------------------|--------------|-------------------|
| FT Small (Free) | $857 | $130 | **Yes — +$727** |
| FT Mid (Pro) | $2,509 | $399 | **Yes — +$2,110** |
| FM Startup (Free) | $403 | $17 | **Yes — +$386** |
| FM Established (Free) | $1,592 | $81 | **Yes — +$1,511** |

**Even at 50% of projected performance, every vendor scenario is profitable.** The platform fee is so small relative to the new revenue channels (especially Market Boxes and events) that it's nearly impossible for a vendor to lose money using the app — as long as they actually list products and show up.

---

### What to Tell Vendors (Conversation Framework)

**For Food Trucks:**
> "Right now you're serving the people who happen to drive by. With the app, you're also reaching the people who are searching for food trucks from their desk at lunch. We bring you customers you'd never see otherwise — and you keep 93.5 cents of every dollar. The app pays for itself in about 3 days of new orders."

**For FM Vendors:**
> "How much product did you bring home from the market last week? What if that was pre-sold before you got there? Our Market Box subscriptions let your best customers commit to a weekly box — that's guaranteed revenue. Five subscribers at $30/week and your app fees are covered for the entire year in the first month."

**For the skeptic who says "I don't need an app":**
> "You're right — you don't need it to survive. But you're leaving $800-5,000 a month on the table. The vendors who ARE on the app are getting event invitations, pre-orders, and new customers from browse searches. The fee is 6.5% — that's less than what Square charges you to swipe a card, and we're not just processing payments, we're sending you customers."
