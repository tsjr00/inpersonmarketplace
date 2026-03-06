# Ecosystem Partner Platform — `partners.farmersmarketing.app`

**Status:** POST-LAUNCH TODO — Backlog item
**Created:** 2026-03-06
**Related Files:**
- `docs/CC_reference_data/Growth_Partner_System_Design.md` — Growth Partner compensation models (ambassador alternative)
- `docs/CC_reference_data/Geographic_Expansion_Algorithm.md` — Market scoring & revenue projections
- `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx` — Interactive planning workbook
- `docs/Build_Instructions/Phase_P_Friends_and_Partners_Specification.md` — Original partner directory spec (superseded by this doc)
- `docs/Regional_Franchise_Scaling_Plan.md` — Regional admin hierarchy (future evolution)

---

## Key Decisions (2026-03-06)

### Infrastructure: NOT a separate app
- Same Next.js codebase, same Supabase DB, same Vercel deployment
- Subdomain `partners.farmersmarketing.app` routes to `/partners/*` via Vercel rewrite
- 5 new tables in existing database, shared auth/images/email/Stripe
- **Incremental infrastructure cost: $0/month**

### Data Scope: Free toolset, NOT their backend
- We provide: profile page, events calendar, resource hosting, analytics
- We do NOT store: their membership lists, dues records, internal communications, financials, or member PII
- Partner keeps their own website, email list, and membership system
- We're additive (like Google Business Profile), not a replacement
- If a partner's member also signs up as a vendor, those are separate relationships — no cross-referencing unless vendor explicitly opts in

### Trust Hurdles Identified
1. **"What's the catch?"** → We benefit from credibility transfer and network exposure. No hidden data monetization. Put it in the partner agreement.
2. **"Will you compete with us?"** → We're a marketplace, not an advocacy org or service provider. Partners are complementary, not competitive.
3. **"Who owns uploaded content?"** → They do. We get display license. They can remove anytime.
4. **"What if you go under?"** → Their own website still exists. Profile is additive. Data export available.
5. **"Will you share my data?"** → Partner analytics are private. No cross-partner data sharing.
6. **"Why trust a startup?"** → Start with warm intros, free tier = zero risk, show existing vendor traction. First 3-5 partners are hardest; after that, the directory itself is social proof.

---

## The Thesis

Small nonprofits and advocacy organizations in the agriculture/food space have extensive networks of exactly the people our platform serves — but they're running on WordPress, Google Groups, Mailchimp free tier, and spreadsheets. They cobble together 6-10 disconnected free tools and spend staff time on manual processes.

**If we can replace 3-4 of those tools with something better, integrated, and free (or nearly free), we create a genuine value exchange:**
- They get technology they can't afford to build
- They share their presence on our domain to their networks
- Their members discover our marketplace organically
- The partner's credibility transfers to our platform

This is not a directory listing. This is giving partner organizations a **mini-platform within our platform** that actually helps them do their job.

---

## The Opportunity (By the Numbers)

| Organization Type | Count in US | Current Tech | Gap Severity |
|-------------------|-------------|-------------|--------------|
| National advocacy orgs (FARFA, NSAC) | ~50 | WordPress + EveryAction + Mailchimp | Medium |
| National coalitions (FMC) | ~10 | WordPress + broken membership mgmt | High |
| State FM associations | ~50 | WordPress/Squarespace + Eventbrite | High |
| Local food hubs | ~300+ | LFM or Local Line or manual | Medium |
| Food truck associations | ~100+ | Basic websites + Facebook | Very High |
| Individual farmers markets | 8,600+ | Square + Facebook + pen-and-paper | High |
| Small ag nonprofits (total) | 27,000+ | 6-10 disconnected free tools | High |

**89% cite budget constraints as their #1 technology obstacle. 64% lack in-house technical expertise.**

Their typical stack costs $0-200/month across 6-10 tools that don't talk to each other:
- Website: WordPress/Squarespace ($0-300/yr)
- Email: Mailchimp free tier ($0)
- Donations: EveryAction or PayPal ($varies)
- Events: Eventbrite ($per-ticket fees)
- Design: Canva ($0 via TechSoup)
- Communication: Google Groups / listservs ($0)
- Member management: Spreadsheets ($0)
- Payments: Square or Stripe ($transaction fees)

**What they need but can't build:** Integrated member directory, event management tied to membership, marketplace/vendor discovery, analytics, mobile-friendly communication, and compliance tracking.

**What doesn't exist today:** No platform combines marketplace + membership management + events + communication + analytics for this vertical. MarketMaker (land-grant university network) is the closest but it's directory-only and aging.

---

## Target Partner Profile: FARFA as Example

**Farm and Ranch Freedom Alliance** (farmandranchfreedom.org)
- National 501(c)(3) advocacy org based in Cameron, TX
- Focus: family farmers vs. corporate consolidation, regulatory advocacy
- 6 membership tiers ($5-$100/month)
- Services: legal consultations, legislative alerts, annual conference
- Tech: WordPress + EveryAction + social media
- No member directory, no marketplace, no interactive event platform
- Newsletter classifieds are their "marketplace" — literally a text listing in an email

**What FARFA needs that we could provide:**
1. A professional, searchable directory of their farmer/rancher members
2. Event management for their annual conference + regional meetups
3. A way for their members to discover and connect with local markets
4. Analytics on member engagement and regional activity
5. A branded presence they're proud to share: `partners.farmersmarketing.app/farfa`

**What FARFA gives us in return:**
1. Credibility — "FARFA is a Farmers Marketing partner" signals trust
2. Distribution — their membership network discovers our platform
3. SEO — content on our domain about farming advocacy, legal resources
4. Social proof — when FARFA shares their partner page, their followers see our brand
5. Warm introductions — FARFA members who need a marketplace are pre-qualified

---

## What `partners.farmersmarketing.app` Could Look Like

### Information Architecture

```
partners.farmersmarketing.app/
├── /                           Landing page — what is the Partner Platform?
├── /directory                  Searchable partner directory
├── /events                     Community calendar (aggregated from all partners)
├── /resources                  Shared resource library
├── /[partner-slug]             Individual partner profile page
│   ├── /[partner-slug]/events  Partner's events
│   ├── /[partner-slug]/resources  Partner's resources
│   └── /[partner-slug]/members    Partner's member directory (if they opt in)
└── /join                       Partner application form
```

### Partner Profile Page — `partners.farmersmarketing.app/farfa`

This is the centerpiece. It needs to be something the partner org is genuinely proud to share.

