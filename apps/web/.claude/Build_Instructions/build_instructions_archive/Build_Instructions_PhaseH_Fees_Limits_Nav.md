# Build Instructions - Phase H: Platform Fee Display, Listing Limits & Navigation

**Date:** January 11, 2026  
**Priority:** High  
**Estimated Time:** 3-4 hours

---

## Overview

Phase H addresses three core issues:

1. **Platform fee not in listing price** - Buyers should see price + 6.5% everywhere except vendor's own edit view
2. **Listing limits not enforced** - 5 per market (standard) / 10 per market (premium)
3. **Market limits** - 1 traditional market (standard) / 3 traditional markets (premium)
4. **Navigation inconsistency** - Add consistent top nav with dropdown menu and logout

---

## Part 1: Platform Fee in Display Price

### Business Rules

| Context | What Price to Show |
|---------|-------------------|
| Vendor creating/editing listing | Base price (what vendor entered) |
| Browse page | Base price + 6.5% |
| Product detail page | Base price + 6.5% |
| Cart | Base price + 6.5% (already done in Phase B - but verify) |
| Checkout | Base price + 6.5% |
| Order confirmation | Base price + 6.5% |
| Vendor order management | Base price (what vendor receives) |

### Constants

**File:** `src/lib/constants.ts` (create if doesn't exist)

```typescript
// Platform fee as decimal (6.5% = 0.065)
export const PLATFORM_FEE_RATE = 0.065

// Calculate display price (what buyer sees)
export function calculateDisplayPrice(basePriceCents: number): number {
  return Math.round(basePriceCents * (1 + PLATFORM_FEE_RATE))
}

// Calculate base price from display price (reverse calculation)
export function calculateBasePrice(displayPriceCents: number): number {
  return Math.round(displayPriceCents / (1 + PLATFORM_FEE_RATE))
}

// Format cents to dollars string
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// Format with fee applied
export function formatDisplayPrice(basePriceCents: number): string {
  return formatPrice(calculateDisplayPrice(basePriceCents))
}
```

### Update Browse Page

**File:** `src/app/[vertical]/browse/page.tsx`

```typescript
import { formatDisplayPrice } from '@/lib/constants'

// In listing card rendering:
// OLD:
<p className="text-lg font-bold">${(listing.price_cents / 100).toFixed(2)}</p>

// NEW:
<p className="text-lg font-bold">{formatDisplayPrice(listing.price_cents)}</p>
```

### Update Product Detail Page

**File:** `src/app/[vertical]/listing/[id]/page.tsx` (or similar)

```typescript
import { formatDisplayPrice } from '@/lib/constants'

// Show display price to buyers:
<p className="text-2xl font-bold">{formatDisplayPrice(listing.price_cents)}</p>
```

### Update Cart Display

**File:** `src/components/cart/CartDrawer.tsx`

Verify cart shows display price (should already be done from Phase B, but confirm):

```typescript
import { formatDisplayPrice, calculateDisplayPrice } from '@/lib/constants'

// Item price
<p>{formatDisplayPrice(item.price_cents)}</p>

// Line total
<p>{formatDisplayPrice(item.price_cents * item.quantity)}</p>

// Cart total
const cartTotal = items.reduce((sum, item) => 
  sum + calculateDisplayPrice(item.price_cents) * item.quantity, 0
)
```

### Update Checkout Page

**File:** `src/app/[vertical]/checkout/page.tsx`

```typescript
import { formatDisplayPrice, calculateDisplayPrice } from '@/lib/constants'

// Show display prices throughout checkout
```

### Vendor Views - Keep Base Price

**File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`

Vendor should see/edit BASE price (no change needed - just verify):

```typescript
// Price input shows what vendor entered
<input
  type="number"
  value={price}  // This is base price in dollars
  onChange={(e) => setPrice(e.target.value)}
/>
// When saving: price_cents = Math.round(parseFloat(price) * 100)
```

**File:** `src/app/[vertical]/vendor/listings/page.tsx`

Vendor's listing management should show BASE price:

```typescript
import { formatPrice } from '@/lib/constants'

// Show base price (what vendor set)
<p>{formatPrice(listing.price_cents)}</p>
```

**File:** `src/app/[vertical]/vendor/dashboard/orders/page.tsx`

Vendor order view should show BASE price (what they'll receive):

```typescript
import { formatPrice } from '@/lib/constants'

// Show base price for vendor
<p>{formatPrice(item.price_cents)}</p>
```

### Buyer Order History - Show Display Price

**File:** `src/app/[vertical]/buyer/orders/page.tsx`

Buyer should see what they paid (display price):

```typescript
import { formatDisplayPrice } from '@/lib/constants'

// Show display price (what buyer paid)
<p>{formatDisplayPrice(item.price_cents)}</p>
```

---

## Part 2: Listing Limits Enforcement

### Business Rules

| Vendor Tier | Listings per Market |
|-------------|---------------------|
| Standard | 5 |
| Premium | 10 |

### Add Vendor Tier to Schema (if not exists)

**Check current schema:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_profiles';
```

If `tier` column doesn't exist, create migration:

**File:** `supabase/migrations/20260111_001_vendor_tier.sql`

```sql
-- Add vendor tier if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vendor_profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.vendor_profiles 
    ADD COLUMN tier TEXT DEFAULT 'standard' CHECK (tier IN ('standard', 'premium'));
  END IF;
END $$;

-- Create index for tier lookups
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_tier ON public.vendor_profiles(tier);
```

### Constants for Limits

**File:** `src/lib/constants.ts` (add to existing)

```typescript
// Vendor tier limits
export const VENDOR_LIMITS = {
  standard: {
    listingsPerMarket: 5,
    traditionalMarkets: 1,
  },
  premium: {
    listingsPerMarket: 10,
    traditionalMarkets: 3,
  },
}

export function getListingLimit(tier: string): number {
  return VENDOR_LIMITS[tier as keyof typeof VENDOR_LIMITS]?.listingsPerMarket || 5
}

export function getMarketLimit(tier: string): number {
  return VENDOR_LIMITS[tier as keyof typeof VENDOR_LIMITS]?.traditionalMarkets || 1
}
```

### Enforce on Listing Creation

**File:** `src/app/[vertical]/vendor/listings/new/page.tsx`

```typescript
import { getListingLimit } from '@/lib/constants'

// Fetch vendor profile and current listing count
const { data: vendorProfile } = await supabase
  .from('vendor_profiles')
  .select('id, tier, vertical_id')
  .eq('user_id', user.id)
  .eq('vertical_id', vertical)
  .single()

const { count: listingCount } = await supabase
  .from('listings')
  .select('id', { count: 'exact' })
  .eq('vendor_profile_id', vendorProfile.id)
  .is('deleted_at', null)

const tier = vendorProfile?.tier || 'standard'
const limit = getListingLimit(tier)
const canCreateListing = (listingCount || 0) < limit

// If at limit, show message instead of form
if (!canCreateListing) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Listing Limit Reached</h1>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          You've reached your limit of {limit} listings for this market.
        </p>
        <p className="text-yellow-700 mt-2">
          {tier === 'standard' ? (
            <>
              <strong>Upgrade to Premium</strong> to create up to 10 listings per market.
            </>
          ) : (
            <>
              Delete an existing listing to create a new one.
            </>
          )}
        </p>
      </div>
      <Link 
        href={`/${vertical}/vendor/listings`}
        className="inline-block mt-4 text-blue-600 hover:underline"
      >
        ← Back to My Listings
      </Link>
    </div>
  )
}
```

### Show Listing Count on Listings Page

**File:** `src/app/[vertical]/vendor/listings/page.tsx`

```typescript
import { getListingLimit } from '@/lib/constants'

// Show count / limit
const tier = vendorProfile?.tier || 'standard'
const limit = getListingLimit(tier)

// In JSX:
<div className="flex justify-between items-center mb-6">
  <h1 className="text-2xl font-bold">My Listings</h1>
  <div className="text-sm text-gray-600">
    {listings.length} / {limit} listings
    {listings.length >= limit - 1 && listings.length < limit && (
      <span className="text-yellow-600 ml-2">(1 remaining)</span>
    )}
    {listings.length >= limit && (
      <span className="text-red-600 ml-2">(limit reached)</span>
    )}
  </div>
</div>
```

### API Enforcement (Belt and Suspenders)

**File:** `src/app/api/listings/route.ts` (or wherever listings are created)

```typescript
import { getListingLimit } from '@/lib/constants'

export async function POST(request: Request) {
  // ... auth checks ...
  
  // Get vendor profile and tier
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, tier, vertical_id')
    .eq('user_id', user.id)
    .single()
  
  // Count existing listings
  const { count } = await supabase
    .from('listings')
    .select('id', { count: 'exact' })
    .eq('vendor_profile_id', vendorProfile.id)
    .is('deleted_at', null)
  
  const limit = getListingLimit(vendorProfile?.tier || 'standard')
  
  if ((count || 0) >= limit) {
    return NextResponse.json(
      { error: `Listing limit reached (${limit} max for ${vendorProfile?.tier || 'standard'} tier)` },
      { status: 403 }
    )
  }
  
  // ... proceed with creation ...
}
```

---

## Part 3: Market Limits Enforcement

### Business Rules

| Vendor Tier | Traditional Markets |
|-------------|---------------------|
| Standard | 1 |
| Premium | 3 |

**Note:** Private Pickup is an OPTION on listings, not a market slot. All vendors can mark listings for private pickup regardless of tier.

### Enforce on Market/Vendor Signup

When a vendor tries to join another traditional market:

**File:** `src/app/[vertical]/vendor-signup/page.tsx` (or market join flow)

```typescript
import { getMarketLimit } from '@/lib/constants'

// Check how many markets vendor is already in
const { data: existingProfiles, count: marketCount } = await supabase
  .from('vendor_profiles')
  .select('id, vertical_id, tier', { count: 'exact' })
  .eq('user_id', user.id)
  .neq('status', 'rejected')

// Get tier from any existing profile (or default)
const tier = existingProfiles?.[0]?.tier || 'standard'
const limit = getMarketLimit(tier)

// Check if they're already in THIS market
const alreadyInMarket = existingProfiles?.some(p => p.vertical_id === vertical)

if (alreadyInMarket) {
  // Redirect to their vendor dashboard for this market
  redirect(`/${vertical}/vendor/dashboard`)
}

if ((marketCount || 0) >= limit) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Market Limit Reached</h1>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          You're already registered at {marketCount} market{marketCount > 1 ? 's' : ''}.
        </p>
        <p className="text-yellow-700 mt-2">
          {tier === 'standard' ? (
            <>
              Standard vendors can participate in 1 traditional market.
              <br />
              <strong>Upgrade to Premium</strong> to join up to 3 markets.
            </>
          ) : (
            <>
              Premium vendors can participate in up to 3 markets.
              <br />
              Leave an existing market to join this one.
            </>
          )}
        </p>
      </div>
      <Link 
        href="/dashboard"
        className="inline-block mt-4 text-blue-600 hover:underline"
      >
        ← Back to Dashboard
      </Link>
    </div>
  )
}
```

---

## Part 4: Consistent Top Navigation

### Navigation Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ [Logo]     [Browse]  [Dashboard]           [Cart 🛒]  [User ▼] │
│                                                        ├─ My Orders
│                                                        ├─ Vendor Dashboard (if vendor)
│                                                        ├─ Admin (if admin)
│                                                        ├─ Settings
│                                                        └─ Logout
└─────────────────────────────────────────────────────────────────┘
```

### Create Header Component

**File:** `src/components/layout/Header.tsx`

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

interface HeaderProps {
  vertical: string
  user?: any
  userProfile?: any
  vendorProfile?: any
  cartCount?: number
}

export function Header({ vertical, user, userProfile, vendorProfile, cartCount = 0 }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createBrowserClient()
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push(`/${vertical}`)
    router.refresh()
  }
  
  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  const isVendor = vendorProfile && vendorProfile.status === 'approved'
  const isPendingVendor = vendorProfile && ['submitted', 'pending'].includes(vendorProfile.status)
  
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo */}
          <Link href={`/${vertical}`} className="flex items-center">
            <span className="text-xl font-bold text-green-700">Fresh Market</span>
          </Link>
          
          {/* Main Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link 
              href={`/${vertical}/browse`}
              className={`text-gray-600 hover:text-gray-900 ${
                pathname?.includes('/browse') ? 'text-green-700 font-medium' : ''
              }`}
            >
              Browse
            </Link>
            
            {user && (
              <Link 
                href={`/${vertical}/dashboard`}
                className={`text-gray-600 hover:text-gray-900 ${
                  pathname === `/${vertical}/dashboard` ? 'text-green-700 font-medium' : ''
                }`}
              >
                Dashboard
              </Link>
            )}
          </nav>
          
          {/* Right Side - Cart & User */}
          <div className="flex items-center space-x-4">
            
            {/* Cart */}
            {user && (
              <Link 
                href={`/${vertical}/cart`}
                className="relative p-2 text-gray-600 hover:text-gray-900"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>
            )}
            
            {/* User Menu */}
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 focus:outline-none"
                >
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-green-700 font-medium text-sm">
                      {userProfile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <svg className={`h-4 w-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
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
                    
                    <Link
                      href={`/${vertical}/settings`}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Settings
                    </Link>
                    
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href={`/${vertical}/login`}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Login
                </Link>
                <Link
                  href={`/${vertical}/signup`}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-100 px-4 py-2">
        <nav className="flex space-x-4">
          <Link 
            href={`/${vertical}/browse`}
            className="text-gray-600 hover:text-gray-900 text-sm"
          >
            Browse
          </Link>
          {user && (
            <Link 
              href={`/${vertical}/dashboard`}
              className="text-gray-600 hover:text-gray-900 text-sm"
            >
              Dashboard
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
```

### Create Header Data Fetcher

**File:** `src/components/layout/HeaderWrapper.tsx`

Server component that fetches data and passes to client Header:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { Header } from './Header'

export async function HeaderWrapper({ vertical }: { vertical: string }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let userProfile = null
  let vendorProfile = null
  let cartCount = 0
  
  if (user) {
    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, role, roles')
      .eq('user_id', user.id)
      .single()
    userProfile = profile
    
    // Get vendor profile for this vertical
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single()
    vendorProfile = vendor
    
    // Get cart count (from session/cookies or cart table)
    // This depends on how cart is implemented
    // Example if using cart table:
    const { count } = await supabase
      .from('cart_items')
      .select('id', { count: 'exact' })
      .eq('user_id', user.id)
    cartCount = count || 0
  }
  
  return (
    <Header
      vertical={vertical}
      user={user}
      userProfile={userProfile}
      vendorProfile={vendorProfile}
      cartCount={cartCount}
    />
  )
}
```

### Update Layout to Use Header

**File:** `src/app/[vertical]/layout.tsx`

```typescript
import { HeaderWrapper } from '@/components/layout/HeaderWrapper'

export default function VerticalLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: { vertical: string }
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderWrapper vertical={params.vertical} />
      <main>{children}</main>
    </div>
  )
}
```

### Remove Old Navigation from Pages

Search for and remove any page-level navigation that's now handled by the header. Pages should no longer have their own "Home", "Logout", etc. buttons in the top area.

---

## Testing Checklist

### Part 1: Platform Fee Display
- [ ] Browse page shows price + 6.5%
- [ ] Product detail shows price + 6.5%
- [ ] Cart shows price + 6.5%
- [ ] Checkout shows price + 6.5%
- [ ] Vendor listing form shows base price (no fee)
- [ ] Vendor listing management shows base price
- [ ] Vendor orders show base price (what they receive)
- [ ] Buyer orders show display price (what they paid)

### Part 2: Listing Limits
- [ ] Standard vendor blocked at 5 listings
- [ ] Shows "X / 5 listings" count
- [ ] Shows upgrade message when limit reached
- [ ] API returns 403 if trying to create beyond limit

### Part 3: Market Limits
- [ ] Standard vendor blocked from joining 2nd market
- [ ] Shows upgrade message when limit reached
- [ ] Premium vendor can join up to 3 markets (if testable)

### Part 4: Navigation
- [ ] Header appears on all pages
- [ ] Browse link works
- [ ] Dashboard link works (logged in only)
- [ ] Cart shows count badge
- [ ] User dropdown opens/closes
- [ ] My Orders link works
- [ ] Vendor Dashboard link shows for vendors
- [ ] Admin link shows for admins
- [ ] Logout works
- [ ] Mobile nav works

---

## Database Migration

**Run in Dev, then Staging:**

```sql
-- Add vendor tier if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vendor_profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.vendor_profiles 
    ADD COLUMN tier TEXT DEFAULT 'standard' CHECK (tier IN ('standard', 'premium'));
  END IF;
END $$;

-- Create index for tier lookups
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_tier ON public.vendor_profiles(tier);

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_profiles' AND column_name = 'tier';
```

---

## Commit Strategy

```bash
# After Part 1
git add -A
git commit -m "Add platform fee to display prices (buyers see price + 6.5%)"

# After Parts 2-3
git add -A
git commit -m "Enforce listing limits (5 standard / 10 premium) and market limits"

# After Part 4
git add -A
git commit -m "Add consistent top navigation with user dropdown and logout"

# Push
git push origin main
```

---

## Session Summary Template

```markdown
# Session Summary - Phase H: Platform Fee, Limits & Navigation

**Date:** [DATE]
**Duration:** [TIME]

## Completed
- [ ] Platform fee in display prices
- [ ] Listing limits enforcement (5/10 per market)
- [ ] Market limits enforcement (1/3 markets)
- [ ] Consistent top navigation with dropdown

## Files Created/Modified
[List files]

## Database Changes
- [ ] Added tier column to vendor_profiles

## Testing Results
[Fill from checklist]

## Notes
[Any issues]
```
