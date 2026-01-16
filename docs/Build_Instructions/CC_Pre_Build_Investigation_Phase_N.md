# Pre-Build Investigation - Phase N Bug Fixes

**Date:** January 15, 2026
**Purpose:** Gather comprehensive information before starting bug fixes to avoid rework and breaking changes

---

## PART 1: File Structure & Component Verification

### Investigation 1: Verify Paths in Build Instructions

**Check if these files exist at the paths specified:**

```bash
cd C:\GitHub\Projects\inpersonmarketplace

# Components
dir /s /b apps\web\src\components\shared\Toast.tsx
dir /s /b apps\web\src\components\shared\Footer.tsx
dir /s /b apps\web\src\components\cart\AddToCartButton.tsx

# Pages
dir /s /b apps\web\src\app\[vertical]\vendor-signup\page.tsx
dir /s /b apps\web\src\app\[vertical]\checkout\page.tsx
dir /s /b apps\web\src\app\[vertical]\buyer\orders\page.tsx
dir /s /b apps\web\src\app\[vertical]\admin\markets\page.tsx
dir /s /b apps\web\src\app\[vertical]\admin\users\page.tsx

# API Routes
dir /s /b apps\web\src\app\api\buyer\orders\route.ts
dir /s /b apps\web\src\app\api\cart\update\route.ts
dir /s /b apps\web\src\app\api\cart\items\[id]\route.ts

# Utilities
dir /s /b apps\web\src\lib\hooks\useCart.tsx
dir /s /b apps\web\src\lib\constants.ts
```

**Report:**
- Which files exist at expected paths?
- Which files are in different locations?
- Which files don't exist at all?

---

### Investigation 2: Existing Component Patterns

**Check for existing implementations:**

```bash
# Search for existing Toast/Notification components
findstr /s /i "toast\|notification\|snackbar" apps\web\src\components\*.tsx

# Search for existing Footer
findstr /s /i "footer" apps\web\src\components\*.tsx apps\web\src\app\layout.tsx

# Search for existing error handling patterns
findstr /s /i "unauthorized\|401\|authentication.error" apps\web\src\*.tsx
```

**Questions:**
1. **Toast/Notification system:** Does one already exist? Where? What's the API?
2. **Footer component:** Already exists? Where is it? Is it in layout?
3. **Error handling patterns:** How are API errors currently handled? Any utility functions?
4. **Modal/Dialog system:** Exists for confirmations? Where?

---

### Investigation 3: Form Patterns & Validation

**Check existing form patterns:**

```bash
# Find existing forms
findstr /s /i "form\|input\|validation" apps\web\src\app\[vertical]\vendor\*.tsx

# Find form libraries
findstr /s /i "react-hook-form\|formik\|zod" apps\web\package.json apps\web\src\*.tsx
```

**Questions:**
1. **Form library:** Using react-hook-form, Formik, or custom?
2. **Validation:** Using Zod, Yup, or custom validators?
3. **Form patterns:** Standard pattern for submit handlers?

---

## PART 2: Database Schema Verification

### Investigation 4: Confirm Database Fields Exist

**Run these queries in Supabase SQL editor:**

```sql
-- Check vendor_profiles table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_profiles'
ORDER BY ordinal_position;

-- Verify these fields exist:
-- - tier (for Standard/Premium)
-- - vertical_id
-- - status
-- - type
-- - business_name

-- Check user_profiles table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Check orders table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- Check cart_items table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cart_items'
ORDER BY ordinal_position;

-- Check listings table for category field
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'listings'
WHERE column_name = 'category';

-- Check markets table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'markets'
ORDER BY ordinal_position;
```

**Report which fields:**
- Exist and match expected type
- Exist but different type/name
- Don't exist (need migration)

---

### Investigation 5: Check Enum Values

**Check what enum values actually exist:**

```sql
-- Category enum values
SELECT unnest(enum_range(NULL::listing_category)) AS category_value;

-- Vendor status enum
SELECT unnest(enum_range(NULL::vendor_status)) AS status_value;

-- Order status enum
SELECT unnest(enum_range(NULL::order_status)) AS order_status_value;

-- Market type enum
SELECT unnest(enum_range(NULL::market_type)) AS market_type_value;
```

**Questions:**
1. Do category enum values need to be updated for new 9-category list?
2. What are the actual vendor status values? (submitted, pending, approved, etc.)
3. Are there any enum mismatches we need to fix?

---

### Investigation 6: RLS Policies

**Check RLS policies that might be blocking data:**

```sql
-- Check orders table RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'orders';

-- Check cart_items RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'cart_items';

-- Check vendor_profiles RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'vendor_profiles';
```

**Questions:**
1. Are RLS policies blocking buyer from seeing their orders?
2. Are RLS policies blocking cart updates?
3. Any policies that would block admin views?

---

## PART 3: State Management & Context

### Investigation 7: How is Cart State Managed?

**Find and examine cart implementation:**

