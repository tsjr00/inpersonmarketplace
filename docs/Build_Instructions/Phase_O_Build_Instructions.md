# Phase O: Bug Fixes & UX Improvements - Build Instructions

**Date:** January 15, 2026
**For:** CC (Claude Code)
**Branch:** `feature/phase-o-bug-fixes`
**Estimated Time:** 3-4 hours

---

## Overview

Phase O fixes all outstanding bugs from testing, starting with a critical database schema issue that's blocking platform admin functionality, then addressing UI/UX improvements across the platform.

**Priority Order:**
1. **CRITICAL:** Database schema fix (markets.active column)
2. **HIGH:** Categories consolidation + data migration
3. **MEDIUM:** UI polish and branding
4. **LOW:** UX enhancements

---

## PART 1: CRITICAL - Database Schema Fix

### Issue: Markets Table Missing 'active' Column

**Problem:** Platform admin trying to access markets.active but column doesn't exist

**Impact:** Platform admin markets management broken

**Fix:** Add column with migration

---

### Migration: Add active Column to Markets

**File:** Create `supabase/migrations/20260115_add_markets_active_column.sql`

```sql
-- Migration: Add active boolean column to markets table
-- Date: 2026-01-15
-- Phase: O
-- Applied to: [will be updated when applied]
-- Applied by: [will be updated when applied]

-- Add active column (defaults to true for existing markets)
ALTER TABLE markets 
ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Add comment
COMMENT ON COLUMN markets.active IS 'Whether market is currently active/visible to vendors and buyers';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active);

-- Update any markets with status='inactive' to have active=false
UPDATE markets 
SET active = false 
WHERE status = 'inactive';

-- Migration applied successfully
```

**Execute:**
1. Run in Dev Supabase SQL Editor
2. Verify success: `SELECT id, name, active FROM markets LIMIT 5;`
3. Run in Staging
4. Update migration header with application details

---

## PART 2: Categories Fix & Data Migration

### Issue: Wrong Categories in ListingForm

**Problem:** 
- ListingForm has 11 hardcoded categories
- Should use approved 9 categories
- Existing listings need migration

**Approved Categories:**
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

### Step 2.1: Update Constants

**File:** `src/lib/constants.ts`

**Find and replace CATEGORIES array:**

```typescript
export const CATEGORIES = [
  'Produce',
  'Meat & Poultry',
  'Dairy & Eggs',
  'Baked Goods',
  'Pantry',
  'Prepared Foods',
  'Health & Wellness',
  'Art & Decor',
  'Home & Functional'
] as const

export type Category = typeof CATEGORIES[number]
```

---

### Step 2.2: Update ListingForm

**File:** `src/components/listings/ListingForm.tsx`

**Find the category select/dropdown and replace options:**

```typescript
<select
  value={formData.category || ''}
  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
  required
  style={{
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14
  }}
>
  <option value="">Select a category</option>
  {CATEGORIES.map(cat => (
    <option key={cat} value={cat}>{cat}</option>
  ))}
</select>
```

**Import CATEGORIES at top:**

```typescript
import { CATEGORIES } from '@/lib/constants'
```

---

### Step 2.3: Migrate Existing Listing Categories

**File:** Run in Supabase SQL Editor

```sql
-- Migration: Consolidate listing categories to approved 9
-- Date: 2026-01-15
-- Phase: O

-- Map old categories to new categories
UPDATE listings SET category = 'Dairy & Eggs' 
WHERE category IN ('Dairy', 'Eggs');

UPDATE listings SET category = 'Pantry' 
WHERE category IN ('Preserves', 'Honey');

UPDATE listings SET category = 'Home & Functional' 
WHERE category IN ('Crafts', 'Plants');

UPDATE listings SET category = 'Prepared Foods'
WHERE category = 'Other' AND description ILIKE '%ready%to%eat%';

-- Any remaining 'Other' goes to Home & Functional as catch-all
UPDATE listings SET category = 'Home & Functional'
WHERE category = 'Other';

-- Verify migration
SELECT category, COUNT(*) as count
FROM listings
GROUP BY category
ORDER BY count DESC;
```

