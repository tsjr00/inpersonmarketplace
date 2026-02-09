# Build Instructions - Phase N: Bug Fixes (Revised)

**Date:** January 15, 2026
**Branch:** feature/bug-fixes-phase-n
**Priority:** HIGH
**Estimated Time:** 2-3 hours

---

## Context

Investigation revealed most "bugs" are config/data issues. This phase fixes ACTUAL code bugs only. Config fixes in separate SQL file.

**What's NOT a bug:**
- Vendor signup form (config issue - SQL fix)
- Orders not displaying (user mismatch - test data issue)
- Categories (already working, just need config alignment)

**What IS a bug:**
- No Toast system for friendly errors
- No Footer component
- Cart quantity controls in checkout (verify/fix)
- Vertical scope filtering issues
- Navigation issues

---

## PART 1: Toast/Notification System

**Purpose:** Replace ugly error alerts with friendly toast messages

### Create Toast Component

**File:** `src/components/shared/Toast.tsx`

```typescript
'use client'
import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const colors = {
    success: { bg: '#10b981', icon: '✓' },
    error: { bg: '#ef4444', icon: '✗' },
    info: { bg: '#3b82f6', icon: 'ℹ' },
    warning: { bg: '#f59e0b', icon: '⚠' }
  }

  const config = colors[type]

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        minWidth: 300,
        maxWidth: 500,
        padding: '16px 20px',
        backgroundColor: config.bg,
        color: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        animation: 'slideIn 0.3s ease-out'
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{config.icon}</span>
      <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: 1.5 }}>{message}</p>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          fontSize: 20,
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          opacity: 0.8
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
      >
        ×
      </button>
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
```

---

### Create Toast Hook

**File:** `src/lib/hooks/useToast.tsx`

```typescript
'use client'
import { useState, useCallback } from 'react'
import Toast, { ToastType } from '@/components/shared/Toast'

interface ToastMessage {
  id: number
  message: string
  type: ToastType
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [nextId, setNextId] = useState(0)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId
    setNextId(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
  }, [nextId])

  const hideToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const ToastContainer = useCallback(() => (
    <>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => hideToast(toast.id)}
        />
      ))}
    </>
  ), [toasts, hideToast])

  return {
    showToast,
    ToastContainer,
    success: (msg: string) => showToast(msg, 'success'),
    error: (msg: string) => showToast(msg, 'error'),
    info: (msg: string) => showToast(msg, 'info'),
    warning: (msg: string) => showToast(msg, 'warning')
  }
}
```

---

### Update AddToCartButton to Use Toast

**File:** `src/components/cart/AddToCartButton.tsx`

**Find the handleAddToCart function and update:**

```typescript
'use client'
import { useToast } from '@/lib/hooks/useToast'

export default function AddToCartButton({ listing }: Props) {
  const { showToast, ToastContainer } = useToast()
  // ... existing state ...

  const handleAddToCart = async () => {
    setLoading(true)
    try {
      await addToCart(listing.id, quantity)
      showToast('Added to cart!', 'success')
      // ... existing success handling ...
    } catch (error: any) {
      // Check for unauthorized error
      if (error.message === 'Unauthorized' || error.message.includes('Unauthorized')) {
        showToast('Please log in to add items to your cart', 'info')
        // Redirect after brief delay
        setTimeout(() => {
          const currentPath = window.location.pathname
          window.location.href = `/farmers_market/login?redirect=${encodeURIComponent(currentPath)}`
        }, 2000)
      } else {
        showToast(error.message || 'Failed to add item to cart', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <ToastContainer />
      {/* ... existing button JSX ... */}
    </>
  )
}
```

---

## PART 2: Footer Component

**File:** `src/components/shared/Footer.tsx`

