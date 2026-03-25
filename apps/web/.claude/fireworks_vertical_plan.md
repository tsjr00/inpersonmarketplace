# Fireworks Vertical Master Plan

**Created:** 2026-03-25 (Session 63)
**Status:** Research complete, awaiting implementation approval
**Source:** Prior work at `C:\FastWrks-Fireworks\BuildApp\`

---

## 1. What Was Previously Built / Planned

The prior fireworks project (`FastWrks`) was a separate app attempt that shared the same Supabase backend as the current multi-vertical marketplace. It had:

### Config & Architecture
- `fireworks.json` vertical config — complete with branding, nouns, vendor fields, listing fields, buyer filters, seasonality, agreements
- Config-driven forms architecture (same pattern we use now)
- Core data model documentation (user, organization, vendor profile, listing — matches our current schema)

### Business Model (Pricing & Features Source of Truth)
- **Same fee structure** as current app: 6.5% buyer + 6.5% vendor + Stripe Connect
- **Vendor tiers:** Standard (free) + Premium ($24.99/mo or $208.15/yr)
- **Buyer tiers:** Free + Premium Member ($9.99/mo or $81.50/yr)
- **Flash sales system** — real-time limited-quantity offers with tiered access (premium members → VIPs → free users)
- **Monthly Market Pass** — 4-week prepaid bundle (same concept as our Market Box / Chef Box)
- **VIP customer system** — premium vendors tag up to 25 customers for early access
- **Multi-vendor cart** — single checkout, separate transactions per vendor

### Fireworks-Specific Elements
- **Seasonality:** Two windows — New Year (Dec 15 - Jan 2) and Independence Day (Jun 15 - Jul 6)
- **TDI Permits:** Texas Department of Insurance fireworks seller permits (2023-2025 permit data available in Excel files)
- **Product categories:** Aerial, Ground, Sparklers, Fountains, Novelty, Assortments, Other (already in our ListingForm.tsx)
- **Terminology:** Seller (not Vendor), Stand (not Listing/Location), Reserve (not Order)
- **Branding:** Domain `fireworksstand.com`, colors: primary `#ff4500` (red-orange), secondary `#ffa500` (orange), dark background `#1a1a1a`
- **Verification:** TDI permit number, permit year(s), permit document upload
- **Regulated goods addendum** — separate legal agreement for fireworks sellers (referenced in config but file was empty)

### Tracy's Notes & Decisions (from text files)
- Skip-the-line depends on vendor staffing — explore QR code self-pickup confirmation
- Don't compete with vendors' existing CSA programs — differentiate on flexibility (monthly vs seasonal)
- Flash sales should be part of initial launch, not a future phase
- No in-app messaging for free tier vendors
- Limit buyer contact info visibility for vendors
- Multi-vendor cart needs vendor no-show handling (partial refunds)
- Guard against membership fatigue during off-season — offer seasonal rate reduction
- VIP customer notification consolidation (max 1 email per buyer per day)

---

## 2. What Already Exists in Our Current App for `fire_works`

### Present (minimal but functional)
- `fire_works` vertical slug exists in the database (`verticals` table)
- Vertical validation accepts `fire_works` (`src/lib/validation/vertical.ts`)
- Branding defaults exist (`src/lib/branding/defaults.ts`) — domain: `fireworksstand.com`
- Category options defined in `ListingForm.tsx`: Aerial, Ground, Sparklers, Fountains, Novelty, Assortments, Other
- Pricing, cancellation fees, and payment logic include `fire_works` cases
- Statement descriptor: "FIREWORKS" (`src/lib/stripe/payments.ts`)
- Layout system handles the vertical (`src/app/[vertical]/layout.tsx`)
- Design token system has fireworks support path (falls back to FM defaults)

### Missing (needs to be built/configured)
- No fireworks-specific terminology in `term()` system
- No fireworks-specific design tokens / color palette
- No fireworks-specific branding config in DB `verticals.config`
- No fireworks vendor onboarding fields (TDI permit, business type, county)
- No seasonality enforcement (sales windows)
- No fireworks-specific landing page content
- No fireworks help articles / knowledge base content
- No fireworks-specific notification templates
- No flash sales system (this was a core feature in the prior design)
- No VIP customer system
- No regulated goods legal addendum

---

## 3. What to Bring Forward (Recommended)

### Phase 1: Vertical Configuration (config + content, no new features)
- [ ] **Terminology mapping** — Add `fire_works` entries to `term()`: market→Stand, vendor→Seller, listing→Product, market_box→Fireworks Box, etc.
- [ ] **Design tokens** — Fireworks color palette: primary `#ff4500`, secondary `#ffa500`, dark background. Add to `getVerticalColors()` and `getVerticalCSSVars()`
- [ ] **Branding defaults** — Update `defaultBranding.fire_works` with domain, tagline, logo path, colors, meta tags
- [ ] **DB vertical config** — Update `verticals.config` JSONB for `fire_works` with vendor_fields (TDI permit, business type, county), listing_fields, buyer_fields, buyer_filters
- [ ] **Product categories** — Already present (Aerial, Ground, Sparklers, etc.). Verify category descriptions in ListingForm
- [ ] **Landing page content** — Fireworks-specific hero, value props, seasonal messaging
- [ ] **Help articles** — Seed knowledge base with fireworks-specific content (TDI permit info, safety, Texas fireworks laws, seasonal dates)

