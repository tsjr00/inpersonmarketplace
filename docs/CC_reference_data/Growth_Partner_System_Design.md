# Growth Partner System — Design Sketch

**Status:** DRAFT — Decision pending
**Created:** 2026-03-06
**Related Files:**
- `docs/Regional_Franchise_Scaling_Plan.md` — Regional admin hierarchy (heavier model)
- `docs/Build_Instructions/Phase_P_Friends_and_Partners_Specification.md` — Friends & Partners directory
- `docs/CC_reference_data/Geographic_Expansion_Algorithm.md` — Market scoring & revenue projections
- `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx` — Interactive planning workbook

---

## The Core Question

Two viable paths to platform growth, each with different economics, speed, and sustainability profiles:

| | **Path A: Ecosystem Play** | **Path B: Regional Influencers** |
|---|---|---|
| **Who** | Market managers, park owners, ag extension offices, food truck associations, community orgs | Hustlers, salespeople, social media influencers, well-connected locals |
| **Motivation** | They already serve vendors — platform makes their job easier | Money — they earn a cut of what they bring in |
| **Cost to you** | Low ongoing (mostly platform value exchange) | Higher ongoing (revenue share payouts) |
| **Growth speed** | Slower but stickier — partners bring clusters of vendors at once | Faster individual signups — one vendor at a time |
| **Retention** | High — partner's own business depends on vendor success | Lower — partner moves on after earning, vendors may churn |
| **Scale** | Self-reinforcing: more vendors → more partner value → more partners | Linear: growth proportional to partner count and effort |
| **Risk** | Slow start; partners may not prioritize your platform | Over-paying for low-quality vendors; gaming; 1099 complexity |
| **Best for** | FM vertical (market managers control vendor access) | FT vertical (fragmented, no central gatekeepers) |

### The Honest Trade-off

**Ecosystem partners** are cheaper and stickier but harder to recruit and slower to activate. You're asking them to change their workflow for indirect benefit.

**Incentivized influencers** are faster and easier to activate but more expensive and less loyal. You're paying for attention, not alignment.

**The good news:** These aren't mutually exclusive. A well-designed system can support both under one umbrella with different compensation profiles.

---

## Hybrid Model: "Growth Partners"

A single system with two partner types that share infrastructure but have different compensation structures.

### Partner Types

#### Type 1: Ecosystem Partner
- Market managers, food truck park owners, ag extension agents, food truck associations
- They already have vendor relationships — they're gatekeepers
- **Value exchange:** Platform tools make their job easier (vendor management, scheduling, payments) + modest revenue share as a thank-you
- **Attribution:** Vendors are linked to partner at signup OR admin manually assigns
- **Compensation:** Lower ongoing % but potentially indefinite (as long as partner is active)
- **Example:** A farmers market manager signs up 15 vendors from their market. They get a small ongoing % of platform revenue from "their" vendors, plus access to market management tools

#### Type 2: Growth Ambassador
- Sales-oriented individuals, community connectors, influencers
- They actively recruit vendors through hustle and relationships
- **Value exchange:** Direct financial incentive — earn money for each vendor brought on
- **Compensation:** Higher per-vendor bonus + time-limited revenue share (12-24 months)
- **Attribution:** Partner code/link at vendor signup
- **Example:** A local foodie with 5K Instagram followers promotes the platform, shares their partner link, earns $25 per vendor who goes live + 15% of platform revenue from those vendors for 18 months

### Compensation Matrix (Strawman — All Numbers Are Placeholders)

| Component | Ecosystem Partner | Growth Ambassador |
|-----------|------------------|-------------------|
| **Signup bonus** | $0 (value is in the tools) | $25 per vendor who goes live |
| **Revenue share %** | 10% of platform's take | 15-20% of platform's take |
| **Revenue share duration** | Ongoing (while partner is active) | 18 months per vendor |
| **Revenue share base** | Platform fees from linked vendors | Platform fees from referred vendors |
| **Monthly cap** | $500/month | $1,500/month |
| **Annual cap** | $5,000/year | $15,000/year |
| **Minimum payout** | $25 (quarterly) | $25 (monthly) |
| **Qualification gate** | Vendor completes first sale | Vendor completes first sale |
| **W-9 required** | Yes, before first payout | Yes, before first payout |

#### What "% of platform's take" means in dollars

For context, using current fee structure (from `pricing.ts`):