```typescript
import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      style={{
        marginTop: 'auto',
        padding: '48px 20px 24px',
        backgroundColor: '#f9fafb',
        borderTop: '1px solid #e5e7eb'
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Footer Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 40,
            marginBottom: 32
          }}
        >
          {/* Company Info */}
          <div>
            <h4 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600, color: '#111827' }}>
              815 Enterprises
            </h4>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Connecting local vendors with their communities through innovative marketplace solutions.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, color: '#111827' }}>
              Company
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: 12 }}>
                <Link
                  href="/about"
                  style={{
                    color: '#6b7280',
                    textDecoration: 'none',
                    fontSize: 14,
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#111827' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280' }}
                >
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, color: '#111827' }}>
              Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: 12 }}>
                <Link
                  href="/terms"
                  style={{
                    color: '#6b7280',
                    textDecoration: 'none',
                    fontSize: 14,
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#111827' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280' }}
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div
          style={{
            paddingTop: 24,
            borderTop: '1px solid #e5e7eb',
            textAlign: 'center'
          }}
        >
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
            © {currentYear} 815 Enterprises. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
```

---

### Create Placeholder Pages

**File:** `src/app/about/page.tsx`

```typescript
import Footer from '@/components/shared/Footer'

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1, maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, color: '#111827' }}>
          About 815 Enterprises
        </h1>
        <div style={{ color: '#4b5563', fontSize: 16, lineHeight: 1.8 }}>
          <p>[Content to be added by Tracy]</p>
          <p>Contact form will appear on this page.</p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
```

**File:** `src/app/terms/page.tsx`

```typescript
import Footer from '@/components/shared/Footer'

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1, maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, color: '#111827' }}>
          Terms of Service
        </h1>
        <div style={{ color: '#4b5563', fontSize: 16, lineHeight: 1.8 }}>
          <p>[Content to be added by Tracy]</p>
          <p>Privacy policy will be included as subsection.</p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
```

---

### Add Footer to Main Layout

**File:** `src/app/layout.tsx`

```typescript
import Footer from '@/components/shared/Footer'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{children}</div>
        <Footer />
      </body>
    </html>
  )
}
```

---

## PART 3: Cart Quantity Controls in Checkout

**File:** `src/app/[vertical]/checkout/page.tsx`

**Investigate first:** Check if quantity controls exist in the cart items display

**If missing, add:**

```typescript
{cartItems.map((item) => (
  <div key={item.id} style={{ 
    display: 'flex', 
    gap: 16, 
    padding: 16, 
    borderBottom: '1px solid #e5e7eb',
    alignItems: 'center'
  }}>
    {/* Item info - existing */}
    <div style={{ flex: 1 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{item.listing.title}</h3>
      <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>
        ${(item.listing.price_cents / 100).toFixed(2)} each
      </p>
    </div>

    {/* ADD QUANTITY CONTROLS */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
        disabled={item.quantity <= 1}
        style={{
          width: 32,
          height: 32,
          border: '1px solid #d1d5db',
          borderRadius: 4,
          backgroundColor: item.quantity <= 1 ? '#f3f4f6' : 'white',
          cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        −
      </button>
      <span style={{ 
        minWidth: 40, 
        textAlign: 'center', 
        fontSize: 16, 
        fontWeight: 600 
      }}>
        {item.quantity}
      </span>
      <button
        onClick={() => updateQuantity(item.id, item.quantity + 1)}
        style={{
          width: 32,
          height: 32,
          border: '1px solid #d1d5db',
          borderRadius: 4,
          backgroundColor: 'white',
          cursor: 'pointer',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        +
      </button>
    </div>

    {/* Remove button */}
    <button
      onClick={() => removeItem(item.id)}
      style={{
        padding: '6px 12px',
        color: '#ef4444',
        backgroundColor: 'white',
        border: '1px solid #ef4444',
        borderRadius: 6,
        fontSize: 14,
        cursor: 'pointer'
      }}
    >
      Remove
    </button>

    {/* Subtotal */}
    <div style={{ minWidth: 80, textAlign: 'right', fontWeight: 600 }}>
      ${((item.listing.price_cents * item.quantity) / 100).toFixed(2)}
    </div>
  </div>
))}
```

**Add update/remove functions:**