```
┌─────────────────────────────────────────────────────────┐
│  [FARFA Logo]                                           │
│  Farm and Ranch Freedom Alliance                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  "Supporting independent family farmers and ranchers"   │
│                                                         │
│  📍 Cameron, TX  •  🌐 farmandranchfreedom.org         │
│  Categories: Legal Services, Advocacy, Policy           │
│  Serves: TX, National  •  Since: 2006                  │
│                                                         │
│  [Visit Website]  [Become a Member]  [Share]            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ABOUT                                                  │
│  ─────                                                  │
│  FARFA supports independent family farmers and          │
│  ranchers against corporate consolidation and           │
│  restrictive regulations. We focus on fair markets,     │
│  scale-sensitive regulations, local food access,        │
│  and Farm Bill advocacy.                                │
│                                                         │
│  SERVICES                                               │
│  ────────                                               │
│  • Individual regulatory consultations                  │
│  • Legislative alerts and action center                 │
│  • Annual Southern Family Farmers Conference            │
│  • Cottage food and raw milk advocacy                   │
│  • Farm Bill policy analysis                            │
│                                                         │
│  UPCOMING EVENTS                                        │
│  ───────────────                                        │
│  📅 Aug 3-4, 2026 — Southern Family Farmers Conference  │
│     Texas State University, San Marcos, TX              │
│     [Details + Register]                                │
│                                                         │
│  📅 Monthly — Virtual Roundtable (members only)         │
│     [Details]                                           │
│                                                         │
│  RESOURCES                                              │
│  ─────────                                              │
│  📄 Texas Cottage Food Law Guide (PDF)                  │
│  📄 Raw Milk Legality by State (Interactive)            │
│  📄 FSMA Compliance Checklist for Small Farms           │
│  📄 How to Start a Farmers Market Booth                 │
│                                                         │
│  FEATURED MEMBERS                                       │
│  ────────────────                                       │
│  [Photo] Smith Family Farm — Organic produce, Cameron   │
│  [Photo] Hill Country Honey — Raw honey, Dripping Spgs  │
│  [Photo] Rio Bravo Ranch — Grass-fed beef, Laredo       │
│  [See all members →]                                    │
│                                                         │
│  FROM THE COMMUNITY                                     │
│  ──────────────────                                     │
│  ⭐ "FARFA helped us navigate cottage food licensing    │
│     when our county tried to shut us down."             │
│     — Hill Country Honey                                │
│                                                         │
│  ──────────────────────────────────────────────────     │
│  🤝 Farmers Marketing Partner since 2026                │
│  [Share this page]  [Report an issue]                   │
└─────────────────────────────────────────────────────────┘
```

### Community Calendar — `partners.farmersmarketing.app/events`

Aggregated from all partner organizations. Filterable by region, category, date.

```
┌─────────────────────────────────────────────────────────┐
│  COMMUNITY CALENDAR                                     │
│  ━━━━━━━━━━━━━━━━━                                     │
│  Events from our partner network                        │
│                                                         │
│  [Filter: Region ▼] [Category ▼] [This Month ▼]       │
│                                                         │
│  MARCH 2026                                             │
│  ──────────                                             │
│  Mar 12 — "Starting Your Cottage Food Business"         │
│           FARFA (Virtual) • Free                        │
│                                                         │
│  Mar 15 — TX Farmers Market Manager Workshop            │
│           TX FM Association • Austin, TX • $25           │
│                                                         │
│  Mar 20 — Food Truck Regulatory Compliance Seminar      │
│           Austin Food Truck Assoc • Austin • Free        │
│                                                         │
│  Mar 26 — NY Farmers Market Federation Conference       │
│           Albany, NY • $75 members / $125 non-members   │
│                                                         │
│  APRIL 2026                                             │
│  ──────────                                             │
│  Apr 5  — Regenerative Farming Field Day                │
│           Rodale Institute • Kutztown, PA • Free         │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
```

### Partner Directory — `partners.farmersmarketing.app/directory`

```
┌─────────────────────────────────────────────────────────┐
│  PARTNER DIRECTORY                                      │
│  ━━━━━━━━━━━━━━━━━                                     │
│  Organizations supporting local food and agriculture    │
│                                                         │
│  [Search...]  [Category ▼]  [State ▼]  [Type ▼]       │
│                                                         │
│  CATEGORIES:                                            │
│  [All] [Legal] [Advocacy] [Education] [Extension]      │
│  [Insurance] [Finance] [Marketing] [Certification]      │
│  [Nonprofit] [Government] [Association]                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ [Logo] FARFA — Farm & Ranch Freedom Alliance     │   │
│  │ Legal Services • Advocacy • National             │   │
│  │ Supporting family farmers since 2006             │   │
│  │ ⭐ 12 vendor endorsements                       │   │
│  │ [View Profile →]                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ [Logo] TX Farmers Market Association             │   │
│  │ Association • Education • Texas                  │   │
│  │ Supporting 200+ markets statewide                │   │
│  │ ⭐ 8 vendor endorsements                        │   │
│  │ [View Profile →]                                 │   │
│  └─────────────────────────────────────────────────┘   │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
```

---

## Value Exchange: What We Provide vs What We Get

### What Partners Get (The "Why Should FARFA Care?" Answer)

#### Tier 1: Free Partner Profile (All Partners)

| Feature | What It Replaces | Value |
|---------|-----------------|-------|
| **Professional profile page** on our domain | Their basic WordPress "About" page | SEO, credibility, professional presence |
| **Event listings** on community calendar | Eventbrite/Facebook events (disconnected) | Centralized, discoverable, integrated |
| **Resource hosting** (PDFs, guides, links) | Scattered across their website | Searchable, categorized, analytics |
| **Social sharing tools** | Manual social media posts | Pre-made graphics, one-click share, embed widgets |
| **Partner badge** ("Farmers Marketing Partner") | Nothing | Social proof, professional association |
| **Analytics dashboard** | No analytics at all | Profile views, resource downloads, event clicks, referral traffic |
| **Vendor endorsements** | Nothing | Social proof from the vendors they serve |
| **Link to their website + membership page** | Nothing | We actively drive traffic TO them |

#### Tier 2: Enhanced Partner Tools (Future — Could Be Free or Paid)