**Expected result:** Only 9 categories should remain

---

### Step 2.4: Update Browse Page Category Display

**File:** `src/app/[vertical]/browse/page.tsx`

**Ensure category grouping matches CATEGORIES array:**

```typescript
import { CATEGORIES } from '@/lib/constants'

// Use CATEGORIES for filtering
const filteredListings = listings.filter(listing => {
  if (selectedCategory && listing.category !== selectedCategory) return false
  return true
})

// Display category badges
<select 
  value={selectedCategory || ''}
  onChange={(e) => setSelectedCategory(e.target.value || null)}
>
  <option value="">All Categories</option>
  {CATEGORIES.map(cat => (
    <option key={cat} value={cat}>{cat}</option>
  ))}
</select>
```

---

## PART 3: Header Branding Fix

### Issue: Header Shows "Fresh Market" Text Instead of Logo

**Problem:** Top left corner has text, should be logo

**File:** `src/components/shared/Header.tsx` (or similar)

---

### Step 3.1: Update Header Component

**Find the header branding section and replace:**

```typescript
import Image from 'next/image'
import Link from 'next/link'

// In the header component, replace text with logo
<Link href={`/${vertical}`} style={{ display: 'flex', alignItems: 'center' }}>
  <Image
    src="/logos/farmersmarket-logo.svg"
    alt="Farmers Market"
    width={150}
    height={40}
    style={{ height: 'auto' }}
    priority
  />
</Link>
```

**Notes:**
- Logo exists at monorepo root
- Use appropriate logo for each vertical
- Add vertical-specific logic if needed:

```typescript
const logoSrc = vertical === 'farmers_market' 
  ? '/logos/farmersmarket-logo.svg'
  : '/logos/fireworks-logo.svg'
```

---

## PART 4: Settings - Display Name Edit

### Issue: Can't Edit Display Name in Settings

**Problem:** Settings page doesn't allow editing display name

**File:** `src/app/[vertical]/settings/page.tsx`

---

### Step 4.1: Add Display Name Field

**Find the settings form and add editable display_name field:**

```typescript
'use client'
import { useState } from 'react'

export default function SettingsPage() {
  const [formData, setFormData] = useState({
    display_name: user.display_name || '',
    // ... other fields
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: formData.display_name
        })
      })

      if (res.ok) {
        setMessage('Profile updated successfully')
      } else {
        setMessage('Failed to update profile')
      }
    } catch (error) {
      setMessage('Error updating profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>Account Settings</h2>
      
      {/* Display Name Field */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
          Display Name
        </label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          placeholder="Your display name"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14
          }}
        />
      </div>

      {/* Email (read-only for now) */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
          Email
        </label>
        <input
          type="email"
          value={user.email}
          disabled
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: '#f9fafb',
            color: '#6b7280'
          }}
        />
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          Email changes require verification (coming soon)
        </p>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={loading}
        style={{
          padding: '10px 24px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1
        }}
      >
        {loading ? 'Saving...' : 'Save Changes'}
      </button>

      {/* Message */}
      {message && (
        <p style={{ 
          marginTop: 12, 
          color: message.includes('success') ? '#10b981' : '#ef4444' 
        }}>
          {message}
        </p>
      )}
    </div>
  )
}
```

---

### Step 4.2: Create/Update Profile API

**File:** `src/app/api/user/profile/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request
  const { display_name } = await request.json()

  // Update user_profiles
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ 
      display_name,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

---

## PART 5: Checkout Enhancements

### Three Issues to Fix:
1. No cross-sell section
2. Minimal security messaging
3. No branding colors

**File:** `src/app/[vertical]/checkout/page.tsx`

---

### Step 5.1: Add Cross-Sell Section

**Add after cart items display, before payment:**

```typescript
'use client'
import { useState, useEffect } from 'react'

