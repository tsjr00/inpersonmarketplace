# CC End-of-Session Protocol (Add to All Build Instructions)

**MANDATORY - CC CANNOT SKIP THIS**

---

## CRITICAL: Session Complete Requirements

**CC: Before reporting "session complete" to Tracy, you MUST complete ALL steps below.**

**Tracy will verify these are done before accepting session as complete.**

---

## Step 1: Create Detailed Session Summary

**File:** `/docs/Session_Summaries/Phase-[ID]-[Feature]-YYYY-MM-DD.md`

**Example:** `/docs/Session_Summaries/Phase-K-1-Markets-Foundation-2026-01-13.md`

**Required sections:**

```markdown
# Session Summary: Phase-[ID]-[Feature]

**Date:** YYYY-MM-DD  
**Duration:** [X hours]  
**Branch:** [branch name]  
**Status:** [Complete/Partial/Blocked]

---

## Completed This Session

- ✓ [Specific feature/component/API completed]
- ✓ [Another completed item]
- ✓ [Database tables/migrations]

---

## NOT Completed (if applicable)

- ⏸ [Feature deferred - reason]
- ⏸ [Issue blocking completion - details]

---

## Issues Encountered & Resolutions

**Issue 1:** [Problem description]  
**Solution:** [How it was resolved]

**Issue 2:** [Another problem]  
**Solution:** [Resolution]

[Or write "None" if no issues]

---

## Migrations Created

[List migration filenames, or "None"]

Example:
- 20260113_phase_k1_markets_tables.sql
- 20260113_phase_k1_add_market_to_listings.sql

---

## Testing Performed

**Manual testing:**
- [What was tested]
- [Results]

**API testing:**
- [Endpoints tested]
- [Tool used - Postman/curl/etc]

**Mobile responsive:**
- [Tested at 375px width - yes/no]

---

## Commits

**Total commits:** [X]  
**Branch:** [branch name]  
**Pushed to GitHub:** [Yes/No]

---

## Next Session Should Start With

[Specific instruction for what to do next - be detailed]

Example: "Start with creating MarketListPage component at /app/[vertical]/markets/page.tsx"

---

## Notes for Tracy

[Any warnings, decisions made, questions for Tracy, or "None"]
```

**CC: After creating detailed summary:**
- Commit: "docs: Add session summary for Phase [ID]"
- Push to GitHub

---

## Step 2: Update SESSION_LOG

**File:** `/docs/Session_Summaries/SESSION_LOG.md`

**CC: Add entry under the appropriate phase section:**

```markdown
### YYYY-MM-DD Session (X hours)
- **Completed:**
  - ✓ [Feature completed]
  - ✓ [Another feature]
- **NOT Completed:**
  - ⏸ [Deferred item]
- **Issues & Resolutions:**
  - [Problem] → [Solution]
- **Migrations Created:** [X migrations - see MIGRATION_LOG]
- **Testing:** [Brief summary]
- **Commits:** [X commits to branch]
- **Next Session:** [Starting point]
- **Detail:** Phase-[ID]-[Feature]-YYYY-MM-DD.md
```

**CC: Update "Last Updated" date at top of file**

---

## Step 3: Update MIGRATION_LOG (if migrations created)

**File:** `/docs/MIGRATION_LOG.md`

**CC: For EACH migration created:**

**3A. Add row to "Current Status" table:**
```
| YYYYMMDD_phase_x_description.sql | Phase-X | ❌ | - | ❌ | - | Yes/No | [dependencies] | [purpose] |
```

**3B. Add detailed entry to "Migration Details" section:**
```markdown
### YYYYMMDD_phase_x_description.sql
**Phase:** Phase-X-Feature-Name
**Purpose:** [What this migration does in one sentence]
**File:** `/supabase/migrations/YYYYMMDD_phase_x_description.sql`

**Changes:**
- `table_name`: [created/altered/dropped] - [details]
- Indexes: [what was added]
- RLS policies: [what was configured]

**Impact:**
- Breaking: Yes/No (why if yes)
- Data migration: Yes/No (what data if yes)
- App changes: Yes/No (what code changes needed)

**Rollback Safety:** Safe/Risky (explanation)

**Notes:** [Warnings or "None"]
```

**CC: Update "Last Updated" date at top of MIGRATION_LOG**

---

## Step 4: Commit All Documentation

**CC: After updating all logs and summaries:**

**Commit message:**
```
docs: Session summary and logs for Phase-[ID] - YYYY-MM-DD
```

**CC: Push to GitHub**

---

## Step 5: Report to Tracy

**CC: Tell Tracy:**

```
Session complete for Phase-[ID]-[Feature].

Documentation created:
- ✓ Session summary: /docs/Session_Summaries/Phase-[ID]-[Feature]-YYYY-MM-DD.md
- ✓ SESSION_LOG updated with today's progress
- ✓ MIGRATION_LOG updated with [X] migrations [or "No migrations created"]
- ✓ All documentation committed and pushed to GitHub

Tracy can review:
- Detailed summary at [filepath]
- [X] commits on [branch name]
- [X] migrations pending deployment in Dev

Ready for Tracy's review.
```

---

## Tracy's Verification Checklist

**Before closing CC session, Tracy checks:**

- [ ] SESSION_LOG has new entry for today
- [ ] Detailed session summary file exists
- [ ] MIGRATION_LOG updated if migrations created
- [ ] All files visible in GitHub (fetch/pull in GitHub Desktop)
- [ ] CC reported all filepaths clearly

**If any missing:** Tracy asks CC to complete before closing session

---

## Why This is Mandatory

**Without proper logging:**
- Tracy loses track of progress across parallel sessions
- Migration history unclear (which DB changes happened when)
- Difficult to troubleshoot issues later
- Can't easily resume work in next session
- Chet (strategy advisor) can't provide good guidance without context

**With proper logging:**
- Clear progress tracking
- Full audit trail of DB changes
- Easy to resume work
- Better strategic guidance from Chet
- Historical reference for future projects

---

## This Protocol is NON-NEGOTIABLE

**CC: You MUST complete all 5 steps before ending session.**

**Tracy will not accept session as complete without:**
1. Detailed summary file
2. SESSION_LOG entry
3. MIGRATION_LOG entry (if applicable)
4. All committed and pushed
5. Clear report to Tracy

**No exceptions.**
