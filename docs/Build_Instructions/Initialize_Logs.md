# Build Instructions: Initialize Session and Migration Logs

**FOR CC TO READ AND EXECUTE**

**Time:** 10 minutes  
**Branch:** main

---

## CC: Autonomy Grant

CC: You have permission from Tracy to create files, commit, and push without asking.

---

## CC: Objective

Create two logging systems:
1. SESSION_LOG.md - tracks development progress across all phases
2. MIGRATION_LOG.md - tracks database changes and deployment status

---

## CC ACTION: Create Session Summary Log

**File:** `/docs/Session_Summaries/SESSION_LOG.md`

**CC: Add this content:**

```markdown
# Build Session Log

**Purpose:** Track development progress across all phases and sessions

**Last Updated:** [CC: insert today's date]

---

## Active Phases

### Phase-K-1-Markets-Foundation
**Branch:** feature/markets-foundation | **Status:** Not Started | **Started:** [date when first session begins]

### Phase-K-2-Vendor-Analytics
**Branch:** feature/vendor-analytics | **Status:** Not Started | **Started:** [date when first session begins]

---

## Completed Phases

[None yet - CC will move phases here when merged to main]

---

## How to Update This Log

**CC: At end of every session, add entry under the appropriate phase:**

```markdown
### YYYY-MM-DD Session (X hours)
- **Completed:**
  - ✓ [Feature/component/API completed]
  - ✓ [Another item completed]
- **NOT Completed:**
  - ⏸ [Deferred item with reason]
- **Issues & Resolutions:**
  - [Problem] → [Solution]
- **Migrations Created:** [X migrations - see MIGRATION_LOG]
- **Testing:** [Summary of testing performed]
- **Commits:** [X commits to branch]
- **Next Session:** [What to start with next]
- **Detail:** [Link to detailed summary file]
```

**Move phase to "Completed Phases" when merged to main**

---

## Legend
- ✓ = Completed
- ⏸ = Deferred/Incomplete
- ⚠️ = Issue requiring attention
```

---

## CC ACTION: Create Migration Log

**File:** `/docs/MIGRATION_LOG.md`

**CC: Add this content:**

```markdown
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
**Last Updated:** [CC: insert today's date]

---

## Current Status

| Migration File | Phase | Dev Status | Dev Date | Staging Status | Staging Date | Breaking | Dependencies | Notes |
|----------------|-------|------------|----------|----------------|--------------|----------|--------------|-------|
| [CC will add migrations here] | - | - | - | - | - | - | - | - |

---

## Pending Migrations (Not Yet Applied)

| Migration File | Phase | Target Environments | Priority | Blocker | Purpose |
|----------------|-------|---------------------|----------|---------|---------|
| [CC will add pending migrations here] | - | - | - | - | - |

---

## Failed/Rolled Back Migrations

| Migration File | Environment | Date | Reason | Resolution | Rollback Date |
|----------------|-------------|------|--------|------------|---------------|
| [None yet] | - | - | - | - | - |

---

## Migration Details

[CC will add detailed entries for each migration here]

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
```

---

## CC ACTION: Create Migrations Folder

**CC: Create folder:** `/supabase/migrations/`

**CC: Add README:** `/supabase/migrations/README.md`

```markdown
# Database Migrations

**Naming Convention:** `YYYYMMDD_phase_x_description.sql`

**Examples:**
- `20260113_phase_k1_markets_tables.sql`
- `20260113_phase_k1_add_market_to_listings.sql`

**Process:**
1. CC creates migration file here
2. CC documents in `/docs/MIGRATION_LOG.md`
3. Tracy applies to Dev first
4. After testing, Tracy applies to Staging
5. Tracy updates MIGRATION_LOG with deployment dates

**Storage:** All migrations stored in this folder, documented in MIGRATION_LOG
```

---

## CC ACTION: Git Operations

**CC: Commit message:**
```
docs: Initialize SESSION_LOG and MIGRATION_LOG systems
```

**CC: Push to main**

---

## CC: Report to Tracy

Tell Tracy:
1. Created SESSION_LOG.md at /docs/Session_Summaries/SESSION_LOG.md
2. Created MIGRATION_LOG.md at /docs/MIGRATION_LOG.md
3. Created /supabase/migrations/ folder with README
4. All files committed and pushed
5. Logs ready for use in parallel sessions
