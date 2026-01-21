# Phase P: Friends & Partners Feature Specification

## Status: PLANNED (Not Yet Started)
**Target Phase:** After core transaction flow complete (post-Phase O)
**Estimated Effort:** 2-3 weeks

---

## 1. Executive Summary

### Vision
Create a dedicated space on the platform for organizations and service providers that support the small agriculture, cottage goods, and local food producer ecosystem. These "Friends & Partners" become platform advocates while providing valuable resources to vendors.

### Value Proposition

| Stakeholder | Value Received |
|-------------|----------------|
| **Partners** | Exposure to target audience (vendors/farmers), lead generation, community presence |
| **Vendors** | Access to trusted resources for legal, compliance, production, business growth |
| **Platform** | Advocacy network, reduced marketing costs, stronger vendor ecosystem, future revenue |
| **Buyers** | Confidence in a platform backed by legitimate industry organizations |

### The Flywheel
```
Partners promote platform
         ↓
    More vendors join
         ↓
    More buyers attracted
         ↓
    Stronger vendor community
         ↓
    Partners see value, promote more
         ↑
    ←────────────────────────────┘
```

---

## 2. User Definition

### What is a Friend & Partner?

Organizations and professionals that support the local food/agriculture/cottage goods economy:

- **Industry Associations** - Texas Farmers Market Association, Cottage Food Networks
- **Government/Extension** - Texas A&M AgriLife Extension, USDA offices
- **Legal Services** - Attorneys specializing in food law, business formation
- **Accounting/Tax** - CPAs familiar with farm/food business accounting
- **Insurance Providers** - Farm liability, product liability, crop insurance
- **Agronomists/Consultants** - Soil health, pest management, organic certification
- **Economic Development** - Small Business Development Centers, local EDCs
- **Marketing/Branding** - Designers, social media consultants for food businesses
- **Equipment/Supplies** - Farm equipment dealers, packaging suppliers
- **Certification Bodies** - Organic certifiers, food safety trainers

### What Partners Are NOT
- Product vendors (they should be regular vendors)
- Buyers looking for bulk purchasing
- Advertisers with no connection to the ecosystem

---

## 3. Feature Specifications

### 3.1 Partner Signup Flow

**Route:** `/[vertical]/partner-signup`

**Steps:**
1. Basic account creation (email, password)
2. Organization information
   - Organization name
   - Organization type (dropdown of categories)
   - Description (500 char limit)
   - Website URL
   - Phone number
   - Email (public contact)
3. Service details
   - Primary category (required)
   - Additional categories (up to 2 for standard, 5 for premium)
   - Service area (regions/counties served)
4. Verification
   - Business documentation (optional but encouraged)
   - How did you hear about us?
5. Terms acceptance
6. Submit for approval

**Post-signup:** Partner enters "pending" status, admin reviews and approves.

---

### 3.2 Partner Profile (Public)

**Route:** `/[vertical]/partner/[partnerId]/profile`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  [Logo]  Organization Name          [Premium Badge] │
│          "Helping Texas farmers since 1985"         │
│                                                     │
│  Categories: [Legal] [Compliance] [Business]        │
│  Service Area: Central Texas, Hill Country         │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ About Us                                     │   │
│  │ [Full description text...]                   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Contact Information                                │
│  🌐 www.example.com                                │
│  📧 contact@example.com (Premium only)             │
│  📞 (512) 555-1234 (Premium only)                  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Vendor Recommendations (3)                   │   │
│  │ "They helped us get licensed..." - Farm A   │   │
│  │ "Great service, highly recommend" - Farm B  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Contact Partner] (Premium: opens message form)    │
│  [Visit Website]                                    │
└─────────────────────────────────────────────────────┘
```

---

### 3.3 Partner Dashboard

**Route:** `/[vertical]/partner/dashboard`

**Sections:**

#### Home
- Profile completion status
- Quick stats (views, recommendation count)
- Upgrade prompt (if standard tier)

#### Profile Management
- Edit organization info
- Upload/change logo
- Update description
- Manage categories
- Update service areas

#### Analytics (Premium Only)
- Profile views over time
- Click-through to website
- Recommendation trends
- Geographic breakdown of viewers

#### Messages (Premium Only)
- Inbox for vendor inquiries
- Response templates

#### Recommendations
- View all vendor recommendations
- Highlight/feature specific recommendations

#### Settings
- Account settings
- Notification preferences
- Subscription management

---

### 3.4 Partner Discovery Page

**Route:** `/[vertical]/partners` or `/[vertical]/resources`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Resources for Vendors                              │
│  Find trusted partners to help grow your business   │
│                                                     │
│  [Search by name...]                                │
│                                                     │
│  Categories:                                        │
│  [All] [Legal] [Accounting] [Insurance] [Agronomy] │
│  [Marketing] [Certification] [Associations] [More] │
│                                                     │
│  Service Area: [All Texas ▼]                       │
│                                                     │
│  ── Featured Partners ──────────────────────────── │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Premium │ │ Premium │ │ Premium │              │
│  │ Partner │ │ Partner │ │ Partner │              │
│  └─────────┘ └─────────┘ └─────────┘              │
│                                                     │
│  ── All Partners ───────────────────────────────── │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Partner │ │ Partner │ │ Partner │              │
│  │  Card   │ │  Card   │ │  Card   │              │
│  └─────────┘ └─────────┘ └─────────┘              │
│  [Load More]                                        │
└─────────────────────────────────────────────────────┘
```

