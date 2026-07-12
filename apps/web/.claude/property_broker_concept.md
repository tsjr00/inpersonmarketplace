# Property Broker — Concept & Plan

Created: 2026-04-09 (Session 69)
Status: Concept phase — pending Phase 0 validation

## The Concept

Three-sided marketplace: **Landowners** (parking lots, vacant land, lawn space) ↔ **Platform** ↔ **Vendors** (food trucks, farm stands, pop-ups).

Platform brokers daily/weekly placements between vendors and property owners who want supplemental income from their land. Existing matching logic (built for events) is adapted for property placement.

**Revenue model:**
- Landowner earns $25-50/day per booking (several hundred/month)
- Platform takes a fee (percentage or flat or hybrid)
- Vendor pays a daily/weekly access rate (in addition to existing transaction fees on sales)
- This is **additive revenue** — doesn't cannibalize existing transaction fee model

**Key insight:** This is not a new app. It's a third leg of the existing platform that reuses ~70% of what's already built. Vendor demand already exists on the platform; only the supply side (landowners) needs to be acquired.

## Why It Could Work

1. **Solves a documented vendor pain point** — finding good locations is consistently a top-3 vendor challenge
2. **Vendor base is pre-qualified** — no cold customer acquisition for the demand side
3. **Defensible moat** — once you have 100+ landowners in a market, network effects compound
4. **Vendor retention lever** — vendors with reliable locations stay on the platform longer (lower churn = higher LTV)
5. **Geographic expansion playbook** — once landowner onboarding is repeatable, each new city is a known process
6. **Underserved by existing players** — Storefront focused on retail. Peerspace on events. No one is laser-focused on daily food vending placement.

## What Already Exists (Reusable from current app)

| Feature | Current Use | Reuse Pattern |
|---------|------------|---------------|
| Multi-vertical system | FM/FT separation | Add `property_rentals` as vertical OR sub-feature |
| 3-gate onboarding | Vendor docs/COI/permits | Adapt for landowner property docs/insurance/contracts |
| Stripe Connect | Vendor payouts | Onboard landowners as connected accounts (same flow) |
| Pricing module (`pricing.ts`) | Buyer/vendor/platform fees | Add 3-way landowner split |
| `markets` table | Vendor pickup locations | Properties are similar — name, address, lat/lng |
| `market_vendors` table | Vendor-market relationships | Becomes `property_bookings` |
| Event matching algorithm | Auto-match vendors to events | Same logic for property placement |
| Notification system | 4 channels (in-app, push, SMS, email) | Booking requests, approvals, reminders |
| Geographic search | Browse by zip | Browse properties by location |
| Document uploads | Vendor onboarding | Landowner contracts, property photos |
| Settlement reports | Vendor payouts | Add landowner payout reports |
| Admin verification | Vendor review | Vet landowners (proof of ownership, insurance) |
| Calendar/availability | Pickup schedules | Property availability windows |
| Vendor tier system | Limit listings/markets | Could differentiate landowner tiers |
| `event_readiness` JSONB | Event suitability scoring | Adapt for property suitability scoring |

## What Needs to Be Built (New)

### Database (estimate: 3-4 migrations)
- `landowner` added to user role enum
- `properties` table — id, owner_user_id, name, address, lat/lng, photos, amenities (electrical/water/restrooms/parking), traffic_data, hourly/daily/weekly rates, max_trucks, status
- `property_bookings` table — id, property_id, vendor_profile_id, start_date, end_date, status, total_cents, platform_fee_cents, landowner_payout_cents, contract_accepted_at
- `property_amenities` (or JSONB column on properties)
- `property_reviews` (bidirectional — vendor reviews landowner, landowner reviews vendor)
- `landowner_payouts` (mirror or extension of vendor_payouts)

### Code (new pages/routes)
- Landowner signup/onboarding flow
- Landowner dashboard (manage properties, bookings, payouts)
- Property listing form (photos, amenities, rates, availability)
- Property browse page (vendor-facing)
- Property detail page (with booking widget)
- Booking request flow (vendor → landowner approval → payment)
- Digital contract acceptance (boilerplate + signature capture)
- Admin landowner management (similar to admin/vendors)
- New API routes: `/api/properties/*`, `/api/property-bookings/*`, `/api/landowner/*`

