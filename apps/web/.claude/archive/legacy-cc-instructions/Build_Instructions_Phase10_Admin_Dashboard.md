# Build Instructions - Phase 10: Admin Dashboard

**Session Date:** January 6, 2026  
**Created by:** Chet (Claude Chat)  
**Phase:** 10 - Admin Dashboard  
**Prerequisites:** Phases 1-9 complete

---

## Objective

Create an admin dashboard for platform operations: approve/reject vendors, view all listings, manage verticals, and see basic analytics. Essential for platform moderation and operations.

---

## Overview

**What admins will be able to do:**
- View pending vendor applications
- Approve or reject vendors
- View all vendors (filter by status)
- View all listings across verticals
- See basic platform stats
- Manage vendor status (suspend, reactivate)

**Access control:**
- Admin pages protected by role check
- Only users with admin role can access
- Regular users redirected away

---

## Part 1: Create Admin Role Infrastructure

### Step 1: Create Migration for Admin Role

**Create migration:** `supabase/migrations/20260106_HHMMSS_001_admin_role.sql`

```sql
-- =============================================================================
-- Migration: Add admin role to user profiles
-- =============================================================================
-- Created: 2026-01-06 HH:MM:SS CST
-- Author: Claude Code
-- 
-- Purpose:
-- Adds role column to user_profiles to support admin access control.
-- Default role is 'user', admins get 'admin' role.
--
-- Dependencies:
-- Requires user_profiles table
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS role;
-- DROP TYPE IF EXISTS user_role;
-- =============================================================================

-- Create role enum
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add role column
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user';

COMMENT ON COLUMN user_profiles.role IS 
'User role: user (default), admin (platform admin), super_admin (full access)';

-- Create index for role queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_role 
ON user_profiles(role);

-- Verify column added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'role'
  ) THEN
    RAISE EXCEPTION 'role column was not added';
  END IF;
  RAISE NOTICE 'Admin role column added successfully';
END $$;
```

### Step 2: Create Your Admin User

**After migration, run this to make yourself admin:**

```sql
-- Replace with your actual email
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'YOUR_EMAIL_HERE';

-- Verify
SELECT user_id, email, role FROM user_profiles WHERE role = 'admin';
```

---

## Part 2: Create Admin Auth Utility

**Create:** `src/lib/auth/admin.ts`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type UserRole = 'user' | 'admin' | 'super_admin'

export interface AdminUser {
  user_id: string
  email: string
  role: UserRole
  display_name: string | null
}