**Partner Card:**
```
┌────────────────────────────────┐
│ [Logo]  Organization Name  ⭐  │
│         [Category] [Category]  │
│                                │
│ Brief description excerpt...   │
│                                │
│ 📍 Central Texas              │
│ 👍 5 vendor recommendations   │
│                                │
│ [View Profile]                 │
└────────────────────────────────┘
```

---

### 3.5 Vendor Recommendation Flow

**Location:** Vendor Dashboard → "Recommend a Partner"

**Also accessible from:** Partner profile page (if vendor is logged in)

**Flow:**
1. Vendor clicks "Recommend a Partner"
2. Search/select partner from list
3. Write recommendation (50-500 characters)
   - "How did this partner help you?"
4. Submit
5. Recommendation appears on partner profile

**Constraints:**
- Vendor must be approved and have at least 1 listing
- Vendor can recommend up to 5 partners total
- Vendor can only recommend each partner once
- Vendor can edit/delete their own recommendations

**Display:**
- Partner profile shows all recommendations
- Vendor name links to vendor profile
- Most recent recommendations shown first

---

### 3.6 Partner Suggestion by Vendors

**Similar to Market Suggestion Flow**

**Route:** Vendor Dashboard → "Suggest a Partner"

**Fields:**
- Organization name
- Website (if known)
- Category
- Why should we invite them?
- Your relationship to them (optional)

**Admin Review:**
- Admin sees suggestions in Partner Management
- Can approve → sends invitation email
- Can reject → optionally notify suggesting vendor

---

## 4. Partner Categories

### Primary Categories

| Category | Icon | Description |
|----------|------|-------------|
| **Legal & Compliance** | ⚖️ | Business formation, food law, contracts, licensing |
| **Accounting & Tax** | 📊 | Bookkeeping, tax preparation, financial planning |
| **Insurance** | 🛡️ | Liability, crop, product, business insurance |
| **Agronomy & Production** | 🌱 | Soil health, pest management, growing techniques |
| **Marketing & Branding** | 📣 | Design, social media, packaging, photography |
| **Equipment & Supplies** | 🚜 | Farm equipment, packaging, cold storage, tools |
| **Regulatory & Certification** | ✅ | Organic cert, food safety, USDA programs |
| **Economic Development** | 💼 | Grants, loans, SBDC, incubators |
| **Industry Associations** | 🤝 | Farmers associations, trade groups, networks |
| **Education & Training** | 🎓 | Workshops, extension services, mentorship |

### Category Assignment Rules
- Standard tier: 1 primary + 1 additional (2 total)
- Premium tier: 1 primary + 4 additional (5 total)
- Categories displayed as badges on profile and cards

---

## 5. Tier Structure

### Standard Tier (Free)

