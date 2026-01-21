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

*Document created: January 21, 2026*
*Status: Ready for review, pending implementation after Phase O*