function CheckoutPage() {
  const [suggestedProducts, setSuggestedProducts] = useState([])

  // Fetch suggested products from vendors in cart
  useEffect(() => {
    const fetchSuggestions = async () => {
      // Get vendor IDs from cart items
      const vendorIds = [...new Set(cartItems.map(item => item.listing.vendor_profile_id))]
      
      // Fetch 3-4 other products from same vendors
      const res = await fetch('/api/listings/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorIds, excludeIds: cartItems.map(i => i.listing_id), limit: 4 })
      })
      
      if (res.ok) {
        const data = await res.json()
        setSuggestedProducts(data.listings)
      }
    }

    if (cartItems.length > 0) {
      fetchSuggestions()
    }
  }, [cartItems])

  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* BRANDING HEADER */}
      <div style={{ 
        backgroundColor: '#3b82f6',
        padding: '20px',
        color: 'white',
        textAlign: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Checkout</h1>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
        {/* CART ITEMS */}
        <div style={{ 
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 24,
          marginBottom: 20
        }}>
          <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600 }}>Your Order</h2>
          {/* ... existing cart items ... */}
        </div>

        {/* CROSS-SELL SECTION */}
        {suggestedProducts.length > 0 && (
          <div style={{
            backgroundColor: '#fef3c7',
            borderRadius: 8,
            padding: 20,
            marginBottom: 20,
            border: '2px dashed #f59e0b'
          }}>
            <h3 style={{ 
              margin: '0 0 16px 0', 
              fontSize: 18, 
              fontWeight: 600,
              color: '#92400e'
            }}>
              ✨ You might also like from your vendors
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12
            }}>
              {suggestedProducts.map(product => (
                <div 
                  key={product.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: 6,
                    padding: 12,
                    border: '1px solid #fbbf24'
                  }}
                >
                  <h4 style={{ 
                    margin: '0 0 4px 0', 
                    fontSize: 14, 
                    fontWeight: 600 
                  }}>
                    {product.title}
                  </h4>
                  <p style={{ 
                    margin: '0 0 8px 0', 
                    fontSize: 12, 
                    color: '#6b7280' 
                  }}>
                    ${(product.price_cents / 100).toFixed(2)}
                  </p>
                  <p style={{ 
                    margin: '0 0 8px 0', 
                    fontSize: 11, 
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    from {product.vendor_profile.business_name}
                  </p>
                  <button
                    onClick={() => addToCart(product.id, 1)}
                    style={{
                      width: '100%',
                      padding: '6px 12px',
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Quick Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECURITY MESSAGING */}
        <div style={{
          backgroundColor: '#dbeafe',
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
          border: '1px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 24 }}>🔒</span>
            <div>
              <h3 style={{ 
                margin: '0 0 8px 0', 
                fontSize: 16, 
                fontWeight: 600,
                color: '#1e40af'
              }}>
                Your payment is secure
              </h3>
              <p style={{ 
                margin: 0, 
                fontSize: 14, 
                color: '#1e40af',
                lineHeight: 1.5
              }}>
                We use Stripe, the same secure payment technology trusted by millions of businesses worldwide. 
                Your payment information is encrypted and never stored on our servers. All transactions are 
                protected by industry-leading security standards.
              </p>
            </div>
          </div>
        </div>

        {/* PAYMENT SECTION */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 24,
          border: '2px solid #3b82f6'
        }}>
          <h2 style={{ 
            marginBottom: 16, 
            fontSize: 20, 
            fontWeight: 600,
            color: '#1e3a8a'
          }}>
            Payment
          </h2>
          {/* ... existing stripe checkout ... */}
          <p style={{ 
            fontSize: 12, 
            color: '#6b7280', 
            marginTop: 12,
            textAlign: 'center'
          }}>
            Secure checkout powered by Stripe
          </p>
        </div>
      </div>
    </div>
  )
}
```

---

### Step 5.2: Create Suggestions API

**File:** `src/app/api/listings/suggestions/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { vendorIds, excludeIds, limit = 4 } = await request.json()

  // Fetch published listings from vendors, excluding items already in cart
  const { data: listings, error } = await supabase
    .from('listings')
    .select(`
      id,
      title,
      price_cents,
      vendor_profile_id,
      vendor_profiles (
        id,
        business_name
      )
    `)
    .in('vendor_profile_id', vendorIds)
    .not('id', 'in', `(${excludeIds.join(',')})`)
    .eq('status', 'published')
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ listings })
}
```

---

## PART 6: Form Data Persistence

### Issue: Form Data Lost on Browser Back

**Problem:** Vendor fills listing form, navigates away, comes back, data gone

**File:** `src/components/listings/ListingForm.tsx`

---

### Step 6.1: Add Session Storage Persistence

**Add useEffect to save/restore form data:**

```typescript
'use client'
import { useState, useEffect } from 'react'

export default function ListingForm({ vertical, vendorProfileId }: Props) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price_cents: 0,
    quantity: 0,
    category: '',
    // ... other fields
  })

  const storageKey = `listing-form-draft-${vendorProfileId}`

  // Load draft from session storage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      try {
        const draft = JSON.parse(saved)
        setFormData(draft)
      } catch (error) {
        console.error('Failed to load draft:', error)
      }
    }
  }, [storageKey])

  // Save draft to session storage on change
  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.setItem(storageKey, JSON.stringify(formData))
    }, 500) // Debounce saves

    return () => clearTimeout(timer)
  }, [formData, storageKey])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // ... submit logic ...

    // Clear draft after successful submit
    if (success) {
      sessionStorage.removeItem(storageKey)
    }
  }

  const clearDraft = () => {
    sessionStorage.removeItem(storageKey)
    setFormData({
      title: '',
      description: '',
      price_cents: 0,
      quantity: 0,
      category: ''
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Show draft indicator if data exists */}
      {sessionStorage.getItem(storageKey) && (
        <div style={{
          padding: 12,
          backgroundColor: '#fef3c7',
          borderRadius: 6,
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 14, color: '#92400e' }}>
            📝 Draft saved - your progress is preserved
          </span>
          <button
            type="button"
            onClick={clearDraft}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              color: '#92400e',
              backgroundColor: 'white',
              border: '1px solid #f59e0b',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Clear Draft
          </button>
        </div>
      )}

      {/* ... rest of form ... */}
    </form>
  )
}
```

---

## PART 7: Browse Button Placement Fix

### Issue: Browse Button Inside Empty State Box

**Problem:** Visual hierarchy issue on orders page

**File:** `src/app/[vertical]/buyer/orders/page.tsx`

---

### Step 7.1: Move Browse Button

**Find the empty state section and restructure:**

```typescript
{orders.length === 0 ? (
  <>
    {/* Empty state message */}
    <div style={{
      textAlign: 'center',
      padding: '60px 20px',
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      border: '1px dashed #d1d5db'
    }}>
      <p style={{ 
        fontSize: 18, 
        color: '#6b7280', 
        margin: 0 
      }}>
        No orders yet
      </p>
    </div>

    {/* Browse button OUTSIDE the box */}
    <div style={{ 
      marginTop: 20, 
      textAlign: 'center' 
    }}>
      <Link
        href={`/${vertical}/browse`}
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#3b82f6',
          color: 'white',
          textDecoration: 'none',
          borderRadius: 6,
          fontSize: 16,
          fontWeight: 600
        }}
      >
        Browse Products
      </Link>
    </div>
  </>
) : (
  // ... orders list ...
)}
```

---

## Testing Checklist

### Database Migration
- [ ] Active column added to markets table
- [ ] Existing markets have active=true by default
- [ ] Platform admin markets page loads without error
- [ ] Can toggle market active/inactive status

### Categories
- [ ] Constants.ts has 9 approved categories
- [ ] ListingForm dropdown shows 9 categories
- [ ] Browse page filter shows 9 categories
- [ ] Existing listings migrated successfully
- [ ] All category filters work on browse page

### Header Branding
- [ ] Logo displays instead of text
- [ ] Logo links to vertical home
- [ ] Logo scales properly on mobile

### Settings
- [ ] Can edit display name
- [ ] Changes save successfully
- [ ] Email field is read-only with explanation
- [ ] Success/error messages display

### Checkout
- [ ] Cross-sell section appears when cart has items
- [ ] Shows 3-4 products from vendors in cart
- [ ] Quick Add button works
- [ ] Security messaging displays
- [ ] Blue branding colors throughout
- [ ] Stripe section styled consistently

### Form Persistence
- [ ] Form data saves to session storage
- [ ] Data restores on browser back
- [ ] Draft indicator appears
- [ ] Can clear draft
- [ ] Draft clears after successful submit

### Browse Button
- [ ] Button appears below empty state box
- [ ] Button styled correctly
- [ ] Links to browse page

---

## Commit Strategy

```bash
# After migration
git add supabase/migrations/20260115_add_markets_active_column.sql
git commit -m "fix(db): Add active column to markets table - fixes admin error"
git push origin feature/phase-o-bug-fixes