| Feature | Included |
|---------|----------|
| Partner profile | ✓ |
| Listed in directory | ✓ |
| Categories | 2 max |
| Service area | 1 region |
| Logo display | Standard size |
| Website link | ✓ |
| Phone/email visible | ✗ |
| Vendor recommendations | ✓ (displayed) |
| Analytics | ✗ |
| Direct messaging | ✗ |
| Featured placement | ✗ |
| Premium badge | ✗ |

### Premium Tier ($19.99/month or $166/year - save 30%)

| Feature | Included |
|---------|----------|
| Partner profile | ✓ Enhanced |
| Listed in directory | ✓ Priority |
| Categories | 5 max |
| Service area | Statewide |
| Logo display | Large + prominent |
| Website link | ✓ |
| Phone/email visible | ✓ |
| Vendor recommendations | ✓ Highlighted |
| Analytics dashboard | ✓ |
| Direct messaging | ✓ |
| Featured placement | ✓ (top of category, homepage rotation) |
| Premium badge | ✓ |
| Content publishing | ✓ (future: guides, articles) |

---

## 6. Database Schema

```sql
-- Partner Categories (seeded data)
CREATE TABLE partner_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT, -- emoji or icon name
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partner Profiles
CREATE TABLE partner_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vertical_id UUID REFERENCES verticals(id),

  -- Organization Info
  organization_name TEXT NOT NULL,
  slug TEXT UNIQUE, -- for URL: /partner/[slug]
  description TEXT,
  logo_url TEXT,
  website TEXT,
  phone TEXT,
  email TEXT, -- public contact email

  -- Service Area
  service_areas TEXT[], -- array of region names or 'statewide'

  -- Status & Tier
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended', 'rejected')),
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'premium')),
  tier_expires_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,

  -- Metadata
  profile_data JSONB DEFAULT '{}', -- flexible additional fields
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, vertical_id)
);

-- Partner Category Assignments (many-to-many)
CREATE TABLE partner_category_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_profile_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  partner_category_id UUID NOT NULL REFERENCES partner_categories(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(partner_profile_id, partner_category_id)
);

-- Vendor Recommendations of Partners
CREATE TABLE partner_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_profile_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  recommendation_text TEXT NOT NULL CHECK (char_length(recommendation_text) BETWEEN 50 AND 500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(partner_profile_id, vendor_profile_id) -- one recommendation per vendor per partner
);

-- Partner Suggestions (from vendors)
CREATE TABLE partner_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suggested_by UUID NOT NULL REFERENCES auth.users(id),
  vertical_id UUID REFERENCES verticals(id),

  organization_name TEXT NOT NULL,
  website TEXT,
  category_id UUID REFERENCES partner_categories(id),
  reason TEXT, -- why suggest them
  relationship TEXT, -- vendor's relationship to them

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'invited')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics tracking (for premium partners)
CREATE TABLE partner_profile_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_profile_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  viewer_user_id UUID REFERENCES auth.users(id), -- null for anonymous
  viewer_type TEXT, -- 'vendor', 'buyer', 'anonymous'
  referrer TEXT, -- where they came from
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_partner_profiles_vertical ON partner_profiles(vertical_id);
CREATE INDEX idx_partner_profiles_status ON partner_profiles(status);
CREATE INDEX idx_partner_profiles_tier ON partner_profiles(tier);
CREATE INDEX idx_partner_category_assignments_partner ON partner_category_assignments(partner_profile_id);
CREATE INDEX idx_partner_category_assignments_category ON partner_category_assignments(partner_category_id);
CREATE INDEX idx_partner_recommendations_partner ON partner_recommendations(partner_profile_id);
CREATE INDEX idx_partner_recommendations_vendor ON partner_recommendations(vendor_profile_id);
CREATE INDEX idx_partner_profile_views_partner ON partner_profile_views(partner_profile_id);
CREATE INDEX idx_partner_profile_views_date ON partner_profile_views(created_at);

-- Add 'partner' to user roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'partner';
```

---

## 7. API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/partners` | List partners (with filters) |
| GET | `/api/partners/[id]` | Get partner profile |
| GET | `/api/partners/categories` | List partner categories |
| GET | `/api/partners/[id]/recommendations` | Get recommendations for partner |

