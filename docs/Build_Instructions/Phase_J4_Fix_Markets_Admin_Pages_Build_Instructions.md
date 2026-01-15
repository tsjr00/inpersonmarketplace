# Build Instructions - Phase J-4: Fix Markets & Admin Pages

**Date:** January 14, 2026  
**Priority:** High  
**Estimated Time:** 2-3 hours

---

## Context

During Phase recovery, several issues were identified:
1. Market type naming inconsistency ('fixed' vs 'traditional')
2. Admin markets page has syntax errors
3. MarketFilters has wrong dropdown options
4. Admin users page missing from Phase G

This phase fixes all these issues.

---

## Part 1: Standardize Market Type Values

### Problem
- Database has `market_type = 'fixed'`
- Should be `market_type = 'traditional'` per Phase K-1 migration spec
- Causes filter dropdown to show wrong values

### Database Fix

**Run in Dev SQL Editor:**
```sql
UPDATE markets 
SET market_type = 'traditional' 
WHERE market_type = 'fixed';
```

**Verify:**
```sql
SELECT id, name, market_type, vertical_id, status 
FROM markets 
ORDER BY name;
```

**Expected:** All markets should have `market_type = 'traditional'`

**Run in Staging SQL Editor:** (same query)

---

## Part 2: Fix MarketFilters Component

### Problem
Dropdown shows wrong options for market type filter.

### Solution

**File:** `src/app/[vertical]/markets/MarketFilters.tsx`

Find the market type `<select>` element and update options:

**Change from:**
```typescript
<select
  value={currentType || ''}
  onChange={(e) => handleTypeChange(e.target.value)}
  style={{
    padding: '10px 15px',
    fontSize: 16,
    border: '1px solid #ddd',
    borderRadius: 6,
    backgroundColor: 'white',
    minWidth: 150
  }}
>
  <option value="">All Types</option>
  {/* WRONG OPTIONS */}
</select>
```

**Change to:**
```typescript
<select
  value={currentType || ''}
  onChange={(e) => handleTypeChange(e.target.value)}
  style={{
    padding: '10px 15px',
    fontSize: 16,
    border: '1px solid #ddd',
    borderRadius: 6,
    backgroundColor: 'white',
    minWidth: 150
  }}
>
  <option value="">All Types</option>
  <option value="traditional">Traditional Markets</option>
  <option value="private_pickup">Private Pickup Locations</option>
</select>
```

---

## Part 3: Fix Admin Markets Page Syntax Errors

### Problem
Admin markets page has broken fetch() calls with template literal syntax errors.

### Solution

**File:** `src/app/[vertical]/admin/markets/page.tsx`

**Find all instances of broken fetch and fix:**

**Example of WRONG syntax:**
```typescript
const res = await fetch`/api/admin/markets?vertical=${vertical}`)
```

**Correct syntax:**
```typescript
const res = await fetch(`/api/admin/markets?vertical=${vertical}`)
```

**Locations to fix:**
1. Line ~40: `fetchMarkets` function
2. Line ~70: Update market (PUT request)
3. Line ~85: Create market (POST request)
4. Line ~100+: Delete market (DELETE request)

**Pattern:** Add opening backtick after `fetch(` and ensure closing backtick before `)`

### Full fetchMarkets function (corrected):

```typescript
const fetchMarkets = async () => {
  try {
    const res = await fetch(`/api/admin/markets?vertical=${vertical}`)
    if (res.ok) {
      const data = await res.json()
      setMarkets(data.markets || [])
    }
  } catch (error) {
    console.error('Error fetching markets:', error)
  } finally {
    setLoading(false)
  }
}
```