```
$30 order, platform payment:
  Buyer fee:  $30 × 6.5% = $1.95
  Vendor fee: $30 × 6.5% = $1.95
  Flat fee:   $0.15
  Platform's take: $4.05

$30 order, external payment:
  Buyer fee:  $30 × 6.5% = $1.95
  Vendor fee: $30 × 3.5% = $1.05
  Flat fee:   $0.15
  Platform's take: $3.15
```

At 10% revenue share (ecosystem partner): $0.41 per $30 platform order
At 15% revenue share (growth ambassador): $0.61 per $30 platform order
At 20% revenue share (growth ambassador): $0.81 per $30 platform order

**Vendor doing 15 platform orders/week × $30 avg:**
- Platform earns: $60.75/week → $263/month
- Ecosystem partner (10%): $26.30/month per vendor
- Growth ambassador (15%): $39.45/month per vendor
- Growth ambassador (20%): $52.60/month per vendor

**If a partner brings 10 vendors at that activity level:**
- Ecosystem partner (10%): ~$263/month
- Growth ambassador (15%): ~$395/month
- Growth ambassador (20%): ~$526/month

These are steady-state numbers. Early months will be lower as vendors ramp up.

---

## How It Integrates With What You Already Have

```
EXISTING                           NEW
────────                           ───
vendor_leads table          →  Partner can be credited as lead source
vendor_referral_credits     →  Growth Partner system replaces/extends this for non-vendors
vendor_profiles.referral_code → Partners get their own partner_code (separate namespace)
Regional Franchise Plan     →  Phase 3 evolution — Growth Partners who prove themselves
                               could become Regional Admins
```

### Migration Path

```
TODAY:  Vendor referral ($10 credit, vendor-to-vendor only)
        Vendor leads (form capture, no attribution tracking)

PHASE 1: Growth Partner system (manual tracking, spreadsheet payouts)
          - Identify 3-5 partners
          - Track with shared spreadsheet or simple admin page
          - Manual Stripe transfers monthly
          - Validate economics before building

PHASE 2: Growth Partner system (in-platform)
          - Partner signup/onboarding flow
          - Partner dashboard (their vendors, revenue, earnings)
          - Automated attribution via partner codes
          - Admin dashboard (all partners, performance, payouts)
          - Automated payout calculation (manual Stripe transfer)

PHASE 3: Full automation + Regional Admin evolution
          - Automated Stripe payouts (Connect or manual transfers)
          - 1099 generation
          - Territory assignment (links to Regional Franchise Plan)
          - Performance tiers
          - Self-service partner portal
```

---

## Proposed Database Schema

Designed to support both partner types with shared infrastructure.

### New Tables

#### `growth_partners`
```sql
CREATE TABLE growth_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  user_id UUID REFERENCES auth.users(id),       -- nullable: partner may not have platform account yet
  vertical_id TEXT REFERENCES verticals(vertical_id),
  partner_type TEXT NOT NULL,                     -- 'ecosystem' | 'ambassador'

  -- Profile
  partner_code TEXT UNIQUE NOT NULL,              -- e.g., 'PARTNER-JANE' or 'AMB-MIKE-2026'
  display_name TEXT NOT NULL,                     -- person or org name
  email TEXT NOT NULL,
  phone TEXT,
  organization TEXT,                              -- market name, park name, org name
  role_description TEXT,                          -- 'Market Manager', 'Park Owner', 'Community Connector'
  region TEXT,                                    -- geographic area (free text for now, FK to regions later)

  -- Compensation config (per-partner, negotiable)
  compensation_config JSONB NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "signup_bonus_cents": 2500,          -- $25 per vendor who goes live
  --   "revenue_share_percent": 15,         -- 15% of platform's take
  --   "revenue_share_duration_months": 18, -- how long revenue share lasts per vendor
  --   "monthly_cap_cents": 150000,         -- $1,500/month
  --   "annual_cap_cents": 1500000,         -- $15,000/year
  --   "min_payout_cents": 2500,            -- $25 minimum to trigger payout
  --   "payout_frequency": "monthly"        -- 'monthly' | 'quarterly'
  -- }

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',          -- 'pending' | 'approved' | 'active' | 'suspended' | 'terminated'

  -- Tax compliance
  w9_collected BOOLEAN DEFAULT FALSE,
  w9_collected_at TIMESTAMPTZ,
  tax_id_last4 TEXT,                               -- last 4 of SSN/EIN for reference
  entity_type TEXT,                                 -- 'individual' | 'llc' | 'corp' | 'partnership'

  -- Agreement
  agreement_signed_at TIMESTAMPTZ,
  agreement_version TEXT,                           -- which version of partner agreement they signed

  -- Tracking
  notes TEXT,                                       -- admin notes
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_growth_partners_code ON growth_partners(partner_code);
CREATE INDEX idx_growth_partners_status ON growth_partners(status);
CREATE INDEX idx_growth_partners_vertical ON growth_partners(vertical_id);
```

