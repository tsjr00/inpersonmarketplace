# Build Instructions - Phase H-2: Navigation Standardization & Layout Fixes

**Date:** January 12, 2026  
**Priority:** High - Complete before adding new features  
**Estimated Time:** 3-4 hours

---

## CRITICAL: Mobile-First Design

**Most users will access via mobile phone.** All layouts must be:
- Mobile-first (design for phone, then expand for desktop)
- Touch-friendly (buttons/links minimum 44px tap target)
- Responsive (grid layouts collapse to single column on mobile)
- Fast loading (minimize layout shifts)

**Breakpoints:**
```css
/* Mobile first approach */
Default: Mobile (< 640px) - single column
sm: 640px+ - can start 2-column
md: 768px+ - can use 2-3 columns
lg: 1024px+ - full desktop layout
```

---

## Overview

Standardize navigation across all pages and fix layout issues before adding new features.

**Changes:**
1. Header: "Browse" → "Browse Products", add dropdown items
2. Remove duplicate navigation from all pages
3. Create Settings page
4. Vendor Dashboard: 3-column grid for info sections (responsive)
5. Browse page: Sort by category → vendor → newest, show category headers

---

## Part 1: Header Navigation Updates

### 1A: Rename "Browse" to "Browse Products"

**File:** `src/components/layout/Header.tsx`

```typescript
// Change:
<Link href={`/${vertical}/browse`}>Browse</Link>

// To:
<Link href={`/${vertical}/browse`}>Browse Products</Link>
```

### 1B: Update Dropdown Menu Items

**File:** `src/components/layout/Header.tsx`

Update dropdown to include all items in correct order:

```typescript
{/* Dropdown Menu */}
{dropdownOpen && (
  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
    {/* User Info */}
    <div className="px-4 py-2 border-b border-gray-100">
      <p className="text-sm font-medium text-gray-900">
        {userProfile?.display_name || 'User'}
      </p>
      <p className="text-xs text-gray-500 truncate">{user.email}</p>
    </div>
    
    {/* Navigation Items */}
    <Link
      href={`/${vertical}/buyer/orders`}
      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      onClick={() => setDropdownOpen(false)}
    >
      My Orders
    </Link>
    
    {/* Become a Vendor - only for non-vendors */}
    {!vendorProfile && (
      <Link
        href={`/${vertical}/vendor-signup`}
        className="block px-4 py-2 text-sm text-green-700 hover:bg-green-50"
        onClick={() => setDropdownOpen(false)}
      >
        Become a Vendor
      </Link>
    )}
    
    {/* Vendor Dashboard - only for vendors */}
    {(isVendor || isPendingVendor) && (
      <Link
        href={`/${vertical}/vendor/dashboard`}
        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        onClick={() => setDropdownOpen(false)}
      >
        Vendor Dashboard
        {isPendingVendor && (
          <span className="ml-2 text-xs text-yellow-600">(Pending)</span>
        )}
      </Link>
    )}
    
    {/* Admin Dashboard - only for admins */}
    {isAdmin && (
      <Link
        href={`/${vertical}/admin`}
        className="block px-4 py-2 text-sm text-purple-700 hover:bg-purple-50"
        onClick={() => setDropdownOpen(false)}
      >
        Admin Dashboard
      </Link>
    )}
    
    <div className="border-t border-gray-100 my-1"></div>
    
    {/* Settings */}
    <Link
      href={`/${vertical}/settings`}
      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      onClick={() => setDropdownOpen(false)}
    >
      Settings
    </Link>
    
    {/* Logout */}
    <button
      onClick={handleLogout}
      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
    >
      Logout
    </button>
  </div>
)}
```

### 1C: Mobile Header Considerations

Ensure header is mobile-friendly:
- Hamburger menu or compact layout on mobile
- Dropdown should work with touch (not just hover)
- Adequate tap targets (min 44px height for links)

---

## Part 2: Remove Duplicate Navigation from All Pages

### Search and Remove

Find and remove these patterns from ALL page files:

```typescript
// REMOVE any of these from page content:
- Standalone "Logout" buttons
- "User Dashboard" buttons  
- Duplicate "Login" / "Sign Up" links
- "Browse" links that duplicate header
- Any secondary navigation row
```

### Specific Files to Update

**File:** `src/app/[vertical]/page.tsx` (Home)
- Remove inline navigation row that duplicates header
- Keep hero section CTAs ("Browse X Listings", "Become a Vendor")

**File:** `src/app/[vertical]/dashboard/page.tsx` (Main Dashboard)
- Remove any standalone "Logout" button
- DO NOT change the rest of the layout - it's good

