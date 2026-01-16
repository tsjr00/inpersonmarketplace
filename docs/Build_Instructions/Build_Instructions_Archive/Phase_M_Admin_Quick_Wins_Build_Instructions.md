# Build Instructions - Phase M: Admin Quick Wins Bundle

**Date:** January 14, 2026
**Branch:** feature/admin-quick-wins
**Priority:** High
**Estimated Time:** 1 hour

---

## Context

Investigation revealed admin features are mostly complete but have:
1. 30+ instances of "fixed" that should be "traditional"
2. Missing navigation links
3. No consistent admin navigation component

This phase fixes all quick wins in one bundle.

---

## Part 1: Fix "Fixed" → "Traditional" Labels

**Affected Files (7 total):**
1. `src/app/[vertical]/admin/page.tsx`
2. `src/app/[vertical]/admin/markets/page.tsx`
3. `src/app/[vertical]/vendor/markets/page.tsx`
4. `src/components/vendor/MarketSelector.tsx`
5. `src/app/api/admin/markets/route.ts`
6. `src/app/api/vendor/markets/route.ts`
7. Any other files found by search

---

### File 1: `src/app/[vertical]/admin/page.tsx`

**Find (line ~196):**
```typescript
"Create and manage fixed farmers markets"
```

**Replace with:**
```typescript
"Create and manage traditional farmers markets"
```

---

### File 2: `src/app/[vertical]/admin/markets/page.tsx`

**Changes needed:**
1. **Line ~195** - Button text:
   - Find: `"Create Fixed Market"`
   - Replace: `"Create Traditional Market"`

2. **Line ~204** - Form title:
   - Find: `"Create New Fixed Market"`
   - Replace: `"Create New Traditional Market"`

3. **Line ~424** - Section header:
   - Find: `"Fixed Markets"`
   - Replace: `"Traditional Markets"`

4. **Line ~429** - Empty state text:
   - Find: `"No fixed markets created yet"`
   - Replace: `"No traditional markets created yet"`

**Also find and replace in this file:**
- Variable names: `fixedMarkets` → `traditionalMarkets`
- Any other instances of "fixed market"

---

### File 3: `src/app/[vertical]/vendor/markets/page.tsx`

**Find ALL instances of:**
- "Fixed Market" → "Traditional Market"
- "fixed market" → "traditional market"
- `fixedMarkets` (variable) → `traditionalMarkets`

---

### File 4: `src/components/vendor/MarketSelector.tsx`

**Find:**
```typescript
"Fixed Markets"
```

**Replace with:**
```typescript
"Traditional Markets"
```

**Also replace:**
- `fixedMarkets` variable → `traditionalMarkets`

---

### File 5: `src/app/api/admin/markets/route.ts`

**Line ~58 - Update comment:**

**Find:**
```typescript
// Comment referencing "fixed market"
```

**Replace with:**
```typescript
// Comment referencing "traditional market"
```

---

### File 6: `src/app/api/vendor/markets/route.ts`

**Replace all instances:**
- `fixedMarkets` → `traditionalMarkets`
- Comments with "fixed" → "traditional"

---

### Automated Search & Replace

**Run this to catch any remaining instances:**

```bash
cd C:\GitHub\Projects\inpersonmarketplace

# Find remaining instances
findstr /s /i /n "fixed.market\|fixedMarket" apps\web\src\*.ts apps\web\src\*.tsx

# Manually review and replace each occurrence
```

---

## Part 2: Add Missing Navigation Links

### Add Users Link to Vertical Admin Dashboard

**File:** `src/app/[vertical]/admin/page.tsx`

**Find the admin cards section (likely around line 150-250):**

Add Users card alongside Markets card:

```typescript
{/* Users Management Card */}
<Link
  href={`/${vertical}/admin/users`}
  style={{
    display: 'block',
    padding: 20,
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    textDecoration: 'none',
    color: '#111827',
    transition: 'box-shadow 0.2s',
    cursor: 'pointer'
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.boxShadow = 'none'
  }}
>
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
    <span style={{ fontSize: 24 }}>👥</span>
    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Users</h3>
  </div>
  <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
    View and manage all users
  </p>
</Link>
```

---

### Add Back-Navigation from Platform Admin

**File:** `src/app/admin/page.tsx`

**Add link at the top of the page (after header, before stats):**

```typescript
{/* Navigation back to Vertical Admin */}
<div style={{ marginBottom: 24 }}>
  <Link
    href="/farmers_market/admin"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      backgroundColor: '#f3f4f6',
      border: '1px solid #d1d5db',
      borderRadius: 6,
      textDecoration: 'none',
      color: '#374151',
      fontSize: 14,
      fontWeight: 500
    }}
  >
    <span>←</span>
    <span>Back to Farmers Market Admin</span>
  </Link>
</div>
```

---

## Part 3: Create Admin Navigation Component

### Create Component

**File:** `src/components/admin/AdminNav.tsx`

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminNavProps {
  type: 'vertical' | 'platform'
  vertical?: string
}