### Full handleSubmit function (corrected):

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setSubmitting(true)

  try {
    if (editingMarket) {
      // Update
      const res = await fetch(`/api/admin/markets/${editingMarket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical, ...formData })
      })
      
      if (res.ok) {
        await fetchMarkets()
        resetForm()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to update market')
      }
    } else {
      // Create
      const res = await fetch(`/api/admin/markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical, ...formData })
      })
      
      if (res.ok) {
        await fetchMarkets()
        resetForm()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to create market')
      }
    }
  } catch (error) {
    console.error('Error submitting market:', error)
    alert('An error occurred')
  } finally {
    setSubmitting(false)
  }
}
```

### Full handleDelete function (corrected):

```typescript
const handleDelete = async (marketId: string) => {
  if (!confirm('Are you sure you want to delete this market?')) return

  try {
    const res = await fetch(`/api/admin/markets/${marketId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertical })
    })

    if (res.ok) {
      await fetchMarkets()
    } else {
      const error = await res.json()
      alert(error.error || 'Failed to delete market')
    }
  } catch (error) {
    console.error('Error deleting market:', error)
    alert('An error occurred')
  }
}
```

---

## Part 4: Create Admin Users Page

### Background
From Phase G session summary - this page was planned but never created.

### Requirements
- Show all users with their roles
- Show vendor status for users who are vendors
- Admin can view user details

### Implementation

**Create file:** `src/app/[vertical]/admin/users/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

interface AdminUsersPageProps {
  params: Promise<{ vertical: string }>
}

interface UserProfile {
  id: string
  user_id: string
  display_name: string | null
  role: string
  roles: string[] | null
  created_at: string
  vendor_profiles: {
    id: string
    status: string
    vertical_id: string
  }[]
}

// Helper to determine display role
function getDisplayRole(user: UserProfile): string {
  const roles: string[] = []
  
  // Check if admin
  if (user.role === 'admin' || user.roles?.includes('admin')) {
    roles.push('admin')
  }
  
  // Check if vendor (has any vendor profile)
  if (user.vendor_profiles && user.vendor_profiles.length > 0) {
    roles.push('vendor')
  }
  
  // Check if buyer (default, or explicit in roles)
  if (user.roles?.includes('buyer') || roles.length === 0) {
    if (!roles.includes('admin')) { // Don't show buyer for admins
      roles.push('buyer')
    }
  }
  
  return roles.join(', ')
}

export default async function AdminUsersPage({ params }: AdminUsersPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Verify user is authenticated and admin
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Please log in to access this page.</p>
      </div>
    )
  }

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Admin access required.</p>
      </div>
    )
  }

  // Fetch all users with their vendor profiles
  const { data: users } = await supabase
    .from('user_profiles')
    .select(`
      id,
      user_id,
      display_name,
      role,
      roles,
      created_at,
      vendor_profiles (
        id,
        status,
        vertical_id
      )
    `)
    .order('created_at', { ascending: false })

  const typedUsers = users as unknown as UserProfile[] | null

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 30 
      }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
            Users
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            {typedUsers?.length || 0} total users
          </p>
        </div>
        <Link
          href={`/${vertical}/admin`}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600
          }}
        >
          ← Back to Admin
        </Link>
      </div>

      {/* Users Table */}
      {typedUsers && typedUsers.length > 0 ? (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: 8, 
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Name
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Role(s)
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Vendor Status
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {typedUsers.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  {/* Name */}
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 500, color: '#333' }}>
                      {user.display_name || 'No name'}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      ID: {user.user_id.slice(0, 8)}...
                    </div>
                  </td>

                  {/* Role(s) */}
                  <td style={{ padding: 12 }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: getDisplayRole(user).includes('admin') 
                        ? '#e7d6ff' 
                        : getDisplayRole(user).includes('vendor')
                        ? '#d1f4ff'
                        : '#f3f4f6',
                      color: getDisplayRole(user).includes('admin')
                        ? '#6b21a8'
                        : getDisplayRole(user).includes('vendor')
                        ? '#0369a1'
                        : '#6b7280'
                    }}>
                      {getDisplayRole(user)}
                    </span>
                  </td>

                  {/* Vendor Status */}
                  <td style={{ padding: 12 }}>
                    {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {user.vendor_profiles.map((vp) => (
                          <span
                            key={vp.id}
                            style={{
                              padding: '3px 10px',
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor: 
                                vp.status === 'approved' ? '#d1fae5' :
                                vp.status === 'rejected' ? '#fee2e2' :
                                '#fef3c7',
                              color:
                                vp.status === 'approved' ? '#065f46' :
                                vp.status === 'rejected' ? '#991b1b' :
                                '#92400e',
                              display: 'inline-block'
                            }}
                          >
                            {vp.vertical_id}: {vp.status}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#999', fontSize: 13 }}>—</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td style={{ padding: 12, color: '#666', fontSize: 14 }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center',
          color: '#666'
        }}>
          <p>No users found.</p>
        </div>
      )}
    </div>
  )
}
```

---

## Testing Checklist

### Part 1: Market Type Values
- [ ] Dev: All markets have `market_type = 'traditional'`
- [ ] Staging: All markets have `market_type = 'traditional'`
- [ ] No markets with `market_type = 'fixed'`

### Part 2: MarketFilters Component
- [ ] Dropdown shows "All Types" (default)
- [ ] Dropdown shows "Traditional Markets"
- [ ] Dropdown shows "Private Pickup Locations"
- [ ] Filtering by Traditional works
- [ ] Filtering by Private Pickup works

### Part 3: Admin Markets Page
- [ ] Page loads without errors
- [ ] Can create new market
- [ ] Can edit existing market
- [ ] Can delete market (if no listings)
- [ ] No syntax errors in console

### Part 4: Admin Users Page
- [ ] Navigate to `/farmers_market/admin/users`
- [ ] Page loads without 404
- [ ] Shows all users in table
- [ ] Role badges show correct colors
- [ ] Admin users show purple badge
- [ ] Vendor users show blue badge
- [ ] Buyer users show gray badge
- [ ] Vendor status column shows vertical:status
- [ ] Approved vendors show green
- [ ] Pending vendors show yellow
- [ ] Rejected vendors show red

---

## Commit Strategy

```bash
# After Part 1 (database only, no code changes)
# No commit needed - database update only

# After Parts 2-4
git add -A
git commit -m "Phase J-4: Fix markets nomenclature and admin pages

Part 1: Update market_type values from 'fixed' to 'traditional'
Part 2: Fix MarketFilters dropdown options
Part 3: Fix admin markets page fetch syntax errors
Part 4: Create admin users page with role display

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# Push
git push origin main
```

---

## Build Verification

After implementation, verify:
```bash
npm run build
```

Should compile without errors.

---

## Session Summary Template

```markdown
# Session Summary - Phase J-4: Fix Markets & Admin Pages

**Date:** [DATE]
**Duration:** [TIME]

## Completed
- [ ] Updated market_type values in database (Dev & Staging)
- [ ] Fixed MarketFilters dropdown options
- [ ] Fixed admin markets page syntax errors
- [ ] Created admin users page

## Database Changes
- Dev: Updated X markets from 'fixed' to 'traditional'
- Staging: Updated X markets from 'fixed' to 'traditional'

## Files Modified
- src/app/[vertical]/markets/MarketFilters.tsx
- src/app/[vertical]/admin/markets/page.tsx

## Files Created
- src/app/[vertical]/admin/users/page.tsx

## Testing Results
[Fill from checklist]

## Issues Encountered
[Any problems]

## Notes
[Additional observations]
```

---

*End of build instructions*