/**
 * Check if current user is an admin
 * Returns admin user data if authorized, redirects if not
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = createServerClient()
  
  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    redirect('/login?error=unauthorized')
  }

  // Get user profile with role
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, email, role, display_name')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    redirect('/login?error=no_profile')
  }

  // Check admin role
  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    redirect('/dashboard?error=not_admin')
  }

  return profile as AdminUser
}

/**
 * Check if user is admin (returns boolean, no redirect)
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = createServerClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return profile?.role === 'admin' || profile?.role === 'super_admin'
}
```

---

## Part 3: Create Admin Layout

**Create:** `src/app/admin/layout.tsx`

```typescript
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await requireAdmin()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 250,
        backgroundColor: '#1a1a2e',
        color: 'white',
        padding: 20
      }}>
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 20, marginBottom: 5 }}>Admin Panel</h2>
          <p style={{ fontSize: 12, color: '#888' }}>{admin.email}</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Link
            href="/admin"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              backgroundColor: 'rgba(255,255,255,0.1)'
            }}
          >
            📊 Dashboard
          </Link>
          <Link
            href="/admin/vendors"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            👥 Vendors
          </Link>
          <Link
            href="/admin/vendors/pending"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            ⏳ Pending Approval
          </Link>
          <Link
            href="/admin/listings"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            📦 Listings
          </Link>
          <Link
            href="/admin/users"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            👤 Users
          </Link>
          
          <div style={{ 
            borderTop: '1px solid rgba(255,255,255,0.2)', 
            margin: '20px 0',
            paddingTop: 20 
          }}>
            <Link
              href="/"
              style={{
                padding: '12px 15px',
                color: '#888',
                textDecoration: 'none',
                borderRadius: 6,
                display: 'block'
              }}
            >
              ← Back to Site
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{ 
        flex: 1, 
        backgroundColor: '#f5f5f5',
        padding: 30
      }}>
        {children}
      </main>
    </div>
  )
}
```

---

## Part 4: Create Admin Dashboard Page

**Create:** `src/app/admin/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

export default async function AdminDashboardPage() {
  await requireAdmin()
  const supabase = createServerClient()

  // Get stats
  const [
    { count: totalUsers },
    { count: totalVendors },
    { count: pendingVendors },
    { count: approvedVendors },
    { count: totalListings },
    { count: publishedListings }
  ] = await Promise.all([
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'published').is('deleted_at', null)
  ])

  // Get recent pending vendors
  const { data: recentPending } = await supabase
    .from('vendor_profiles')
    .select('vendor_id, profile_data, vertical_id, created_at')
    .eq('status', 'submitted')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <h1 style={{ marginBottom: 30, color: '#333' }}>Admin Dashboard</h1>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20,
        marginBottom: 40
      }}>
        <StatCard 
          title="Total Users" 
          value={totalUsers || 0} 
          color="#0070f3" 
        />
        <StatCard 
          title="Total Vendors" 
          value={totalVendors || 0} 
          color="#10b981" 
        />
        <StatCard 
          title="Pending Approval" 
          value={pendingVendors || 0} 
          color="#f59e0b"
          href="/admin/vendors/pending"
        />
        <StatCard 
          title="Approved Vendors" 
          value={approvedVendors || 0} 
          color="#10b981" 
        />
        <StatCard 
          title="Total Listings" 
          value={totalListings || 0} 
          color="#8b5cf6" 
        />
        <StatCard 
          title="Published Listings" 
          value={publishedListings || 0} 
          color="#8b5cf6" 
        />
      </div>

      {/* Pending Approvals */}
      {pendingVendors && pendingVendors > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 25,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 20
          }}>
            <h2 style={{ color: '#333' }}>Pending Vendor Approvals</h2>
            <Link
              href="/admin/vendors/pending"
              style={{
                color: '#0070f3',
                textDecoration: 'none',
                fontWeight: 600
              }}
            >
              View All →
            </Link>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', color: '#666' }}>Business</th>
                <th style={{ textAlign: 'left', padding: '10px 0', color: '#666' }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: '10px 0', color: '#666' }}>Applied</th>
                <th style={{ textAlign: 'right', padding: '10px 0', color: '#666' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentPending?.map((vendor: any) => {
                const profileData = vendor.profile_data as Record<string, any>
                const businessName = profileData?.business_name || profileData?.farm_name || 'Unknown'
                
                return (
                  <tr key={vendor.vendor_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '15px 0', color: '#333' }}>{businessName}</td>
                    <td style={{ padding: '15px 0', color: '#666' }}>{vendor.vertical_id}</td>
                    <td style={{ padding: '15px 0', color: '#666' }}>
                      {new Date(vendor.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '15px 0', textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendor.vendor_id}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: 4,
                          fontSize: 14
                        }}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 20,
        marginTop: 30
      }}>
        <QuickAction
          title="Review Pending Vendors"
          description="Approve or reject vendor applications"
          href="/admin/vendors/pending"
          color="#f59e0b"
        />
        <QuickAction
          title="Manage All Vendors"
          description="View, edit, or suspend vendors"
          href="/admin/vendors"
          color="#10b981"
        />
        <QuickAction
          title="View All Listings"
          description="Browse and moderate listings"
          href="/admin/listings"
          color="#8b5cf6"
        />
      </div>
    </div>
  )
}