### Partner Endpoints (Authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/partner/signup` | Create partner application |
| GET | `/api/partner/profile` | Get own profile |
| PUT | `/api/partner/profile` | Update own profile |
| GET | `/api/partner/analytics` | Get analytics (premium) |
| GET | `/api/partner/messages` | Get messages (premium) |
| POST | `/api/partner/messages/[id]/reply` | Reply to message |

### Vendor Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vendor/partner-recommendations` | Get own recommendations |
| POST | `/api/vendor/partner-recommendations` | Create recommendation |
| PUT | `/api/vendor/partner-recommendations/[id]` | Update recommendation |
| DELETE | `/api/vendor/partner-recommendations/[id]` | Delete recommendation |
| POST | `/api/vendor/partner-suggestions` | Suggest a new partner |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/partners` | List all partners |
| PUT | `/api/admin/partners/[id]/approve` | Approve partner |
| PUT | `/api/admin/partners/[id]/reject` | Reject partner |
| PUT | `/api/admin/partners/[id]/suspend` | Suspend partner |
| GET | `/api/admin/partner-suggestions` | List suggestions |
| PUT | `/api/admin/partner-suggestions/[id]` | Review suggestion |

---

## 8. Page Routes

```
/[vertical]/partners                    # Discovery/listing page
/[vertical]/partners/categories/[slug]  # Category-filtered view
/[vertical]/partner/[partnerId]/profile # Public partner profile
/[vertical]/partner-signup              # Partner signup flow
/[vertical]/partner/dashboard           # Partner dashboard home
/[vertical]/partner/dashboard/profile   # Edit profile
/[vertical]/partner/dashboard/analytics # Analytics (premium)
/[vertical]/partner/dashboard/messages  # Messages (premium)
/[vertical]/partner/dashboard/upgrade   # Upgrade to premium
/[vertical]/partner/dashboard/settings  # Account settings

