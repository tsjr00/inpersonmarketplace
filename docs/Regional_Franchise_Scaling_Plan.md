# Regional Franchise Scaling Plan

## Document Status
- **Created:** 2026-02-06
- **Status:** Planning / Draft
- **Owner:** Platform Admin
- **Last Updated:** 2026-02-06

---

## 1. Vision

Scale the marketplace nationally by dividing states into geographic regions and
selling micro-franchise licenses to local operators. Each regional admin manages
vendor onboarding, market relationships, buyer support, and local partnerships
within their territory. Revenue from transactions at markets within their region
flows through a tiered split structure.

**Why this model works for local commerce:**
- Marketplace businesses require vendor AND buyer density in the same geography
- Local operators understand their community's culture, vendors, and market scene
- Face-to-face commerce needs a face-to-face relationship builder
- Central operations can't scale relationship management nationally
- Regional admins are incentivized by revenue, not salary — aligns their success with platform success

---

## 2. Admin Hierarchy

```
Platform Admin (you)
  └── Vertical Admin (one per vertical — farmers_market, fireworks, etc.)
        └── State Admin (one per state, must also be a regional admin)
              └── Regional Admin (one per region — the micro-franchise operator)
```

### Role Responsibilities

| Role | Scope | Responsibilities | Revenue |
|------|-------|------------------|---------|
| **Platform Admin** | All verticals, all states | Tech, strategy, legal, platform-wide policy, billing | Platform's share of all transactions |
| **Vertical Admin** | All states within one vertical | Vertical strategy, state admin recruitment/training, vertical-wide quality standards, escalation point | Small % of vertical-wide revenue (TBD) |
| **State Admin** | All regions within one state | Regional admin recruitment/training, state-level partnerships, escalation point, must also manage their own region | State-level override % + their own regional share |
| **Regional Admin** | One region (set of contiguous zip codes/counties) | Vendor onboarding, market relationships, buyer support, local marketing, quality control | Majority share of transactional revenue in their region |

### Role Requirements

**Regional Admin:**
- Must live in or near their region
- Basic training on the platform (vendor onboarding, order flow, dispute resolution)
- Agree to franchise terms (territory exclusivity, performance minimums, brand standards)
- No technical skills required — all tools are in-app

**State Admin:**
- Must also be a regional admin (manages their own region)
- Deeper training: admin dashboard, financial reporting, escalation handling
- Responsible for recruiting and supporting regional admins in their state
- Point of contact for state-level regulatory issues (cottage food laws, market regulations)

**Vertical Admin:**
- Deep understanding of the vertical's market dynamics
- Manages state admin relationships
- Sets vertical-wide policies (categories, pricing guidelines, quality standards)
- May or may not manage a region directly

**Platform Admin:**
- Technical operations, infrastructure, security
- Financial oversight, Stripe configuration, payout management
- Legal compliance, franchise agreements
- Platform-wide feature development and roadmap

### Escalation Chain

```
Buyer/Vendor Issue
  → Regional Admin (first response, most issues resolved here)
    → State Admin (if regional admin can't resolve, or involves multiple regions)
      → Vertical Admin (policy questions, cross-state issues)
        → Platform Admin (technical issues, legal, security, financial)
```

---

## 3. Regional Territory Design

### Principles
- Each region contains contiguous zip codes and whole counties
- Regions are roughly equal by population (not geography — rural regions are larger)
- Every zip code in a state belongs to exactly one region
- Region boundaries follow county lines where possible (easier to explain)
- Metropolitan areas may be split into multiple regions (e.g., DFW could be 2-3 regions)

### Texas Example (reference model)
- ~20 regions covering the entire state
- Population target: ~1.2-1.8 million per region
- Major metros split: Houston (2-3 regions), DFW (2-3 regions), Austin/San Antonio (1-2 each)
- Rural areas consolidated: West Texas, Panhandle, East Texas (larger geography, smaller population)

### Territory Data Structure

The `zip_codes` table already has a `region_code` field (e.g., 'TX-CENTRAL', 'TX-GULF').
The `get_region_zip_codes()` function already returns all zip codes for a region.

What's needed:

