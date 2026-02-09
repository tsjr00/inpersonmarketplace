# Comprehensive Bug Investigation - All Outstanding Issues

**Date:** January 15, 2026
**Purpose:** Investigate ALL bugs found in testing + new screenshot errors

---

## Part 1: NEW Critical Errors from Screenshots

### Error 1: Market Edit Page - Schema Error

**Screenshot shows:** `Could not find the 'active' column of 'markets' in the schema cache`

**Investigation needed:**
```sql
-- Check markets table schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'markets'
ORDER BY ordinal_position;
```

**Questions:**
1. Does `active` column exist?
2. If not, what column controls active/inactive? (`status`? `is_active`?)
3. Where in code is `active` column referenced?
4. Need migration to add it, or rename references?

---

### Error 2: Markets List - Wrong Data Display

**Screenshot shows:**
- All 3 markets showing "Private Pickup" (orange)
- Should show "Traditional (Farmers Market)"
- All showing "Inactive" 
- Should show "Active" (Tracy confirmed listings exist)

**Investigation needed:**
```sql
-- Check actual market data
SELECT id, name, market_type, status, vertical_id
FROM markets
WHERE vertical_id = 'farmers_market';
```

**Questions:**
1. What are actual market_type values in database?
2. What are actual status values?
3. Is display logic inverting/misreading the data?
4. Check `src/app/admin/markets/page.tsx` for display mapping

---

## Part 2: Original Bugs NOT Yet Fixed

### Bug 3: Category Mismatch

**Issue:** Categories in dropdown ≠ categories on browse page

**Investigation:**
```sql
-- What categories actually exist in listings?
SELECT DISTINCT category, COUNT(*) as count
FROM listings
GROUP BY category
ORDER BY count DESC;
```

**Check files:**
- `src/app/[vertical]/browse/page.tsx` - What categories does it show?
- `src/components/listings/ListingForm.tsx` - What's in dropdown?
- Are they reading from different sources?

**Fix:** Both should use these 9 categories:
1. Produce
2. Meat & Poultry
3. Dairy & Eggs
4. Baked Goods
5. Pantry
6. Prepared Foods
7. Health & Wellness
8. Art & Decor
9. Home & Functional

---

### Bug 4: "Back to Site" Wrong Location

**Issue:** Platform admin "Back to Site" goes to localhost:3002 (vertical selector)

**Tracy's rule:** Nothing in a vertical should link back to 815 home

**Investigation:**
- Find "Back to Site" link in `src/app/admin/page.tsx`
- Where does it currently point?
- Change to point to farmers_market home (or whichever vertical admin came from)

---

### Bug 5: Branding - "Fresh Market" Text Should Be Logo

**Issue:** Top left corner shows text "Fresh Market"

**Should be:** Company logo that links to vertical home

**Investigation:**
- Find header component (Header.tsx or similar)
- Where is "Fresh Market" text?
- Need logo file from Tracy or placeholder logo?

---

### Bug 6: Settings - Can't Edit Name/Email

**Issue:** No way to change display name or email in settings

**Investigation:**
- Check `src/app/[vertical]/settings/page.tsx` (or similar)
- Are name/email fields read-only?
- Add edit functionality

---

### Bug 7: Cross-Sell Missing in Checkout

**Issue:** Used to show "More from this vendor" in checkout, now missing

**Investigation:**
- Check `src/app/[vertical]/checkout/page.tsx`
- Is there a section showing other vendor products?
- If missing, add it back

---

### Bug 8: Security Language in Checkout

**Issue:** Checkout only says "Secure checkout powered by Stripe"

**Need:** Reassuring language about online payment security

**Investigation:**
- Check checkout page
- Add security reassurance section before payment

---

### Bug 9: Checkout Lacks Branding

**Issue:** Checkout page is plain white, no company colors

**Investigation:**
- Check checkout page styling
- Add consistent branding (colors, logo, etc.)

---

### Bug 10: Form Data Lost on Browser Back

**Issue:** Vendor filling listing form, clicks "manage markets", uses back button, loses all form data

**Investigation:**
- Check listing form
- Does it use session storage or local storage to preserve data?
- Add form data persistence

---

### Bug 11: Browse Products Button Placement

**Issue:** On empty orders page, "Browse Products" button is inside the empty state box

**Minor fix:** Move below or inline with order list

---

## Part 3: Database Schema Verification

**Run these queries and report results:**

```sql
-- Markets table full schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'markets'
ORDER BY ordinal_position;

-- Check market_type enum values
SELECT unnest(enum_range(NULL::market_type)) AS market_type_value;

-- Check if status column exists for markets
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'markets' AND column_name = 'status';

-- Vendor profiles - verify tier column
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'vendor_profiles' AND column_name = 'tier';

-- Listings - verify category column type
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'listings' AND column_name = 'category';
```

---

## Part 4: Code Pattern Analysis

**For each bug, identify:**
1. **Root cause** - What's actually broken?
2. **Fix approach** - Simple config, code change, or migration?
3. **Files affected** - Which files need changes?
4. **Breaking changes** - Will fix affect other parts?
5. **Time estimate** - Quick fix or complex rebuild?

---

## Output Format

```markdown
# Investigation Results

## CRITICAL Schema Errors

### Error 1: Market 'active' column
- **Root cause:** [explain]
- **Fix:** [migration SQL or code change]
- **Files:** [list]
- **Time:** [estimate]

### Error 2: Markets showing wrong type/status
- **Root cause:** [explain]
- **Fix:** [solution]
- **Files:** [list]
- **Time:** [estimate]

## Outstanding Bugs

### Bug 3: Categories
[same format]

### Bug 4: Back to Site
[same format]

[etc...]

## Summary
- Total bugs: [count]
- Schema issues: [count]
- Code bugs: [count]
- Quick fixes (<30 min): [count]
- Medium fixes (30min-2hr): [count]
- Complex fixes (>2hr): [count]

## Recommended Fix Order
1. [Bug with reasoning]
2. [Bug with reasoning]
[etc...]
```

---

## Critical Notes

- **Test data is correct** - Tracy confirmed listings exist, markets should be active
- **Display logic is wrong** - Database probably has correct data, code misreading it
- **Priority:** Schema errors first (blocking), then display bugs, then UX improvements
- **Don't assume** - If unsure about anything, note it in questions section of output

---

*Investigate thoroughly - this will inform the master fix document*
