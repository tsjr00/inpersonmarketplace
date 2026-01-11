# Build Instructions - Bug Fixes Phase D

**Date:** January 10, 2026  
**Priority:** High  
**Estimated Time:** 3-4 hours

---

## Overview

Phase D addresses issues found during Phase C testing:
1. Buyer orders page fails
2. Pending vendors can't create listings (allow drafts)
3. Navigation terminology confusion
4. Allergen checkbox + ingredients field
5. No admin user exists (create one)
6. Admin reminder for pending vendors (2+ days)
7. Favicon
8. Multi-select vendor type config

---

## IMPORTANT: Database Patterns

All SQL must follow these patterns (from earlier reconciliation):
```sql
-- Use public. prefix on ALL tables and types
FROM public.table_name
'admin'::public.user_role

-- Use optimized auth call
WHERE user_id = (SELECT auth.uid())

-- Functions need these settings
SECURITY DEFINER
SET search_path = ''
```

---

## Part 1: Fix Buyer Orders Page

### 1A: Diagnose the Issue

The RLS policy looks correct. Check if the API/page query is the problem.

**File:** `src/app/[vertical]/buyer/orders/page.tsx` (or similar)

Look for the Supabase query and ensure it:
- Uses correct table name (`orders` not `order_items`)
- Includes proper select fields
- Doesn't have extra filters breaking the query

**Debug by adding logging:**
```typescript
const { data: orders, error } = await supabase
  .from('orders')
  .select(`
    *,
    order_items (
      *,
      listing:listings (title, price_cents)
    )
  `)
  .order('created_at', { ascending: false })

// Add this to see actual error:
if (error) {
  console.error('Orders fetch error:', JSON.stringify(error, null, 2))
}
```

### 1B: Check order_items RLS

**Run in Dev and Staging:**
```sql
-- Verify order_items allows buyer access
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'order_items';
```

If order_items_select doesn't include buyer access via order relationship, add:

```sql
-- Drop and recreate with buyer access
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
FOR SELECT USING (
  -- Buyer can see items from their orders
  order_id IN (SELECT public.get_buyer_order_ids())
  OR
  -- Vendor can see their sold items
  listing_id IN (
    SELECT id FROM public.listings 
    WHERE vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (SELECT auth.uid())
    )
  )
  OR
  -- Admin sees all
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE user_id = (SELECT auth.uid()) 
    AND role = 'admin'::public.user_role
  )
);
```

---

## Part 2: Allow Pending Vendors to Create Draft Listings

### 2A: Update Listings RLS Policy

**Run in Dev, then Staging:**

```sql
-- Drop existing insert policy
DROP POLICY IF EXISTS "listings_insert" ON public.listings;

-- New policy: Approved vendors can create any status, pending can create drafts
CREATE POLICY "listings_insert" ON public.listings
FOR INSERT WITH CHECK (
  -- Approved vendors can create listings (any status)
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles 
    WHERE user_id = (SELECT auth.uid())
    AND status = 'approved'
  )
  OR
  -- Pending/submitted vendors can create DRAFT listings only
  (
    vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles 
      WHERE user_id = (SELECT auth.uid())
      AND status IN ('submitted', 'pending')
    )
    AND status = 'draft'
  )
);

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'listings' AND cmd = 'INSERT';
```

### 2B: Update Listing Form to Default to Draft for Pending Vendors

**File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`

Add logic to check vendor status and set default:

```typescript
// Near the top of the component, after getting vendor profile:
const isPendingVendor = vendorProfile?.status === 'submitted' || vendorProfile?.status === 'pending'

// Set initial status based on vendor approval
const [status, setStatus] = useState(isPendingVendor ? 'draft' : 'published')

// In the form, show message if pending:
{isPendingVendor && (
  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
    <p className="text-yellow-800 text-sm">
      <strong>Note:</strong> Your vendor account is pending approval. 
      Listings will be saved as drafts and can be published once your account is approved.
    </p>
  </div>
)}