```
regions table
├── id (UUID)
├── region_code (VARCHAR, unique per vertical) — e.g., 'TX-CENTRAL-FM'
├── vertical_id (TEXT, FK)
├── name (TEXT) — e.g., 'Central Texas'
├── state (VARCHAR 2) — e.g., 'TX'
├── description (TEXT) — what's included
├── zip_codes (TEXT[]) — authoritative list of zip codes in this region
├── counties (TEXT[]) — human-readable county list
├── center_lat (DECIMAL) — geographic center for map display
├── center_lng (DECIMAL)
├── population (INTEGER) — estimated total population
├── status (TEXT) — 'available', 'assigned', 'suspended'
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

```
region_admins table
├── id (UUID)
├── region_id (UUID, FK → regions)
├── user_id (UUID, FK → user_profiles)
├── role_level (TEXT) — 'regional_admin', 'state_admin'
├── revenue_split_config (JSONB) — their specific split terms
├── status (TEXT) — 'active', 'suspended', 'terminated'
├── onboarded_at (TIMESTAMPTZ)
├── agreement_signed_at (TIMESTAMPTZ) — franchise agreement date
├── performance_review_at (TIMESTAMPTZ) — last review
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

---

## 4. Revenue Model

### Transaction Flow

The platform collects fees from BOTH sides of every transaction:
- **Buyer pays:** base price + 6.5% + $0.15 flat fee
- **Vendor pays:** 6.5% + $0.15 deducted from their payout
- **Total platform revenue:** 13% + $0.30 per order (on Stripe transactions)

External payment transactions: vendor fee is 3.5% instead of 6.5%.

```
Buyer purchases $30.00 item (Stripe payment):
  → Buyer pays:  $30.00 + $1.95 (6.5%) + $0.15 flat = $32.10
  → Vendor gets: $30.00 - $1.95 (6.5%) - $0.15 flat = $27.90
  → Platform fee total: $4.20 (buyer $2.10 + vendor $2.10)
  → Platform fee ($4.20) is split:
      ├── Regional Admin:  60% = $2.52
      ├── State Admin:      5% = $0.21
      ├── Vertical Admin:   5% = $0.21
      └── Platform:        30% = $1.26
```

```
Same $30.00 item (external/cash payment):
  → Buyer pays:  $30.00 + $1.95 (6.5%) + $0.15 flat = $32.10
  → Vendor pays: $1.05 (3.5%) + $0.15 flat = $1.20 (added to fee balance)
  → Platform fee total: $3.30 (buyer $2.10 + vendor $1.20)
  → Split applies to the $3.30
```

Source of truth: `src/lib/pricing.ts` — FEES object defines all rates.

### Revenue Split Configuration

Splits are configurable per region and stored in `revenue_split_config` JSONB:

```json
{
  "regional_admin_percent": 60,
  "state_admin_percent": 5,
  "vertical_admin_percent": 5,
  "platform_percent": 30,
  "cap_monthly_cents": 200000,
  "cap_annual_cents": 2000000,
  "effective_date": "2026-06-01",
  "notes": "Standard franchise terms"
}
```

**IMPORTANT:** Splits must always sum to 100%.

### Revenue Tracking

