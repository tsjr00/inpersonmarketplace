# Build Instructions - Phase H-3: Mobile View Fixes & API Error

**Date:** January 12, 2026  
**Priority:** High  
**Estimated Time:** 2-3 hours

---

## Overview

Mobile testing revealed layout issues on several pages and a recurring API error. This phase fixes:

1. Button text centering (general)
2. Vendor listings page mobile layout
3. Product detail page mobile layout
4. Vendor profile page (image + categories)
5. Checkout page mobile layout
6. API /buyer/orders 500 error

---

## Part 1: General - Button Text Centering

Audit all buttons to ensure text is centered horizontally and vertically.

**Pattern to use:**
```typescript
<button className="flex items-center justify-center px-4 py-2 ...">
  Button Text
</button>

// Or for links styled as buttons:
<Link className="flex items-center justify-center px-4 py-2 ...">
  Link Text
</Link>
```

**Files to check:**
- All page files with buttons
- Any shared button components

---

## Part 2: Vendor Listings Page Mobile Layout

**File:** `src/app/[vertical]/vendor/listings/page.tsx`

### Problem
Title "My Listings" doesn't wrap correctly, pushes buttons off screen on mobile.

### Solution
Stack elements vertically on mobile:

```
MOBILE:
┌─────────────────────────┐
│ My Listings             │  ← Line 1: Title
│ Fresh Market            │
├─────────────────────────┤
│ [+ New Listing] [Vendor │  ← Line 2: Buttons (can wrap)
│    Dashboard]           │
├─────────────────────────┤
│ 2 / 5 listings          │  ← Line 3: Count
└─────────────────────────┘

DESKTOP:
┌─────────────────────────────────────────────────────────────┐
│ My Listings              [+ New Listing] [Vendor Dashboard] │
│ Fresh Market • 2 / 5 listings                               │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
{/* Header Section */}
<div className="mb-6">
  {/* Title - always on its own line on mobile */}
  <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
  <p className="text-sm text-gray-500 mb-4 md:mb-0">Fresh Market</p>
  
  {/* Buttons - stack on mobile, inline on desktop */}
  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 my-4">
    <Link
      href={`/${vertical}/vendor/listings/new`}
      className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
    >
      + New Listing
    </Link>
    <Link
      href={`/${vertical}/vendor/dashboard`}
      className="flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
    >
      Vendor Dashboard
    </Link>
  </div>
  
  {/* Listing count */}
  <p className="text-sm text-gray-600">
    {listings.length} / {limit} listings
    {listings.length >= limit && (
      <span className="text-red-600 ml-2">(limit reached)</span>
    )}
  </p>
</div>
```

---

## Part 3: Product Detail Page Mobile Layout

**File:** `src/app/[vertical]/listing/[listingId]/page.tsx`

### Problem
Desktop layout showing on mobile - not responsive.

### Solution
Single column on mobile, two columns on desktop.

```
MOBILE (<768px):
┌─────────────────────────┐
│ ← Back to Browse        │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │                     │ │
│ │      [IMAGE]        │ │
│ │                     │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ Category Badge          │
│ Product Title           │
│ $XX.XX                  │
│                         │
│ Availability: X         │
│ Quantity: [- 1 +]       │
│ [Add to Cart]           │
├─────────────────────────┤
│ Description             │
│ ...                     │
├─────────────────────────┤
│ Sold by                 │
│ Vendor Name             │
│ [View Vendor Profile]   │
└─────────────────────────┘

DESKTOP (768px+):
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Browse                                            │
├────────────────────────────┬────────────────────────────────┤
│                            │ Category Badge                 │
│                            │ Product Title                  │
│        [IMAGE]             │ $XX.XX                         │
│                            │                                │
│                            │ Availability: X                │
│                            │ Quantity: [- 1 +]              │
│                            │ [Add to Cart]                  │
├────────────────────────────┼────────────────────────────────┤
│ Description                │ Sold by                        │
│ ...                        │ Vendor Name                    │
│                            │ [View Vendor Profile]          │
└────────────────────────────┴────────────────────────────────┘
```

### Implementation

