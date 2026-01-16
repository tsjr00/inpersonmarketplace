# Build Instructions: Seed Data Script

**FOR CC TO READ AND EXECUTE**

**Phase:** Phase-M-1-Seed-Data-Script  
**Branch:** feature/seed-data-script  
**Estimated Time:** 30-45 minutes  
**Complexity:** Low

---

## CC: CRITICAL - Autonomous Operation Mode

**CC: Tracy has given you FULL AUTONOMOUS PERMISSION. Do NOT stop to ask Tracy for permission.**

### What CC Can Do WITHOUT Asking:

**File Operations (DO NOT ASK):**
- Create any files, edit any files, delete temporary/test files, create folders

**Code Operations (DO NOT ASK):**
- Install npm packages, run builds, run tests

**Git Operations (DO NOT ASK - THIS IS CRITICAL):**
- Stage files, make commits, push commits to branch
- DO NOT ask "May I commit?" or "Should I push?" - JUST DO IT and report what you did

### What CC MUST Ask Tracy About:
1. Deleting production data
2. Adding secrets/API keys
3. Truly ambiguous requirement

**Everything else: PROCEED AUTONOMOUSLY and report actions after completing them.**

---

## CC: Objective

Create a TypeScript script that generates realistic test data for all tables (vendors, listings, orders, markets, etc.). Makes testing faster by eliminating manual data entry. Should be configurable (how many of each entity) and runnable with one command.

---

## CC: Pre-flight Checklist

**CC: Before starting, verify:**
- [ ] On branch: feature/seed-data-script
- [ ] Supabase client configured in project
- [ ] Database schema understood (check existing tables)

**CC: Report verification, then proceed**

---

## Implementation

### Script File

**File:** `/apps/web/scripts/seed-data.ts`

**Purpose:** Generate test data for Dev database

**What to create:**
- 5-10 test vendors (different tiers: free, basic, premium)
- 20-30 listings (variety of products, prices, statuses)
- 10-15 orders (different statuses: pending, completed, cancelled)
- 3-5 markets (if markets tables exist)
- Market schedules and vendor associations
- User profiles for vendors

**Requirements:**
- Use Supabase client to insert data
- Clear existing test data first (DELETE WHERE email LIKE '%@test.com')
- Realistic data (proper names, prices, dates)
- Console log progress
- Handle errors gracefully
- Return summary of what was created

**Configuration via environment variables:**
```typescript
const config = {
  numVendors: parseInt(process.env.NUM_VENDORS || '10'),
  numListings: parseInt(process.env.NUM_LISTINGS || '30'),
  numOrders: parseInt(process.env.NUM_ORDERS || '15'),
  numMarkets: parseInt(process.env.NUM_MARKETS || '5'),
};
```

**Sample data characteristics:**
- Vendors: Mix of fireworks/farmers market verticals
- Listings: Various prices ($5-$500), different statuses
- Orders: Recent dates (last 30 days)
- Markets: Mix of traditional/private pickup types

---

### Package.json Script

**File:** `/apps/web/package.json`

**CC: Add script:**
```json
{
  "scripts": {
    "seed": "tsx scripts/seed-data.ts"
  }
}
```

**Install tsx if needed:** `npm install -D tsx`

---

### README

**File:** `/apps/web/scripts/README.md`

**Content:**
```markdown
# Seed Data Script

Generates test data for development.

## Usage

**Default (10 vendors, 30 listings, 15 orders, 5 markets):**
```bash
npm run seed
```

**Custom amounts:**
```bash
NUM_VENDORS=20 NUM_LISTINGS=50 npm run seed
```

## What it creates

- Vendors with test emails (@test.com)
- Listings in various statuses
- Orders with recent dates
- Markets (if tables exist)
- User profiles

## Clearing data

Script automatically clears test data before creating new data.

## Safety

Only affects records with @test.com emails or specific test flags. Does not delete real user data.
```

---

## Testing

**CC: After creating script:**

1. Run: `npm run seed` in apps/web
2. Verify data in Supabase dashboard
3. Check console output shows summary
4. Run again to verify it clears/recreates

---

## Git Operations

**Commits:**
1. "feat(scripts): Add seed data script"
2. "docs(scripts): Add seed data README"

**Push after commits**

---

## CRITICAL: End-of-Session Requirements

**CC: Complete all 5 steps:**

1. Create session summary: `/docs/Session_Summaries/Phase-M-1-Seed-Data-Script-2026-01-13.md`
2. Update SESSION_LOG
3. No migrations (skip MIGRATION_LOG)
4. Commit documentation
5. Report to Tracy with filepaths

---

## Success Criteria

- [ ] Script creates test data successfully
- [ ] Runnable with `npm run seed`
- [ ] Clears old test data safely
- [ ] Console shows progress
- [ ] README documents usage
- [ ] Session documentation complete

---

## Notes

- Only run in Dev (not Staging/Production)
- Test data uses @test.com emails for easy identification
- Adjust quantities via environment variables
- Can extend script later for more entity types