```
region_revenue_ledger table
├── id (UUID)
├── region_id (UUID, FK → regions)
├── order_item_id (UUID, FK → order_items)
├── market_id (UUID, FK → markets) — pickup location that triggered this
├── transaction_date (TIMESTAMPTZ)
├── platform_fee_cents (INTEGER) — total platform fee on this item
├── regional_admin_cents (INTEGER) — regional admin's share
├── state_admin_cents (INTEGER) — state admin's share
├── vertical_admin_cents (INTEGER) — vertical admin's share
├── platform_cents (INTEGER) — platform's share
├── regional_admin_user_id (UUID) — snapshot of who was admin at time of transaction
├── state_admin_user_id (UUID)
├── payout_status (TEXT) — 'pending', 'approved', 'paid', 'disputed'
├── payout_id (UUID, FK → nullable, links to payout record)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### Cap Structure

| Cap Type | Amount | Purpose |
|----------|--------|---------|
| Monthly per region | $2,000 | Prevents outsized payouts in high-volume regions |
| Annual per region | $20,000 | Annual ceiling |
| Minimum activity | TBD | If a regional admin isn't meeting minimums, territory can be reassigned |

*Note: Cap amounts are placeholder — adjust based on actual transaction volume data.*

### Earnings Projections (per region)

Platform fee varies by payment method:

| Payment Type | Buyer Fee | Vendor Fee | Platform Total | Prevalence (est.) |
|---|---|---|---|---|
| Stripe (card) | 6.5% + $0.15 | 6.5% + $0.15 | 13% + $0.30 | ~40% of transactions |
| External (Venmo/CashApp/PayPal/Cash) | 6.5% | 3.5% | 10% | ~60% of transactions |

Source: `src/lib/pricing.ts` (Stripe) and `src/lib/payments/vendor-fees.ts` (external)

**Blended rate calculation** (assuming 40/60 Stripe/external split):
- Stripe: $30 order → $4.20 platform fee
- External: $30 order → $3.00 platform fee
- Blended: (0.4 × $4.20) + (0.6 × $3.00) = **$3.48 avg platform fee per $30 order**

| Scenario | Orders/Week | Avg Order | Blended Fee/Order | Regional Admin (60%) | Regional/Month |
|----------|------------|-----------|-------------------|---------------------|----------------|
| Early stage | 50 | $25 | $2.90 | $1.74 | $348 |
| Growing | 200 | $30 | $3.48 | $2.09 | $1,672 |
| Mature | 500 | $35 | $4.06 | $2.00 (capped) | $2,000 (capped) |

**Important: The Stripe/external split will vary by region and over time.**
- Farmers markets traditionally skew heavily toward cash/Venmo
- As the platform matures, Stripe share may increase (convenience, buyer protection)
- Some vendors may exclusively use external methods
- The external vendor fee (3.5%) is collected via the `vendor_fee_ledger` system —
  recorded as a balance owed, auto-deducted from future Stripe payouts (max 50%
  of payout), or invoiced when balance hits $50 or 40 days old

**Revenue split applies to ALL platform fees regardless of payment method.**
The collection timing differs (Stripe = instant, external = deferred), but the
regional admin's share is calculated the same way. Payout timing for regional
admins should account for this — external fee collection can lag.

At the "early stage" (~50 orders/week), the regional admin earns ~$350/month.
The cap kicks in around ~230 orders/week with the blended rate.

### Market Manager Integration

The market manager revenue sharing concept (discussed separately) fits naturally here:
- If a regional admin IS also a market manager, their revenue comes from the regional split
- If a market manager is NOT a regional admin, they can earn a smaller per-transaction
  amount for orders picked up at their specific market
- These are separate revenue streams that don't conflict

---

## 5. How Region Assignment Works (Attribution)

**No codes. No friction. Automatic.**

The attribution chain already exists in the data:

```
Order Item
  → has market_id (pickup location)
    → market has zip code
      → zip code belongs to a region
        → region has a regional admin
          → regional admin earns their split
```

This means:
- Vendors don't need to enter codes or choose a regional admin
- Buyers don't know or care about regions
- Revenue flows automatically based on WHERE the pickup happens
- If a vendor sells at markets in multiple regions, each region's admin earns on
  the transactions at their market

### Edge Cases

| Situation | Resolution |
|-----------|------------|
| Market's zip code isn't assigned to any region | Revenue stays 100% with platform until region is assigned |
| Region has no admin (vacant territory) | Revenue stays with platform; territory is "available" |
| Admin is suspended/terminated | Revenue pauses; territory marked for reassignment |
| Vendor sells at markets in multiple regions | Each region's admin earns on transactions at their own markets |
| Market sits on a region boundary | Market's zip code determines the region (single assignment) |
| Region admin disputes attribution | Transaction log shows market → zip → region chain; auditable |

---

## 6. Security Model

### Principle: Least Privilege by Default

Each admin level can ONLY see data within their scope. This is enforced at the
database level via RLS, not just in the UI.

### Access Matrix

| Data | Regional Admin | State Admin | Vertical Admin | Platform Admin |
|------|---------------|-------------|----------------|----------------|
| Vendors in their region | Read + manage | Read all regions in state | Read all in vertical | Full access |
| Vendors in other regions | No access | Only their state | Only their vertical | Full access |
| Orders in their region | Read (support) | Read all in state | Read all in vertical | Full access |
| Revenue data (own) | Read own earnings | Read own + regional rollups | Read vertical rollups | Full access |
| Revenue data (others) | No access | No access | No access | Full access |
| Buyer PII | Limited (name, order context) | Same as regional | Same as regional | Full access |
| Financial details (Stripe) | No access | No access | No access | Full access |
| Admin management | No access | Manage regional admins in state | Manage state admins | Full access |
| Platform settings | No access | No access | No access | Full access |

### Data Isolation Enforcement

```sql
-- Example: Regional admin can only see vendors at markets in their region
CREATE POLICY "regional_admin_vendor_access" ON vendor_profiles
  FOR SELECT USING (
    -- Regular user access (own profile)
    user_id = (SELECT auth.uid())
    OR
    -- Regional admin: vendors who have listings at markets in their region
    EXISTS (
      SELECT 1 FROM region_admins ra
      JOIN regions r ON r.id = ra.region_id
      JOIN markets m ON m.zip = ANY(r.zip_codes)
      JOIN listing_markets lm ON lm.market_id = m.id
      JOIN listings l ON l.id = lm.listing_id
      WHERE ra.user_id = (SELECT auth.uid())
        AND ra.status = 'active'
        AND l.vendor_profile_id = vendor_profiles.id
    )
    OR
    -- Existing vertical/platform admin access
    is_vertical_admin(vertical_id)
    OR is_platform_admin()
  );
