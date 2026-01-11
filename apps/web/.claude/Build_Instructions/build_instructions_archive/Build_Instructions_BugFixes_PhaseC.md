# Build Instructions - Bug Fixes Phase C

**Date:** January 10, 2026  
**Priority:** Medium - UX Improvements  
**Estimated Time:** 3-4 hours

**Prerequisite:** Complete Phase A and B first

---

## Overview

Dashboard and navigation UX issues:
1. Vendor signup redirect loop
2. Dashboard layout needs buyer/vendor separation
3. Large "Become a Vendor" should be small link
4. Add browse link for buyers
5. Vendor type should allow multiple selections

---

## Part 1: Fix Vendor Signup Redirect Loop

### Problem
After completing vendor signup, user is redirected back to "complete registration" instead of vendor dashboard.

**File:** `src/app/[vertical]/vendor-signup/page.tsx` (or VendorSignupForm component)

### Find the success handler:

```typescript
// Current (problematic):
if (result.success) {
  router.push(`/${vertical}/dashboard`)
}

// Should redirect to vendor dashboard:
if (result.success) {
  router.push(`/${vertical}/vendor/dashboard`)
  router.refresh() // Force refresh to pick up new vendor status
}
```

### Also check the vendor profile creation API:

**File:** `src/app/api/vendor/signup/route.ts` (or similar)

Ensure the response includes the created vendor profile:

```typescript
// After successful insert:
return NextResponse.json({ 
  success: true, 
  vendorProfile: data,
  redirectTo: `/${vertical}/vendor/dashboard`
})
```

---

## Part 2: Redesign Dashboard Layout

### New Dashboard Structure

**File:** `src/app/[vertical]/dashboard/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage({ 
  params 
}: { 
  params: { vertical: string } 
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect(`/${params.vertical}/login`)
  }
  
  // Get user profile
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  
  // Check if user is a vendor in this vertical
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', params.vertical)
    .single()
  
  const isVendor = !!vendorProfile
  const isApprovedVendor = vendorProfile?.status === 'approved'
  
  // Get recent orders (as buyer)
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('*, order_items(*, listing:listings(title))')
    .eq('buyer_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">
        Welcome back, {userProfile?.display_name || 'there'}!
      </h1>
      
      {/* ========== SHOPPER SECTION ========== */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-green-700">
          🛒 Shopper
        </h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          {/* Browse Products Card */}
          <Link 
            href={`/${params.vertical}/browse`}
            className="block p-6 bg-white border rounded-lg hover:shadow-md transition"
          >
            <h3 className="font-semibold text-lg mb-2">Browse Products</h3>
            <p className="text-gray-600 text-sm">
              Discover fresh products from local vendors
            </p>
          </Link>
          
          {/* My Orders Card */}
          <Link 
            href={`/${params.vertical}/orders`}
            className="block p-6 bg-white border rounded-lg hover:shadow-md transition"
          >
            <h3 className="font-semibold text-lg mb-2">My Orders</h3>
            <p className="text-gray-600 text-sm">
              {recentOrders?.length || 0} recent orders
            </p>
          </Link>
        </div>
        
        {/* Recent Orders Preview */}
        {recentOrders && recentOrders.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">Recent Orders</h4>
            <ul className="space-y-2">
              {recentOrders.slice(0, 3).map((order: any) => (
                <li key={order.id} className="text-sm text-gray-600">
                  Order #{order.id.slice(0, 8)} - {order.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      
      {/* ========== VENDOR SECTION ========== */}
      {isVendor ? (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-700">
            🏪 Vendor
          </h2>
          
          {isApprovedVendor ? (
            <div className="grid md:grid-cols-2 gap-4">
              <Link 
                href={`/${params.vertical}/vendor/dashboard`}
                className="block p-6 bg-blue-50 border border-blue-200 rounded-lg hover:shadow-md transition"
              >
                <h3 className="font-semibold text-lg mb-2">Vendor Dashboard</h3>
                <p className="text-gray-600 text-sm">
                  Manage listings, orders, and payments
                </p>
              </Link>
              
              <Link 
                href={`/${params.vertical}/vendor/listings`}
                className="block p-6 bg-white border rounded-lg hover:shadow-md transition"
              >
                <h3 className="font-semibold text-lg mb-2">My Listings</h3>
                <p className="text-gray-600 text-sm">
                  View and manage your products
                </p>
              </Link>
            </div>
          ) : (
            <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">⏳ Pending Approval</h3>
              <p className="text-gray-600 text-sm">
                Your vendor application is being reviewed. We'll notify you once approved.
              </p>
            </div>
          )}
        </section>
      ) : null}
      
      {/* ========== BECOME A VENDOR (small, at bottom) ========== */}
      {!isVendor && (
        <section className="border-t pt-6 mt-8">
          <p className="text-gray-500 text-sm">
            Interested in selling? {' '}
            <Link 
              href={`/${params.vertical}/vendor-signup`}
              className="text-blue-600 hover:underline"
            >
              Become a vendor →
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
```

