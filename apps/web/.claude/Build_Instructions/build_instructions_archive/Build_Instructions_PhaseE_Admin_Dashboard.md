# Build Instructions - Phase E: Admin Dashboard

**Date:** January 11, 2026  
**Priority:** High - Admin functions needed for vendor management  
**Estimated Time:** 2-3 hours

---

## Overview

Create the admin dashboard for managing vendors. Currently `/admin` returns 404.

**Features to build:**
1. Admin dashboard page with vendor management
2. Pending vendors list with approval/rejection
3. Stale vendor reminder (2+ days pending)
4. All vendors list with status filter
5. API routes for admin actions

---

## IMPORTANT: Security

All admin pages and APIs MUST verify user is admin before processing:

```typescript
// Check pattern for pages
const { data: profile } = await supabase
  .from('user_profiles')
  .select('role')
  .eq('user_id', user.id)
  .single()

if (profile?.role !== 'admin') {
  redirect(`/${vertical}/dashboard`)
}

// Check pattern for APIs
if (profile?.role !== 'admin') {
  return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
}
```

---

## Part 1: Create Admin Dashboard Page

**File:** `src/app/[vertical]/admin/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { VendorManagement } from './VendorManagement'

export default async function AdminDashboardPage({
  params
}: {
  params: { vertical: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect(`/${params.vertical}/login`)
  }
  
  // Verify admin role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  
  if (profile?.role !== 'admin') {
    redirect(`/${params.vertical}/dashboard`)
  }
  
  // Get pending vendors count
  const { data: pendingVendors } = await supabase
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('vertical_id', params.vertical)
    .in('status', ['submitted', 'pending'])
  
  const staleCount = pendingVendors?.filter(v => {
    const daysPending = Math.floor((Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24))
    return daysPending >= 2
  }).length || 0

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Link 
          href={`/${params.vertical}/dashboard`}
          className="text-gray-600 hover:underline"
        >
          ← Main Menu
        </Link>
      </div>
      
      {/* Stale Vendor Warning */}
      {staleCount > 0 && (
        <div className="bg-orange-100 border-l-4 border-orange-500 p-4 mb-6">
          <p className="text-orange-700 font-medium">
            ⚠️ {staleCount} vendor{staleCount > 1 ? 's' : ''} pending approval for 2+ days
          </p>
        </div>
      )}
      
      {/* Quick Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-yellow-700">{pendingVendors?.length || 0}</p>
          <p className="text-yellow-600">Pending Vendors</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-green-700">—</p>
          <p className="text-green-600">Approved Vendors</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-blue-700">—</p>
          <p className="text-blue-600">Active Listings</p>
        </div>
      </div>
      
      {/* Vendor Management Component */}
      <VendorManagement vertical={params.vertical} />
    </div>
  )
}
```

---

## Part 2: Create Vendor Management Component

