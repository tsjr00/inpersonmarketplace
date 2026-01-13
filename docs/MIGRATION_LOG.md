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
**Last Updated:** 2026-01-13

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