# Admin routes
/[vertical]/admin/partners              # Partner management
/[vertical]/admin/partners/[id]         # Partner detail/edit
/[vertical]/admin/partner-suggestions   # Review suggestions
/admin/partners                         # Platform-wide partner management
```

---

## 9. Integration Points

### With Existing Features

| Feature | Integration |
|---------|-------------|
| **Vendor Dashboard** | Add "Resources" section with link to partners, "Recommend a Partner" action |
| **Vendor Profile** | Show "Recommended Partners" section (optional) |
| **Navigation** | Add "Resources" or "Partners" link in header/footer |
| **Admin Dashboard** | Add partner management quick actions |
| **Search** | Partners searchable alongside listings (separate tab) |

### Future Integrations

| Feature | Description |
|---------|-------------|
| **Content Hub** | Partners publish guides, articles (Phase Q+) |
| **Event Calendar** | Partners list workshops, events (Phase Q+) |
| **Vendor Badges** | Partners verify/certify vendors (Phase R+) |
| **Referral Tracking** | Track vendor signups referred by partners (Phase R+) |
| **B2B Services** | Partners offer paid services through platform (Phase S+) |

---

## 10. Implementation Phases

### Phase P-1: Foundation (Week 1)
- [ ] Run database migrations
- [ ] Seed partner categories
- [ ] Create partner signup flow
- [ ] Create basic partner profile page
- [ ] Admin partner approval workflow

### Phase P-2: Discovery (Week 2)
- [ ] Partner discovery/listing page
- [ ] Category filtering
- [ ] Search functionality
- [ ] Partner cards component
- [ ] Add "Partners" to navigation

### Phase P-3: Engagement (Week 3)
- [ ] Partner dashboard (basic)
- [ ] Vendor recommendation flow
- [ ] Partner suggestion flow
- [ ] Recommendation display on partner profile

### Phase P-4: Monetization (Week 4 or Later)
- [ ] Premium tier implementation
- [ ] Stripe integration for partner subscriptions
- [ ] Analytics dashboard (premium)
- [ ] Messaging system (premium)
- [ ] Featured placement logic

---

## 11. Success Metrics

### Launch Metrics (First 90 Days)

| Metric | Target |
|--------|--------|
| Partners signed up | 25+ |
| Partners approved | 20+ |
| Vendor recommendations | 50+ |
| Partner profile views | 500+ |
| Premium conversions | 5+ (20% of approved) |

### Growth Metrics (6 Months)

| Metric | Target |
|--------|--------|
| Active partners | 50+ |
| Premium partners | 15+ (30%) |
| Vendor referrals from partners | Track and grow |
| Partner-attributed vendor signups | 20%+ of new vendors |

---

## 12. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Low partner quality | Require approval, encourage vendor recommendations as social proof |
| Partner spam/abuse | Rate limits on messaging, report mechanism, admin suspension |
| Slow adoption | Start with warm outreach to known organizations |
| Category mismatch | Review and adjust categories based on signup patterns |
| Vendor gaming recommendations | Limit recommendations per vendor, public accountability |

---

## 13. Launch Checklist

### Pre-Launch
- [ ] Identify 10-15 launch partners (warm contacts)
- [ ] Prepare outreach email template
- [ ] Create partner onboarding guide
- [ ] Set up admin review workflow
- [ ] Test full signup → approval → profile flow

### Launch
- [ ] Soft launch with invited partners only
- [ ] Gather feedback, iterate
- [ ] Open public signup
- [ ] Announce to existing vendors

### Post-Launch
- [ ] Monitor signup quality
- [ ] Track engagement metrics
- [ ] Gather partner feedback
- [ ] Plan premium tier launch timing

---

## 14. Open Questions

1. **Vertical-specific vs Platform-wide?**
   - Should partners be tied to a vertical or available across all verticals?
   - Recommendation: Start vertical-specific, expand later

2. **Partner-to-Partner visibility?**
   - Should partners see other partners? Potential for networking or competition concerns.
   - Recommendation: Yes, it's public anyway

3. **Buyer visibility?**
   - Should buyers see the partner directory?
   - Recommendation: Yes, but clearly labeled "Resources for Vendors"

4. **Partner content moderation?**
   - Who reviews partner descriptions for inappropriate content?
   - Recommendation: Admin approval covers initial review, report mechanism for ongoing

---

## 15. Appendix: Potential Launch Partners (Texas)

### Industry Associations
- Texas Farmers Market Association
- Texas Organic Farmers and Gardeners Association (TOFGA)
- Homemade Texas (cottage food network)
- Texas Farm Bureau (local chapters)

### Extension & Education
- Texas A&M AgriLife Extension
- Local community college agriculture programs
- USDA Farm Service Agency (local offices)

### Economic Development
- Small Business Development Centers (SBDCs)
- Local Economic Development Corporations
- Texas Department of Agriculture programs

### Service Providers
- Food law attorneys (search Texas food lawyer)
- Farm-focused CPAs
- Agricultural insurance agents
- Organic certification bodies (Texas)

---

---

## 16. Founding Vendor Program

### Overview
Reward early adopters with permanently reduced premium pricing to create urgency and build loyal community.

### Program Details

| Aspect | Specification |
|--------|---------------|
| **Discount** | 50% off premium forever ($12.50/mo or $104/yr) |
| **Eligibility** | First 100 vendors per vertical OR first 6 months from launch |
| **Lock-in** | Rate locked as long as subscription stays active (lapse = lose status) |
| **Badge** | "Founding Vendor" badge on profile |
| **Requirement** | Must complete profile + 1 approved listing within 30 days |

### Database Changes
```sql
ALTER TABLE vendor_profiles ADD COLUMN is_founding_vendor BOOLEAN DEFAULT FALSE;
ALTER TABLE vendor_profiles ADD COLUMN founding_vendor_granted_at TIMESTAMPTZ;
```

### Benefits
- Creates urgency ("only 47 founding spots left!")
- Early vendors take the most risk - reward them
- Locked rate incentivizes retention
- Badge creates visible community of early adopters

---

## 17. Vendor-to-Vendor Referral Program

### Overview
Vendors earn credit toward platform fees when they refer other vendors who become active sellers.

### Program Details

| Aspect | Specification |
|--------|---------------|
| **Reward** | $10 credit per successful referral |
| **Trigger** | Applied after referred vendor's **first completed sale** |
| **Cap per referral** | $10 one-time per referred vendor |
| **Cap per referrer** | $100/year (10 referrals max earning per year) |
| **Credit usage** | Platform fees, premium subscription |
| **Expiration** | Credits expire 12 months after earning |

### Why "First Sale" Trigger
- Prevents gaming (signing up fake vendors)
- Ensures referred vendor is real and active
- Aligns incentives with platform success

### Referral Code System
```
Each vendor gets unique code: FARM-JANE-2024 or UUID
Shareable link: farm2table.com/vendor-signup?ref=FARM-JANE-2024
```

### Database Schema
```sql
-- Add to vendor_profiles
ALTER TABLE vendor_profiles ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE vendor_profiles ADD COLUMN referred_by_vendor_id UUID REFERENCES vendor_profiles(id);