# After categories
git add src/lib/constants.ts src/components/listings/ListingForm.tsx src/app/[vertical]/browse/page.tsx
git commit -m "fix(categories): Consolidate to 9 approved categories with data migration"
git push origin feature/phase-o-bug-fixes

# After header
git add src/components/shared/Header.tsx
git commit -m "fix(branding): Replace text with logo in header"
git push origin feature/phase-o-bug-fixes

# After settings
git add src/app/[vertical]/settings/page.tsx src/app/api/user/profile/route.ts
git commit -m "feat(settings): Add display name editing capability"
git push origin feature/phase-o-bug-fixes

# After checkout
git add src/app/[vertical]/checkout/page.tsx src/app/api/listings/suggestions/route.ts
git commit -m "feat(checkout): Add cross-sell, security messaging, and branding"
git push origin feature/phase-o-bug-fixes

# After form persistence
git add src/components/listings/ListingForm.tsx
git commit -m "feat(forms): Add session storage persistence for listing form"
git push origin feature/phase-o-bug-fixes

# After browse button
git add src/app/[vertical]/buyer/orders/page.tsx
git commit -m "fix(ui): Move browse button outside empty state box"
git push origin feature/phase-o-bug-fixes
```

---

## Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/phase-o-bug-fixes
git push origin main
git branch -d feature/phase-o-bug-fixes
```