### Phase 2: Fireworks-Specific Business Rules
- [ ] **Seasonality enforcement** — Two sales windows: Dec 15 - Jan 2 (New Year) and Jun 15 - Jul 6 (Independence Day). Outside these windows, listings should be hidden or paused. Vendor dashboard shows countdown to next season.
- [ ] **TDI permit verification** — Vendor onboarding requires TDI permit number and document upload. Admin reviews. This is the fireworks equivalent of vendor onboarding gate 1.
- [ ] **Vendor tiers** — Map to existing Free/Pro/Boss system. Standard = Free, Premium = Pro. Adjust limits per fireworks vertical in `vendor-limits.ts`
- [ ] **Sales tax** — All fireworks are taxable in Texas (tangible goods). Auto-set `is_taxable = true` like food trucks.
- [ ] **Regulated goods agreement** — Additional legal agreement required during vendor onboarding

### Phase 3: Flash Sales System (NEW FEATURE — benefits all verticals)
- [ ] **Flash sales** — This was a core differentiator in the prior design. Time-limited, quantity-limited offers with tiered access. Could be valuable for FM and FT too (end-of-day discounts, surplus inventory). Design as a cross-vertical feature gated by vertical config.
- [ ] **Notification timing tiers** — Premium members notified first, then VIPs, then free users

### Phase 4: VIP Customer System (NEW FEATURE — benefits all verticals)
- [ ] **VIP tagging** — Premium vendors designate up to 25 customers as VIPs
- [ ] **VIP benefits** — Early flash sale access, consolidated notifications
- [ ] **VIP management dashboard** — Capacity tracking, engagement metrics

---

## 4. Key Business Decisions Needed

| # | Question | Prior Plan | Current Status |
|---|----------|-----------|---------------|
| 1 | Fireworks vertical domain | fireworksstand.com | Need to verify domain ownership/DNS |
| 2 | Vendor tiers | Standard (free) + Premium ($24.99) | Map to Free/Pro/Boss or keep 2-tier? |
| 3 | Buyer tiers | Free + Premium ($9.99) | Same as existing buyer premium? |
| 4 | Flash sales | Core feature, tiered access | New feature — build for all verticals or fireworks only? |
| 5 | Seasonality | Dec 15-Jan 2, Jun 15-Jul 6 | Confirm dates. What happens outside season? |
| 6 | TDI permit verification | Manual admin review | Same as current onboarding gates? |
| 7 | Market definition | Stand site / pickup point | How do fireworks stands work? Individual locations? |
| 8 | VIP system | Premium vendor feature, 25 cap | New feature — build for all verticals? |
| 9 | Flash sale frequency | Standard: 2/week, Premium: unlimited | Confirm limits |
| 10 | Pre-packaged vs prepared food | N/A for fireworks | All fireworks are retail goods, not food — different tax treatment |

---

## 5. Texas Fireworks Regulatory Context

### TDI (Texas Department of Insurance) Permits
- Fireworks retailers in Texas must obtain a permit from TDI
- Permits are per-location, per-season (not transferable)
- TDI publishes permit data (we have 2023-2025 data in Excel files)
- Permit data could be used for verification: vendor provides permit #, we cross-reference TDI records
- Permit years are seasonal — need annual renewal

### Texas Fireworks Sales Law
- Retail fireworks sales are limited to specific seasonal windows set by state/county law
- Some counties have additional restrictions (burn bans can close sales early)
- All fireworks sales are subject to Texas sales tax (tangible goods)
- Age restrictions: must be 16+ to purchase certain types
- Platform should probably NOT be the age verification mechanism — leave that to the vendor at pickup

### Safety & Liability
- Prior design referenced a regulated goods legal addendum — this should include:
  - Platform is not responsible for product safety
  - Vendor certifies proper storage and handling
  - Vendor certifies valid TDI permit
  - Buyer acknowledges safety responsibilities
  - Platform does not provide safety ratings or product certifications

---

## 6. Security Note

**`C:\FastWrks-Fireworks\info.txt` contains Supabase API keys and secrets in plain text** (Dev and Staging projects). These are the same projects used by our current app. This file should be deleted or moved to a secure location immediately.

---

## Progress Tracker

| Phase | Item | Status |
|-------|------|--------|
| 1 | Terminology mapping | Not started |
| 1 | Design tokens / colors | Not started |
| 1 | Branding defaults | Not started |
| 1 | DB vertical config | Not started |
| 1 | Landing page content | Not started |
| 1 | Help articles | Not started |
| 2 | Seasonality enforcement | Not started |
| 2 | TDI permit verification | Not started |
| 2 | Vendor tiers | Not started |
| 2 | Sales tax (always taxable) | Not started |
| 2 | Regulated goods agreement | Not started |
| 3 | Flash sales system | Not started |
| 3 | Notification timing tiers | Not started |
| 4 | VIP customer system | Not started |
| 4 | VIP management dashboard | Not started |