**File:** `src/app/[vertical]/admin/VendorManagement.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

interface Vendor {
  id: string
  user_id: string
  status: string
  created_at: string
  profile_data: {
    business_name?: string
    legal_name?: string
    email?: string
    phone?: string
    vendor_type?: string | string[]
  }
  user_email?: string
  days_pending?: number
}

export function VendorManagement({ vertical }: { vertical: string }) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const supabase = createBrowserClient()
  
  useEffect(() => {
    fetchVendors()
  }, [statusFilter])
  
  async function fetchVendors() {
    setLoading(true)
    
    let query = supabase
      .from('vendor_profiles')
      .select(`
        id,
        user_id,
        status,
        created_at,
        profile_data
      `)
      .eq('vertical_id', vertical)
      .order('created_at', { ascending: false })
    
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        query = query.in('status', ['submitted', 'pending'])
      } else {
        query = query.eq('status', statusFilter)
      }
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching vendors:', error)
      setVendors([])
    } else {
      // Calculate days pending and fetch user emails
      const vendorsWithDetails = await Promise.all(
        (data || []).map(async (vendor) => {
          const daysPending = Math.floor(
            (Date.now() - new Date(vendor.created_at).getTime()) / (1000 * 60 * 60 * 24)
          )
          
          // Get user email
          const { data: userData } = await supabase.auth.admin.getUserById(vendor.user_id)
          
          return {
            ...vendor,
            days_pending: daysPending,
            user_email: vendor.profile_data?.email || userData?.user?.email || 'Unknown'
          }
        })
      )
      setVendors(vendorsWithDetails)
    }
    
    setLoading(false)
  }
  
  async function handleApprove(vendorId: string) {
    setActionLoading(vendorId)
    
    const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, {
      method: 'POST'
    })
    
    if (res.ok) {
      // Refresh list
      fetchVendors()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to approve vendor')
    }
    
    setActionLoading(null)
  }
  
  async function handleReject(vendorId: string) {
    if (!confirm('Are you sure you want to reject this vendor?')) return
    
    setActionLoading(vendorId)
    
    const res = await fetch(`/api/admin/vendors/${vendorId}/reject`, {
      method: 'POST'
    })
    
    if (res.ok) {
      fetchVendors()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to reject vendor')
    }
    
    setActionLoading(null)
  }
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Vendor Management</h2>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>
      
      {loading ? (
        <p className="text-gray-500">Loading vendors...</p>
      ) : vendors.length === 0 ? (
        <p className="text-gray-500">No vendors found with status: {statusFilter}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-3 border">Business Name</th>
                <th className="text-left p-3 border">Email</th>
                <th className="text-left p-3 border">Type</th>
                <th className="text-left p-3 border">Submitted</th>
                <th className="text-left p-3 border">Status</th>
                <th className="text-left p-3 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr 
                  key={vendor.id}
                  className={vendor.days_pending && vendor.days_pending >= 2 && vendor.status !== 'approved' 
                    ? 'bg-orange-50' 
                    : ''
                  }
                >
                  <td className="p-3 border">
                    <div className="font-medium">
                      {vendor.profile_data?.business_name || 'Unnamed'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {vendor.profile_data?.legal_name}
                    </div>
                  </td>
                  <td className="p-3 border">
                    <div>{vendor.user_email}</div>
                    <div className="text-sm text-gray-500">
                      {vendor.profile_data?.phone}
                    </div>
                  </td>
                  <td className="p-3 border">
                    {Array.isArray(vendor.profile_data?.vendor_type) 
                      ? vendor.profile_data.vendor_type.join(', ')
                      : vendor.profile_data?.vendor_type || '—'
                    }
                  </td>
                  <td className="p-3 border">
                    <div>{new Date(vendor.created_at).toLocaleDateString()}</div>
                    {vendor.days_pending !== undefined && vendor.days_pending >= 2 && vendor.status !== 'approved' && (
                      <div className="text-sm text-orange-600 font-medium">
                        {vendor.days_pending} days ago
                      </div>
                    )}
                  </td>
                  <td className="p-3 border">
                    <span className={`px-2 py-1 rounded text-sm ${
                      vendor.status === 'approved' ? 'bg-green-100 text-green-700' :
                      vendor.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {vendor.status}
                    </span>
                  </td>
                  <td className="p-3 border">
                    {(vendor.status === 'submitted' || vendor.status === 'pending') && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(vendor.id)}
                          disabled={actionLoading === vendor.id}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === vendor.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(vendor.id)}
                          disabled={actionLoading === vendor.id}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {vendor.status === 'approved' && (
                      <span className="text-gray-400 text-sm">Active</span>
                    )}
                    {vendor.status === 'rejected' && (
                      <button
                        onClick={() => handleApprove(vendor.id)}
                        disabled={actionLoading === vendor.id}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Re-approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

---

## Part 3: Create Admin API Routes

### 3A: Get Vendors Route

**File:** `src/app/api/admin/vendors/route.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  
  // Verify user is admin
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
  
  // Get query params
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const vertical = searchParams.get('vertical')
  
  let query = supabase
    .from('vendor_profiles')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }
  
  if (status && status !== 'all') {
    if (status === 'pending') {
      query = query.in('status', ['submitted', 'pending'])
    } else {
      query = query.eq('status', status)
    }
  }
  
  const { data: vendors, error } = await query
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ vendors })
}
```

### 3B: Approve Vendor Route

**File:** `src/app/api/admin/vendors/[id]/approve/route.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  
  // Verify user is admin
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
  
  // Update vendor status
  const { data, error } = await supabase
    .from('vendor_profiles')
    .update({ 
      status: 'approved',
      updated_at: new Date().toISOString()
    })
    .eq('id', params.id)
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  // TODO: Send approval email to vendor
  
  return NextResponse.json({ 
    success: true, 
    vendor: data,
    message: 'Vendor approved successfully'
  })
}
```

### 3C: Reject Vendor Route

**File:** `src/app/api/admin/vendors/[id]/reject/route.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  
  // Verify user is admin
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
  
  // Get rejection reason from request body (optional)
  let reason = null
  try {
    const body = await request.json()
    reason = body.reason
  } catch {
    // No body provided, that's ok
  }
  
  // Update vendor status
  const { data, error } = await supabase
    .from('vendor_profiles')
    .update({ 
      status: 'rejected',
      updated_at: new Date().toISOString()
    })
    .eq('id', params.id)
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  // TODO: Send rejection email to vendor with reason
  
  return NextResponse.json({ 
    success: true, 
    vendor: data,
    message: 'Vendor rejected'
  })
}
```

---

## Part 4: Create Admin Layout (Optional but Recommended)

**File:** `src/app/[vertical]/admin/layout.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: { vertical: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect(`/${params.vertical}/login`)
  }
  
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  
  if (profile?.role !== 'admin') {
    redirect(`/${params.vertical}/dashboard`)
  }
  
  return <>{children}</>
}
```

---

## Testing Checklist

### Admin Access
- [ ] Non-admin user redirected from /admin
- [ ] Admin user can access /admin
- [ ] Admin sees link on main dashboard

### Vendor List
- [ ] Pending vendors display
- [ ] Status filter works (pending/approved/rejected/all)
- [ ] Stale vendors (2+ days) highlighted in orange
- [ ] Warning banner shows for stale vendors

### Approve/Reject
- [ ] Approve button changes status to 'approved'
- [ ] Reject button (with confirm) changes status to 'rejected'
- [ ] Re-approve button works for rejected vendors
- [ ] List refreshes after action

### After Approval
- [ ] Approved vendor can now publish listings (not just drafts)
- [ ] Vendor's dashboard shows full vendor access

---

## Commit Strategy

```bash
# After Part 1-2 (Pages)
git add -A
git commit -m "Create admin dashboard page and vendor management component"

# After Part 3 (APIs)
git add -A
git commit -m "Add admin API routes for vendor approval/rejection"

# After Part 4 (Layout)
git add -A
git commit -m "Add admin layout with auth check"

# Push
git push origin main
```

---

## Future Enhancements (Not in This Phase)

- Email notifications on approve/reject
- Vendor application detail view
- Listing moderation
- User management
- Analytics/reports