function StatCard({ 
  title, 
  value, 
  color,
  href 
}: { 
  title: string
  value: number
  color: string
  href?: string
}) {
  const content = (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ color: '#666', fontSize: 14, marginBottom: 5 }}>{title}</div>
      <div style={{ color: '#333', fontSize: 36, fontWeight: 'bold' }}>{value}</div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    )
  }

  return content
}

function QuickAction({
  title,
  description,
  href,
  color
}: {
  title: string
  description: string
  href: string
  color: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 20,
        textDecoration: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        borderTop: `3px solid ${color}`
      }}
    >
      <h3 style={{ color: '#333', marginBottom: 5 }}>{title}</h3>
      <p style={{ color: '#666', fontSize: 14 }}>{description}</p>
    </Link>
  )
}
```

---

## Part 5: Create Pending Vendors Page

**Create:** `src/app/admin/vendors/pending/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

export default async function PendingVendorsPage() {
  await requireAdmin()
  const supabase = createServerClient()

  // Get all pending vendors
  const { data: pendingVendors, error } = await supabase
    .from('vendor_profiles')
    .select(`
      vendor_id,
      vertical_id,
      profile_data,
      status,
      created_at,
      user_id
    `)
    .eq('status', 'submitted')
    .order('created_at', { ascending: true })

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 30 
      }}>
        <h1 style={{ color: '#333' }}>Pending Vendor Approvals</h1>
        <span style={{ 
          padding: '6px 12px', 
          backgroundColor: '#f59e0b', 
          color: 'white',
          borderRadius: 20,
          fontWeight: 600
        }}>
          {pendingVendors?.length || 0} pending
        </span>
      </div>

      {pendingVendors && pendingVendors.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Business Name</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Contact</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Applied</th>
                <th style={{ textAlign: 'right', padding: 15, color: '#666' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingVendors.map((vendor: any) => {
                const profileData = vendor.profile_data as Record<string, any>
                const businessName = profileData?.business_name || profileData?.farm_name || 'Unknown'
                const contactName = profileData?.legal_name || 'N/A'
                const email = profileData?.email || 'N/A'

                return (
                  <tr key={vendor.vendor_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15 }}>
                      <div style={{ fontWeight: 600, color: '#333' }}>{businessName}</div>
                      <div style={{ fontSize: 13, color: '#666' }}>{contactName}</div>
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: vendor.vertical_id === 'fireworks' ? '#ff450020' : '#2d501620',
                        color: vendor.vertical_id === 'fireworks' ? '#ff4500' : '#2d5016',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {vendor.vertical_id}
                      </span>
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {email}
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {new Date(vendor.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 15, textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendor.vendor_id}`}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 14
                        }}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 15 }}>✅</div>
          <h3 style={{ color: '#333', marginBottom: 10 }}>All Caught Up!</h3>
          <p style={{ color: '#666' }}>No pending vendor applications to review.</p>
        </div>
      )}
    </div>
  )
}
```

---

## Part 6: Create Vendor Detail/Review Page

**Create:** `src/app/admin/vendors/[vendorId]/page.tsx`

```typescript
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import VendorActions from './VendorActions'

interface VendorDetailPageProps {
  params: Promise<{ vendorId: string }>
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { vendorId } = await params
  await requireAdmin()
  const supabase = createServerClient()

  // Get vendor details
  const { data: vendor, error } = await supabase
    .from('vendor_profiles')
    .select(`
      *,
      user_profiles!vendor_profiles_user_id_fkey (
        email,
        display_name,
        created_at
      )
    `)
    .eq('vendor_id', vendorId)
    .single()

  if (error || !vendor) {
    notFound()
  }

  const profileData = vendor.profile_data as Record<string, any>
  const businessName = profileData?.business_name || profileData?.farm_name || 'Unknown'
  const userProfile = vendor.user_profiles as any

  // Get vendor's listings count
  const { count: listingsCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorId)
    .is('deleted_at', null)

  return (
    <div>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: 30 
      }}>
        <div>
          <Link
            href="/admin/vendors"
            style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}
          >
            ← Back to Vendors
          </Link>
          <h1 style={{ color: '#333', marginTop: 10 }}>{businessName}</h1>
          <span style={{
            display: 'inline-block',
            marginTop: 10,
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: 
              vendor.status === 'approved' ? '#d4edda' :
              vendor.status === 'submitted' ? '#fff3cd' :
              vendor.status === 'rejected' ? '#f8d7da' : '#e2e3e5',
            color:
              vendor.status === 'approved' ? '#155724' :
              vendor.status === 'submitted' ? '#856404' :
              vendor.status === 'rejected' ? '#721c24' : '#383d41'
          }}>
            {vendor.status.toUpperCase()}
          </span>
        </div>

        <VendorActions 
          vendorId={vendorId} 
          currentStatus={vendor.status}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 30 }}>
        {/* Main Info */}
        <div>
          {/* Profile Data */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 25,
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ color: '#333', marginBottom: 20 }}>Business Information</h2>
            
            <div style={{ display: 'grid', gap: 15 }}>
              {Object.entries(profileData).map(([key, value]) => (
                <div key={key} style={{ 
                  display: 'flex',
                  borderBottom: '1px solid #eee',
                  paddingBottom: 10
                }}>
                  <div style={{ 
                    width: 150, 
                    color: '#666', 
                    fontSize: 14,
                    textTransform: 'capitalize'
                  }}>
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div style={{ flex: 1, color: '#333' }}>
                    {String(value) || 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Account */}
          {userProfile && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: 8,
              padding: 25,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h2 style={{ color: '#333', marginBottom: 20 }}>User Account</h2>
              
              <div style={{ display: 'grid', gap: 15 }}>
                <div style={{ display: 'flex', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Email</div>
                  <div style={{ flex: 1, color: '#333' }}>{userProfile.email}</div>
                </div>
                <div style={{ display: 'flex', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Display Name</div>
                  <div style={{ flex: 1, color: '#333' }}>{userProfile.display_name || 'N/A'}</div>
                </div>
                <div style={{ display: 'flex' }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Account Created</div>
                  <div style={{ flex: 1, color: '#333' }}>
                    {new Date(userProfile.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* Quick Stats */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 25,
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#333', marginBottom: 15 }}>Quick Stats</h3>
            
            <div style={{ marginBottom: 15 }}>
              <div style={{ color: '#666', fontSize: 14 }}>Vertical</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {vendor.vertical_id}
              </div>
            </div>
            
            <div style={{ marginBottom: 15 }}>
              <div style={{ color: '#666', fontSize: 14 }}>Listings</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {listingsCount || 0}
              </div>
            </div>
            
            <div style={{ marginBottom: 15 }}>
              <div style={{ color: '#666', fontSize: 14 }}>Applied</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {new Date(vendor.created_at).toLocaleDateString()}
              </div>
            </div>
            
            <div>
              <div style={{ color: '#666', fontSize: 14 }}>Last Updated</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {new Date(vendor.updated_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Vendor ID */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 25,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#333', marginBottom: 10 }}>Vendor ID</h3>
            <code style={{ 
              fontSize: 11, 
              color: '#666',
              backgroundColor: '#f8f9fa',
              padding: '8px 12px',
              borderRadius: 4,
              display: 'block',
              wordBreak: 'break-all'
            }}>
              {vendor.vendor_id}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Part 7: Create Vendor Actions Component

**Create:** `src/app/admin/vendors/[vendorId]/VendorActions.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface VendorActionsProps {
  vendorId: string
  currentStatus: string
}

export default function VendorActions({ vendorId, currentStatus }: VendorActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const updateStatus = async (newStatus: string) => {
    const confirmMessage = {
      approved: 'Approve this vendor? Their listings will become visible to buyers.',
      rejected: 'Reject this vendor? They will need to reapply.',
      suspended: 'Suspend this vendor? Their listings will be hidden.'
    }

    if (!confirm(confirmMessage[newStatus as keyof typeof confirmMessage] || `Change status to ${newStatus}?`)) {
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('vendor_profiles')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('vendor_id', vendorId)

    if (error) {
      alert('Failed to update status: ' + error.message)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {currentStatus === 'submitted' && (
        <>
          <button
            onClick={() => updateStatus('approved')}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => updateStatus('rejected')}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            ✗ Reject
          </button>
        </>
      )}

      {currentStatus === 'approved' && (
        <button
          onClick={() => updateStatus('suspended')}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Suspend
        </button>
      )}

      {currentStatus === 'suspended' && (
        <button
          onClick={() => updateStatus('approved')}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Reactivate
        </button>
      )}

      {currentStatus === 'rejected' && (
        <button
          onClick={() => updateStatus('approved')}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Approve
        </button>
      )}
    </div>
  )
}
```

---

## Part 8: Create All Vendors Page

**Create:** `src/app/admin/vendors/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

interface VendorsPageProps {
  searchParams: Promise<{ status?: string; vertical?: string }>
}

export default async function VendorsPage({ searchParams }: VendorsPageProps) {
  await requireAdmin()
  const { status, vertical } = await searchParams
  const supabase = createServerClient()

  // Build query
  let query = supabase
    .from('vendor_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  const { data: vendors } = await query

  // Get unique verticals for filter
  const { data: verticals } = await supabase
    .from('verticals')
    .select('vertical_id, name_public')
    .eq('is_active', true)

  return (
    <div>
      <h1 style={{ color: '#333', marginBottom: 30 }}>All Vendors</h1>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: 15,
        marginBottom: 30,
        padding: 20,
        backgroundColor: 'white',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: 5, color: '#666', fontSize: 14 }}>
            Status
          </label>
          <select
            defaultValue={status || ''}
            onChange={(e) => {
              const params = new URLSearchParams()
              if (e.target.value) params.set('status', e.target.value)
              if (vertical) params.set('vertical', vertical)
              window.location.href = `/admin/vendors${params.toString() ? '?' + params.toString() : ''}`
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              minWidth: 150
            }}
          >
            <option value="">All Statuses</option>
            <option value="submitted">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 5, color: '#666', fontSize: 14 }}>
            Vertical
          </label>
          <select
            defaultValue={vertical || ''}
            onChange={(e) => {
              const params = new URLSearchParams()
              if (status) params.set('status', status)
              if (e.target.value) params.set('vertical', e.target.value)
              window.location.href = `/admin/vendors${params.toString() ? '?' + params.toString() : ''}`
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              minWidth: 150
            }}
          >
            <option value="">All Verticals</option>
            {verticals?.map((v: any) => (
              <option key={v.vertical_id} value={v.vertical_id}>
                {v.name_public}
              </option>
            ))}
          </select>
        </div>

        {(status || vertical) && (
          <div style={{ alignSelf: 'flex-end' }}>
            <Link
              href="/admin/vendors"
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontSize: 14
              }}
            >
              Clear Filters
            </Link>
          </div>
        )}
      </div>

      {/* Results */}
      <div style={{ marginBottom: 15, color: '#666' }}>
        {vendors?.length || 0} vendor{vendors?.length !== 1 ? 's' : ''} found
      </div>

      {vendors && vendors.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Business</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Status</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Created</th>
                <th style={{ textAlign: 'right', padding: 15, color: '#666' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor: any) => {
                const profileData = vendor.profile_data as Record<string, any>
                const businessName = profileData?.business_name || profileData?.farm_name || 'Unknown'

                return (
                  <tr key={vendor.vendor_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15 }}>
                      <div style={{ fontWeight: 600, color: '#333' }}>{businessName}</div>
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: '#f0f0f0',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {vendor.vertical_id}
                      </span>
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: 
                          vendor.status === 'approved' ? '#d4edda' :
                          vendor.status === 'submitted' ? '#fff3cd' :
                          vendor.status === 'rejected' ? '#f8d7da' : '#e2e3e5',
                        color:
                          vendor.status === 'approved' ? '#155724' :
                          vendor.status === 'submitted' ? '#856404' :
                          vendor.status === 'rejected' ? '#721c24' : '#383d41'
                      }}>
                        {vendor.status}
                      </span>
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {new Date(vendor.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 15, textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendor.vendor_id}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: 4,
                          fontSize: 14
                        }}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center'
        }}>
          <p style={{ color: '#666' }}>No vendors found matching filters.</p>
        </div>
      )}
    </div>
  )
}
```

---

## Part 9: Create All Listings Page

**Create:** `src/app/admin/listings/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