| Feature | What It Replaces | Value |
|---------|-----------------|-------|
| **Member directory** (opt-in by their members) | Spreadsheets / no directory | Searchable, self-service profiles, public or private |
| **Event registration** with payment processing | Eventbrite ($per-ticket fees) | Free or lower-cost alternative |
| **Newsletter/announcement tool** | Mailchimp free tier limitations | Reach members via push/email through our infra |
| **Featured placement** in vendor dashboard resources | Nothing | Their content surfaces to active vendors |
| **Co-branded landing page** | Nothing | `partners.farmersmarketing.app/farfa/join` for their membership drives |
| **SNAP/EBT resources** (relevant to FM partners) | Scattered, outdated info | Current, accurate, linked to platform data |

#### Tier 3: Deep Integration (Future — Premium)

| Feature | What It Replaces | Value |
|---------|-----------------|-------|
| **White-label member portal** | No portal at all | Members log in, see benefits, access resources |
| **Membership payment processing** | EveryAction / manual | Integrated dues collection, tier management |
| **Action alerts / advocacy tools** | Email blasts | Targeted push notifications to members |
| **Market data / analytics** | No data access | Regional market performance, vendor activity, consumer trends |
| **API access** | Nothing | Embed partner content on their own site |

### What We Get From Partners

| What We Get | How It Works |
|-------------|-------------|
| **Credibility by association** | "FARFA trusts Farmers Marketing" signals legitimacy to their network |
| **Distribution to warm audiences** | Partner shares profile → their members discover our platform |
| **SEO compound effect** | Partner pages, events, resources = content on our domain |
| **Vendor pipeline** | Partner members who are farmers/vendors are pre-qualified leads |
| **Social sharing loop** | Partner posts about their profile → their followers see our brand → some convert |
| **Content we don't create** | Partners upload resources, list events, write descriptions — user-generated content |
| **Market intelligence** | Partner event data tells us where activity is happening |
| **Competitive moat** | Once 50+ partners are on the platform, this network is hard to replicate |
| **Trust transfer** | A new vendor sees "FARFA Partner" badge on our platform → reduced signup friction |

---

## The FARFA Pitch (Example Conversation)

> "Hey, we're building Farmers Marketing — a platform that connects farmers market vendors with buyers for pre-orders and payments. We already serve [X] vendors across Texas.
>
> We know FARFA does incredible work for family farmers, and a lot of your members are exactly the people our platform helps. We'd love to feature FARFA as a partner on our platform.
>
> Here's what that means for you:
> - A professional partner page at `partners.farmersmarketing.app/farfa` that you can share with your membership
> - Your events listed on our community calendar (conference, roundtables, webinars)
> - Your resources (cottage food guides, FSMA checklists) available to our vendor base
> - Analytics showing how many people view your profile, click your events, download your resources
> - A 'Farmers Marketing Partner' badge you can use on your website and social media
> - Direct links to your membership page — we actively drive traffic to you
>
> There's no cost. We benefit because your members discover our platform through you, and your credibility makes our platform more trustworthy.
>
> Down the road, if it makes sense, we could also help with things like a searchable member directory for your farmer members, event registration with payment processing, or even member communication tools — things we know most small ag nonprofits struggle with technically.
>
> Would you be open to a conversation about it?"

The key: **lead with what they get, not what you get.** The value has to be real and immediate, not "we'll maybe do something later."

---

## How Partners Drive Vendor Acquisition (The Flywheel)

```
PARTNER JOINS
     │
     ▼
PARTNER SHARES PROFILE to their network
(social media, newsletter, website link, conference mention)
     │
     ▼
NETWORK MEMBERS visit partners.farmersmarketing.app
(farmers, ranchers, market managers, food truck owners)
     │
     ▼
VISITORS discover the main platform
(link from partner page: "Are you a vendor? Join Farmers Marketing →")
     │
     ▼
SOME VISITORS sign up as vendors
(attributed to partner if tracked, or organic)
     │
     ▼
MORE VENDORS = more value for existing vendors + buyers
     │
     ▼
VENDORS endorse their partner orgs on the platform
("I'm a FARFA member — they helped me get started")
     │
     ▼
ENDORSEMENTS make partner profile more attractive
     │
     ▼
PARTNER is motivated to share more → CYCLE REPEATS
```

This flywheel is **self-reinforcing** — each cycle makes the next cycle easier. Compare to the Growth Ambassador model which is linear (pay per vendor, stop paying = stop growing).

---

## Partner Categories

Based on research of existing organizations:

| Category | Examples | Why They're Valuable |
|----------|----------|---------------------|
| **Legal Services** | FARFA, farm law attorneys, cottage food consultants | Vendors need legal help; these orgs have farmer networks |
| **Advocacy / Policy** | NSAC, state farming associations, rural commerce groups | Influence policy + have large member bases |
| **Education / Extension** | Ag extension offices, land-grant universities, 4-H | Training programs feed new vendors into ecosystem |
| **Market Associations** | FMC, state FM federations, food truck associations | They ARE the gatekeepers — manage markets directly |
| **Insurance** | Farm bureau insurance, crop insurance agents | Every vendor needs insurance; natural cross-sell |
| **Finance / Accounting** | Farm CPAs, USDA lending, micro-lenders | Financial services for small producers |
| **Certification** | Organic certifiers, GAP auditors, food safety trainers | Certification = credibility for vendors |
| **Marketing / Branding** | Agricultural marketing firms, food photographers | Help vendors present better = more sales |
| **Technology** | POS providers, farm management software, delivery services | Complementary tools (not competitors) |
| **Sustainability** | Regenerative farming orgs, soil health nonprofits | Values alignment, passionate communities |
| **Government** | USDA offices, state ag departments, rural development | Grants, programs, official resources |
| **Community** | Local food councils, food banks, community gardens | Hyperlocal connections, mission-aligned |

---

## Technical Architecture

### Subdomain Approach

`partners.farmersmarketing.app` runs as part of the same Next.js app but with a different layout and navigation.

**Option A: Subdomain rewrite (recommended for MVP)**
```
# Vercel config or middleware
partners.farmersmarketing.app/* → /partners/*
```
- Same codebase, same deployment
- Different layout component for `/partners` routes
- Shared auth, shared database
- Partner pages are just another route group

**Option B: Separate app (future consideration)**
- Only if partner platform grows significantly
- Separate deployment, shared Supabase
- More independence but more complexity

### Shared Infrastructure

Partners benefit from existing platform infrastructure:
- **Auth system** — partners can log in with same Supabase auth
- **Image handling** — same upload/resize/CDN pipeline
- **Email** — same Resend infrastructure for notifications
- **Push notifications** — same VAPID/web push for event reminders
- **Payment processing** — same Stripe for event tickets or premium tiers
- **Search** — same patterns for directory search and filtering

### New Routes (MVP)