```typescript
<div className="max-w-6xl mx-auto p-4">
  {/* Back Link */}
  <Link href={`/${vertical}/browse`} className="text-gray-600 hover:underline mb-4 inline-block">
    ← Back to Browse
  </Link>
  
  {/* Main Content - single col mobile, two col desktop */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
    
    {/* Image - full width on mobile */}
    <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
      {listing.image_url ? (
        <img 
          src={listing.image_url} 
          alt={listing.title}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-6xl">📦</span>
        </div>
      )}
    </div>
    
    {/* Details */}
    <div className="space-y-4">
      {/* Category Badge */}
      <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
        {listing.category}
      </span>
      
      {/* Title & Price */}
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{listing.title}</h1>
      <p className="text-2xl md:text-3xl font-bold text-green-700">
        {formatDisplayPrice(listing.price_cents)}
      </p>
      
      {/* Availability */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-500">Availability</p>
        <p className="font-medium">{listing.quantity} available</p>
      </div>
      
      {/* Quantity Selector */}
      <div className="flex items-center gap-4">
        <span className="text-gray-600">Quantity:</span>
        <div className="flex items-center border rounded-lg">
          <button className="px-3 py-2 hover:bg-gray-100">-</button>
          <span className="px-4 py-2 border-x">{quantity}</span>
          <button className="px-3 py-2 hover:bg-gray-100">+</button>
        </div>
      </div>
      
      {/* Add to Cart */}
      <button className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-lg">
        🛒 Add to Cart
      </button>
    </div>
  </div>
  
  {/* Description & Vendor - stack on mobile, side by side on desktop */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
    {/* Description */}
    <div className="bg-white rounded-lg border p-4">
      <h2 className="font-semibold text-lg mb-2">Description</h2>
      <p className="text-gray-600">{listing.description}</p>
    </div>
    
    {/* Vendor Info */}
    <div className="bg-white rounded-lg border p-4">
      <h2 className="font-semibold text-lg mb-2">Sold by</h2>
      <p className="font-medium">{vendorProfile?.profile_data?.business_name}</p>
      <p className="text-sm text-gray-500 mb-4">
        Member since {new Date(vendorProfile?.created_at).toLocaleDateString()}
      </p>
      <Link
        href={`/${vertical}/vendor/${vendorProfile?.id}/profile`}
        className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
      >
        View Vendor Profile
      </Link>
    </div>
  </div>
</div>
```

---

## Part 4: Vendor Profile Page Fixes

**File:** `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx`

### Problem 1: Image Stretched Vertically
The vendor profile image is stretched instead of maintaining aspect ratio.

### Solution 1: Fix Image Aspect Ratio

```typescript
{/* Vendor Profile Image/Logo */}
<div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
  {vendorProfile.profile_data?.logo_url ? (
    <img 
      src={vendorProfile.profile_data.logo_url}
      alt={vendorProfile.profile_data.business_name}
      className="w-full h-full object-cover"  // Use object-cover, not object-fill
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-green-100">
      <span className="text-3xl md:text-4xl font-bold text-green-700">
        {vendorProfile.profile_data?.business_name?.[0]?.toUpperCase() || 'V'}
      </span>
    </div>
  )}
</div>
```

### Problem 2: Only Shows One Category
Profile only shows the category from signup, not all categories the vendor sells.

### Solution 2: Show All Categories from Listings

```typescript
// Query to get all unique categories this vendor sells
const { data: vendorCategories } = await supabase
  .from('listings')
  .select('category')
  .eq('vendor_profile_id', vendorId)
  .eq('status', 'published')
  .is('deleted_at', null)

// Get unique categories
const uniqueCategories = [...new Set(vendorCategories?.map(l => l.category) || [])]

// Also include vendor_type from profile if it's not already in listings
const profileTypes = vendorProfile.profile_data?.vendor_type
const allCategories = profileTypes 
  ? [...new Set([
      ...uniqueCategories, 
      ...(Array.isArray(profileTypes) ? profileTypes : [profileTypes])
    ])]
  : uniqueCategories

// Display all categories
<div className="flex flex-wrap gap-2 mt-2">
  {allCategories.map(category => (
    <span 
      key={category}
      className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded-full"
    >
      {category}
    </span>
  ))}
</div>
```

---

## Part 5: Checkout Page Mobile Layout

**File:** `src/app/[vertical]/checkout/page.tsx`

### Problem
Desktop two-column layout showing on mobile - content cut off.

### Solution
Single column on mobile, two columns on desktop.

```
MOBILE:
┌─────────────────────────┐
│ ← Back to Shopping      │
│ Checkout                │
├─────────────────────────┤
│ Order Items             │
│ ┌─────────────────────┐ │
│ │ Item 1       $XX.XX │ │
│ │ Qty: [- 1 +] Remove │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Item 2       $XX.XX │ │
│ │ Qty: [- 1 +] Remove │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ Order Summary           │
│ Items (2)      $XX.XX   │
│ Total          $XX.XX   │
│ [Place Order]           │
└─────────────────────────┘

DESKTOP:
┌────────────────────────────────┬─────────────────────────────┐
│ Order Items                    │ Order Summary               │
│ ...                            │ Items (2)      $XX.XX       │
│                                │ Total          $XX.XX       │
│                                │ [Place Order]               │
└────────────────────────────────┴─────────────────────────────┘
```

### Implementation

