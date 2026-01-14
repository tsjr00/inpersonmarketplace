# Migration Application Log

**Purpose:** Track all database schema changes and deployment across environments

## Legend
- ✅ Applied successfully
- ❌ Failed / Not yet applied
- 🔄 In progress
- ⚠️ Needs attention
- 🔴 Breaking change
- 📊 Data migration

---

## Environment Notes
- **Dev:** Local development (localhost:3002) - safe to break
- **Staging:** Live tester environment (farmersmarket.app, fastwrks.com) - testers see this
- **Production:** Not yet created - will exist when marketing launches

**Dev project:** vawpviatqalicckkqchs (InPersonMarketplace)
**Staging project:** vfknvsxfgcwqmlkuzhnq (InPersonMarketplace-Staging)

**Process:** Always apply to Dev first, test, then apply to Staging
**Last Updated:** 2026-01-14

---

## Current Status

| Migration File | Phase | Dev Status | Dev Date | Staging Status | Staging Date | Breaking | Dependencies | Notes |
|----------------|-------|------------|----------|----------------|--------------|----------|--------------|-------|
| 20260114_001_phase_k1_markets_tables.sql | Phase-K-1 | ❌ | - | ❌ | - | No | None | Markets, schedules, vendors tables |
| 20260114_002_phase_k1_listings_market_link.sql | Phase-K-1 | ❌ | - | ❌ | - | No | First migration | Add market_id to listings |

---

## Pending Migrations (Not Yet Applied)

| Migration File | Phase | Target Environments | Priority | Blocker | Purpose |
|----------------|-------|---------------------|----------|---------|---------|
| 20260114_001_phase_k1_markets_tables.sql | Phase-K-1 | Dev, Staging | High | None | Create markets foundation tables |
| 20260114_002_phase_k1_listings_market_link.sql | Phase-K-1 | Dev, Staging | High | First migration | Link listings to markets |

---

## Failed/Rolled Back Migrations

| Migration File | Environment | Date | Reason | Resolution | Rollback Date |
|----------------|-------------|------|--------|------------|---------------|
| [None yet] | - | - | - | - | - |

---

## Migration Details

### 20260114_001_phase_k1_markets_tables.sql
**Phase:** Phase-K-1-Markets-Foundation
**Purpose:** Create foundation tables for markets functionality
**File:** `/supabase/migrations/20260114_001_phase_k1_markets_tables.sql`

**Changes:**
- `markets`: Created - Main markets table with type (traditional/private_pickup), location, contact info
- `market_schedules`: Created - Operating hours for traditional markets (day_of_week, start/end times)
- `market_vendors`: Created - Junction table for vendor-market associations with approval workflow
- Indexes: 9 indexes for performance on common queries
- RLS Policies: Public view active markets, vendors apply to markets, admins manage all

**Impact:**
- Breaking: No
- Data migration: No
- App changes: No - new tables only

**Rollback Safety:** Safe - DROP TABLE for all three tables

**Notes:** None

---

### 20260114_002_phase_k1_listings_market_link.sql
**Phase:** Phase-K-1-Markets-Foundation
**Purpose:** Add optional market association to listings for future pre-sales feature
**File:** `/supabase/migrations/20260114_002_phase_k1_listings_market_link.sql`

**Changes:**
- `listings`: ALTER - Add market_id column (nullable UUID, FK to markets)
- Index: idx_listings_market for market-based queries

**Impact:**
- Breaking: No - nullable column
- Data migration: No
- App changes: No - optional field

**Rollback Safety:** Safe - ALTER TABLE DROP COLUMN

**Notes:** Pre-sales feature will use this in Phase-K-3

---

## How to Update This Log

**CC: For each migration you create, add TWO entries:**

**Entry 1: Add row to "Current Status" table:**
```
| YYYYMMDD_phase_x_description.sql | Phase-X | ❌ | - | ❌ | - | Yes/No | [dependencies or "None"] | [one sentence] |
```

**Entry 2: Add detailed section under "Migration Details":**
```markdown
### YYYYMMDD_phase_x_description.sql
**Phase:** Phase-X-Feature-Name
**Purpose:** [One sentence describing what this does]
**File:** `/supabase/migrations/YYYYMMDD_phase_x_description.sql`

**Changes:**
- `table_name`: [created/altered/dropped] - [description]
- Index/Policy: [what was added/changed]

**Impact:**
- Breaking: Yes/No (+ why if yes)
- Data migration: Yes/No (+ what data if yes)
- App changes: Yes/No (+ what needs updating if yes)

**Rollback Safety:** Safe/Risky (+ explanation)

**Notes:** [Warnings, context, or "None"]
```

**Tracy will update Dev/Staging dates when migrations are applied**