#### `growth_partner_vendors`
Links partners to the vendors they brought on. This is the attribution table.

```sql
CREATE TABLE growth_partner_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  partner_id UUID NOT NULL REFERENCES growth_partners(id),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id),

  -- Attribution
  attribution_method TEXT NOT NULL,                -- 'partner_code' | 'manual_assign' | 'lead_conversion'
  attributed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Revenue share window
  revenue_share_starts_at TIMESTAMPTZ,             -- when vendor's first sale happens
  revenue_share_ends_at TIMESTAMPTZ,               -- starts_at + duration_months from partner config

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending',           -- 'pending' | 'qualified' | 'active' | 'expired' | 'revoked'
  -- pending:   vendor signed up but hasn't made first sale
  -- qualified: vendor made first sale → signup bonus triggered
  -- active:    revenue share window is open
  -- expired:   revenue share window closed (duration elapsed)
  -- revoked:   admin removed (fraud, vendor inactive, etc.)

  qualified_at TIMESTAMPTZ,                         -- when vendor made first sale
  expired_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  -- Signup bonus tracking
  signup_bonus_cents INTEGER DEFAULT 0,
  signup_bonus_paid BOOLEAN DEFAULT FALSE,
  signup_bonus_paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(partner_id, vendor_profile_id)
);

CREATE INDEX idx_gpv_partner ON growth_partner_vendors(partner_id);
CREATE INDEX idx_gpv_vendor ON growth_partner_vendors(vendor_profile_id);
CREATE INDEX idx_gpv_status ON growth_partner_vendors(status);
```

#### `growth_partner_earnings`
Ledger of all earnings — both signup bonuses and revenue share. One row per earning event.

```sql
CREATE TABLE growth_partner_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  partner_id UUID NOT NULL REFERENCES growth_partners(id),
  partner_vendor_id UUID REFERENCES growth_partner_vendors(id),  -- which vendor relationship generated this

  -- Earning details
  earning_type TEXT NOT NULL,                      -- 'signup_bonus' | 'revenue_share'
  amount_cents INTEGER NOT NULL,

  -- For revenue_share type: what transaction generated this
  order_item_id UUID REFERENCES order_items(id),
  platform_fee_cents INTEGER,                      -- total platform fee on this transaction
  revenue_share_percent NUMERIC(5,2),              -- % applied (snapshot at time of earning)

  -- For signup_bonus type: which vendor qualified
  -- (use partner_vendor_id above)

  -- Payout tracking
  payout_status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'approved' | 'paid' | 'voided'
  payout_batch_id TEXT,                             -- group earnings into payout batches
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,

  -- Period tracking (for caps)
  earning_month TEXT,                               -- '2026-03' for easy monthly cap queries
  earning_year INTEGER,                             -- 2026 for easy annual cap queries

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gpe_partner ON growth_partner_earnings(partner_id);
CREATE INDEX idx_gpe_status ON growth_partner_earnings(payout_status);
CREATE INDEX idx_gpe_month ON growth_partner_earnings(partner_id, earning_month);
CREATE INDEX idx_gpe_year ON growth_partner_earnings(partner_id, earning_year);
```

#### `growth_partner_payouts`
Actual money transfers to partners. Groups earnings into periodic payouts.

```sql
CREATE TABLE growth_partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  partner_id UUID NOT NULL REFERENCES growth_partners(id),

  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Amounts
  total_earnings_cents INTEGER NOT NULL,            -- sum of all earnings in period
  signup_bonus_cents INTEGER DEFAULT 0,             -- portion from signup bonuses
  revenue_share_cents INTEGER DEFAULT 0,            -- portion from revenue share

  -- Cap adjustments
  cap_adjustment_cents INTEGER DEFAULT 0,           -- amount reduced due to hitting cap
  net_payout_cents INTEGER NOT NULL,                -- total_earnings - cap_adjustment

  -- Payout execution
  status TEXT NOT NULL DEFAULT 'pending',            -- 'pending' | 'approved' | 'processing' | 'paid' | 'failed'
  payment_method TEXT,                               -- 'stripe_transfer' | 'check' | 'manual'
  stripe_transfer_id TEXT,                           -- Stripe transfer ID if applicable

  -- Admin
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gpp_partner ON growth_partner_payouts(partner_id);
CREATE INDEX idx_gpp_status ON growth_partner_payouts(status);
CREATE INDEX idx_gpp_period ON growth_partner_payouts(period_start, period_end);
```