interface ListingsPageProps {
  searchParams: Promise<{ status?: string; vertical?: string }>
}

export default async function AdminListingsPage({ searchParams }: ListingsPageProps) {
  await requireAdmin()
  const { status, vertical } = await searchParams
  const supabase = createServerClient()

  // Build query
  let query = supabase
    .from('listings')
    .select(`
      *,
      vendor_profiles!inner (
        vendor_id,
        profile_data,
        vertical_id
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  const { data: listings } = await query

  return (
    <div>
      <h1 style={{ color: '#333', marginBottom: 30 }}>All Listings</h1>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: 15,
        marginBottom: 30,
        padding: 20,
        backgroundColor: 'white',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: 5, color: '#666', fontSize: 14 }}>
            Status
          </label>
          <select
            defaultValue={status || ''}
            onChange={(e) => {
              const params = new URLSearchParams()
              if (e.target.value) params.set('status', e.target.value)
              if (vertical) params.set('vertical', vertical)
              window.location.href = `/admin/listings${params.toString() ? '?' + params.toString() : ''}`
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              minWidth: 150
            }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 5, color: '#666', fontSize: 14 }}>
            Vertical
          </label>
          <select
            defaultValue={vertical || ''}
            onChange={(e) => {
              const params = new URLSearchParams()
              if (status) params.set('status', status)
              if (e.target.value) params.set('vertical', e.target.value)
              window.location.href = `/admin/listings${params.toString() ? '?' + params.toString() : ''}`
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              minWidth: 150
            }}
          >
            <option value="">All Verticals</option>
            <option value="fireworks">Fireworks</option>
            <option value="farmers_market">Farmers Market</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div style={{ marginBottom: 15, color: '#666' }}>
        {listings?.length || 0} listing{listings?.length !== 1 ? 's' : ''} found
      </div>

      {listings && listings.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Title</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vendor</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Price</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Status</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing: any) => {
                const vendorData = listing.vendor_profiles?.profile_data as Record<string, any>
                const vendorName = vendorData?.business_name || vendorData?.farm_name || 'Unknown'

                return (
                  <tr key={listing.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15 }}>
                      <div style={{ fontWeight: 600, color: '#333' }}>{listing.title}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{listing.category}</div>
                    </td>
                    <td style={{ padding: 15, color: '#666' }}>
                      {vendorName}
                    </td>
                    <td style={{ padding: 15, color: '#333', fontWeight: 600 }}>
                      ${((listing.price_cents || 0) / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: 
                          listing.status === 'published' ? '#d4edda' :
                          listing.status === 'draft' ? '#e2e3e5' : '#fff3cd',
                        color:
                          listing.status === 'published' ? '#155724' :
                          listing.status === 'draft' ? '#383d41' : '#856404'
                      }}>
                        {listing.status}
                      </span>
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {new Date(listing.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center'
        }}>
          <p style={{ color: '#666' }}>No listings found.</p>
        </div>
      )}
    </div>
  )
}
```

---

## Part 10: Create Users Page

**Create:** `src/app/admin/users/page.tsx`

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'

export default async function UsersPage() {
  await requireAdmin()
  const supabase = createServerClient()

  const { data: users } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 style={{ color: '#333', marginBottom: 30 }}>All Users</h1>

      <div style={{ marginBottom: 15, color: '#666' }}>
        {users?.length || 0} user{users?.length !== 1 ? 's' : ''} total
      </div>

      {users && users.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Email</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Role</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.user_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 15, color: '#333' }}>{user.email}</td>
                  <td style={{ padding: 15, color: '#666' }}>{user.display_name || 'N/A'}</td>
                  <td style={{ padding: 15 }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: user.role === 'admin' ? '#e0e7ff' : '#f0f0f0',
                      color: user.role === 'admin' ? '#3730a3' : '#666'
                    }}>
                      {user.role || 'user'}
                    </span>
                  </td>
                  <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
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
          textAlign: 'center'
        }}>
          <p style={{ color: '#666' }}>No users found.</p>
        </div>
      )}
    </div>
  )
}
```

---

## Part 11: Test Admin Dashboard

### Test 1: Apply Migration & Set Admin
1. Apply admin role migration to Dev
2. Run SQL to make yourself admin:
   ```sql
   UPDATE user_profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL';
   ```
3. Verify with: `SELECT email, role FROM user_profiles WHERE role = 'admin';`

### Test 2: Access Admin Dashboard
1. Login with admin account
2. Visit http://localhost:3002/admin
3. ✅ Should see admin dashboard with stats
4. ✅ Sidebar navigation visible

### Test 3: Non-Admin Blocked
1. Login with regular user account
2. Visit http://localhost:3002/admin
3. ✅ Should redirect away (not authorized)

### Test 4: Pending Vendors
1. Go to /admin/vendors/pending
2. ✅ Shows pending vendor applications
3. Click "Review" on a vendor
4. ✅ Shows vendor detail page

### Test 5: Approve Vendor
1. On vendor detail page, click "Approve"
2. Confirm action
3. ✅ Status changes to "approved"
4. ✅ Vendor's listings now visible on browse page

### Test 6: Reject Vendor
1. Find a pending vendor
2. Click "Reject"
3. ✅ Status changes to "rejected"

### Test 7: Suspend Vendor
1. Find an approved vendor
2. Click "Suspend"
3. ✅ Status changes to "suspended"
4. ✅ Their listings hidden from browse

### Test 8: All Vendors Page
1. Go to /admin/vendors
2. ✅ Shows all vendors
3. ✅ Filters work (status, vertical)

### Test 9: All Listings Page
1. Go to /admin/listings
2. ✅ Shows all listings
3. ✅ Filters work

### Test 10: Users Page
1. Go to /admin/users
2. ✅ Shows all users
3. ✅ Shows role badges

---

## Migration Files Summary

**Files to create:**
```
supabase/migrations/20260106_HHMMSS_001_admin_role.sql
```

**After migration, run:**
```sql
UPDATE user_profiles SET role = 'admin' WHERE email = 'your@email.com';
```

---

## Session Summary Requirements

**Tasks Completed:**
- [ ] Created admin role migration
- [ ] Applied migration to Dev
- [ ] Set yourself as admin
- [ ] Created admin auth utility
- [ ] Created admin layout with sidebar
- [ ] Created admin dashboard with stats
- [ ] Created pending vendors page
- [ ] Created vendor detail/review page
- [ ] Created vendor actions component
- [ ] Created all vendors page with filters
- [ ] Created all listings page with filters
- [ ] Created users page
- [ ] All test scenarios passed
- [ ] Applied migration to Staging

**Migration Files Created:**
```
supabase/migrations/20260106_HHMMSS_001_admin_role.sql
  Purpose: Add role column to user_profiles
  Applied: ✅ Dev | ✅ Staging
```

**Files Created:**
```
src/lib/auth/admin.ts
src/app/admin/layout.tsx
src/app/admin/page.tsx
src/app/admin/vendors/page.tsx
src/app/admin/vendors/pending/page.tsx
src/app/admin/vendors/[vendorId]/page.tsx
src/app/admin/vendors/[vendorId]/VendorActions.tsx
src/app/admin/listings/page.tsx
src/app/admin/users/page.tsx
```

---

**Estimated Time:** 2-3 hours  
**Complexity:** Medium  
**Priority:** High - Essential for operations