```typescript
const updateQuantity = async (itemId: string, newQuantity: number) => {
  if (newQuantity < 1) return
  
  try {
    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity })
    })

    if (res.ok) {
      // Refresh cart data
      fetchCart()
    }
  } catch (error) {
    console.error('Failed to update quantity:', error)
  }
}

const removeItem = async (itemId: string) => {
  try {
    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: 'DELETE'
    })

    if (res.ok) {
      fetchCart()
    }
  } catch (error) {
    console.error('Failed to remove item:', error)
  }
}
```

---

## PART 4: Vertical Scope Filtering

### Fix Markets Page

**File:** `src/app/[vertical]/admin/markets/page.tsx`

**Find the markets query and add vertical filter:**

```typescript
export default async function AdminMarketsPage({ params }: Props) {
  const { vertical } = await params
  const supabase = await createClient()

  // ADD vertical_id filter
  const { data: markets } = await supabase
    .from('markets')
    .select('*')
    .eq('market_type', 'traditional')
    .eq('vertical_id', vertical)  // ADD THIS LINE
    .order('name')

  // ... rest of component
}
```

---

### Fix Users Page

**File:** `src/app/[vertical]/admin/users/page.tsx`

**Filter users to only show those in current vertical:**

```typescript
export default async function AdminUsersPage({ params }: Props) {
  const { vertical } = await params
  const supabase = await createClient()

  // Get users with vendor profiles in this vertical
  const { data: users } = await supabase
    .from('user_profiles')
    .select(`
      id,
      email,
      role,
      roles,
      created_at,
      vendor_profiles (
        id,
        status,
        vertical_id,
        tier
      )
    `)
    .order('created_at', { ascending: false })

  // Filter to only users in this vertical
  const verticalUsers = users?.filter(user => {
    // Include all buyers (no vendor profile)
    if (!user.vendor_profiles || user.vendor_profiles.length === 0) {
      return true
    }
    
    // Include vendors only if they have profile in this vertical
    return user.vendor_profiles.some((vp: any) => vp.vertical_id === vertical)
  }) || []

  // ... render with verticalUsers instead of users
}
```

---

## PART 5: Navigation Fixes

### Fix "Back to Site" Link

**File:** `src/app/admin/page.tsx`

**Find "Back to Site" link and update:**

```typescript
// Instead of linking to "/"
<Link href="/">Back to Site</Link>

// Change to default vertical (or track in session)
<Link href="/farmers_market">Back to Farmers Market</Link>

// Better: Add query param tracking
// When navigating TO platform admin, include ?from=farmers_market
// Then read it back:
const searchParams = await searchParams
const fromVertical = searchParams.get('from') || 'farmers_market'

<Link href={`/${fromVertical}`}>Back to {fromVertical.replace('_', ' ')}</Link>
```

---

### Fix Orders Navigation Nomenclature

**File:** `src/components/Header.tsx` (or wherever navigation dropdown is)

**Find "My Orders" link and make it conditional:**

```typescript
const isVendor = user.roles?.includes('vendor') || user.role === 'vendor'

{isVendor ? (
  <>
    <Link href={`/${vertical}/buyer/orders`}>
      Orders Placed
    </Link>
    <Link href={`/${vertical}/vendor/orders`}>
      Orders Received
    </Link>
  </>
) : (
  <Link href={`/${vertical}/buyer/orders`}>
    My Orders
  </Link>
)}
```

---

## PART 6: Vendor Tier Column

**File:** `src/app/[vertical]/admin/page.tsx` (VendorManagement component)

**Add tier column to vendor table:**

```typescript
<table>
  <thead>
    <tr>
      <th>Business Name</th>
      <th>Status</th>
      <th>Tier</th>  {/* ADD THIS */}
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {vendors.map(vendor => (
      <tr key={vendor.id}>
        <td>{vendor.business_name}</td>
        <td>
          <span style={{
            padding: '4px 12px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            backgroundColor: 
              vendor.status === 'approved' ? '#d1fae5' :
              vendor.status === 'pending' ? '#fef3c7' : '#fee2e2',
            color:
              vendor.status === 'approved' ? '#065f46' :
              vendor.status === 'pending' ? '#92400e' : '#991b1b'
          }}>
            {vendor.status}
          </span>
        </td>
        <td>
          <span style={{
            padding: '4px 12px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            backgroundColor: vendor.tier === 'premium' ? '#dbeafe' : '#f3f4f6',
            color: vendor.tier === 'premium' ? '#1e40af' : '#374151'
          }}>
            {vendor.tier === 'premium' ? '⭐ Premium' : 'Standard'}
          </span>
        </td>
        <td>
          {/* ... existing action buttons ... */}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

**Ensure query includes tier:**

```typescript
const { data: vendors } = await supabase
  .from('vendor_profiles')
  .select('id, business_name, status, tier')  // Include tier
  .eq('vertical_id', vertical)