// Hide status dropdown for pending vendors, or disable non-draft options:
{!isPendingVendor && (
  <div className="space-y-2">
    <label className="font-medium">Status</label>
    <select 
      value={status} 
      onChange={(e) => setStatus(e.target.value)}
      className="w-full border rounded-lg p-3"
    >
      <option value="draft">Draft</option>
      <option value="published">Published</option>
    </select>
  </div>
)}
```

---

## Part 3: Navigation Terminology Updates

### Terminology Standard
- **Main Menu** = User dashboard (`/{vertical}/dashboard`)
- **Vendor Dashboard** = Vendor dashboard (`/{vertical}/vendor/dashboard`)

### 3A: Update Back Buttons

**Files to update:**

| File | Current | Change To |
|------|---------|-----------|
| `src/app/[vertical]/vendor/listings/page.tsx` | "Back to Dashboard" | "Vendor Dashboard" |
| `src/app/[vertical]/vendor/dashboard/orders/page.tsx` | "Back to Dashboard" | "Vendor Dashboard" |
| `src/app/[vertical]/vendor/dashboard/stripe/page.tsx` | "Back to Dashboard" | "Vendor Dashboard" |
| `src/app/[vertical]/vendor/edit/page.tsx` | "Cancel" | Keep as "Cancel" or "Vendor Dashboard" |

### 3B: Add Main Menu Link to Vendor Pages

Add a secondary navigation link on vendor pages:

```typescript
<div className="flex gap-4 mb-6">
  <Link 
    href={`/${vertical}/vendor/dashboard`}
    className="text-blue-600 hover:underline"
  >
    ← Vendor Dashboard
  </Link>
  <Link 
    href={`/${vertical}/dashboard`}
    className="text-gray-500 hover:underline"
  >
    Main Menu
  </Link>
</div>
```

---

## Part 4: Allergen Checkbox + Ingredients Field

### 4A: Update Listing Form

**File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`

Add state and fields:

```typescript
// Add state
const [containsAllergens, setContainsAllergens] = useState(false)
const [ingredients, setIngredients] = useState('')

// Add to form JSX (after description field):
<div className="space-y-4">
  {/* Allergen Checkbox */}
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={containsAllergens}
      onChange={(e) => setContainsAllergens(e.target.checked)}
      className="mt-1 h-5 w-5 rounded border-gray-300"
    />
    <div>
      <span className="font-medium">This product may contain allergens</span>
      <p className="text-sm text-gray-500">
        Check this if your product contains ingredients that may cause allergic reactions 
        (e.g., nuts, dairy, gluten, eggs, soy, shellfish)
      </p>
    </div>
  </label>

  {/* Ingredients Field - only shown if allergen checkbox is checked */}
  {containsAllergens && (
    <div className="space-y-2 ml-8">
      <label htmlFor="ingredients" className="font-medium">
        Ingredients / Allergen Information
      </label>
      <textarea
        id="ingredients"
        value={ingredients}
        onChange={(e) => setIngredients(e.target.value)}
        rows={3}
        className="w-full border rounded-lg p-3"
        placeholder="List ingredients, especially those that may cause allergic reactions..."
      />
      <p className="text-sm text-gray-500">
        List all ingredients OR at minimum the common allergens: nuts, peanuts, dairy, 
        eggs, wheat/gluten, soy, fish, shellfish.
      </p>
    </div>
  )}
</div>
```

### 4B: Update Description Helper Text

Update the existing helper text to mention allergens:

```typescript
<p className="text-sm text-gray-500">
  Include: what it is, variety/type, quantity (size, count, or weight), and any special qualities.
  <br />
  <strong>If your product contains potential allergens</strong>, check the allergen box below 
  and list the ingredients.
</p>
```

### 4C: Include in Form Submission

Add to the listing data object:

```typescript
const listingData = {
  // ... existing fields
  contains_allergens: containsAllergens,
  ingredients: containsAllergens ? ingredients : null,
}
```

### 4D: Update Database (Optional - store in listing_data JSONB)

No schema change needed - store in existing `listing_data` JSONB field:

```typescript
// In form submission:
const { error } = await supabase
  .from('listings')
  .insert({
    vendor_profile_id: vendorProfileId,
    vertical_id: vertical,
    title,
    description,
    price_cents: Math.round(parseFloat(price) * 100),
    quantity: parseInt(quantity),
    category,
    status,
    listing_data: {
      contains_allergens: containsAllergens,
      ingredients: containsAllergens ? ingredients : null,
    }
  })
```

---

## Part 5: Create Admin User

### 5A: Create Admin Account

You (Tracy) need to sign up as admin first, then we'll update the role.

**Option A: Use existing account**
If you already have an account, get the email and run:

```sql
-- Find your user
SELECT au.id, au.email, up.role 
FROM auth.users au
JOIN public.user_profiles up ON au.id = up.user_id
WHERE au.email LIKE '%jennifer%' OR au.email LIKE '%tracy%';
```

**Option B: Create new admin account**
1. Sign up at localhost:3002/farmers_market/signup with an admin email
2. Get the user_id from the query above

### 5B: Update Role to Admin

```sql
-- Replace 'your-user-id-here' with actual UUID from query above
UPDATE public.user_profiles 
SET role = 'admin'::public.user_role, 
    updated_at = NOW()
WHERE user_id = 'your-user-id-here';

-- Verify
SELECT user_id, email, role FROM public.user_profiles WHERE role = 'admin'::public.user_role;
```

**Run on both Dev and Staging with the appropriate user_id for each environment.**

---

## Part 6: Admin Reminder for Pending Vendors (2+ Days)

### 6A: Create Database Function for Pending Vendor Check

**Run in Dev, then Staging:**

```sql
-- Function to get vendors pending for more than X days
CREATE OR REPLACE FUNCTION public.get_stale_pending_vendors(days_threshold INTEGER DEFAULT 2)
RETURNS TABLE (
  vendor_profile_id UUID,
  user_email TEXT,
  business_name TEXT,
  submitted_at TIMESTAMPTZ,
  days_pending INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vp.id as vendor_profile_id,
    au.email as user_email,
    vp.profile_data->>'business_name' as business_name,
    vp.created_at as submitted_at,
    EXTRACT(DAY FROM NOW() - vp.created_at)::INTEGER as days_pending
  FROM public.vendor_profiles vp
  JOIN auth.users au ON vp.user_id = au.id
  WHERE vp.status IN ('submitted', 'pending')
    AND vp.created_at < NOW() - (days_threshold || ' days')::INTERVAL
  ORDER BY vp.created_at ASC;
END;
$$;
```

### 6B: Create Admin API Endpoint

**File:** `src/app/api/admin/pending-vendors/route.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServerClient()
  
  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  
  // Get stale pending vendors (2+ days)
  const { data: staleVendors, error } = await supabase
    .rpc('get_stale_pending_vendors', { days_threshold: 2 })
  
  if (error) {
    console.error('Error fetching stale vendors:', error)
    return NextResponse.json({ error: 'Failed to fetch pending vendors' }, { status: 500 })
  }
  
  return NextResponse.json({ 
    staleVendors,
    count: staleVendors?.length || 0
  })
}
```

### 6C: Show Reminder on Admin Dashboard

**File:** `src/app/[vertical]/admin/page.tsx` (or admin dashboard component)

Add a warning banner when there are stale pending vendors:

```typescript
// Fetch stale vendors count
const [stalePendingCount, setStalePendingCount] = useState(0)

useEffect(() => {
  async function checkPendingVendors() {
    const res = await fetch('/api/admin/pending-vendors')
    if (res.ok) {
      const data = await res.json()
      setStalePendingCount(data.count)
    }
  }
  checkPendingVendors()
}, [])

// Show warning banner
{stalePendingCount > 0 && (
  <div className="bg-orange-100 border-l-4 border-orange-500 p-4 mb-6">
    <div className="flex items-center">
      <span className="text-orange-700 font-medium">
        ⚠️ {stalePendingCount} vendor{stalePendingCount > 1 ? 's' : ''} pending approval for 2+ days
      </span>
      <Link 
        href={`/${vertical}/admin/vendors?status=pending`}
        className="ml-4 text-orange-600 hover:underline"
      >
        Review now →
      </Link>
    </div>
  </div>
)}
```

---

## Part 7: Add Favicon

### 7A: Create Favicon Files

Use the existing logo and create favicon versions:

**Files needed in `public/` folder:**
- `favicon.ico` (32x32, ICO format)
- `favicon-16x16.png` (16x16)
- `favicon-32x32.png` (32x32)
- `apple-touch-icon.png` (180x180)

### 7B: Generate Favicons

Use an online tool like https://realfavicongenerator.net/ or create manually:

**If using existing logo:**
1. Take `public/logos/farmersmarketing-logo.png` or another suitable logo
2. Resize to required dimensions
3. For ICO format, use online converter or ImageMagick:
   ```bash
   convert logo.png -resize 32x32 favicon.ico
   ```

### 7C: Update App Metadata

**File:** `src/app/layout.tsx`