```
/partners/                          → Landing page
/partners/directory                 → Searchable partner directory
/partners/events                    → Community calendar
/partners/resources                 → Shared resource library
/partners/[slug]                    → Partner profile page
/partners/[slug]/events             → Partner's events
/partners/[slug]/resources          → Partner's resources
/partners/join                      → Partner application form
/partners/dashboard                 → Partner admin dashboard (logged-in partner)

API routes:
/api/partners                       → CRUD for partner profiles
/api/partners/[id]/events           → Partner event management
/api/partners/[id]/resources        → Partner resource management
/api/partners/[id]/analytics        → Partner analytics data
/api/partners/directory             → Directory search/filter
/api/partners/events                → Community calendar aggregation
```

### Database Schema

Extends the partner tables from Phase_P spec with event and resource capabilities:

```sql
-- Core partner profile (adapted from Phase P spec)
CREATE TABLE partner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  vertical_id TEXT REFERENCES verticals(vertical_id),

  -- Identity
  organization_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,                    -- URL-safe: /partners/farfa
  tagline TEXT,                                 -- short description (≤150 chars)
  description TEXT,                             -- full description (markdown)
  logo_url TEXT,
  cover_image_url TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,                                   -- public contact email

  -- Classification
  categories TEXT[] DEFAULT '{}',               -- from category enum
  organization_type TEXT,                       -- 'nonprofit' | 'government' | 'business' | 'association'
  service_areas TEXT[] DEFAULT '{}',            -- regions/states served
  founded_year INTEGER,

  -- Social links
  social_links JSONB DEFAULT '{}',
  -- { facebook, instagram, twitter, linkedin, youtube }

  -- Membership (if applicable)
  membership_url TEXT,                          -- link to their membership page
  membership_description TEXT,                  -- brief description of membership benefits

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'approved' | 'active' | 'suspended'
  tier TEXT NOT NULL DEFAULT 'free',             -- 'free' | 'enhanced' | 'premium'

  -- Analytics (denormalized for fast display)
  profile_views INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  resource_count INTEGER DEFAULT 0,
  endorsement_count INTEGER DEFAULT 0,

  -- Admin
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partner events (community calendar)
CREATE TABLE partner_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,

  -- Event details
  title TEXT NOT NULL,
  description TEXT,                              -- markdown
  event_type TEXT,                               -- 'conference' | 'workshop' | 'webinar' | 'meetup' | 'field_day' | 'other'
  location_type TEXT,                            -- 'in_person' | 'virtual' | 'hybrid'
  location_name TEXT,                            -- venue name
  location_address TEXT,
  location_city TEXT,
  location_state TEXT,
  location_zip TEXT,
  virtual_url TEXT,                              -- Zoom/Teams link (hidden until registered, or public)

  -- Timing
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  timezone TEXT DEFAULT 'America/Chicago',
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,                          -- iCal RRULE format (future)

  -- Registration
  registration_url TEXT,                         -- external registration link
  registration_required BOOLEAN DEFAULT FALSE,
  cost_description TEXT,                         -- 'Free' | '$25 members / $50 non-members'
  max_attendees INTEGER,

  -- Metadata
  categories TEXT[] DEFAULT '{}',
  cover_image_url TEXT,
  status TEXT DEFAULT 'published',               -- 'draft' | 'published' | 'cancelled'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_partner_events_date ON partner_events(starts_at) WHERE status = 'published';
CREATE INDEX idx_partner_events_partner ON partner_events(partner_id);

-- Partner resources (guides, PDFs, links)
CREATE TABLE partner_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,

  -- Resource details
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL,                   -- 'pdf' | 'link' | 'video' | 'guide' | 'toolkit'
  url TEXT,                                      -- external link or uploaded file URL
  file_url TEXT,                                 -- uploaded file (PDF, etc.)
  thumbnail_url TEXT,

  -- Classification
  categories TEXT[] DEFAULT '{}',
  target_audience TEXT,                          -- 'vendors' | 'market_managers' | 'buyers' | 'all'
  states TEXT[] DEFAULT '{}',                    -- applicable states (empty = national)

  -- Tracking
  download_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published',               -- 'draft' | 'published'
  featured BOOLEAN DEFAULT FALSE,                -- featured on main resources page

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_partner_resources_partner ON partner_resources(partner_id);

-- Vendor endorsements of partners
CREATE TABLE partner_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,

  endorsement_text TEXT NOT NULL,                -- 50-500 chars
  rating INTEGER,                                -- 1-5 stars (optional)

  status TEXT DEFAULT 'published',               -- 'published' | 'hidden' | 'flagged'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(partner_id, vendor_profile_id)
);

-- Partner profile analytics (daily snapshots)
CREATE TABLE partner_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  profile_views INTEGER DEFAULT 0,
  event_views INTEGER DEFAULT 0,
  resource_views INTEGER DEFAULT 0,
  resource_downloads INTEGER DEFAULT 0,
  website_clicks INTEGER DEFAULT 0,              -- clicks to partner's external website
  membership_clicks INTEGER DEFAULT 0,           -- clicks to partner's membership page
  social_shares INTEGER DEFAULT 0,
  referral_signups INTEGER DEFAULT 0,            -- vendor signups attributed to this partner

  UNIQUE(partner_id, date)
);

CREATE INDEX idx_partner_analytics_date ON partner_analytics(partner_id, date);
```

---

## Value Delivery: Concrete Features by Phase

### Phase 1 MVP — "Something Worth Sharing"

The minimum that makes a partner proud to post on their socials.

**Partner Profile Page:**
- Organization name, logo, tagline, full description
- Category badges and service area
- Link to their website and membership page
- Social media links
- Contact information
- "Farmers Marketing Partner" badge with date joined

**Event Listings:**
- Partners can list upcoming events (conferences, workshops, webinars)
- Events appear on their profile AND on the community calendar
- Event details: title, date, location/virtual, cost, registration link
- Basic event categories and filtering

**Resource Uploads:**
- Partners can upload/link PDFs, guides, videos
- Resources appear on their profile AND in shared resource library
- Basic categorization and search

**Partner Directory:**
- Searchable list of all approved partners
- Filter by category, state, organization type
- Card view with logo, name, tagline, categories

**Social Sharing:**
- Share buttons on every partner page
- Open Graph meta tags for rich social previews
- Suggested social copy: "We're proud to be a @FarmersMarketing partner! Find us at [link]"

**Basic Analytics:**
- Profile views (total and over time)
- Event clicks
- Resource downloads
- Website click-throughs

**Vendor Endorsements:**
- Vendors on the main platform can endorse partner orgs they work with
- Endorsements show on partner profile as social proof
- Max 5 endorsements per vendor across all partners