### Legal / Operational
- Boilerplate contract template (3-party: platform, landowner, vendor)
- Insurance requirement matrix (general liability, property damage)
- Cancellation/refund policy
- Dispute resolution process
- Tax handling (landowner 1099s, marketplace facilitator status implications)

## Similar Business Models — Study These

### Closest analogues (study first)
1. **Storefront** (storefront.com) — Pop-up retail space rentals. Same 3-sided model. Acquired by Raise in 2018, then sold. **Worth understanding why it didn't dominate** — common theories: too dependent on big-city retail, didn't crack the supply side, marketplace liquidity problem.
2. **Appear Here** (appearhere.us / .co.uk) — UK-based pop-up retail broker, expanded to NYC/LA. Strong brand. Study their landlord onboarding and contract templates.
3. **Peerspace** — Hourly venue rentals (events, meetings, photo shoots). Best-in-class availability calendar UX.
4. **Giggster** — Film location rentals. Mature landlord approval flow and damage deposit system.

### Adjacent models (different but useful patterns)
5. **Neighbor.com** — Storage in neighbors' garages/basements. Gold-standard trust/insurance model for peer-to-peer property rentals.
6. **Spacer** — Parking space peer-to-peer. Smaller scale, urban parking focus.
7. **Curbflip** — Driveway/spot rentals. Has tackled legal/zoning challenges.

### The killer reference: Storefront's failure
Storefront was the closest to this concept and they didn't make it. Worth understanding why before committing.

**Edge over Storefront:** This platform already has the demand side (food trucks + farmers market vendors) actively using it. Storefront had to build supply AND demand simultaneously. We start with demand.

## Risks (Ranked by Severity)

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Zoning / municipal permits** — Cities have varying rules about commercial activity on private property | HIGH | Per-city legal review before launch in each market. Start in vendor-friendly cities (Austin, Portland, Nashville). |
| **Liability for vendor activities** — Vendor injures customer, landowner gets sued | HIGH | Mandatory vendor general liability insurance ($1M minimum), platform indemnification clauses, additional insured riders for landowners |
| **Property damage** — Vendor damages property, dispute over who pays | HIGH | Damage deposit system, photo documentation pre/post, insurance requirements |
| **Marketplace liquidity** — Need both sides to scale together | HIGH | Start with existing vendor base. Onboard 5-10 landowners in 1 city before public launch. |
| **Health permits** — Many cities require permits to operate as a food vendor on private commercial property | MED | Surface permit requirements per city, integrate with permit-tracking system |
| **Tax complexity** — Landowner income reporting, marketplace facilitator obligations | MED | 1099 system (Stripe handles for vendors, can extend), CPA review |
| **Landowner cancellations** — Booking conflict with another vendor or landowner needs the lot | MED | Cancellation fees, booking confirmation period, automated rebooking suggestions |
| **Vendor no-shows** — Damages landowner trust | MED | No-show penalty system, vendor rating system, deposit forfeit |
| **Neighbor complaints / nuisance** — Smell, traffic, noise → property owner gets cited | MED | Property characteristics matching (adapt event_readiness scoring) |
| **Contract enforceability** — Boilerplate may not hold across states | MED | Per-state legal review, electronic signature compliance (ESIGN Act) |
| **Stripe Connect onboarding friction** — Landowners less tech-savvy than vendors | LOW | Manual concierge onboarding for first 50 landowners |

## Opportunities

1. **Additive revenue stream** — Booking fees on top of existing transaction fees. Vendor at brokered location ALSO pays transaction fees on every sale.
2. **Vendor retention lever** — Good locations = lower churn = higher LTV
3. **Defensible moat** — 100+ landowners in a market = competitor can't replicate supply side easily
4. **Free customer acquisition** — Existing vendors are pre-qualified leads for the new feature
5. **Geographic expansion playbook** — Once repeatable, each new city is a known process
6. **Premium tier opportunity** — Featured listings for landowners, priority booking for vendors
7. **Data product (long-term)** — Aggregate location performance data, sell as insights to municipal/economic-development organizations
8. **Adjacent expansion** — Same property infrastructure works for pop-up retail, mobile health (vaccinations, blood drives), event services
9. **Solves a documented pain point** — Vendor surveys consistently rank "finding good locations" as top-3
10. **First-mover in food vendor placement** — Storefront focused on retail. Peerspace on events. No food-vendor-specific solution exists.