```

---

## Testing Checklist

### Toast System
- [ ] Adding to cart while logged out shows friendly info message
- [ ] Redirects to login after 2 seconds
- [ ] Success message shows when item added
- [ ] Toast auto-dismisses after 5 seconds
- [ ] Can manually close toast

### Footer
- [ ] Footer shows on all pages
- [ ] About link works (placeholder page)
- [ ] Terms link works (placeholder page)
- [ ] Copyright shows current year
- [ ] Footer styling matches site

### Cart in Checkout
- [ ] Can increase quantity
- [ ] Can decrease quantity (min 1)
- [ ] Can remove items
- [ ] Subtotal updates correctly
- [ ] Total updates correctly

### Vertical Scoping
- [ ] Farmers market admin sees only farmers market markets
- [ ] Farmers market admin sees only farmers market users/vendors
- [ ] Platform admin sees all (unchanged)

### Navigation
- [ ] "Back to Site" goes to correct vertical
- [ ] Vendors see "Orders Placed" and "Orders Received"
- [ ] Buyers see "My Orders"

### Vendor Tier
- [ ] Tier column shows in vendor management
- [ ] Standard shows as gray badge
- [ ] Premium shows as blue badge with star

---

## Commit Strategy

```bash
# After Toast system
git add src/components/shared/Toast.tsx src/lib/hooks/useToast.tsx src/components/cart/AddToCartButton.tsx
git commit -m "feat(ui): Add toast notification system for better error handling"
git push origin feature/bug-fixes-phase-n

# After Footer
git add src/components/shared/Footer.tsx src/app/about src/app/terms src/app/layout.tsx
git commit -m "feat(footer): Add footer component with legal pages"
git push origin feature/bug-fixes-phase-n

# After cart controls
git add src/app/[vertical]/checkout/page.tsx
git commit -m "fix(checkout): Add quantity controls and remove button"
git push origin feature/bug-fixes-phase-n

# After vertical scoping
git add src/app/[vertical]/admin/markets/page.tsx src/app/[vertical]/admin/users/page.tsx
git commit -m "fix(admin): Add vertical_id filtering to scope admin views correctly"
git push origin feature/bug-fixes-phase-n

# After navigation fixes
git add src/app/admin/page.tsx src/components/Header.tsx
git commit -m "fix(navigation): Fix back link and clarify order navigation"
git push origin feature/bug-fixes-phase-n

# After vendor tier
git add src/app/[vertical]/admin/page.tsx
git commit -m "feat(admin): Add vendor tier column with visual badges"
git push origin feature/bug-fixes-phase-n
```

---

## Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/bug-fixes-phase-n
git push origin main
git branch -d feature/bug-fixes-phase-n
```

---

## Session Summary Template

```markdown
# Session Summary - Phase N: Bug Fixes

**Date:** January 15, 2026
**Duration:** [TIME]
**Branch:** feature/bug-fixes-phase-n (merged to main)

## Bugs Fixed
- [x] Toast notification system created
- [x] Footer component with legal pages
- [x] Cart quantity controls in checkout
- [x] Vertical scope filtering (markets, users)
- [x] Back to Site navigation
- [x] Orders navigation nomenclature
- [x] Vendor tier column display

## Config Issues Fixed (SQL)
- [x] Added vendor_fields to farmers_market config
- [x] Verified listing_fields config

## Non-Issues (Test Data)
- Orders display works correctly - was user ID mismatch

## Files Created
[List]

## Files Modified
[List]

## Testing Results
[From checklist]

## Notes
[Observations]
```

---

*End of build instructions*