```

### Security Concerns at Scale

| Risk | Mitigation |
|------|------------|
| Regional admin exports vendor database then leaves | Audit logging on all data exports; no bulk export for regional admins; watermarked reports |
| Regional admin creates fake orders for revenue | All orders require Stripe payment; revenue only on fulfilled orders; anomaly detection |
| Terminated admin retains access | Immediate access revocation on status change; RLS enforced at DB level |
| Admin account compromise | MFA required for all admin levels; session timeout; IP logging |
| Cross-region data leakage | RLS policies tested with automated checks; no client-side-only access control |
| Revenue manipulation | Immutable ledger entries; platform admin approval for payouts above threshold |
| Collusion between admin and vendor | Revenue caps limit exposure; periodic audits; anonymous vendor feedback |

### Audit Trail

Every admin action should be logged:

```
admin_audit_log table
├── id (UUID)
├── admin_user_id (UUID)
├── admin_role_level (TEXT)
├── region_id (UUID, nullable)
├── action (TEXT) — 'vendor_approved', 'order_viewed', 'payout_requested', etc.
├── target_type (TEXT) — 'vendor', 'order', 'market', etc.
├── target_id (UUID)
├── metadata (JSONB) — action-specific details
├── ip_address (TEXT)
├── created_at (TIMESTAMPTZ)
```

---

## 7. Technical Architecture

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `zip_codes` table with `region_code` | Built | 33k+ US zip codes with lat/lng, county, region_code field |
| `get_region_zip_codes()` function | Built | Returns all zips for a region code |
| Vertical admin RLS (14 tables) | Built | Pattern to follow for regional scoping |
| `vertical_admins` table with `is_chief` | Built | Model for admin hierarchy |
| `is_platform_admin()`, `is_vertical_admin()` | Built | Helper functions pattern |
| Admin dashboard (platform + vertical) | Built | UI pattern to extend |
| Markets with geographic fields | Built | lat/lng/city/state/zip on markets |

### What Needs to Be Built

#### Phase 1: Foundation (no revenue, no payouts)
*Goal: Define regions, assign admins, scope their access*

1. **Migration: `regions` table**
   - Region definitions with zip code arrays
   - Populate Texas regions from existing division data

2. **Migration: `region_admins` table**
   - Admin assignments with role levels
   - Revenue split configuration (stored, not yet used)

3. **Migration: Helper functions**
   - `is_regional_admin(region_id)` — check if user is admin for a region
   - `is_state_admin(state)` — check if user is state admin
   - `get_user_regions(user_id)` — get all regions a user administers
   - `get_region_for_zip(zip)` — look up which region a zip code belongs to
   - `get_region_for_market(market_id)` — look up which region a market is in

4. **RLS policies for regional scoping**
   - Extend vendor_profiles, listings, orders, markets policies
   - Follow existing vertical admin RLS pattern

5. **Regional admin dashboard page**
   - `/:vertical/region-admin/` — region-specific metrics
   - Vendor count, order volume, active markets in region
   - Similar layout to existing vertical admin dashboard

6. **Admin management pages**
   - Platform admin can create regions and assign regional admins
   - State admin can view/manage regional admins in their state

#### Phase 2: Revenue Tracking (track, don't pay)
*Goal: Record what each admin WOULD earn so you have real data*

7. **Migration: `region_revenue_ledger` table**
   - Per-transaction revenue split records

8. **Revenue calculation in checkout/success**
   - After order fulfillment, look up market → zip → region → admin
   - Calculate split percentages
   - Insert ledger entry
   - No payouts — just tracking

9. **Earnings dashboard for regional admins**
   - Show accumulated earnings, transaction history
   - "Your earnings this month: $XXX (payouts coming soon)"

10. **Platform admin: revenue overview**
    - Revenue by region, by state, by vertical
    - Identify high-performing and underperforming regions

#### Phase 3: Payouts (money moves)
*Goal: Automated or semi-automated revenue sharing*

11. **Payout system**
    - Option A: Manual Stripe transfers (admin approves, clicks "pay")
    - Option B: Automated monthly Stripe Connect transfers
    - Cap enforcement (monthly/annual)

12. **Regional admin Stripe onboarding**
    - Regional admins connect their bank account via Stripe Connect
    - Same onboarding flow vendors already use

13. **Payout history and reporting**
    - Tax-relevant reporting (1099 threshold tracking)
    - Downloadable statements

#### Phase 4: Self-Service and Scale
*Goal: Regional admins can largely self-manage*

14. **Regional admin onboarding flow**
    - Application → review → training materials → territory assignment → go live

15. **Performance dashboards**
    - KPIs: vendor count, active vendors, order volume, buyer growth
    - Comparison to other regions (anonymized)
    - Minimum performance thresholds

16. **Territory management tools (platform admin)**
    - Map view of all regions with status
    - Reassign territories
    - Split/merge regions as needed

---

## 8. Database Changes Summary

### New Tables

| Table | Purpose | Phase |
|-------|---------|-------|
| `regions` | Territory definitions (zip codes, state, status) | 1 |
| `region_admins` | Admin assignments and revenue config | 1 |
| `region_revenue_ledger` | Per-transaction revenue split tracking | 2 |
| `region_payouts` | Payout records and status | 3 |
| `admin_audit_log` | Admin action audit trail | 1 |

### Modified Tables

| Table | Change | Phase |
|-------|--------|-------|
| `zip_codes` | Populate `region_code` for Texas (already has the column) | 1 |
| `user_profiles` | Add 'regional_admin', 'state_admin' to roles | 1 |

### New Functions

| Function | Purpose | Phase |
|----------|---------|-------|
| `is_regional_admin(region_id)` | RLS helper | 1 |
| `is_state_admin(state)` | RLS helper | 1 |
| `get_user_regions(user_id)` | Get admin's regions | 1 |
| `get_region_for_market(market_id)` | Attribution lookup | 2 |
| `calculate_revenue_split(order_item_id)` | Split calculation | 2 |

---

## 9. Legal Considerations

### Franchise Law

**This model likely qualifies as a franchise in most states.**

The FTC Franchise Rule applies when three conditions are met:
1. The franchisee uses the franchisor's trademark/brand — **Yes** (Farmers Marketing brand)
2. The franchisor exercises significant control over the franchisee's operations — **Yes** (territory, standards, platform rules)
3. The franchisee pays the franchisor (or the franchisor collects fees) — **Yes** (platform takes a revenue share)

**Requirements:**
- Franchise Disclosure Document (FDD) — must be provided 14 days before signing
- State-specific franchise registration (varies — Texas does not require registration, but many states do)
- Franchise agreement (legal contract defining terms, territory, obligations)

**Recommendation:** Consult a franchise attorney before selling the first territory.
This is a business prerequisite, not a technical one — the platform can be built
independently of the legal structure.

### Tax Implications

- Regional admins are independent contractors (1099), not employees
- Platform must track earnings and issue 1099-NEC if >$600/year
- Regional admins are responsible for their own taxes
- Platform may need to collect state sales tax in some jurisdictions (varies by state)

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regional admin underperforms | High | Medium | Performance minimums, territory reassignment clause |
| Regional admin poaches vendors to competing platform | Medium | High | Non-compete clause in franchise agreement; vendor relationships are with the platform, not the admin |
| Franchise law compliance | Medium | High | Engage franchise attorney before first sale |
| Regional admin disputes revenue calculation | Medium | Low | Transparent ledger, auditable transaction chain |
| Too many admin tiers create bureaucracy | Low | Medium | Keep hierarchy flat; regional admins report to state admin only for escalations, not daily operations |
| Regional admins form collective and negotiate | Low | Medium | Cap terms in franchise agreement; territory is non-transferable |
| Security breach via admin account | Low | High | MFA, audit logging, least-privilege RLS, immediate revocation |
| Revenue share doesn't attract quality operators | Medium | High | Validate economics with real data (Phase 2) before selling territories |

---

## 11. Open Questions

These need answers before building Phase 1:

### Business
- [ ] What are the exact regional boundaries for Texas? (User has this data)
- [ ] What is the minimum franchise fee or buy-in (if any)?
- [ ] Should regional admins pay an upfront fee, monthly fee, or only share revenue?
- [ ] What performance minimums trigger territory reassignment? (e.g., X vendors onboarded in first 90 days)
- [ ] Can a regional admin transfer or sell their territory?
- [ ] How long is the franchise agreement term? (1 year? 3 years? Auto-renew?)

### Revenue
- [ ] Confirm revenue split percentages (60/5/5/30 is placeholder)
- [ ] Confirm monthly and annual caps
- [ ] How frequently are payouts? (Monthly? Bi-weekly?)
- [ ] Minimum payout threshold? (e.g., don't pay out less than $25)

### Technical
- [ ] Should regional admin dashboard be a new section or extend existing admin?
- [ ] Do regional admins get a separate login flow or same as current admins?
- [ ] Should the region assignment be shown to vendors? ("Your region: Central Texas, managed by [Name]")
- [ ] How does the market manager concept (separate doc) integrate — same person, different person, or both?

### Legal
- [ ] Franchise attorney consultation scheduled?
- [ ] Which states are targeted first after Texas?
- [ ] Employment classification review (1099 vs W-2 for different admin levels)

---

## 12. Implementation Priority

**Do now (no code required):**
- Finalize Texas regional boundaries
- Draft franchise agreement terms (with attorney)
- Validate revenue projections with current transaction data

**Build Phase 1 when:**
- At least one regional admin candidate identified
- Franchise legal structure confirmed
- Texas regions finalized

**Build Phase 2 when:**
- Phase 1 deployed and first regional admin onboarded
- Need real revenue tracking data to validate the model

**Build Phase 3 when:**
- Multiple regional admins active
- Revenue tracking shows the model works
- Volume justifies automated payouts

---

## Appendix A: Existing Infrastructure Reference

| Component | Location | Relevance |
|-----------|----------|-----------|
| ZIP codes table (33k+ entries) | `supabase/migrations/20260204_001_zip_codes_table.sql` | Has `region_code` field ready for territory assignment |
| `get_region_zip_codes()` | Same migration | Already queries zips by region code |
| Vertical admin RLS | `supabase/migrations/20260203_003_add_vertical_admin_rls_support.sql` | Pattern for regional scoping (14 tables) |
| `vertical_admins` table | `supabase/migrations/20260120_009_admin_management.sql` | Model for `region_admins` table |
| Admin auth helpers | `apps/web/src/lib/auth/admin.ts` | Extend with `isRegionalAdmin()`, `isStateAdmin()` |
| Platform admin dashboard | `apps/web/src/app/admin/page.tsx` | UI pattern for regional dashboard |
| Vertical admin dashboard | `apps/web/src/app/[vertical]/admin/page.tsx` | UI pattern for regional dashboard |
| Nearby vendors API | `apps/web/src/app/api/vendors/nearby/route.ts` | Geographic querying patterns |
| Revenue tracking (market manager) | Not yet built | Will share infrastructure with regional revenue |

## Appendix B: Admin Role Comparison

| Capability | Regional | State | Vertical | Platform |
|-----------|----------|-------|----------|----------|
| Approve vendors | In region | In state | In vertical | All |
| View orders | In region | In state | In vertical | All |
| Manage markets | In region | In state | In vertical | All |
| View revenue | Own only | Own + region rollups | Vertical rollups | All |
| Manage admins below | No | Regional admins | State admins | All |
| Create regions | No | No | No | Yes |
| Set revenue splits | No | No | No | Yes |
| Access Stripe | No | No | No | Yes |
| Export data | Limited, watermarked | Limited, watermarked | Vertical scope | Full |
| Modify platform settings | No | No | No | Yes |