```typescript
export const metadata: Metadata = {
  title: 'Fresh Market',
  description: 'Your local marketplace',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
  },
}
```

---

## Part 8: Enable Multi-Select Vendor Types

### 8A: Update Database Config

**Run in Dev, then Staging:**

```sql
-- Update farmers_market vendor_fields to use multi_select
UPDATE public.verticals
SET config = jsonb_set(
  config,
  '{vendor_fields}',
  '[
    {"key":"legal_name","type":"text","label":"Legal Name","required":true},
    {"key":"phone","type":"phone","label":"Phone Number","required":true},
    {"key":"email","type":"email","label":"Email Address","required":true},
    {"key":"business_name","type":"text","label":"Farm / Business Name","required":true},
    {"key":"vendor_type","type":"multi_select","label":"What do you sell? (select all that apply)","options":["Produce","Meat","Dairy","Baked Goods","Prepared Foods","Preserves","Plants","Crafts","Other"],"required":true},
    {"key":"cottage_food_cert","type":"file","label":"Cottage Food Permit or Exemption","accept":["pdf","jpg","png"],"required":false},
    {"key":"organic_cert","type":"file","label":"Organic Certification (if applicable)","accept":["pdf","jpg","png"],"required":false}
  ]'::jsonb
)
WHERE vertical_id = 'farmers_market';

-- Verify
SELECT config->'vendor_fields' FROM public.verticals WHERE vertical_id = 'farmers_market';
```

### 8B: Update Fireworks Vertical (if exists)

```sql
-- Check if fireworks has vendor_fields
SELECT vertical_id, config->'vendor_fields' FROM public.verticals WHERE vertical_id = 'fireworks';

-- If it exists and needs updating, similar pattern:
-- UPDATE public.verticals SET config = jsonb_set(...) WHERE vertical_id = 'fireworks';
```

---

## Testing Checklist

### Part 1: Buyer Orders
- [ ] Log in as buyer with orders
- [ ] Go to /{vertical}/buyer/orders
- [ ] Page loads without error

### Part 2: Pending Vendor Draft Listings
- [ ] Log in as new vendor (pending status)
- [ ] Go to create listing
- [ ] See yellow "pending approval" notice
- [ ] Create listing succeeds (saved as draft)
- [ ] Listing appears in vendor's list with draft status

### Part 3: Navigation
- [ ] "Back to Dashboard" buttons say "Vendor Dashboard"
- [ ] "Main Menu" link available on vendor pages

### Part 4: Allergen Field
- [ ] Allergen checkbox visible on listing form
- [ ] Checking box reveals ingredients field
- [ ] Helper text mentions allergens
- [ ] Data saves correctly

### Part 5: Admin User
- [ ] Admin user exists in database
- [ ] Can access admin dashboard

### Part 6: Pending Vendor Reminder
- [ ] Admin dashboard shows warning for 2+ day pending vendors
- [ ] Link to review pending vendors works

### Part 7: Favicon
- [ ] Favicon appears in browser tab
- [ ] Apple touch icon works

### Part 8: Multi-Select Vendor Types
- [ ] Vendor signup shows checkboxes
- [ ] Can select multiple types
- [ ] Saves correctly

---

## Commit Strategy

```bash
# After Part 1
git add -A
git commit -m "Fix buyer orders page query"

# After Parts 2-3
git add -A
git commit -m "Allow pending vendors to create drafts, update navigation terminology"

# After Part 4
git add -A
git commit -m "Add allergen checkbox and ingredients field to listings"

# After Parts 5-6
git add -A
git commit -m "Add admin reminder for stale pending vendors"

# After Parts 7-8
git add -A
git commit -m "Add favicon, enable multi-select vendor types"

# Push all
git push origin main
```

---

## Session Summary Template

```markdown
# Session Summary - Bug Fixes Phase D

**Date:** [DATE]
**Duration:** [TIME]

## Completed
- [ ] Fixed buyer orders page
- [ ] Allow pending vendors to create drafts
- [ ] Updated navigation terminology
- [ ] Added allergen checkbox + ingredients
- [ ] Created admin user
- [ ] Added pending vendor reminder
- [ ] Added favicon
- [ ] Enabled multi-select vendor types

## Database Changes Applied
- Dev: ✅/❌
- Staging: ✅/❌

## Testing Results
[Fill in from checklist]

## Notes
[Any issues encountered]
```