**File:** `src/app/[vertical]/vendor/dashboard/page.tsx` (Vendor Dashboard)
- Remove "User Dashboard" button (top right)
- Keep "Edit Profile" button on Contact Information card

**Check and clean these directories:**
- `src/app/[vertical]/vendor/*`
- `src/app/[vertical]/buyer/*`
- `src/app/[vertical]/admin/*`
- `src/app/[vertical]/checkout/*`

---

## Part 3: Create Settings Page

**File:** `src/app/[vertical]/settings/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function SettingsPage({
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
  
  // Get vendor profile if exists
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', params.vertical)
    .single()
  
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      
      {/* Account Details */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h2>
        
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="text-gray-900">{user.email}</p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500">Display Name</p>
            <p className="text-gray-900">{userProfile?.display_name || 'Not set'}</p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500">Member Since</p>
            <p className="text-gray-900">
              {new Date(userProfile?.created_at).toLocaleDateString()}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500">Account ID</p>
            <p className="text-gray-500 text-xs font-mono">{user.id}</p>
          </div>
        </div>
      </div>
      
      {/* Vendor Account Details (if vendor) */}
      {vendorProfile && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vendor Account</h2>
          
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Vendor ID</p>
              <p className="text-gray-500 text-xs font-mono">{vendorProfile.id}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className={`inline-block px-2 py-1 rounded text-sm ${
                vendorProfile.status === 'approved' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {vendorProfile.status}
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Tier</p>
              <p className="text-gray-900 capitalize">{vendorProfile.tier || 'standard'}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Last Updated</p>
              <p className="text-gray-900">
                {new Date(vendorProfile.updated_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Future: Notification Preferences */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-500 mb-2">Coming Soon</h2>
        <ul className="text-sm text-gray-500 list-disc list-inside">
          <li>Notification preferences</li>
          <li>Email settings</li>
          <li>Privacy settings</li>
        </ul>
      </div>
    </div>
  )
}
```

---

## Part 4: Vendor Dashboard Layout Redesign

### Current Layout (Problems)
- Full-width sections stacked vertically
- Wastes screen real estate
- "User Dashboard" button is redundant

### New Layout

**File:** `src/app/[vertical]/vendor/dashboard/page.tsx`

```
MOBILE (< 768px):
┌─────────────────────────┐
│ Vendor Dashboard        │
│ [Status Banner]         │
├─────────────────────────┤
│ Contact Information     │
│ [Edit Profile]          │
├─────────────────────────┤
│ Business Information    │
├─────────────────────────┤
│ Market Info             │
│ (Coming Soon)           │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ Your Listings       │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Payment Settings    │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Orders              │ │
│ └─────────────────────┘ │
└─────────────────────────┘

DESKTOP (768px+):
┌─────────────────────────────────────────────────────────────┐
│ Vendor Dashboard                                             │
│ [Status Banner - full width]                                 │
├───────────────────┬───────────────────┬─────────────────────┤
│ Contact Info      │ Business Info     │ Market Info         │
│ [Edit Profile]    │                   │ (Coming Soon)       │
├───────────────────┴───────────────────┴─────────────────────┤
│ ┌─────────────┐ ┌─────────────────┐ ┌─────────────────────┐ │
│ │ Your        │ │ Payment         │ │ Orders              │ │
│ │ Listings    │ │ Settings        │ │                     │ │
│ └─────────────┘ └─────────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// Remove "User Dashboard" button from top right

// Replace current full-width sections with responsive grid:
<div className="space-y-6">
  {/* Status Banner - full width */}
  <div className="bg-green-100 border border-green-300 rounded-lg p-4">
    <p className="font-medium text-green-800">Status: {vendorProfile.status}</p>
    <p className="text-sm text-green-700">Your vendor profile is approved and active</p>
  </div>
  
  {/* Info Cards - 3 column grid on desktop, 1 column on mobile */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    
    {/* Contact Information */}
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-3">
        <h2 className="font-semibold text-gray-900">Contact Information</h2>
        <Link
          href={`/${vertical}/vendor/edit`}
          className="text-sm text-blue-600 hover:underline"
        >
          Edit Profile
        </Link>
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-gray-500">Legal Name</p>
          <p className="text-gray-900">{vendorProfile.profile_data?.legal_name}</p>
        </div>
        <div>
          <p className="text-gray-500">Phone</p>
          <p className="text-gray-900">{vendorProfile.profile_data?.phone}</p>
        </div>
        <div>
          <p className="text-gray-500">Email</p>
          <p className="text-gray-900">{vendorProfile.profile_data?.email}</p>
        </div>
      </div>
    </div>
    
    {/* Business Information */}
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-900 mb-3">Business Information</h2>
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-gray-500">Business Name</p>
          <p className="text-gray-900">{vendorProfile.profile_data?.business_name}</p>
        </div>
        <div>
          <p className="text-gray-500">Vendor Type</p>
          <p className="text-gray-900">
            {Array.isArray(vendorProfile.profile_data?.vendor_type)
              ? vendorProfile.profile_data.vendor_type.join(', ')
              : vendorProfile.profile_data?.vendor_type}
          </p>
        </div>
      </div>
    </div>
    
    {/* Market Info - Placeholder for future */}
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-400 mb-3">Market Info</h2>
      <p className="text-sm text-gray-400">Coming soon</p>
      <p className="text-xs text-gray-400 mt-2">
        Your market assignments and schedule will appear here.
      </p>
    </div>
    
  </div>
  
  {/* Action Cards - 3 column grid on desktop */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {/* Your Listings */}
    <Link
      href={`/${vertical}/vendor/listings`}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
    >
      <div className="text-2xl mb-2">📦</div>
      <h3 className="font-semibold text-gray-900">Your Listings</h3>
      <p className="text-sm text-gray-500">Create and manage your product listings</p>
    </Link>
    
    {/* Payment Settings */}
    <Link
      href={`/${vertical}/vendor/dashboard/stripe`}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
    >
      <div className="text-2xl mb-2">🏦</div>
      <h3 className="font-semibold text-gray-900">Payment Settings</h3>
      <p className="text-sm text-gray-500">Connect your bank account to receive payments</p>
    </Link>
    
    {/* Orders */}
    <Link
      href={`/${vertical}/vendor/dashboard/orders`}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
    >
      <div className="text-2xl mb-2">🧾</div>
      <h3 className="font-semibold text-gray-900">Orders</h3>
      <p className="text-sm text-gray-500">Manage incoming orders from customers</p>
    </Link>
  </div>
  
  {/* Coming Soon */}
  <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
    <h2 className="font-semibold text-gray-500 mb-2">Coming Soon</h2>
    <ul className="text-sm text-gray-500 list-disc list-inside">
      <li>Analytics and insights</li>
      <li>Customer messages</li>
    </ul>
  </div>
</div>
```

---

## Part 5: Browse Page - Sort Order & Category Headers

### Sort Order (Default - Before Search)

```
1. Group by Category (alphabetical: Baked Goods, Dairy, Produce, etc.)
2. Within category, group by Vendor (alphabetical by business name)
3. Within vendor, sort by newest first (created_at DESC)
```

### Implementation

**File:** `src/app/[vertical]/browse/page.tsx`

```typescript
// Fetch listings with proper sorting
const { data: listings } = await supabase
  .from('listings')
  .select(`
    *,
    vendor_profiles (
      id,
      profile_data
    )
  `)
  .eq('vertical_id', vertical)
  .eq('status', 'published')
  .is('deleted_at', null)
  .order('category', { ascending: true })
  .order('created_at', { ascending: false })

// Group listings by category, then by vendor
function groupListings(listings: any[]) {
  const grouped: Record<string, Record<string, any[]>> = {}
  
  listings.forEach(listing => {
    const category = listing.category || 'Other'
    const vendorName = listing.vendor_profiles?.profile_data?.business_name || 'Unknown Vendor'
    
    if (!grouped[category]) {
      grouped[category] = {}
    }
    if (!grouped[category][vendorName]) {
      grouped[category][vendorName] = []
    }
    grouped[category][vendorName].push(listing)
  })
  
  // Sort vendors within each category alphabetically
  Object.keys(grouped).forEach(category => {
    const sortedVendors: Record<string, any[]> = {}
    Object.keys(grouped[category]).sort().forEach(vendor => {
      sortedVendors[vendor] = grouped[category][vendor]
    })
    grouped[category] = sortedVendors
  })
  
  return grouped
}

const groupedListings = groupListings(listings || [])
const categories = Object.keys(groupedListings).sort()
```

### Display with Category Headers

```typescript
{/* Before search - show grouped by category */}
{!searchQuery && !selectedCategory && (
  <div className="space-y-8">
    {categories.map(category => (
      <div key={category}>
        {/* Category Header */}
        <div className="flex items-center gap-4 mb-4">
          <div className="h-px bg-gray-300 flex-1"></div>
          <h2 className="text-lg font-semibold text-gray-700 px-4 bg-gray-50 rounded-full">
            {category}
          </h2>
          <div className="h-px bg-gray-300 flex-1"></div>
        </div>
        
        {/* Listings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.values(groupedListings[category]).flat().map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    ))}
  </div>
)}

{/* When searching or filtering - show flat grid */}
{(searchQuery || selectedCategory) && (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {filteredListings.map(listing => (
      <ListingCard key={listing.id} listing={listing} />
    ))}
  </div>
)}
```

### Category Badge on Listing Cards

**File:** `src/components/listings/ListingCard.tsx` (or wherever cards are defined)

Ensure category badge is visible on each card:

```typescript
<div className="relative">
  {/* Category Badge */}
  <span className="absolute top-2 left-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
    {listing.category}
  </span>
  
  {/* Listing Image */}
  <div className="aspect-square bg-gray-100 rounded-t-lg">
    {/* ... image ... */}
  </div>
</div>
```

---

## Part 6: Mobile Responsiveness Checklist

### Header
- [ ] Touch-friendly dropdown (onClick, not hover)
- [ ] Adequate tap targets (min 44px height)
- [ ] Hamburger menu option for very small screens (optional)

### Vendor Dashboard
- [ ] 3-column grid → 1-column on mobile
- [ ] Cards stack vertically on mobile
- [ ] Edit Profile button easily tappable

### Browse Page
- [ ] Listing grid: 1-col mobile, 2-col tablet, 3-4 col desktop
- [ ] Category filter dropdown works on mobile
- [ ] Search input full width on mobile
- [ ] Category headers readable on mobile

### Settings Page
- [ ] Single column layout on mobile
- [ ] Adequate spacing between sections

### General
- [ ] No horizontal scroll on any page
- [ ] Text readable without zooming
- [ ] Forms have large input fields on mobile

---

## Testing Checklist

### Part 1: Header
- [ ] Shows "Browse Products" (not "Browse")
- [ ] Non-vendor sees "Become a Vendor" in dropdown
- [ ] Vendor sees "Vendor Dashboard" in dropdown
- [ ] Admin sees "Admin Dashboard" in dropdown
- [ ] Settings link in dropdown works
- [ ] Logout works

### Part 2: Duplicate Nav Removed
- [ ] Home page: no duplicate nav row
- [ ] Dashboard: no standalone Logout button
- [ ] Vendor Dashboard: no "User Dashboard" button
- [ ] All other pages: clean, no duplicates

### Part 3: Settings Page
- [ ] Accessible from dropdown
- [ ] Shows account details
- [ ] Shows vendor details (if vendor)
- [ ] Mobile responsive

### Part 4: Vendor Dashboard
- [ ] 3-column grid on desktop
- [ ] 1-column stack on mobile
- [ ] Edit Profile button present
- [ ] Market Info placeholder shows
- [ ] Action cards at bottom intact

### Part 5: Browse Page
- [ ] Listings grouped by category
- [ ] Category headers visible
- [ ] Within category, grouped by vendor
- [ ] Within vendor, newest first
- [ ] Search/filter overrides grouping

### Part 6: Mobile
- [ ] Test all pages at 375px width (iPhone SE)
- [ ] Test all pages at 414px width (iPhone Plus)
- [ ] No horizontal scrolling
- [ ] All buttons/links tappable

---

## Commit Strategy

```bash
# After Part 1-2 (Header + cleanup)
git add -A
git commit -m "Standardize header nav, remove duplicate navigation from all pages"

# After Part 3 (Settings)
git add -A
git commit -m "Create settings page for account details"

# After Part 4 (Vendor Dashboard)
git add -A
git commit -m "Redesign vendor dashboard with 3-column responsive grid"

# After Part 5 (Browse)
git add -A
git commit -m "Add category grouping and headers to browse page"

# Push
git push origin main
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/layout/Header.tsx` | Modify - rename Browse, update dropdown |
| `src/app/[vertical]/settings/page.tsx` | **Create** |
| `src/app/[vertical]/page.tsx` | Modify - remove duplicate nav |
| `src/app/[vertical]/dashboard/page.tsx` | Modify - remove Logout button |
| `src/app/[vertical]/vendor/dashboard/page.tsx` | Modify - 3-col grid, remove User Dashboard btn |
| `src/app/[vertical]/browse/page.tsx` | Modify - category grouping and sort |
| Various other pages | Modify - remove duplicate navigation |

---

*Session instructions prepared by Chet (Claude Chat)*