```typescript
<div className="max-w-6xl mx-auto p-4">
  {/* Header */}
  <div className="mb-6">
    <Link href={`/${vertical}/browse`} className="text-gray-600 hover:underline">
      ← Back to Shopping
    </Link>
    <h1 className="text-2xl font-bold mt-2">Checkout</h1>
  </div>
  
  {/* Main Content - single col mobile, two col desktop */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    
    {/* Order Items - takes 2 cols on desktop */}
    <div className="lg:col-span-2 space-y-4">
      <h2 className="text-lg font-semibold">Order Items</h2>
      
      {cartItems.map(item => (
        <div key={item.id} className="bg-white rounded-lg border p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.vendor_name}</p>
            </div>
            <div className="text-right">
              <p className="font-bold">{formatDisplayPrice(item.price_cents)}</p>
              <p className="text-sm text-gray-500">
                {formatDisplayPrice(item.price_cents)} each
              </p>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Qty:</span>
              <div className="flex items-center border rounded">
                <button className="px-2 py-1 hover:bg-gray-100">-</button>
                <span className="px-3 py-1 border-x">{item.quantity}</span>
                <button className="px-2 py-1 hover:bg-gray-100">+</button>
              </div>
            </div>
            <button className="text-red-600 text-sm hover:underline">
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
    
    {/* Order Summary - takes 1 col on desktop, full width on mobile */}
    <div className="lg:col-span-1">
      <div className="bg-white rounded-lg border p-4 sticky top-4">
        <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
        
        <div className="space-y-2 mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Items ({cartItems.length})</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
        </div>
        
        <div className="border-t pt-4 mb-4">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
        
        <button className="w-full flex items-center justify-center py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
          Place Order
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## Part 6: Fix API /buyer/orders 500 Error

**File:** `src/app/api/buyer/orders/route.ts`

### Problem
API returns 500 Internal Server Error. This error appears on multiple pages.

### Debugging Steps

1. Add detailed error logging:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createServerClient()
    
    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('[/api/buyer/orders] Auth error:', authError)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }
    
    if (!user) {
      console.error('[/api/buyer/orders] No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('[/api/buyer/orders] Fetching orders for user:', user.id)
    
    // Fetch orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        created_at,
        status,
        total_cents,
        order_items (
          id,
          quantity,
          price_cents,
          listing:listings (
            id,
            title,
            vendor_profile_id
          )
        )
      `)
      .eq('buyer_user_id', user.id)
      .order('created_at', { ascending: false })
    
    if (ordersError) {
      console.error('[/api/buyer/orders] Database error:', ordersError)
      return NextResponse.json(
        { error: 'Failed to fetch orders', details: ordersError.message }, 
        { status: 500 }
      )
    }
    
    console.log('[/api/buyer/orders] Found orders:', orders?.length || 0)
    
    return NextResponse.json({ orders: orders || [] })
    
  } catch (error) {
    console.error('[/api/buyer/orders] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) }, 
      { status: 500 }
    )
  }
}
```

2. Check for these common issues:
   - Column name mismatches (buyer_user_id vs user_id)
   - RLS policy blocking access
   - Missing table/column references
   - Null handling in nested joins

3. Verify the query works directly in Supabase:

```sql
-- Test query in Supabase SQL Editor
SELECT 
  o.id,
  o.created_at,
  o.status,
  o.total_cents,
  o.buyer_user_id
FROM orders o
WHERE o.buyer_user_id = 'your-test-user-id';
```

4. Check RLS policies:

```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'orders';
```

---

## Testing Checklist

### Part 1: Button Centering
- [ ] All buttons have centered text
- [ ] Link-buttons have centered text

### Part 2: Vendor Listings Page
- [ ] Title on its own line on mobile
- [ ] Buttons wrap/stack below title on mobile
- [ ] Listing count visible on mobile
- [ ] Proper layout on desktop

### Part 3: Product Detail Page
- [ ] Single column on mobile
- [ ] Image full width on mobile
- [ ] Details stack below image on mobile
- [ ] Two columns on desktop

### Part 4: Vendor Profile Page
- [ ] Profile image not stretched (circular, proper aspect)
- [ ] Shows ALL categories vendor sells
- [ ] Categories from listings + profile_data combined

### Part 5: Checkout Page
- [ ] Single column on mobile
- [ ] Order items full width on mobile
- [ ] Summary below items on mobile
- [ ] Two columns on desktop

### Part 6: API Fix
- [ ] /api/buyer/orders returns 200 (not 500)
- [ ] No console errors for buyer/orders
- [ ] Orders page loads correctly

### Mobile Testing
- [ ] Test all pages at 375px width (iPhone SE)
- [ ] No horizontal scrolling
- [ ] All content visible and readable

---

## Commit Strategy

```bash
# After Parts 1-2
git add -A
git commit -m "Fix button centering and vendor listings mobile layout"

# After Part 3
git add -A
git commit -m "Apply mobile-first layout to product detail page"

# After Part 4
git add -A
git commit -m "Fix vendor profile image and show all categories"

# After Part 5
git add -A
git commit -m "Apply mobile-first layout to checkout page"

# After Part 6
git add -A
git commit -m "Fix /api/buyer/orders 500 error with improved error handling"

# Push
git push origin main
```

---

## Files to Modify

| File | Changes |
|------|---------|
| Various button components | Center text alignment |
| `src/app/[vertical]/vendor/listings/page.tsx` | Mobile header layout |
| `src/app/[vertical]/listing/[listingId]/page.tsx` | Mobile-first responsive layout |
| `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` | Fix image, show all categories |
| `src/app/[vertical]/checkout/page.tsx` | Mobile-first responsive layout |
| `src/app/api/buyer/orders/route.ts` | Debug and fix 500 error |

---

*Session instructions prepared by Chet (Claude Chat)*
