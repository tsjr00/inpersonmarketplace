# Build Instructions - Phase L-Quick: Fix Checkout & Add Market Validation

**Date:** January 14, 2026
**Branch:** feature/checkout-fixes
**Priority:** High
**Estimated Time:** 30-45 minutes

---

## Context

Investigation revealed checkout is mostly complete but has:
1. **Critical bug:** Checkout page calls `/api/checkout` instead of `/api/checkout/session`
2. **Missing validation:** No check that cart items are from compatible markets

---

## Part 1: Fix API Path Bug

### File: `src/app/[vertical]/checkout/page.tsx`

**Find the line that calls `/api/checkout` (likely around line 50-70):**

```typescript
// WRONG - Current code
const res = await fetch('/api/checkout', {
  method: 'POST',
  // ...
})
```

**Change to:**

```typescript
// CORRECT
const res = await fetch('/api/checkout/session', {
  method: 'POST',
  // ...
})
```

**Search for all instances of `/api/checkout` and change to `/api/checkout/session`**

---

## Part 2: Add Cart Validation API

### File: `src/app/api/cart/validate/route.ts`

**If file exists, UPDATE it. If not, CREATE it:**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's cart with market info
  const { data: cart } = await supabase
    .from('carts')
    .select(`
      id,
      cart_items (
        id,
        quantity,
        listing_id,
        listings (
          id,
          title,
          price_cents,
          listing_markets (
            market_id,
            markets (
              id,
              name,
              market_type
            )
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!cart || !cart.cart_items || cart.cart_items.length === 0) {
    return NextResponse.json({
      valid: true,
      warnings: [],
      marketType: null,
      marketIds: []
    })
  }

  const items = cart.cart_items as any[]
  const warnings: string[] = []
  const marketTypes = new Set<string>()
  const marketIds = new Set<string>()

  // Check each item
  for (const item of items) {
    const listing = item.listings
    
    if (!listing || !listing.listing_markets || listing.listing_markets.length === 0) {
      warnings.push(`"${listing?.title || 'Unknown item'}" is not available at any markets`)
      continue
    }

    // Get first market for this listing
    const market = listing.listing_markets[0].markets
    marketTypes.add(market.market_type)
    marketIds.add(market.id)
  }

  // Validation checks
  const valid = warnings.length === 0

  // Check for mixed market types
  if (marketTypes.size > 1) {
    warnings.push('Cart contains items from both traditional markets and private pickup locations. Please checkout separately.')
  }

  const marketType = marketTypes.size === 1 ? Array.from(marketTypes)[0] : null

  // For traditional markets, all items should be from same market
  if (marketType === 'traditional' && marketIds.size > 1) {
    warnings.push('Traditional market items must all be from the same market. Please remove items from other markets.')
  }

  return NextResponse.json({
    valid,
    warnings,
    marketType,
    marketIds: Array.from(marketIds),
    itemCount: items.length
  })
}
```

---

## Part 3: Add Validation Check to Cart Page

### File: `src/app/[vertical]/cart/page.tsx`

**Add validation check before checkout:**

Find the checkout button section (likely near the bottom) and add validation:

```typescript
'use client'
import { useState, useEffect } from 'react'

// ... existing code ...

export default function CartPage() {
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  
  // ... existing state ...

  // Add validation check
  useEffect(() => {
    const validateCart = async () => {
      try {
        const res = await fetch('/api/cart/validate')
        if (res.ok) {
          const data = await res.json()
          setValidationWarnings(data.warnings || [])
        }
      } catch (error) {
        console.error('Validation error:', error)
      }
    }

    if (cartItems.length > 0) {
      validateCart()
    }
  }, [cartItems])

  // ... existing code ...

  return (
    <div>
      {/* ... existing cart display ... */}

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div style={{
          padding: 16,
          backgroundColor: '#fef3c7',
          border: '2px solid #f59e0b',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#92400e' }}>
            ⚠️ Cart Issues:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#92400e' }}>
            {validationWarnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Checkout Button */}
      <button
        onClick={handleCheckout}
        disabled={cartItems.length === 0 || validationWarnings.length > 0}
        style={{
          width: '100%',
          padding: 16,
          backgroundColor: validationWarnings.length > 0 ? '#9ca3af' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: validationWarnings.length > 0 ? 'not-allowed' : 'pointer'
        }}
      >
        {validationWarnings.length > 0 ? 'Fix Issues to Checkout' : 'Proceed to Checkout'}
      </button>
    </div>
  )
}
```

---

## Part 4: Add Validation to Checkout Page

### File: `src/app/[vertical]/checkout/page.tsx`

**Add validation check on page load:**

```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CheckoutPage() {
  const router = useRouter()
  const [validating, setValidating] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  // ... existing state ...

  // Validate cart on mount
  useEffect(() => {
    const validateBeforeCheckout = async () => {
      try {
        const res = await fetch('/api/cart/validate')
        if (res.ok) {
          const data = await res.json()
          if (!data.valid || data.warnings.length > 0) {
            setValidationError(data.warnings.join(' '))
            // Redirect back to cart after 3 seconds
            setTimeout(() => {
              router.push(`/${vertical}/cart`)
            }, 3000)
          }
        }
      } catch (error) {
        console.error('Validation error:', error)
      } finally {
        setValidating(false)
      }
    }

    validateBeforeCheckout()
  }, [])

  if (validating) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Validating cart...</p>
      </div>
    )
  }

  if (validationError) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{
          padding: 20,
          backgroundColor: '#fee2e2',
          border: '2px solid #ef4444',
          borderRadius: 8,
          maxWidth: 500,
          margin: '0 auto'
        }}>
          <h2 style={{ color: '#991b1b', marginBottom: 12 }}>Cannot Proceed to Checkout</h2>
          <p style={{ color: '#991b1b', margin: 0 }}>{validationError}</p>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 12 }}>
            Redirecting back to cart...
          </p>
        </div>
      </div>
    )
  }

  // ... rest of existing checkout page ...
}
```

---

## Part 5: Update Market Validation in Checkout Session API

### File: `src/app/api/checkout/session/route.ts`

**Add validation at the start of the POST handler:**

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  // ... existing auth check ...

  // ADD THIS: Validate cart before creating order
  const { data: cart } = await supabase
    .from('carts')
    .select(`
      id,
      cart_items (
        id,
        quantity,
        listing_id,
        listings (
          id,
          title,
          price_cents,
          listing_markets (
            market_id,
            markets (
              id,
              name,
              market_type
            )
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!cart || !cart.cart_items || cart.cart_items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  // Validate market compatibility
  const items = cart.cart_items as any[]
  const marketTypes = new Set<string>()
  const marketIds = new Set<string>()

  for (const item of items) {
    const listing = item.listings
    if (!listing.listing_markets || listing.listing_markets.length === 0) {
      return NextResponse.json({
        error: `Listing "${listing.title}" is not available at any markets`
      }, { status: 400 })
    }
    const market = listing.listing_markets[0].markets
    marketTypes.add(market.market_type)
    marketIds.add(market.id)
  }

  // Check for mixed types
  if (marketTypes.size > 1) {
    return NextResponse.json({
      error: 'Cannot checkout with items from both traditional markets and private pickup'
    }, { status: 400 })
  }

  // Check traditional markets use same market
  const marketType = Array.from(marketTypes)[0]
  if (marketType === 'traditional' && marketIds.size > 1) {
    return NextResponse.json({
      error: 'All traditional market items must be from the same market'
    }, { status: 400 })
  }

  // ... rest of existing order creation code ...
}
```

---

## Testing Checklist

### Basic Checkout Flow
- [ ] Navigate to cart with items
- [ ] Click "Proceed to Checkout"
- [ ] Checkout page loads without error
- [ ] Can complete checkout (creates order)
- [ ] Redirects to success page
- [ ] Cart is cleared after checkout

### Market Validation
- [ ] Cart with items from single traditional market: ✓ Allows checkout
- [ ] Cart with items from multiple traditional markets: ✗ Shows warning, blocks checkout
- [ ] Cart with items from private pickup: ✓ Allows checkout
- [ ] Cart with mixed traditional + private: ✗ Shows warning, blocks checkout
- [ ] Validation warnings show in cart page
- [ ] Cannot click checkout when validation fails
- [ ] Checkout page redirects back to cart if validation fails

---

## Commit Strategy

```bash
# After fixes
git add -A
git commit -m "fix(checkout): Fix API path bug and add market validation

- Fixed checkout page calling /api/checkout instead of /api/checkout/session
- Added cart validation API endpoint
- Added validation checks in cart page
- Added validation in checkout page with redirect
- Added market compatibility validation to session API
- Disabled checkout button when validation fails

Fixes critical bug preventing checkout completion"

git push origin feature/checkout-fixes
```

---

## Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/checkout-fixes
git push origin main
git branch -d feature/checkout-fixes
```

---

## Session Summary Template

```markdown
# Session Summary - Phase L-Quick: Fix Checkout & Add Market Validation

**Date:** [DATE]
**Duration:** [TIME]
**Branch:** feature/checkout-fixes (merged to main)

## Completed
- [x] Fixed API path bug in checkout page
- [x] Created cart validation API endpoint
- [x] Added validation warnings in cart page
- [x] Added validation redirect in checkout page
- [x] Added market compatibility checks to session API

## Files Modified
- src/app/[vertical]/checkout/page.tsx
- src/app/[vertical]/cart/page.tsx
- src/app/api/checkout/session/route.ts

## Files Created
- src/app/api/cart/validate/route.ts

## Testing Results
[Fill from checklist]

## Notes
[Any issues or observations]
```

---

*End of build instructions*