export default function AdminNav({ type, vertical }: AdminNavProps) {
  const pathname = usePathname()

  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + '/')
  }

  // Vertical admin links
  const verticalLinks = vertical ? [
    { label: 'Dashboard', href: `/${vertical}/admin`, icon: '📊' },
    { label: 'Markets', href: `/${vertical}/admin/markets`, icon: '🏪' },
    { label: 'Users', href: `/${vertical}/admin/users`, icon: '👥' },
  ] : []

  // Platform admin links
  const platformLinks = [
    { label: 'Dashboard', href: '/admin', icon: '📊' },
    { label: 'Vendors', href: '/admin/vendors', icon: '🏪' },
    { label: 'Pending', href: '/admin/vendors/pending', icon: '⏳' },
    { label: 'Listings', href: '/admin/listings', icon: '📦' },
    { label: 'Markets', href: '/admin/markets', icon: '🗺️' },
    { label: 'Users', href: '/admin/users', icon: '👥' },
  ]

  const links = type === 'vertical' ? verticalLinks : platformLinks

  return (
    <nav style={{
      display: 'flex',
      gap: 8,
      padding: '16px 0',
      borderBottom: '1px solid #e5e7eb',
      marginBottom: 24,
      overflowX: 'auto'
    }}>
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            backgroundColor: isActive(link.href) ? '#e0e7ff' : 'transparent',
            color: isActive(link.href) ? '#4338ca' : '#6b7280',
            border: isActive(link.href) ? '1px solid #c7d2fe' : '1px solid transparent'
          }}
        >
          <span>{link.icon}</span>
          <span>{link.label}</span>
        </Link>
      ))}

      {/* Switch to other admin type */}
      <div style={{ marginLeft: 'auto', paddingLeft: 16 }}>
        {type === 'vertical' && vertical && (
          <Link
            href="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db'
            }}
          >
            <span>🌐</span>
            <span>Platform Admin</span>
          </Link>
        )}
        {type === 'platform' && (
          <Link
            href="/farmers_market/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db'
            }}
          >
            <span>🌾</span>
            <span>Vertical Admin</span>
          </Link>
        )}
      </div>
    </nav>
  )
}
```

---

### Add AdminNav to Vertical Admin Pages

**Files to update:**
- `src/app/[vertical]/admin/page.tsx`
- `src/app/[vertical]/admin/markets/page.tsx`
- `src/app/[vertical]/admin/users/page.tsx`

**Add at the top of each page (after the main wrapper div):**

```typescript
import AdminNav from '@/components/admin/AdminNav'

export default async function AdminPage({ params }: Props) {
  const { vertical } = await params
  
  // ... existing code ...

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      {/* Add AdminNav */}
      <AdminNav type="vertical" vertical={vertical} />

      {/* Rest of existing page content */}
      ...
    </div>
  )
}
```

---

### Add AdminNav to Platform Admin Pages

**Files to update:**
- `src/app/admin/page.tsx`
- `src/app/admin/vendors/page.tsx`
- `src/app/admin/vendors/pending/page.tsx`
- `src/app/admin/listings/page.tsx`
- `src/app/admin/markets/page.tsx`
- `src/app/admin/users/page.tsx`

**Add at the top of each page:**

```typescript
import AdminNav from '@/components/admin/AdminNav'

export default async function PlatformAdminPage() {
  // ... existing code ...

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      {/* Add AdminNav */}
      <AdminNav type="platform" />

      {/* Rest of existing page content */}
      ...
    </div>
  )
}
```

---

## Testing Checklist

### Label Fixes
- [ ] Vertical admin dashboard says "traditional markets"
- [ ] Admin markets page says "Create Traditional Market"
- [ ] Admin markets page says "Traditional Markets" header
- [ ] Vendor markets page says "Traditional Markets"
- [ ] MarketSelector says "Traditional Markets"
- [ ] No remaining "fixed market" references in UI
- [ ] Variable names updated (traditionalMarkets)

### Navigation Links
- [ ] Vertical admin dashboard shows Users link
- [ ] Users link navigates to `/[vertical]/admin/users`
- [ ] Platform admin has back link to vertical admin
- [ ] Back link works correctly

### AdminNav Component
- [ ] AdminNav shows on vertical admin pages
- [ ] AdminNav shows on platform admin pages
- [ ] Active page is highlighted
- [ ] All links work correctly
- [ ] Can switch between vertical and platform admin
- [ ] Mobile responsive (horizontal scroll if needed)

---

## Commit Strategy

```bash
# After Part 1 (label fixes)
git add -A
git commit -m "fix(admin): Replace 'fixed' with 'traditional' terminology

- Updated all references to 'fixed market' → 'traditional market'
- Updated variable names fixedMarkets → traditionalMarkets
- Fixed across admin pages, vendor pages, and API comments

Affects 7 files with 30+ occurrences fixed"

# After Part 2 (navigation links)
git add -A
git commit -m "feat(admin): Add missing navigation links

- Added Users link to vertical admin dashboard
- Added back-navigation from platform admin to vertical admin

Improves admin navigation flow"

# After Part 3 (AdminNav component)
git add -A
git commit -m "feat(admin): Add AdminNav component for consistent navigation

- Created AdminNav component with vertical and platform modes
- Added to all admin pages for consistent navigation
- Shows active page highlighting
- Allows switching between vertical and platform admin

Improves UX across all admin interfaces"

# Push
git push origin feature/admin-quick-wins
```

---

## Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/admin-quick-wins
git push origin main
git branch -d feature/admin-quick-wins
```

---

## Session Summary Template

```markdown
# Session Summary - Phase M: Admin Quick Wins Bundle

**Date:** [DATE]
**Duration:** [TIME]
**Branch:** feature/admin-quick-wins (merged to main)

## Completed
- [x] Fixed 30+ "fixed" → "traditional" label issues
- [x] Added Users link to vertical admin dashboard
- [x] Added back-navigation from platform admin
- [x] Created AdminNav component
- [x] Added AdminNav to all admin pages

## Files Modified
[List all files]

## Files Created
- src/components/admin/AdminNav.tsx

## Testing Results
[Fill from checklist]

## Notes
[Any issues or observations]
```

---

*End of build instructions*