```bash
# Find cart hook
type apps\web\src\lib\hooks\useCart.tsx

# Find cart context
findstr /s /i "cartcontext\|cartprovider" apps\web\src\*.tsx

# Find cart drawer
findstr /s /i "cartdrawer" apps\web\src\components\*.tsx
```

**Questions:**
1. **Cart state:** Context API? Zustand? Redux? Just API calls?
2. **Cart updates:** How do we trigger cart refresh after quantity change?
3. **Cart drawer:** Where is it? How does it open/close?
4. **Optimistic updates:** Does cart update optimistically or wait for API?

---

### Investigation 8: How is Vertical Context Passed?

**Check how vertical_id is accessed in pages:**

```bash
# Search for vertical usage patterns
findstr /s /i "params.vertical\|searchParams.vertical\|useParams" apps\web\src\app\[vertical]\*.tsx
```

**Questions:**
1. **In page components:** How do we get vertical? `params.vertical` or `await params`?
2. **In client components:** Can they access vertical directly or must be passed as prop?
3. **API routes:** How is vertical validated/extracted from request?

---

### Investigation 9: Authentication & User State

**Check auth patterns:**

```bash
# Find auth utilities
findstr /s /i "getUser\|useAuth\|currentUser" apps\web\src\lib\*.tsx

# Check middleware
type apps\web\src\middleware.ts
```

**Questions:**
1. **Get current user:** Standard pattern? `createClient().auth.getUser()`?
2. **Client-side auth:** Hook for getting user in client components?
3. **Protected routes:** Middleware handling or per-page checks?
4. **Role checking:** Utility function for checking admin/vendor roles?

---

## PART 4: Existing Features Check

### Investigation 10: Vendor Signup Form

**THIS IS CRITICAL - What's actually wrong?**

```bash
# Find vendor signup page
type apps\web\src\app\[vertical]\vendor-signup\page.tsx

# Search for form configuration
findstr /s /i "form.fields\|formconfig\|marketplace.config" apps\web\src\*.tsx
```

**Questions:**
1. **Does the page exist?** If yes, what's in it currently?
2. **Error message:** "no form fields configured for this marketplace"
   - Where does this message come from?
   - Is it checking a config file?
   - Is config missing for farmers_market vertical?
3. **Quick fix or rebuild?** Can we just add config, or does form need to be built?

---

### Investigation 11: Orders Display Issue

**Find the actual error:**

```bash
# Check buyer orders page
type apps\web\src\app\[vertical]\buyer\orders\page.tsx

# Check API route
type apps\web\src\app\api\buyer\orders\route.ts

# Check for console errors in terminal when page loads
```

**Questions:**
1. **What's the actual error?** Check browser console and terminal logs
2. **API response:** What does `/api/buyer/orders` return? (test with curl or browser)
3. **Test data:** Do orders exist for test user in database?
   ```sql
   SELECT * FROM orders WHERE buyer_user_id = '3319a4d3-a7f2-4b3d-bf09-39148b48cd7f';
   ```
4. **Quick fix or deeper issue?**

---

### Investigation 12: Image Upload Infrastructure

**Check if any upload system exists:**

```bash
# Search for upload-related code
findstr /s /i "upload\|storage\|bucket" apps\web\src\*.tsx apps\web\src\*.ts

# Check Supabase storage config
findstr /s /i "storage\|bucket" apps\web\src\lib\supabase\*.ts

# Check for file input components
findstr /s /i "type=\"file\"\|FileInput" apps\web\src\components\*.tsx
```

**Questions:**
1. **Supabase Storage:** Is it set up? Any buckets created?
2. **Upload utilities:** Any helper functions for uploading files?
3. **Image optimization:** Any existing image processing?
4. **From scratch or extend?** Do we build new or extend existing?

---

## PART 5: Test Data Analysis

### Investigation 13: Current Test Data State

**Run these queries to understand test data:**

```sql
-- Count and analyze vendors
SELECT vertical_id, status, tier, COUNT(*) as count
FROM vendor_profiles
GROUP BY vertical_id, status, tier;

-- Find problematic vendors (published but pending)
SELECT vp.id, vp.business_name, vp.status, vp.tier,
       COUNT(l.id) as listing_count,
       SUM(CASE WHEN l.status = 'published' THEN 1 ELSE 0 END) as published_count
FROM vendor_profiles vp
LEFT JOIN listings l ON l.vendor_profile_id = vp.id
WHERE vp.status != 'approved' AND l.status = 'published'
GROUP BY vp.id, vp.business_name, vp.status, vp.tier;

-- Find listings with no price or description
SELECT id, title, price_cents, description, status, vendor_profile_id
FROM listings
WHERE price_cents = 0 OR description IS NULL OR description = '';

-- Check orders
SELECT COUNT(*) as order_count, 
       status,
       buyer_user_id
FROM orders
GROUP BY status, buyer_user_id;

-- Check categories in use
SELECT DISTINCT category, COUNT(*) as count
FROM listings
GROUP BY category
ORDER BY count DESC;
```