-- Referral credits tracking
CREATE TABLE vendor_referral_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_vendor_id UUID NOT NULL REFERENCES vendor_profiles(id),
  referred_vendor_id UUID NOT NULL REFERENCES vendor_profiles(id),
  credit_amount_cents INTEGER NOT NULL DEFAULT 1000, -- $10.00
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'earned', 'applied', 'expired', 'voided')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  earned_at TIMESTAMPTZ,        -- when first sale triggered credit
  applied_at TIMESTAMPTZ,       -- when credit was used
  expires_at TIMESTAMPTZ,       -- 12 months after earned_at

  -- Audit
  applied_to TEXT,              -- 'subscription', 'platform_fee', etc.
  voided_reason TEXT,

  UNIQUE(referrer_vendor_id, referred_vendor_id)
);

-- Track annual cap
CREATE INDEX idx_referral_credits_referrer ON vendor_referral_credits(referrer_vendor_id);
CREATE INDEX idx_referral_credits_status ON vendor_referral_credits(status);
```

### UI Touchpoints

**1. Vendor Dashboard - "Invite a Vendor" Card**
```
┌─────────────────────────────────────────────┐
│  🎁 Invite a Vendor, Earn $10              │
│                                             │
│  Share your link with fellow vendors:       │
│  ┌─────────────────────────────────────┐   │
│  │ farm2table.com/vendor-signup?ref=X  │ 📋│
│  └─────────────────────────────────────┘   │
│                                             │
│  You earn $10 credit when they make their  │
│  first sale. Max $100/year.                │
│                                             │
│  Your referrals: 3 pending, 2 earned ($20) │
│  [View Details]                             │
└─────────────────────────────────────────────┘
```

**2. Vendor Signup - Referral Recognition**
```
┌─────────────────────────────────────────────┐
│  🎉 You were invited by Jane's Farm!       │
│  Complete signup and make your first sale  │
│  to earn them a referral bonus.            │
└─────────────────────────────────────────────┘
```

**3. Vendor Dashboard - Referral Details Page**
```
┌─────────────────────────────────────────────┐
│  Your Referral Credits                      │
│                                             │
│  Available Balance: $20.00                  │
│  Pending: $30.00 (3 vendors awaiting sale)  │
│  Earned This Year: $50.00 / $100.00 cap    │
│                                             │
│  ── Referral History ─────────────────────  │
│  Jane's Farm    Earned   $10   Jan 15      │
│  Bob's Produce  Earned   $10   Jan 10      │
│  New Vendor     Pending   -    Jan 20      │
│  Old Vendor     Expired  $10   (Dec 2025)  │
└─────────────────────────────────────────────┘
```

### Attribution Flow
```
1. Vendor A copies referral link from dashboard
2. Vendor A shares with friend (Vendor B)
3. Vendor B clicks link, lands on signup with ?ref= param
4. Signup page shows "Invited by [Vendor A]"
5. Vendor B completes signup → referred_by_vendor_id = Vendor A
6. System creates referral_credit record (status: 'pending')
7. Vendor B gets approved, creates listing
8. Vendor B makes first sale (order completed)
9. Trigger updates referral_credit to 'earned', sets earned_at and expires_at
10. Vendor A sees credit in dashboard
11. Credit auto-applies to next subscription charge
```

### Abuse Prevention
- $100/year cap prevents making referrals a "business"
- First-sale trigger prevents fake signups
- Monitor for suspicious patterns (same IP, similar emails)
- Admin can void credits if fraud detected
- Referred vendor must remain active 30 days or credit voided

---

## 18. Geographic Rollout Strategy

### Approach: Soft Focus (Recommended)

**Philosophy:** Don't hard-gate signups by geography. Instead, focus marketing efforts while allowing organic growth anywhere.

**How it works:**
- Anyone can sign up from anywhere
- Marketing/outreach concentrates on target metros
- Homepage shows "Featured Markets" in active areas
- Browse defaults to user's location
- If no vendors nearby: "Be the first vendor in [City]!"

### Density Strategy
Focus on **market density** rather than geographic gates:
- Partner with specific farmers markets to onboard their vendors
- Goal: 5-10 vendors per market before promoting to buyers
- Launch buyer marketing only after vendor threshold met

### Suggested Texas Rollout
```
Phase 1: Austin metro (home base, in-person support)
Phase 2: San Antonio, Houston (large markets, driving distance)
Phase 3: Dallas-Fort Worth (largest Texas metro)
Phase 4: Secondary Texas cities (Waco, Lubbock, El Paso)
Phase 5: Other states (when Texas is solid)
```

### Benefits of Soft Focus
- Organic growth isn't blocked
- Vendor in "non-target" area might bring entire farmers market
- Captures demand data for expansion planning
- No awkward rejection of eager users

---

## 19. State-Specific Landing Pages

### For Users Outside Active Areas

**URL Structure:**
```
/texas          → Active state, full experience
/oklahoma       → Coming soon page
/california     → Coming soon page
/               → Detects location, routes appropriately
```

### Coming Soon Page Content
```
┌─────────────────────────────────────────────────────┐
│  [Logo] Farm2Table is coming to Oklahoma!           │
│                                                     │
│  We're growing fast and will be in your area soon.  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Get Founding Status When We Launch          │   │
│  │                                             │   │
│  │ [Email address          ]                   │   │
│  │ I am a:  ○ Vendor  ○ Shopper  ○ Both       │   │
│  │ [Join Waitlist]                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Founding vendors get 50% off premium - forever.   │
│                                                     │
│  ── Meanwhile, explore resources ────────────────  │
│  [National resources that apply anywhere]           │
└─────────────────────────────────────────────────────┘
```

### Waitlist Database
```sql
CREATE TABLE launch_waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT,
  user_type TEXT CHECK (user_type IN ('vendor', 'shopper', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ,  -- when we emailed about launch
  converted_at TIMESTAMPTZ  -- when they actually signed up
);

CREATE INDEX idx_waitlist_state ON launch_waitlist(state);
CREATE INDEX idx_waitlist_email ON launch_waitlist(email);
```

### Benefits
- Captures demand data by state (prioritize expansion)
- Builds launch list for each state
- Creates anticipation
- SEO value for state-specific pages

---

## 20. Partner Filtering by Location

### Filtering Hierarchy
```
State → Region/Metro → City
```

### Default Behavior
1. Detect user's location (browser geolocation or IP)
2. Default filter to their metro/region
3. Allow expanding to statewide or narrowing to city
4. "Show national resources" toggle

### Service Area Options
```sql
-- In partner_profiles.service_areas
['austin', 'san-antonio']     -- specific metros
['central-texas']             -- region
['texas']                     -- statewide
['national']                  -- anywhere
```

### Query Logic with Relevance Sorting
```sql
-- User in Austin sees partners sorted by proximity
SELECT * FROM partner_profiles
WHERE 'austin' = ANY(service_areas)
   OR 'central-texas' = ANY(service_areas)
   OR 'texas' = ANY(service_areas)
   OR 'national' = ANY(service_areas)
ORDER BY
  CASE
    WHEN 'austin' = ANY(service_areas) THEN 1
    WHEN 'central-texas' = ANY(service_areas) THEN 2
    WHEN 'texas' = ANY(service_areas) THEN 3
    WHEN 'national' = ANY(service_areas) THEN 4
  END,
  tier DESC  -- premium first within each proximity tier
LIMIT 20 OFFSET 0;
```

### Pagination
- 20 partners per page
- "Load more" button
- Reduces initial payload
- Better UX - most relevant first

### Avoiding Dead Profiles
- Partners must select specific service areas
- Flag inactive partners (no profile views in 6 months)
- Consider "last active" indicator
- National resources should be truly national

---

*Document created: January 21, 2026*
*Updated: January 21, 2026 - Added sections 16-20*
*Status: Ready for review, pending implementation after Phase O*