## Phased Action Plan

### Phase 0: Validation (2-4 weeks, NO CODE)
- [ ] Interview 10 existing vendors: "Would you pay $25-50/day for a good location? What makes a location 'good'?"
- [ ] Identify 5 potential landowner candidates in local market (gas stations, churches, office complexes, lawn owners)
- [ ] Research zoning + food vendor permit requirements in 3 target cities
- [ ] 30-min consultation with small business attorney about contract structure
- [ ] Create comparison doc: Storefront, Appear Here, Peerspace, Neighbor.com — their fees, contracts, insurance models
- [ ] **Decision point:** separate vertical (`property_rentals`) or sub-feature of existing verticals?

### Phase 1: Foundation (1-2 weeks of build)
- [ ] Migration: add `landowner` to user role enum
- [ ] Migration: create `properties` table
- [ ] Migration: create `property_bookings` table
- [ ] Migration: create `landowner_payouts` table (or extend vendor_payouts)
- [ ] Landowner signup flow + onboarding (reuse 3-gate pattern)
- [ ] Stripe Connect integration for landowners (reuse vendor flow)

### Phase 2: Listing + Discovery (2 weeks)
- [ ] Landowner property creation form
- [ ] Property browse page (vendor-facing)
- [ ] Property detail page with photos, amenities, rates
- [ ] Geographic search (reuse browse infrastructure)
- [ ] Property characteristics matching algorithm (adapt from event matching)

### Phase 3: Booking Flow (2-3 weeks)
- [ ] Booking request UI (vendor selects dates, sees price)
- [ ] Landowner approval flow (notification → accept/reject)
- [ ] Digital contract acceptance (signature + timestamp)
- [ ] Payment processing (vendor pays platform, platform splits to landowner)
- [ ] Booking confirmation emails to all parties

### Phase 4: Operations (2 weeks)
- [ ] Calendar/availability management for landowners
- [ ] Cancellation flow + refund handling
- [ ] Bidirectional review system
- [ ] Settlement reports for landowners
- [ ] Admin landowner management page
- [ ] Dispute resolution workflow

### Phase 5: Scale (ongoing)
- [ ] Auto-matching (vendor sets preferences, system suggests properties)
- [ ] Recurring bookings ("every Tuesday")
- [ ] Premium landowner tier
- [ ] Analytics dashboards (location performance, booking trends)
- [ ] Geographic expansion playbook

## Key Decisions Pending

1. **Separate vertical or sub-feature?** — Lean toward sub-feature. Existing vendors and matching algorithms work across both models. Separate vertical means duplicating admin tooling.
2. **Fee structure** — Percentage of booking? Flat fee? Hybrid? Need vendor and landowner price sensitivity research first.
3. **Insurance requirements** — How much coverage to require from vendors? What does platform provide vs. what's required of vendors?
4. **Contract template ownership** — Build in-app (e-signature) or use external service (DocuSign, HelloSign)?
5. **Damage deposit handling** — Stripe holds funds? Separate escrow? How long to release after booking?
6. **First market** — Which city to launch in based on vendor density + landowner-friendly zoning?

## Recommendation

**Do not start building until Phase 0 is complete.** The biggest risk is not technical — it's whether landowners will actually list, whether vendors will actually pay the daily fee, and whether local zoning supports this model. 2-4 weeks of validation will save months of building the wrong thing.

The structural decision (separate vertical vs sub-feature) is the most important architectural choice. It affects every later phase. Don't decide this in isolation — let Phase 0 findings inform it.

## Related Files

- `apps/web/src/lib/pricing.ts` — pricing module to extend
- `apps/web/src/lib/vendor-limits.ts` — tier system pattern to mirror
- `apps/web/src/app/api/admin/vendors/[id]/` — admin verification pattern to copy
- `apps/web/src/app/[vertical]/vendor/onboarding/` — onboarding flow pattern to adapt
- `supabase/migrations/applied/20260403_110_event_waves_schema.sql` — recent multi-table migration as a structural reference