**Questions:**
1. **Scope of bad data:** How many vendors/listings/orders are corrupted?
2. **Can we salvage?** Fix with UPDATE queries or start fresh?
3. **Recommendation:** Your professional opinion on best approach:
   - Quick SQL fixes for major issues
   - Delete all and recreate
   - Mix of both
4. **Time estimate:** Rough idea - 30 min? 2 hours? 4 hours?

---

## PART 6: Breaking Changes Check

### Investigation 14: Category Change Impact

**Check what uses categories currently:**

```bash
# Find all category references
findstr /s /i "category\|CATEGORIES" apps\web\src\*.tsx apps\web\src\*.ts

# Find filters
findstr /s /i "filter.*category\|categoryFilter" apps\web\src\*.tsx
```

**Questions:**
1. **Browse page filtering:** Will changing categories break filters?
2. **Existing listings:** How many will need category updates?
3. **API routes:** Do any hardcode category values?
4. **Migration needed?** SQL to update existing listings to new categories?

---

### Investigation 15: Vertical Scope Change Impact

**Check what uses vertical_id filtering:**

```bash
# Find all vertical_id queries
findstr /s /i "eq.*vertical_id\|vertical_id.*eq" apps\web\src\*.tsx apps\web\src\*.ts

# Check admin pages
findstr /s /i "vertical" apps\web\src\app\[vertical]\admin\*.tsx
```

**Questions:**
1. **Platform admin:** Will adding vertical_id filters break platform-wide views?
2. **API routes:** Do any need vertical_id param added?
3. **Shared components:** Any components that work for both vertical and platform admin?

---

### Investigation 16: Dependencies Between Admin Types

**Understand admin architecture:**

```bash
# Check admin layouts
type apps\web\src\app\admin\layout.tsx
type apps\web\src\app\[vertical]\admin\layout.tsx

# Check admin dashboard
type apps\web\src\app\admin\page.tsx
type apps\web\src\app\[vertical]\admin\page.tsx
```

**Questions:**
1. **Shared components:** Do vertical and platform admin share any components?
2. **Navigation:** How does "Back to Site" currently work?
3. **Session tracking:** How do we track which vertical admin came from?
4. **Will changes to vertical admin break platform admin?**

---

## PART 7: External Dependencies & Config

### Investigation 17: External Services

**Check service configuration:**

```bash
# Check Supabase config
type apps\web\src\lib\supabase\client.ts
type apps\web\src\lib\supabase\server.ts

# Check Stripe config
type apps\web\src\lib\stripe\config.ts

# Check environment variables
type apps\web\.env.local
```

**Questions:**
1. **Supabase Storage:** Configured? Buckets created?
2. **Image CDN:** Any CDN setup for serving images?
3. **Stripe:** Working? Test mode?
4. **Missing env vars:** Anything needed for fixes?

---

### Investigation 18: Package Dependencies

**Check what's already installed:**

```bash
# Check package.json
type apps\web\package.json | findstr /i "react-hook-form zod upload file image sharp"
```

**Questions:**
1. **Form libraries:** What's installed?
2. **File upload libraries:** Any installed (react-dropzone, etc)?
3. **Image processing:** Sharp, jimp, or other?
4. **Need to add:** Any packages needed for fixes?

---

## PART 8: Summary & Recommendations

### After Completing Investigation, Provide:

**1. File Structure Report**
- Confirmed paths vs actual locations
- Existing components we can reuse
- Missing components we need to build

**2. Database Schema Report**
- Fields that exist as expected
- Fields with different names/types
- Fields that need migration
- RLS policies that might block functionality

**3. State Management Summary**
- How cart works
- How auth works  
- How vertical context works
- Patterns to follow

**4. Existing Features Assessment**
- Vendor signup: What's wrong, how to fix
- Orders display: Root cause, solution
- Image uploads: Exists or build from scratch

**5. Test Data Recommendation**
- Scope of problems
- Recommended approach (fix vs recreate)
- SQL scripts if fixing

**6. Breaking Changes Risk**
- What could break from our fixes
- Mitigation strategies
- Testing focus areas

**7. Build Order Recommendation**
Based on dependencies, what order should we tackle fixes?

**8. Blockers & Questions**
Anything unclear that needs Tracy's input before starting?

---

## Format for Response

Please provide findings in this structure:

```markdown
# Investigation Results - Phase N Bug Fixes

## Executive Summary
[2-3 sentences on overall findings]

## Critical Findings
[Anything that changes our approach]

## Part 1: File Structure
[Table of files: exists/location/status]

## Part 2: Database Schema
[Field verification results]

## Part 3: State Management
[Cart, auth, vertical patterns]

## Part 4: Existing Features
[Vendor signup analysis]
[Orders display analysis]
[Image upload analysis]

## Part 5: Test Data
[Recommendation with rationale]

## Part 6: Breaking Changes
[Risks and mitigations]

## Part 7: Dependencies
[Services, packages needed]

## Part 8: Recommendations
[Build order, estimated complexity]

## Questions for Tracy
[Anything needing clarification]
```

---

*This investigation should take 30-60 minutes but will save hours of rework*
