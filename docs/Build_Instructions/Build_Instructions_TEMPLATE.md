# Build Instructions Template

**FOR CC TO READ AND EXECUTE**

**Phase:** [Phase-ID-Feature-Name]  
**Branch:** [branch-name]  
**Estimated Time:** [X-Y hours]  
**Complexity:** [Low/Medium/High]  
**Parallel With:** [Other phase or "None"]

---

## CC: Autonomy Grant

CC: You have full permission from Tracy to:
- Create/edit any files without asking Tracy
- Install packages without asking Tracy
- Make commits without asking Tracy
- Push to GitHub without asking Tracy

CC: Only ask Tracy if:
- Deleting production data
- Making security decisions
- Truly ambiguous requirements

CC: Otherwise work autonomously and report actions to Tracy.

---

## CC: Objective

[One paragraph: What is CC building? What problem does it solve?]

Example: "Build the markets foundation tables and API endpoints to support both traditional farmers markets with fixed schedules and private pickup locations with flexible timing."

---

## CC: Pre-flight Checklist

**CC: Before starting implementation, verify:**

- [ ] Working on correct branch: [branch-name]
- [ ] Latest code pulled from main
- [ ] Database schema matches assumptions (run verification queries if needed)
- [ ] No conflicting features in progress
- [ ] Test data exists for feature testing

**CC: Report verification results before proceeding**

---

## Database Implementation

### Migration 1: [Description]

**File:** `/supabase/migrations/YYYYMMDD_phase_x_description.sql`

**Purpose:** [What this migration does]

**Tables to create/modify:**
```sql
-- CC: Add SQL here
-- Include table definitions
-- Include RLS policies
-- Include indexes
```

**CC: After creating migration:**
- Save to /supabase/migrations/
- Document in MIGRATION_LOG
- Test locally if possible

---

### Migration 2: [Description]

[Repeat format for each migration needed]

---

## API Implementation

### Endpoint 1: [Name]

**File:** `/app/api/[path]/route.ts`

**Methods:** GET, POST, PATCH, DELETE (as needed)

**Purpose:** [What this endpoint does]

**Request/Response format:**
```typescript
// CC: Add TypeScript interfaces
// Example request body
// Example response
```

**RLS verification:** [How to verify permissions work]

**Testing:** [How to test this endpoint]

---

### Endpoint 2: [Name]

[Repeat for each API endpoint]

---

## UI Implementation

### Page/Component 1: [Name]

**File:** `/app/[path]/page.tsx` or `/components/[name].tsx`

**Purpose:** [What this UI does]

**Key features:**
- [Feature 1]
- [Feature 2]
- [Feature 3]

**Mobile responsive:** Must work at 375px width

**State management:** [How data flows]

**Testing checklist:**
- [ ] Displays correctly on desktop
- [ ] Mobile responsive (375px)
- [ ] Loading states work
- [ ] Error states handled
- [ ] Data updates properly

---

### Component 2: [Name]

[Repeat for each component]

---

## Shared Components to Use

**If component library exists, use these:**
- AdminTable for data tables
- StandardForm for forms
- StatusBadge for status indicators
- MobileNav for navigation

**If building from scratch:**
- Create in appropriate location
- Follow existing patterns
- Consider extracting to shared components later

---

## Testing Requirements

### Manual Testing Checklist

**Database/API:**
- [ ] Migrations applied successfully
- [ ] RLS policies enforce permissions
- [ ] API endpoints return expected data
- [ ] Error handling works

**UI/UX:**
- [ ] All pages load without errors
- [ ] Mobile responsive (375px width)
- [ ] Forms validate correctly
- [ ] Navigation works
- [ ] Loading states display

**Integration:**
- [ ] Data flows between components
- [ ] Authentication/authorization works
- [ ] No console errors

---

## Git Operations

### Commit Strategy

**CC: Commit after each major section:**
1. Database migrations → "feat(phase-x): Add [tables/migrations]"
2. API endpoints → "feat(phase-x): Add [endpoint] API"
3. UI components → "feat(phase-x): Add [component] UI"
4. Testing/fixes → "fix(phase-x): [what was fixed]"

### Push Frequency

**CC: Push after every 2-3 commits**

**DO NOT merge to main** - Tracy will merge after testing

---

## CRITICAL: End-of-Session Requirements (MANDATORY)

**CC: Before reporting "session complete," you MUST:**

### 1. Create Detailed Session Summary
**File:** `/docs/Session_Summaries/Phase-[ID]-[Feature]-YYYY-MM-DD.md`

[Use format from CC_End_of_Session_Protocol.md]

### 2. Update SESSION_LOG
**File:** `/docs/Session_Summaries/SESSION_LOG.md`

Add entry under appropriate phase with today's work

### 3. Update MIGRATION_LOG (if migrations created)
**File:** `/docs/MIGRATION_LOG.md`

Document all migrations in both table and details section

### 4. Commit All Documentation
```
docs: Session summary and logs for Phase-[ID] - YYYY-MM-DD
```

### 5. Report to Tracy

Tell Tracy:
- Session summary filepath
- SESSION_LOG updated
- MIGRATION_LOG updated (if applicable)
- Total commits and branch name
- Ready for Tracy's review

**Tracy will verify all documentation exists before accepting session as complete**

---

## Success Criteria

- [ ] All objectives from "Objective" section completed
- [ ] Database migrations created and documented
- [ ] API endpoints functional and tested
- [ ] UI components working and responsive
- [ ] No console errors
- [ ] All commits pushed to [branch-name]
- [ ] Session documentation complete (summary + logs)
- [ ] NOT merged to main (awaiting Tracy's review)

---

## Notes

[Add any phase-specific notes, warnings, or context here]

Example:
- This feature depends on X being complete first
- Breaking changes in this phase require careful testing
- Known issues or limitations to be aware of