---

## Session Summary Template

```markdown
# Phase O: Bug Fixes & UX Improvements - Session Summary

**Date:** January 15, 2026
**Duration:** [TIME]
**Branch:** feature/phase-o-bug-fixes (merged to main)

## Critical Fixes
- [x] Added active column to markets table (schema fix)
- [x] Fixed platform admin markets error

## Code Fixes
- [x] Consolidated categories to 9 approved types
- [x] Migrated existing listing categories
- [x] Replaced header text with logo
- [x] Added display name editing in settings
- [x] Added cross-sell section to checkout (3-4 products)
- [x] Added security messaging to checkout
- [x] Added branding colors to checkout
- [x] Implemented form data persistence (session storage)
- [x] Fixed browse button placement on orders page

## Files Created
[List]

## Files Modified
[List]

## Migrations Applied
- 20260115_add_markets_active_column.sql (Dev + Staging)
- Category data migration (inline SQL)

## Testing Results
[From checklist]

## Notes
[Any observations or issues]
```

---

## Important Notes

### Logo Implementation
- Logos confirmed to exist at monorepo root
- Use `/logos/farmersmarket-logo.svg` for farmers_market
- Use `/logos/fireworks-logo.svg` for fireworks
- Add vertical-specific logic in header

### Email Editing
- NOT implemented (future enhancement)
- Requires email verification flow
- Tracy & Chet will investigate separately

### Cross-Sell Logic
- Shows products from vendors already in cart
- Limits to 3-4 products
- Excludes items already in cart
- Only shows published listings

### Form Persistence
- Uses sessionStorage (clears on browser close)
- Auto-saves every 500ms (debounced)
- Shows draft indicator
- Clears on successful submit

---

*End of Phase O Build Instructions*
