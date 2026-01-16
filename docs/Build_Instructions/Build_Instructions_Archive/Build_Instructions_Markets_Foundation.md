# Build Instructions: Markets Foundation

**FOR CC TO READ AND EXECUTE**

**Phase:** Phase-K-1-Markets-Foundation  
**Branch:** feature/markets-foundation  
**Estimated Time:** 2-4 hours  
**Complexity:** High  
**Parallel With:** Phase-K-2-Vendor-Analytics

---

## CC: CRITICAL - Autonomous Operation Mode

**CC: Full autonomous permission. Do NOT ask Tracy for permission for file operations, package installs, commits, or pushes. Just do it and report what you did.**

**Only ask if:** Deleting production data, adding secrets, or truly ambiguous requirement.

---

## CC: Objective

Build foundation for markets functionality supporting both traditional farmers markets (fixed schedules) and private pickup locations (flexible timing). Includes database tables, API endpoints, vendor market management, and admin UI. Enables pre-sales feature in future phase.

---

## CC: Pre-flight Checklist

**FIRST: Read PROJECT_CONTEXT.md for:**
- Tech stack and architecture patterns
- Database conventions and RLS patterns
- Component library location and usage
- Business rules (market types, fees, tiers)
- Existing tables (don't recreate)
- Code style standards

**File location:** `/docs/PROJECT_CONTEXT.md`

**Then verify:**
- [ ] On branch: feature/markets-foundation
- [ ] Latest pulled from main
- [ ] verticals and vendors tables exist
- [ ] Component library available (AdminTable, StandardForm, StatusBadge)
- [ ] Understand Fixed vs Private Pickup market types

**CC: Report verification, then proceed**

---

## Database Implementation

### Migration 1: Markets Foundation Tables

**File:** `/supabase/migrations/YYYYMMDD_phase_k1_markets_tables.sql`

**Tables to create:**

```sql
-- Markets table
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('traditional', 'private_pickup')),
  description TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market schedules (for traditional markets)
CREATE TABLE market_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market vendors (junction table)
CREATE TABLE market_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  approved BOOLEAN DEFAULT false,
  booth_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, vendor_id)
);

-- Indexes
CREATE INDEX idx_markets_vertical ON markets(vertical_id);
CREATE INDEX idx_markets_active ON markets(active);
CREATE INDEX idx_market_schedules_market ON market_schedules(market_id);
CREATE INDEX idx_market_vendors_market ON market_vendors(market_id);
CREATE INDEX idx_market_vendors_vendor ON market_vendors(vendor_id);

-- RLS policies
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_vendors ENABLE ROW LEVEL SECURITY;

-- Public can view active markets
CREATE POLICY "Markets viewable by all"
  ON markets FOR SELECT
  USING (active = true);

-- Admins can manage markets
CREATE POLICY "Markets manageable by admins"
  ON markets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Market schedules viewable with market
CREATE POLICY "Schedules viewable with market"
  ON market_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM markets WHERE id = market_id AND active = true
    )
  );

-- Admins manage schedules
CREATE POLICY "Schedules manageable by admins"
  ON market_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Vendors can view their market associations
CREATE POLICY "Vendors view their markets"
  ON market_vendors FOR SELECT
  USING (
    vendor_id IN (
      SELECT id FROM vendors WHERE user_id = auth.uid()
    )
  );

-- Vendors can apply to markets
CREATE POLICY "Vendors can apply to markets"
  ON market_vendors FOR INSERT
  WITH CHECK (
    vendor_id IN (
      SELECT id FROM vendors WHERE user_id = auth.uid()
    )
  );

-- Admins manage all market vendors
CREATE POLICY "Admins manage market vendors"
  ON market_vendors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Updated timestamp trigger
CREATE TRIGGER update_markets_updated_at
  BEFORE UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

### Migration 2: Add market_id to listings (optional association)

**File:** `/supabase/migrations/YYYYMMDD_phase_k1_listings_market_link.sql`

```sql
-- Add optional market association to listings
ALTER TABLE listings
ADD COLUMN market_id UUID REFERENCES markets(id);

CREATE INDEX idx_listings_market ON listings(market_id);
```

---

## API Implementation

### Endpoint 1: Markets CRUD

**File:** `/app/api/markets/route.ts`

**Methods:** GET, POST

**GET - List all markets:**
```typescript
// Query params: vertical_id, type, active
// Returns: Array of markets with schedule count
```

**POST - Create market (admin only):**
```typescript
// Body: name, vertical_id, type, description, address, city, state, zip, contact_email, contact_phone
// Returns: Created market
```

---

**File:** `/app/api/markets/[id]/route.ts`

**Methods:** GET, PATCH, DELETE

**GET - Market details:**
```typescript
// Returns: Market with schedules and vendor count
```

**PATCH - Update market (admin only):**
```typescript
// Body: Partial market fields
// Returns: Updated market
```

**DELETE - Delete market (admin only):**
```typescript
// Returns: Success
```

---

### Endpoint 2: Market Schedules

**File:** `/app/api/markets/[id]/schedules/route.ts`

**Methods:** GET, POST

**GET - List schedules for market**

**POST - Add schedule (admin only):**
```typescript
// Body: day_of_week, start_time, end_time
```

---

**File:** `/app/api/markets/[id]/schedules/[scheduleId]/route.ts`

**Methods:** PATCH, DELETE (admin only)

---

### Endpoint 3: Market Vendors

**File:** `/app/api/markets/[id]/vendors/route.ts`

**Methods:** GET, POST

**GET - List vendors at market:**
```typescript
// Returns: Vendors with approval status, booth number
```

**POST - Vendor applies to market:**
```typescript
// Body: vendor_id, notes
// Returns: Created association (approved: false)
```

---

**File:** `/app/api/markets/[id]/vendors/[vendorId]/route.ts`

**Methods:** PATCH (admin approve), DELETE

---

## UI Implementation

### Page 1: Market List

**File:** `/app/[vertical]/markets/page.tsx`

**Features:**
- List all markets for vertical
- Filter by type (traditional/private pickup)
- Filter by city
- Search by name
- Use AdminTable component
- Mobile responsive card view

**Columns:**
- Name
- Type badge (StatusBadge)
- City, State
- Schedule summary ("Mon, Wed, Fri 8AM-2PM" or "Private Pickup")
- Vendor count
- Active status

---

### Page 2: Market Detail

**File:** `/app/[vertical]/markets/[id]/page.tsx`

**Features:**
- Market information
- Schedule display (if traditional)
- Vendor list (AdminTable)
- "Apply to Market" button (for vendors)
- Map (optional - can add later)

**Vendor actions:**
- Apply to market (if not already)
- View booth number (if approved)

**Admin actions:**
- Edit market
- Manage schedules
- Approve/reject vendors

---

### Component 1: MarketCard

**File:** `/components/markets/MarketCard.tsx`

**Purpose:** Display market summary in list view

**Features:**
- Market name, type badge
- Address
- Schedule summary
- Vendor count
- Click to detail page

---

### Component 2: ScheduleDisplay

**File:** `/components/markets/ScheduleDisplay.tsx`

**Purpose:** Show market schedules in readable format

**Input:** Array of schedules
**Output:** "Monday 8:00 AM - 2:00 PM, Wednesday 8:00 AM - 2:00 PM" etc.

---

### Admin Page: Manage Markets

**File:** `/app/admin/markets/page.tsx`

**Features:**
- AdminTable with all markets
- Create new market button
- Edit/Delete actions
- Filter by vertical, type, active

---

**File:** `/app/admin/markets/new/page.tsx`

**Features:**
- StandardForm for market creation
- Vertical selection
- Type selection (traditional/private_pickup)
- Address fields
- Contact fields

---

**File:** `/app/admin/markets/[id]/edit/page.tsx`

**Features:**
- StandardForm pre-filled with market data
- Schedule management section (add/edit/delete schedules)
- Vendor management (approve/reject applications)

---

## Testing Requirements

**Database:**
- [ ] Migrations apply successfully in Dev
- [ ] RLS policies enforce permissions
- [ ] Cascading deletes work

**APIs:**
- [ ] GET /api/markets returns markets
- [ ] POST /api/markets creates (admin only)
- [ ] Vendors can apply to markets
- [ ] Admins can approve vendors

**UI:**
- [ ] Market list displays correctly
- [ ] Market detail shows schedules and vendors
- [ ] Vendor can apply to market
- [ ] Admin can create/edit markets
- [ ] Mobile responsive (375px)

---

## Git Operations

**Commit after each section:**
1. "feat(markets): Add markets database schema and migrations"
2. "feat(markets): Add markets CRUD API endpoints"
3. "feat(markets): Add market schedules API"
4. "feat(markets): Add market vendors API"
5. "feat(markets): Add market list and detail pages"
6. "feat(markets): Add admin market management"

**Push every 2-3 commits**

**DO NOT merge to main** - Tracy will merge after testing

---

## CRITICAL: End-of-Session Requirements

1. Create session summary: `/docs/Session_Summaries/Phase-K-1-Markets-Foundation-2026-01-14.md`
2. Update SESSION_LOG
3. Update MIGRATION_LOG (2 migrations)
4. Commit documentation
5. Report to Tracy

---

## Success Criteria

- [ ] Markets, schedules, vendors tables created
- [ ] RLS policies working
- [ ] All API endpoints functional
- [ ] Market list and detail pages working
- [ ] Admin can create/manage markets
- [ ] Vendors can apply to markets
- [ ] Mobile responsive
- [ ] Session documentation complete

---

## Notes

- Markets foundation supports future pre-sales feature
- Traditional markets have schedules, private pickup doesn't
- Vendors must be approved by admin before appearing at market
- Use component library (AdminTable, StandardForm, StatusBadge)
