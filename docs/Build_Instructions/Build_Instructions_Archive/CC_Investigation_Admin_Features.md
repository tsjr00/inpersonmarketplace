# Investigation Request - Admin Features & Architecture

**Date:** January 14, 2026
**Purpose:** Determine what admin features exist, what's missing, and clarify vertical vs platform admin separation

---

## Questions for CC

Please investigate the current admin implementation and answer the following questions:

---

## Part 1: Admin Panel Structure

### Vertical-Level Admin

**Check if these exist:**
```bash
src/app/[vertical]/admin/page.tsx
src/app/[vertical]/admin/dashboard/page.tsx
```

**Questions:**
1. Does each vertical have its own admin panel?
2. What's the path to access it? (e.g., `/farmers_market/admin`)
3. What features/links are shown on vertical admin dashboard?
4. Is there navigation between vertical admin sections?

---

### Platform-Level Admin

**Check if these exist:**
```bash
src/app/admin/page.tsx
src/app/admin/dashboard/page.tsx
src/app/platform-admin/page.tsx
```

**Questions:**
1. Is there a platform-wide admin panel (manages ALL verticals)?
2. What's the path to access it?
3. What features/links are shown on platform admin dashboard?
4. Can platform admins see data across all verticals?

---

## Part 2: Existing Admin Features by Location

### Vertical Admin Features (Per Vertical)

**Check what exists at `/[vertical]/admin/`:**

```bash
# List all admin pages for a vertical
dir /s /b apps\web\src\app\[vertical]\admin\*.tsx
```

**Document which of these exist:**
- [ ] Dashboard/Overview - Path: _____
- [ ] Users Management - Path: _____
- [ ] Vendors Management - Path: _____
- [ ] Vendor Approvals - Path: _____
- [ ] Listings Management - Path: _____
- [ ] Listings Approvals - Path: _____
- [ ] Markets Management - Path: _____
- [ ] Orders Overview - Path: _____
- [ ] Analytics/Reports - Path: _____
- [ ] Settings - Path: _____

**For each that exists, note:**
- What can admins do on that page?
- Any obvious missing features?

---

### Platform Admin Features (Cross-Vertical)

**Check what exists at `/admin/` or `/platform-admin/`:**

**Document which of these exist:**
- [ ] Platform Dashboard - Path: _____
- [ ] All Users (across verticals) - Path: _____
- [ ] All Vendors (across verticals) - Path: _____
- [ ] Verticals Management (create/edit verticals) - Path: _____
- [ ] Platform Analytics - Path: _____
- [ ] Fee Configuration - Path: _____
- [ ] Platform Settings - Path: _____

---

## Part 3: Admin Navigation & Access Control

### Navigation Between Admin Levels

**Check Header component:**
```bash
src/components/Header.tsx
src/components/shared/Header.tsx
```

**Questions:**
1. Does the header show "Admin" link?
2. Does it differentiate between vertical admin and platform admin?
3. Can you navigate between vertical admin and platform admin?
4. What does the admin navigation look like?

---

### Access Control

**Check how admin roles are defined:**

```bash
# Search for admin role checks
findstr /s /i "role.*admin\|isAdmin\|admin.*role" apps\web\src\*.ts apps\web\src\*.tsx
```

**Questions:**
1. How is admin role stored? (user_profiles.role, user_profiles.roles array, etc.)
2. Is there distinction between:
   - Vertical admin (manages one vertical)
   - Platform admin (manages all verticals)
   - Super admin (all permissions)
3. Where is admin access checked? (middleware, per-page, API routes?)

---

## Part 4: Missing Admin Features

### Based on Investigation, Identify Gaps

**Vertical Admin - What's Missing:**
- [ ] Feature 1: _____
- [ ] Feature 2: _____
- [ ] Feature 3: _____

**Platform Admin - What's Missing:**
- [ ] Feature 1: _____
- [ ] Feature 2: _____
- [ ] Feature 3: _____

**Navigation - What's Missing:**
- [ ] Issue 1: _____
- [ ] Issue 2: _____

---

## Part 5: Specific Issues to Check

### Issue 1: "Fixed" vs "Traditional" Labels

**Tracy mentioned remaining label issues. Search for:**
```bash
findstr /s /i "fixed.market\|create.fixed" apps\web\src\*.ts apps\web\src\*.tsx
```

**Find and list:**
- [ ] Any remaining "Fixed Market" labels that should be "Traditional Market"
- [ ] Any buttons saying "Create Fixed Market"
- [ ] Any headers saying "Fixed Markets"

---

### Issue 2: Admin Users Page

**Check:**
```bash
src/app/[vertical]/admin/users/page.tsx
```