**Cross-linking from Main Platform:**
- Vendor dashboard: "Partner Resources" section showing relevant guides/events
- Vendor signup: "Recommended by [Partner Name]" when referred
- Browse page: "Community Events" sidebar or section

### Phase 2 — "Better Than What They Have"

Features that start replacing partner's existing disconnected tools.

**Enhanced Event Management:**
- Event registration tracking (who's interested/attending)
- Event reminders via push notification to interested users
- Post-event feedback/survey capability
- Recurring event support (monthly meetups)
- Calendar export (iCal, Google Calendar)

**Member Visibility (Opt-in):**
- Partner's vendor members who are also on our platform can be featured
- "FARFA Members on Farmers Marketing" section on partner profile
- Only shows vendors who opt in to being listed under that partner
- Drives cross-discovery: partner members find each other

**Partner Dashboard Improvements:**
- Traffic sources (where are profile visitors coming from?)
- Conversion tracking (how many profile visitors became vendor signups?)
- Resource performance (which guides get most downloads?)
- Event performance (which events get most interest?)
- Monthly summary email to partner contact

**Embeddable Widgets:**
- Partner badge widget for their website: "We're a Farmers Marketing Partner"
- Event widget: embed upcoming events on partner's own site
- Resource widget: embed latest resources
- Simple iframe or JavaScript embed code

**Co-branded Landing Pages:**
- `partners.farmersmarketing.app/farfa/vendors` — "FARFA members: join Farmers Marketing"
- Custom messaging from partner ("As a FARFA member, you'll find...")
- Vendor signup with auto-attribution to partner
- Partner can customize the CTA and description

### Phase 3 — "Platform Within a Platform"

Deep integration that makes the partner platform indispensable.

**Member Communication Tools:**
- Partners can send announcements to their members on the platform
- Push notifications, in-app messages, or email via our infrastructure
- Audience segmentation (by region, tier, activity level)
- This replaces Google Groups / Mailchimp for intra-org communication

**Event Registration + Payment:**
- Built-in event registration (no more Eventbrite)
- Payment processing for paid events through our Stripe
- Member pricing vs non-member pricing
- Attendee management and check-in

**Member Directory:**
- Self-service member profiles within partner org
- Searchable by location, specialty, certifications
- Public or members-only visibility toggle
- This replaces the spreadsheet most small nonprofits use

**Content Publishing:**
- Blog/article publishing on partner profile
- Newsletter creation and distribution
- Content shows in platform-wide resource feed

**Data Insights:**
- Regional market data (anonymized, aggregated)
- Vendor activity trends in partner's service area
- Consumer demand signals relevant to partner's mission
- "Your region has 45 active vendors, up 12% this quarter"

---

## Design & Brand Considerations

### Visual Identity

The partner platform should feel **connected to but distinct from** the main marketplace:

- **Shared:** Typography, spacing system, component library (buttons, cards, inputs)
- **Different:** Color palette shifts — softer, more neutral tones. Less commerce-focused, more community/institutional
- **Header/nav:** Simpler than main app. No cart, no vendor tools. Just: Directory, Events, Resources, [Partner Dashboard]
- **Footer:** Links back to main platform + partner-specific links

Suggested palette modifier for partner platform:
```
Main FM:     Primary #2d6a4f (forest green) — commerce, transactions
Partners:    Primary #3d7a6f (sage green) — community, support, softer
             Secondary #6b8e7b (muted green)
             Accent #c9a96e (warm gold) — partner badge, featured content
```

### Partner Badge

A visual mark partners can display on their own website/materials:

```
┌──────────────────────────────┐
│  🌱 Farmers Marketing        │
│     COMMUNITY PARTNER        │
│     ─── Since 2026 ───       │
└──────────────────────────────┘
```

Provided as: SVG, PNG (multiple sizes), and embeddable HTML widget.

---

## How This Connects to Revenue (Without Charging Partners)

The partner platform is a **growth engine**, not a profit center (at least initially).

### Direct Revenue Paths
1. **Vendor acquisition** — Partners drive vendor signups → vendors pay subscriptions + platform fees
2. **Premium partner tier** (future) — Enhanced tools for $19.99/mo (from Phase P spec)
3. **Event ticket processing** — Small % of event ticket sales (like Eventbrite but lower)
4. **Sponsored placement** — Partners can pay for featured positioning in directory/dashboard

### Indirect Revenue Paths
5. **SEO compound effect** — Every partner page, event, and resource is indexed content on our domain
6. **Trust/credibility** — Partner logos on our landing page ("Trusted by FARFA, FMC, TX FM Association...")
7. **Network effect** — More partners → more content → more traffic → more vendors → more buyers → more value for partners → more partners
8. **Market intelligence** — Partner event data tells us where activity is happening (informs geographic expansion)
9. **Competitive moat** — 50+ partner relationships are incredibly hard for a competitor to replicate

### The Math

If partners collectively drive 100 vendor signups in Year 1:
- 100 vendors × avg $15/mo subscription = $1,500/mo subscription revenue
- 100 vendors × avg $100/mo platform fees = $10,000/mo transaction revenue
- Total: $11,500/month in platform revenue from partner-attributed vendors
- Cost: Development time + minimal hosting (shared infrastructure)
- No ongoing cash payout to partners (value exchange is tools, not money)

Compare to Growth Ambassador model:
- 100 vendors at 15% revenue share = $1,725/month in payouts
- Net to platform: $9,775/month (vs $11,500 with ecosystem model)

**The ecosystem model costs less per vendor AND builds a sustainable competitive advantage.**

---

## FT Vertical: The Bigger Opportunity — `partners.foodtruckn.app`

### The Finding: A $2.8B Industry With No Advocacy Infrastructure

Research (2026-03-06) reveals the food truck industry is dramatically underserved compared to farmers markets on every organizational dimension:

| Category | Farmers Markets | Food Trucks |
|---|---|---|
| **National advocacy org** | FMC — 10 staff, $1.2M budget, active federal lobbying, published research | Nothing. NFTA is a content/consulting site. FTAA is an informal peer group. Neither does real advocacy. |
| **State associations** | Strong in most states, many with paid staff and state ag dept funding | ~15-20 states/metros, mostly volunteer-run event booking co-ops. Only 3-4 do legislative work. |
| **Legal advocacy** | Not a major need — governments support markets | Institute for Justice (outside law firm) does more than any FT org. No dedicated FT legal defense. |
| **Government funding** | USDA FMPP: **$10.5M/year** in grants. Farm Bill authorization. SNAP equipment subsidies. | **$0.** No USDA program. No federal grants. No dedicated support whatsoever. |
| **Industry data** | USDA directory (9,000+ markets). FMC surveys. Academic research programs. | IBISWorld topline numbers. U.S. Chamber Food Truck Nation report (2018, never updated). No centralized data. |
| **Training/certification** | Market Manager certification (FMC). State extensions. USDA-funded training. | No standardized certification. ServSafe is foodservice-wide. Community college programs and commercial courses only. |
| **Government relationship** | USDA has dedicated FM directory and liaison. State ag depts actively support markets. | No government agency has a food truck portfolio. Cities actively restrict them. |
| **Academic research** | Extensive USDA-funded research. Multiple university programs. | Only 243 published documents from 2000-2025. No dedicated research centers. |
| **Annual conference** | FMC annual conference + state-level events | FT Owners Expo draws ~400 people — for a 92,000-business industry |
| **Political goodwill** | High. Bipartisan support. Government sees markets as food access infrastructure. | Mixed to hostile. Restaurant industry lobbies against trucks. Cities see them as problems to regulate. |

### The "National" Organizations Are Hollow

**NFTA (National Food Truck Association):**
- Founded by Matt Geller (UCLA Law), who did genuine advocacy through SoCal MFVA in the early 2010s
- His primary focus shifted to Best Food Trucks (a commercial booking platform where he's CEO)
- NFTA website has blog content and a directory but no evidence of active legislative advocacy, lobbying, policy positions, or annual reports
- No visible membership dues structure for individual operators
- No annual conference
- **Assessment: Content/consulting brand, not a functioning advocacy organization**

**FTAA (Food Truck Associations of America):**
- Coalition of state-level association leaders who share ideas
- Bare-bones website. No visible membership list, advocacy wins, events, or annual report
- No social media presence
- **Assessment: Informal peer network, not a functioning national organization**

### State/Regional Associations That Actually Do Things

**Tier 1 — Active and doing real advocacy:**

| Association | Location | Members | What They Actually Do |
|---|---|---|---|
| DMV Food Truck Association | DC/MD/VA | 100+ | Defeated DC food truck moratorium (2010). Active lobbying across 4+ jurisdictions. Legitimate advocacy org. |
| SoCal MFVA | Southern CA | 130+ | Expanded rights in 30+ jurisdictions. Matt Geller's original org. Still operating. |
| MN Food Truck Association | Minnesota | 100+ | Official state trade association. Annual meetings, advocacy, member profiles. |
| Nashville FTA | Nashville, TN | 70-80+ | Weekly Street Food Thursdays, Street Food Month, charitable work. Visible and active. |

**Tier 2 — Exist and functional (mostly event booking):**
- NY Food Truck Association (NYC, 100+ members, event booking focus)
- Food Truck Association of Georgia (Atlanta)
- Washington State FTA (non-profit advocacy)
- South Florida FTA (180 members, advocacy since 2014)
- Cincinnati FTA, Central Ohio FTA, Pittsburgh FTA
- Food Truck Association of Los Angeles (80+ vendors, primarily events/catering)

**Texas — Fragmented by city, no statewide org:**
- Austin FTA (ATXFTA), North Texas FTA (NTXFTA), Dallas FTA (DALFTA)
- Food Truck Association of San Antonio (FTASA)
- Austin Food Trailer Chamber (separate from ATXFTA)
- No single statewide voice

**States with NO visible FT association:**
Colorado, Oregon (despite Portland being one of the friendliest cities), North Carolina, and many others.

### The Regulatory Nightmare (Why Advocacy Matters)

Per the U.S. Chamber of Commerce Food Truck Nation report:
- Average food truck must complete **45 separate government procedures**
- Takes **37 business days** to get running
- Costs roughly **$28,276 annually** just in compliance

Top pain points:
1. **Proximity laws** — Many cities require 100-500ft from brick-and-mortar restaurants (Chicago: 200ft, Minneapolis: up to 500ft from sports events)
2. **Permitting fragmentation** — A permit from one city is almost never valid in the next. Operators serving multiple areas face duplicative fees
3. **Commissary requirements** — Many jurisdictions require daily reporting to a licensed commissary
4. **Restaurant industry lobbying** — Brick-and-mortar restaurants actively lobby for protectionist ordinances
5. **Zoning restrictions** — Time limits (some as short as 30 minutes), prohibited zones, hour limits

**Institute for Justice** is the real hero: 12+ lawsuits filed, most won. Created the Model Mobile Food Vendor Freedom Act. Published "Food Truck Truth" report proving trucks don't harm restaurants. But IJ is a general economic liberty firm — they're not food-truck-specific and can only take a handful of cases.

Only ~4 states have passed preemption laws preventing localities from banning food trucks entirely (Utah, Georgia, Washington + others).

### Where Food Truck Operators Get Information Today

| Source | Type | Reach | Limitations |
|---|---|---|---|
| Food Truck Operator (foodtruckoperator.com) | Trade publication | 10K email subscribers, 110K annual visitors | Commercial media, not advocacy |
| FoodTruckr (foodtruckr.com) | Blog/podcast | 36.7K Facebook followers | Content site, no advocacy |
| Food Truck Profit (foodtruckprofit.com) | Commercial courses | Unknown | Paid education, state guides for all 50 states |
| Mobile Cuisine (mobile-cuisine.com) | Blog/directory | Unknown | Food truck laws by city, but incomplete |
| Roaming Hunger (roaminghunger.com) | Booking marketplace | 17,978 trucks listed | Commercial platform, not advocacy |
| Best Food Trucks (bestfoodtrucks.com) | Booking/ordering | Unknown | Matt Geller's commercial platform |
| Goodfynd (goodfynd.com) | POS/management | Unknown | Technology platform, not advocacy |
| Facebook Groups | Community | Fragmented across local groups | No centralized national community |
| Food Truck Scholar Podcast | Academic/cultural | Niche | Excellent but academic, not operational |

**Key finding: Nobody combines advocacy + education + community + technology. The space is fragmented across commercial competitors, none of whom do advocacy.**

### What Food Truck Operators Need But Can't Find

1. **A real national voice** — Nobody calls Congress on behalf of food truck operators
2. **Regulatory navigation tools** — No centralized database of permit requirements by city/county
3. **Government funding parity** — $0 vs $10.5M/year for farmers markets
4. **Standardized industry data** — Nobody tracks truck counts, revenue, failure rates systematically
5. **Commissary network directory** — Finding a compliant commissary is a major barrier
6. **Collective purchasing power** — No group rates for insurance, supplies, fuel, equipment
7. **Standardized event/booking infrastructure** — Still finding each other through Facebook and word of mouth
8. **Legal resources** — When a city passes a restrictive ordinance, operators fight alone

---

## Strategic Reframe: Food Truck'n AS the Advocacy Platform

### The Opportunity

For farmers markets, you're partnering WITH existing advocacy orgs (FARFA, FMC, state associations). For food trucks, you could BE the advocacy org. Nobody else is doing it.

**Instead of:**
> "Food Truck'n is a marketplace app. Also, here are some partner organizations."

**Position as:**
> "Food Truck'n is the food truck industry's home base — the place operators go for regulatory info, community, business resources, and yes, also a marketplace for pre-orders and payments."

This is the "sell advocacy instead of selling the app" insight. The app becomes a natural extension of the trust relationship, not a cold sell.

### What "Being the FARFA for Food Trucks" Looks Like

#### Content/Resources (Free, builds trust)
- **Regulatory database** — Permit requirements, fees, and restrictions by city/county. Start with TX, expand. This doesn't exist anywhere in a reliable, current form.
- **Starting a food truck guides** — State-by-state. Food Truck Profit charges for this; you give it away.
- **Commissary directory** — Where to find compliant commissary kitchens. Currently no national directory.
- **Insurance comparison** — FLIP, NEXT, Progressive, Hartford. Side-by-side with real costs.
- **Legal rights explainer** — "What to do when your city tries to restrict food trucks." Link to IJ resources.
- **Industry data** — Annual survey of operators. Revenue benchmarks, cost benchmarks, failure rates. Nobody publishes this.

#### Community (Free, builds network)
- **Food truck operator directory** — "Find food trucks in your area" (this IS your vendor directory)
- **Event calendar** — Food truck rallies, festivals, association meetups
- **Forum or discussion space** — Q&A for operators (future, Phase 3+)
- **Featured truck spotlights** — Editorial content highlighting operators

#### Advocacy (Free, builds loyalty)
- **Track legislation** — Monitor bills affecting food trucks in TX (expand later)
- **Action alerts** — "Your city council is voting on a food truck restriction Tuesday"
- **Model ordinance library** — Share IJ's Model Mobile Food Vendor Freedom Act
- **"Food Truck Friendly" city ratings** — Rate cities on how easy they make it for trucks
- **Partnership with IJ** — Formal relationship, feature their cases and resources

#### Platform (Revenue, natural extension)
- **Pre-order & payments** — The core marketplace app
- **Scheduling & location** — Where trucks will be and when
- **Vendor tools** — Listings, inventory, order management
- **Subscriptions** — Tiered vendor plans

### The Sales Cycle Shift

| Traditional App Sell | Advocacy-First Sell |
|---|---|
| "Sign up for our marketplace platform" | "We're building the resource hub the food truck industry never had" |
| Cold outreach to individual truck operators | Operators find you because you have the best regulatory info |
| Competing with Goodfynd, Roaming Hunger, Square | No competition — nobody else does advocacy + marketplace |
| Value prop: "We'll get you more orders" | Value prop: "We fight for your right to operate + here are tools" |
| Churn risk: operator can switch platforms | Sticky: operators trust you as their industry home |
| CAC: high (paid ads, cold outreach) | CAC: low (content marketing, organic search, social sharing) |

### The Content Flywheel

```
You publish: "Texas Food Truck Permit Guide — Every City & County"
     │
     ▼
Food truck operators find it via Google (SEO)
     │
     ▼
They bookmark foodtruckn.app as a resource
     │
     ▼
They see you also have a marketplace platform
     │
     ▼
Some sign up as vendors (organic conversion)
     │
     ▼
They tell other operators: "Have you seen Food Truck'n?"
     │
     ▼
More operators visit → more signups → more content value
     │
     ▼
You become THE trusted resource → competitive moat
```

### FM Partners + FT Advocacy = Both Verticals Covered

| Vertical | Strategy | Why |
|---|---|---|
| **Farmers Markets** | Partner with existing orgs (FARFA, FMC, state associations) | Infrastructure exists — plug into it |
| **Food Trucks** | BE the industry resource yourself | Infrastructure doesn't exist — create it |

This actually makes both verticals stronger:
- FM partners see you doing genuine advocacy work for FT → increases trust
- FT operators see you partnering with credible FM orgs → increases legitimacy
- Content from both verticals drives SEO compound effect
- The platform becomes "the local food industry hub" not just "an ordering app"

### Competitive Landscape: Who You'd Be Competing With (And Why You Win)

| Competitor | What They Do | What They Don't Do | Your Advantage |
|---|---|---|---|
| **Roaming Hunger** | Booking marketplace (17K trucks) | No advocacy, no resources, no community | You do both |
| **Best Food Trucks** | Booking + ordering | No advocacy (despite founder's history) | You do both |
| **Goodfynd** | POS + management + AI leads | No advocacy, no community | You do both |
| **Food Truck Profit** | Paid courses + state guides | No marketplace, no advocacy, charges for info | You give it away |
| **FoodTruckr** | Blog + podcast | No marketplace, no advocacy, just content | You have platform + advocacy |
| **NFTA** | Content website | No real advocacy, no marketplace | You do both |

Nobody combines advocacy + education + marketplace + community. You'd be the first.

---

## FT Partner Categories (Adjusted for Reality)

Given the thin ecosystem, partner categories shift from "organizations we partner with" to "categories of content and resources we provide + the few real organizations that exist":

| Category | Partner Opportunity | Content Opportunity |
|---|---|---|
| **Legal / Advocacy** | Institute for Justice (formal link) | Regulatory guides, rights explainers, model ordinances |
| **Associations** | MN FTA, Nashville FTA, DMV FTA, SoCal MFVA + city-level TX groups | Association directory, help them have a presence |
| **Insurance** | FLIP, NEXT Insurance, Progressive | Insurance comparison guides, cost benchmarks |
| **Commissary Kitchens** | Local commissaries (invite them as partners) | Commissary directory by city/state |
| **Equipment / Builders** | Prestige Food Trucks, Concession Nation, Custom Concessions | Startup cost guides, equipment comparison |
| **Financing** | SBA, Lendio, Biz2Credit | Financing guide, loan comparison, SBA microloan explainer |
| **Education** | Street Food Institute, MSU free course, community colleges | Curated learning paths, free vs paid course comparison |
| **Food Truck Parks** | Park owners join as partners (like FM market managers) | Park directory, "start a food truck park" guide |
| **Event Organizers** | Festival organizers join as partners | Event calendar, "how to get booked" guides |
| **Government** | SBA offices, state health departments | Permit requirement database by city/county |
| **Technology** | POS providers (non-competing), delivery services | Tool comparison guides |

---

## Open Questions

### Strategic
- [ ] **Both verticals simultaneously?** FM ecosystem play + FT advocacy play use the same infrastructure. Could launch together.
- [ ] **How many partners for launch?** Recommend 5-10 hand-curated for FM. For FT, start with content (regulatory guides, commissary directory) and invite the ~6 real associations.
- [ ] **Combine with Growth Partner compensation?** Could ecosystem partners ALSO earn modest revenue share, or keep it pure value exchange?
- [ ] **Does this replace Phase P spec?** This is a more ambitious, research-backed version. Recommend replacing Phase P with this approach.
- [ ] **"Sell advocacy" branding:** Does FT landing page / marketing shift to lead with advocacy + resources, with marketplace as a feature? Or keep separate?
- [ ] **IJ partnership:** Formal content partnership? Feature their cases? Link to their Model Freedom Act? They may welcome a platform that amplifies their work.

### Content Priority
- [ ] **First content pieces:** TX food truck permit guide (every city/county)? Commissary directory? Insurance comparison? Starting a food truck guide?
- [ ] **Who writes it?** You (with Claude research), freelance writers, or partner orgs contributing?
- [ ] **Content format:** Static pages on foodtruckn.app? Or partner subdomain? Both?

### Tactical
- [ ] **Subdomain routing:** Vercel rewrites vs middleware approach?
- [ ] **Partner onboarding:** Admin-only creation (MVP) vs self-service application?
- [ ] **Content moderation:** Who reviews partner-submitted events and resources?
- [ ] **SEO strategy:** Do partner pages need their own sitemap? Regulatory content SEO plan?

### Outreach (FM)
- [ ] **First FM target:** FARFA? FMC? A state FM association? Local org?
- [ ] **Pitch approach:** Cold email? Warm intro? Conference booth?
- [ ] **Value proof:** What's the minimum we need built before approaching the first partner?

### Outreach (FT)
- [ ] **First FT targets:** MN FTA, Nashville FTA, DMV FTA (the 3 most active). TX city-level groups.
- [ ] **IJ approach:** Email their communications team? They may welcome a platform that features their work.
- [ ] **Content-first strategy:** Publish regulatory guides BEFORE reaching out to associations. Show up with value already created.

---

## Implementation Estimate

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 1 MVP** | Partner profiles, events, resources, directory, basic analytics | 3-4 sessions |
| **Phase 2 Enhanced** | Dashboard improvements, widgets, co-branded pages, member visibility | 2-3 sessions |
| **Phase 3 Deep** | Communication tools, event registration + payment, member directory, content publishing | 4-6 sessions |
| **FT Content** | Regulatory database, commissary directory, resource guides (can be done in parallel with Phase 1) | 1-2 sessions for initial content |

Phase 1 builds heavily on existing patterns:
- Profile pages mirror vendor profile structure
- Event listings mirror the existing events feature (Session 39)
- Resource uploads mirror listing image uploads
- Directory mirrors vendor browse page
- Analytics mirrors existing pattern (simple counters + daily snapshots)

The subdomain routing is straightforward — middleware already handles `[vertical]` routing. Adding partner subdomain detection is a similar pattern.

---

## Research Sources

### Food Truck Industry Organizations
- [National Food Truck Association](https://nationalfoodtrucks.org/about-us)
- [Food Truck Associations of America](https://www.foodtruckassociationsofamerica.org/)
- [MN Food Truck Association](https://mnfoodtruckassociation.org/)
- [Nashville Food Truck Association](https://www.nashvillefta.org/)
- [DMV Food Truck Association](https://www.linkedin.com/company/dmv-food-truck-association)
- [SoCal MFVA](https://socalmfva.com/)
- [New York Food Truck Association](https://nyfta.org/join)
- [Food Truck Association of Georgia](https://www.foodtruckassociationofgeorgia.com/)
- [Washington State Food Truck Association](https://wafoodtrucks.org)
- [Austin FTA](https://atxfta.org/) | [North Texas FTA](https://ntxfta.org/) | [Dallas FTA](https://dalfta.org/) | [San Antonio FTASA](https://ftasa.org/)

### Advocacy & Legal
- [Institute for Justice — Vending/Food Trucks](https://ij.org/issues/economic-liberty/vending/)
- [IJ Model Mobile Food Vendor Freedom Act](https://ij.org/legislation/mobile-food-vendor-freedom-act/)
- [IJ Food Truck Truth Report](https://ij.org/report/food-truck-truth/)
- [U.S. Chamber of Commerce Food Truck Nation](https://www.uschamberfoundation.org/emerging-issues/food-truck-nation)
- [PBS: Best and Worst Cities for Food Trucks](https://www.pbs.org/newshour/economy/making-sense/the-best-and-worst-cities-for-running-a-food-truck)

### Industry Data & Media
- [IBISWorld Food Trucks Industry](https://www.ibisworld.com/united-states/industry/food-trucks/4322/)
- [CNBC: Food Trucks Nearing $3B](https://www.cnbc.com/2025/11/01/food-truck-restaurant-billion-dollar-business-keys-success-costs.html)
- [Food Truck Operator](https://www.foodtruckoperator.com/)
- [FoodTruckr](https://foodtruckr.com/)
- [Food Truck Profit](https://www.foodtruckprofit.com/)
- [Roaming Hunger](https://roaminghunger.com)
- [Goodfynd](https://www.goodfynd.com/)
- [Food Truck Scholar Podcast](https://podcasts.apple.com/us/podcast/the-food-truck-scholar/id1456602492)

### Education & Support
- [Street Food Institute](https://streetfoodinstitute.org/)
- [Michigan State University — Free FT Course](https://www.canr.msu.edu/courses/how-to-start-a-food-truck-business)
- [The Food Corridor / NICK](https://www.thefoodcorridor.com/thenick/)
- [FLIP Insurance](https://www.fliprogram.com/food-truck-insurance)

### Farmers Market Comparison
- [Farmers Market Coalition](https://farmersmarketcoalition.org/)
- [USDA Farmers Market Promotion Program](https://www.ams.usda.gov/services/grants/fmpp)
- [USDA National Farmers Market Directory](https://www.ams.usda.gov/local-food-directories/farmersmarkets)
- [Farm and Ranch Freedom Alliance](https://farmandranchfreedom.org)