---

## Part 3: Vendor Type Multi-Select

### Problem
Vendor signup only allows 1 vendor type selection.

### Option A: Allow Multiple Selection in Form

**File:** `src/app/[vertical]/vendor-signup/VendorSignupForm.tsx` (or similar)

```typescript
// Change from single select:
<select 
  value={vendorType} 
  onChange={(e) => setVendorType(e.target.value)}
>

// To checkboxes:
const [vendorTypes, setVendorTypes] = useState<string[]>([])

const handleTypeToggle = (type: string) => {
  setVendorTypes(prev => 
    prev.includes(type) 
      ? prev.filter(t => t !== type)
      : [...prev, type]
  )
}

// Render as checkboxes:
<div className="space-y-2">
  <label className="font-medium">What do you sell? (select all that apply)</label>
  {['Produce', 'Dairy', 'Meat', 'Baked Goods', 'Preserves', 'Artisan', 'Other'].map(type => (
    <label key={type} className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={vendorTypes.includes(type)}
        onChange={() => handleTypeToggle(type)}
      />
      {type}
    </label>
  ))}
</div>
```

### Update Database Field

**Run in Dev and Staging:**

```sql
-- Check current vendor_type column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_profiles' AND column_name LIKE '%type%';

-- If it's a single value field, we store as JSONB array in profile_data instead:
-- No schema change needed - just update the form to save as array in profile_data.vendor_types
```

**Update form submission:**

```typescript
const profileData = {
  business_name: businessName,
  // ... other fields
  vendor_types: vendorTypes, // Now an array
}

await supabase.from('vendor_profiles').insert({
  user_id: user.id,
  vertical_id: vertical,
  profile_data: profileData,
  // ...
})
```

### Option B: Auto-Track from Listings (Future Enhancement)

Instead of manual selection, track categories from listings:

```sql
-- Query to get vendor's categories from their listings:
SELECT DISTINCT category 
FROM listings 
WHERE vendor_profile_id = 'xxx';
```

This can be a Phase 2 enhancement.

---

## Part 4: Listing Form - Add Description Guidance

**File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`

Find the description field and add helper text:

```typescript
<div className="space-y-2">
  <label htmlFor="description" className="font-medium">
    Description
  </label>
  <textarea
    id="description"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    rows={4}
    className="w-full border rounded-lg p-3"
    placeholder="Describe your product..."
  />
  <p className="text-sm text-gray-500">
    Include: what it is, variety/type, quantity (size, count, or weight), 
    and any special qualities.
  </p>
</div>
```

---

## Part 5: Testing Checklist

### Test 1: Vendor Signup Redirect
1. Create new account
2. Complete vendor signup form
3. ✅ Should redirect to /vendor/dashboard (not loop back)

### Test 2: Dashboard Layout
1. Log in as buyer (no vendor profile)
2. ✅ Should see Shopper section with Browse and Orders
3. ✅ Should see small "Become a vendor" link at bottom
4. ✅ Should NOT see large vendor CTA

### Test 3: Dashboard as Vendor
1. Log in as approved vendor
2. ✅ Should see Shopper section
3. ✅ Should see Vendor section with dashboard links

### Test 4: Vendor Type Multi-Select
1. Go to vendor signup
2. ✅ Should see checkboxes for vendor types
3. ✅ Should be able to select multiple

### Test 5: Description Helper
1. Go to create listing form
2. ✅ Should see helper text under description field

---

## Commit Strategy

```bash
# After vendor signup fix
git add -A
git commit -m "Fix vendor signup redirect loop"

# After dashboard redesign
git add -A  
git commit -m "Redesign dashboard with buyer/vendor sections"

# After vendor type multi-select
git add -A
git commit -m "Allow multiple vendor type selection"

# After description helper
git add -A
git commit -m "Add description guidance to listing form"

# Push all
git push origin main
```

---

## Session Summary Template

```markdown
# Session Summary - Bug Fixes Phase C

**Date:** [DATE]
**Duration:** [TIME]

## Completed
- [ ] Fixed vendor signup redirect
- [ ] Redesigned dashboard layout
- [ ] Added browse link for buyers
- [ ] Made "Become vendor" a small link
- [ ] Enabled multi-select vendor types
- [ ] Added listing description helper text

## Testing Results
- Vendor signup redirect: ✅/❌
- Dashboard layout (buyer): ✅/❌
- Dashboard layout (vendor): ✅/❌
- Vendor type multi-select: ✅/❌
- Description helper: ✅/❌

## Notes
[Any issues encountered]
```