### Schema Relationship Diagram

```
growth_partners
  │
  ├── growth_partner_vendors (1:many — which vendors they brought)
  │     │
  │     └── vendor_profiles (FK — the actual vendor)
  │
  ├── growth_partner_earnings (1:many — individual earning events)
  │     │
  │     ├── order_items (FK — for revenue_share type)
  │     └── growth_partner_vendors (FK — which vendor relationship)
  │
  └── growth_partner_payouts (1:many — periodic payout batches)


Existing tables touched:
  vendor_profiles — add: growth_partner_id (UUID, nullable)
                         growth_partner_code_used (TEXT, nullable)
  vendor_leads    — add: growth_partner_id (UUID, nullable)
```

---

## Feature Set by Phase

### Phase 1: Manual Validation (No Code)

**Goal:** Test the model with 3-5 partners before writing any code.

**Tools:**
- Shared spreadsheet tracking partner → vendor → revenue
- Manual Stripe transfers (monthly or quarterly)
- W-9 collected via email/DocuSign
- Partner codes = just a note in `vendor_leads.notes` or `vendor_profiles` admin notes

**Success criteria before moving to Phase 2:**
- [ ] At least 3 partners actively referring vendors
- [ ] At least 10 vendors attributed to partners
- [ ] Revenue share economics validated (are you paying out less than you're earning?)
- [ ] Partner satisfaction — do they feel fairly compensated?
- [ ] Vendor quality — are partner-referred vendors as active as organic ones?

### Phase 2: In-Platform MVP

**Partner Onboarding:**
- Admin-only creation (no self-service signup yet)
- Collect: name, email, phone, org, role, region, partner type
- Generate unique partner code
- Set compensation config per partner
- W-9 upload/tracking

**Partner Dashboard (`/{vertical}/partner/dashboard`):**
- Summary cards: Total Vendors Referred | Active Vendors | Monthly Earnings | Lifetime Earnings
- Vendor list: name, signup date, status, first sale date, revenue generated, your earnings
- Shareable referral link with copy button: `/{vertical}/vendor-signup?partner={code}`
- Earning history: date, type, amount, status
- Payout history: period, amount, status, payment date

**Vendor Signup Integration:**
- `?partner={code}` query param captured at signup
- Stored on `vendor_profiles.growth_partner_code_used`
- Creates `growth_partner_vendors` record (status: pending)
- On vendor's first completed sale → status: qualified → signup bonus created

**Revenue Share Calculation (Cron or Webhook):**
- On each completed order item where vendor has an active partner attribution:
  1. Calculate platform fee for this transaction
  2. Look up partner's `revenue_share_percent`
  3. Check if vendor's revenue share window is still open
  4. Check if partner has hit monthly/annual cap
  5. Create `growth_partner_earnings` record
- Run payout calculation monthly: sum pending earnings → create payout record

**Admin Dashboard (`/{vertical}/admin/growth-partners`):**
- Partner list: name, type, status, vendor count, monthly earnings
- Partner detail: full profile, compensation config, vendor list, earnings, payouts
- Payout approval queue: review and approve pending payouts
- Performance metrics: partner ROI (revenue generated vs paid out)

### Phase 3: Full Automation + Scale

- Partner self-service signup with approval flow
- Automated Stripe Connect payouts (partners connect bank account)
- 1099-NEC generation (annual, for partners earning $2,000+)
- Performance tiers (Bronze/Silver/Gold with increasing revenue share %)
- Territory assignment (links to Regional Franchise Plan)
- Partner marketing toolkit (branded flyers, social media assets)
- Partner leaderboard
- Automated cap enforcement and notifications

---

## Ecosystem Partner vs Growth Ambassador: Detailed Comparison

### Ecosystem Partner (Market Manager Example)

```
SCENARIO: Jane manages Riverside Farmers Market (25 vendors)

Jane signs up as ecosystem partner
  → Partner code: ECO-RIVERSIDE-FM
  → Compensation: 10% revenue share, ongoing, $500/mo cap

Jane invites her 25 market vendors to the platform
  → 15 sign up using her partner link
  → 12 make their first sale within 30 days
  → 3 are still pending

Monthly activity (12 active vendors):
  → Avg vendor does 12 orders/week × $28 avg = $336/week GMV
  → Platform take (blended 12.1%): $40.66/week per vendor
  → Jane's 10% share: $4.07/week per vendor
  → Jane's monthly earnings: $4.07 × 4.33 × 12 = ~$211/month

Cost to platform: $211/month
Revenue from Jane's vendors: $2,113/month
Platform net: $1,902/month
Jane's ROI: 10:1 (you earn $10 for every $1 you pay Jane)

Jane's motivation: The platform helps her manage her market.
  Vendor payments, scheduling, and order tracking make her job easier.
  The revenue share is a bonus, not the primary draw.
```

### Growth Ambassador (Community Connector Example)

```
SCENARIO: Mike is a local foodie with connections to food truck owners

Mike signs up as growth ambassador
  → Partner code: AMB-MIKE-2026
  → Compensation: $25 signup bonus + 15% revenue share for 18 months, $1,500/mo cap

Mike recruits food truck owners one at a time
  → Month 1: Signs up 4 vendors (3 qualify)
  → Month 2: Signs up 3 vendors (2 qualify)
  → Month 3: Signs up 2 vendors (2 qualify)
  → Total: 7 qualified vendors after 3 months

Signup bonuses: 7 × $25 = $175

Monthly activity (7 active FT vendors, month 4+):
  → Avg vendor does 20 orders/week × $13 avg = $260/week GMV
  → Platform take (blended 12.55%): $32.63/week per vendor
  → Mike's 15% share: $4.89/week per vendor
  → Mike's monthly earnings: $4.89 × 4.33 × 7 = ~$148/month + declining signup bonuses

Cost to platform (month 4): $148/month + bonuses from new signups
Revenue from Mike's vendors: $989/month
Platform net: $841/month
Mike's ROI: ~6:1

Mike's motivation: Money. When the revenue share expires (18 months),
  Mike may stop recruiting unless he's earned enough to stay engaged.
  But the vendors he brought are now on the platform and (hopefully) sticky.
```

### Side-by-Side Economics

| Metric | Ecosystem (Jane) | Ambassador (Mike) |
|--------|------------------|-------------------|
| Vendors brought (90 days) | 12 (cluster) | 7 (one-by-one) |
| Monthly platform revenue | $2,113 | $989 |
| Monthly partner cost | $211 | $148 + bonuses |
| Platform net | $1,902 | $841 |
| Partner ROI | 10:1 | 6:1 |
| Revenue share duration | Ongoing | 18 months |
| Total 18-month partner cost | $3,798 | $2,664 + $175 bonuses |
| Vendor retention risk | Low (market community) | Higher (no anchor) |
| Recruitment effort | One conversation (market manager) | 7+ individual pitches |

**Takeaway:** Ecosystem partners are more efficient per dollar but harder to find. Growth ambassadors are easier to activate but less efficient. A healthy program probably has both.

---

## Fraud Prevention & Guardrails

| Risk | Prevention |
|------|------------|
| **Self-referral** | Partner can't also be a vendor in their own attribution chain |
| **Fake vendor signups** | Qualification gate: vendor must make first real sale (actual payment processed) |
| **Vendor goes inactive after qualifying** | Revenue share only accrues on actual transactions; inactive vendor = $0 earnings |
| **Partner gaming with friends** | Monitor vendor quality metrics: GMV per vendor, order frequency, customer ratings |
| **Exceeding caps** | Enforce monthly/annual caps in earning calculation; cap-hit notification to admin |
| **Partner leaves, vendors stay** | Revenue share has end date (ambassador) or requires partner to remain active (ecosystem) |
| **Disputed attribution** | Audit trail: partner_code captured at signup, timestamped, immutable |
| **Multiple partners claiming same vendor** | First-touch attribution: whoever's code was used at signup gets credit. One partner per vendor. |

### Clawback Provisions

Revenue share earnings can be voided if:
- Vendor's transaction is refunded or charged back
- Vendor is terminated for fraud or TOS violation
- Partner violated agreement terms
- Attribution was fraudulent (self-referral, fake accounts)

---

## Legal & Tax Considerations

### Partner Agreement (Separate from Vendor Agreement)

The partner agreement should cover:
- Independent contractor status (not employee, not franchisee)
- Revenue share terms, caps, and duration
- Termination conditions (either party, with/without cause)
- Confidentiality (platform revenue data, vendor lists, growth strategies)
- Non-solicitation (can't poach vendors to competing platforms)
- IP ownership (platform owns all tools, data, and relationships)
- Dispute resolution
- Tax responsibility (partner is responsible for own taxes)

**Important:** This is NOT a franchise agreement. No territory exclusivity, no franchise fee, no required investment. This distinction matters legally — franchise regulations are complex and state-specific. The Growth Partner model intentionally avoids franchise territory by:
- No exclusive territories
- No required purchase of goods/services from platform
- No significant upfront investment required
- Partner can work with competitors (non-exclusive)
- No use of platform's trademark in partner's business name

### 1099-NEC Compliance

**2026 threshold:** $2,000 per calendar year triggers 1099-NEC filing
**Requirements:**
1. Collect W-9 (name, address, SSN/EIN) before first payout
2. Track cumulative annual payments per partner
3. File 1099-NEC by January 31 of following year for partners earning $2,000+
4. Provide copy to partner by January 31

**Implementation:** W-9 collection at onboarding. Annual payment totals tracked in `growth_partner_payouts`. 1099 generation can be manual for first year (few partners), automated later.

---

## Open Decisions (For You)

### Strategic
- [ ] **Start with which type?** Ecosystem partners (market managers) or growth ambassadors (hustlers) or both?
- [ ] **FM first or FT first or both?** FM has natural ecosystem partners (market managers). FT might need ambassadors more.
- [ ] **How many partners to start?** Recommend 3-5 for Phase 1 validation
- [ ] **Revenue share base:** % of platform's take (recommended — sustainable) vs % of GMV (more attractive but eats margin)

### Compensation
- [ ] **Signup bonus amount:** $0 / $15 / $25 / $50 per qualified vendor?
- [ ] **Revenue share %:** 10% / 15% / 20% of platform's take?
- [ ] **Duration:** 12 / 18 / 24 months per vendor? Or ongoing for ecosystem partners?
- [ ] **Caps:** Monthly ($500 / $1,000 / $1,500 / $2,000)? Annual?
- [ ] **Minimum payout:** $25 / $50?
- [ ] **Payout frequency:** Monthly / quarterly?

### Operational
- [ ] **Attribution method:** Partner code at signup only? Or also allow admin manual assignment?
- [ ] **Phase 1 tracking:** Spreadsheet or simple admin page?
- [ ] **Payout method:** Manual Stripe transfer / check / Stripe Connect?
- [ ] **W-9 collection:** Email/DocuSign or in-platform upload?

### Legal
- [ ] **Partner agreement draft:** Need attorney review?
- [ ] **Franchise law review:** Confirm Growth Partner model doesn't trigger franchise regulations
- [ ] **Non-compete scope:** How narrow/broad?

---

## Relationship to Regional Franchise Plan

The Growth Partner system is designed as a **stepping stone** to the Regional Admin model:

```
Growth Partner (Phase 1-2)          Regional Admin (Phase 3+)
─────────────────────────           ──────────────────────────
No territory exclusivity      →     Exclusive territory
Revenue share only            →     Revenue share + management tools
No franchise agreement        →     Franchise agreement (with attorney)
Simple partner dashboard      →     Full admin dashboard
Manual payouts                →     Automated Stripe Connect
No vendor management          →     Vendor approval/support authority
No hierarchy                  →     Regional → State → Vertical hierarchy
```

A Growth Partner who proves themselves — brings 20+ vendors, maintains quality, stays engaged — is a natural candidate to become a Regional Admin when you're ready to formalize territories.

The database schema is designed with this evolution in mind:
- `growth_partners.partner_type` can be extended to include `'regional_admin'`
- `growth_partners.compensation_config` is flexible JSONB — can hold franchise terms
- `growth_partners.region` is free text now, FK to `regions` table later
- `growth_partner_vendors` attribution chain is preserved regardless of partner tier

---

## Implementation Estimate

| Phase | Effort | Prerequisites |
|-------|--------|---------------|
| **Phase 1 (manual)** | 0 dev time | Identify partners, create spreadsheet, draft agreement |
| **Phase 2 (MVP)** | 2-3 sessions | Migration + partner dashboard + admin UI + signup integration + earning calculation |
| **Phase 3 (automation)** | 3-5 sessions | Stripe Connect payouts + 1099 + self-service signup + performance tiers |

Phase 2 builds heavily on existing patterns:
- Partner dashboard mirrors vendor referral page structure
- Admin UI mirrors vendor-activity admin page
- Earning calculation mirrors vendor payout webhook logic
- Attribution mirrors existing `referred_by_vendor_id` pattern