**Questions:**
1. Does this page exist? (We created it in Phase J-4)
2. Does it show:
   - User roles correctly?
   - Vendor status?
   - Can admins take actions (edit roles, approve vendors)?
3. Is it linked from vertical admin dashboard?

---

### Issue 3: Admin Markets Page

**Check:**
```bash
src/app/[vertical]/admin/markets/page.tsx
```

**Questions:**
1. Does this page exist?
2. Can admins:
   - Create new markets?
   - Edit existing markets?
   - Delete markets?
   - See market schedules?
3. Are there any syntax errors or broken features?

---

### Issue 4: Vendor Approvals

**Check:**
```bash
src/app/[vertical]/admin/vendors/page.tsx
src/app/api/admin/vendors/
```

**Questions:**
1. Where do admins approve/reject vendor applications?
2. Is there a dedicated approvals page or part of vendors list?
3. Can admins:
   - See pending applications?
   - Approve vendors?
   - Reject vendors?
   - Add notes/reasons?

---

### Issue 5: Listing Approvals

**Check:**
```bash
src/app/[vertical]/admin/listings/page.tsx
src/app/api/admin/listings/
```

**Questions:**
1. Where do admins approve/reject listings?
2. Is there a dedicated approvals page?
3. Can admins:
   - See pending listings?
   - Approve listings?
   - Reject listings?
   - Edit listings?

---

## Part 6: Admin Analytics & Reporting

**Check for admin-specific analytics:**

```bash
src/app/[vertical]/admin/analytics/
src/app/admin/analytics/
```

**Questions:**
1. Do admins have access to analytics?
2. What metrics can admins see:
   - Total users?
   - Total vendors?
   - Total orders/revenue?
   - Growth trends?
3. Is this at vertical level or platform level?

---

## Part 7: Admin Settings & Configuration

**Check for admin settings:**

```bash
src/app/[vertical]/admin/settings/
src/app/admin/settings/
```

**Questions:**
1. Can admins configure:
   - Platform fees?
   - Vertical settings?
   - Email templates?
   - Feature flags?
2. Where are these settings stored?

---

## Report Format

Please provide a comprehensive report in this format:

```markdown
# Admin Features Investigation Report

## Current Architecture

### Vertical Admin
- **Access Path:** `/[vertical]/admin`
- **Who can access:** [role requirements]
- **Existing Features:**
  1. Feature - Path - Status (working/broken/incomplete)
  2. Feature - Path - Status
  [etc.]

### Platform Admin
- **Access Path:** [path or "DOES NOT EXIST"]
- **Who can access:** [role requirements]
- **Existing Features:**
  1. Feature - Path - Status
  [etc.]

---

## Feature Gap Analysis

### Vertical Admin - Missing Features
1. **Feature Name**
   - **What's missing:** Description
   - **Impact:** Why it matters
   - **Effort:** Estimated time to build

2. [Repeat for each missing feature]

### Platform Admin - Missing Features
1. **Feature Name**
   - **What's missing:** Description
   - **Impact:** Why it matters
   - **Effort:** Estimated time to build

---

## Specific Issues Found

### Label Issues
- [ ] Location 1: Description of issue
- [ ] Location 2: Description of issue

### Broken Features
- [ ] Feature 1: What's broken
- [ ] Feature 2: What's broken

### Missing Navigation
- [ ] Issue 1: Description
- [ ] Issue 2: Description

---

## Access Control Issues

- **Current role system:** Description
- **Problems:** List any issues
- **Recommendations:** Suggested improvements

---

## Recommendations

### Quick Wins (< 1 hour)
1. Fix 1 - Description
2. Fix 2 - Description

### Medium Features (1-2 hours)
1. Feature 1 - Description
2. Feature 2 - Description

### Large Features (3+ hours)
1. Feature 1 - Description
2. Feature 2 - Description

---

## Priority Order

Based on impact and effort, recommended build order:
1. [Highest priority fix/feature]
2. [Second priority]
3. [Third priority]
[etc.]
```

---

## Commands to Help Investigation

```bash
cd C:\GitHub\Projects\inpersonmarketplace

# Find all admin pages
dir /s /b apps\web\src\app\*admin*\page.tsx

# Find all admin API routes
dir /s /b apps\web\src\app\api\*admin*\route.ts

# Search for admin role checks
findstr /s /i "role.*admin" apps\web\src\*.ts apps\web\src\*.tsx

# Search for remaining "fixed" label issues
findstr /s /i "fixed.market" apps\web\src\*.ts apps\web\src\*.tsx

# Find all admin-related components
dir /s /b apps\web\src\components\*admin*\*.tsx
```

---

*End of investigation request*
