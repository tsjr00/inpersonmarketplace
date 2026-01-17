import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import VendorManagement from './VendorManagement'
import AdminNav from '@/components/admin/AdminNav'
import { hasPlatformAdminRole } from '@/lib/auth/admin'

interface AdminDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function AdminDashboardPage({ params }: AdminDashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Verify admin role - check BOTH columns during transition
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin') ||
    userProfile?.role === 'platform_admin' || userProfile?.roles?.includes('platform_admin')
  if (!isAdmin) {
    redirect(`/${vertical}/dashboard`)
  }

  // Check if user has platform admin privileges (can access global admin)
  const isPlatformAdmin = hasPlatformAdminRole(userProfile || {})

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get pending vendors for this vertical
  const { data: pendingVendors } = await supabase
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('vertical_id', vertical)
    .eq('status', 'submitted')

  // Get approved vendors count
  const { count: approvedCount } = await supabase
    .from('vendor_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', vertical)
    .eq('status', 'approved')

  // Get published listings count
  const { count: listingsCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vertical_id', vertical)
    .eq('status', 'published')
    .is('deleted_at', null)

  // Calculate stale vendors (pending 2+ days)
  const staleCount = pendingVendors?.filter(v => {
    const daysPending = Math.floor(
      (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysPending >= 2
  }).length || 0

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 40
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <div>
          <h1 style={{ color: branding.colors.primary, margin: 0 }}>
            Admin Panel
          </h1>
          <p style={{ fontSize: 14, color: branding.colors.secondary, margin: '5px 0 0 0' }}>
            {branding.brand_name} - Vendor Management
          </p>
        </div>
        <Link
          href={`/${vertical}/dashboard`}
          style={{
            color: branding.colors.primary,
            textDecoration: 'none',
            fontWeight: 500
          }}
        >
          ← Main Menu
        </Link>
      </div>

      {/* Admin Navigation */}
      <AdminNav type="vertical" vertical={vertical} />

      {/* Stale Vendor Warning */}
      {staleCount > 0 && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderLeft: '4px solid #f59e0b',
          borderRadius: 6,
          padding: 15,
          marginBottom: 25,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span style={{ color: '#92400e', fontWeight: 600 }}>
            {staleCount} vendor{staleCount > 1 ? 's' : ''} pending approval for 2+ days
          </span>
        </div>
      )}

      {/* Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20,
        marginBottom: 30
      }}>
        {/* Pending Vendors */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #f59e0b'
        }}>
          <div style={{ color: '#666', fontSize: 14, marginBottom: 5 }}>Pending Vendors</div>
          <div style={{ color: '#333', fontSize: 36, fontWeight: 'bold' }}>
            {pendingVendors?.length || 0}
          </div>
        </div>

        {/* Approved Vendors */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #10b981'
        }}>
          <div style={{ color: '#666', fontSize: 14, marginBottom: 5 }}>Approved Vendors</div>
          <div style={{ color: '#333', fontSize: 36, fontWeight: 'bold' }}>
            {approvedCount || 0}
          </div>
        </div>

        {/* Published Listings */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #8b5cf6'
        }}>
          <div style={{ color: '#666', fontSize: 14, marginBottom: 5 }}>Published Listings</div>
          <div style={{ color: '#333', fontSize: 36, fontWeight: 'bold' }}>
            {listingsCount || 0}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
        marginBottom: 30
      }}>
        <Link
          href={`/${vertical}/admin/markets`}
          style={{
            display: 'block',
            padding: '24px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', marginTop: 0, color: branding.colors.primary }}>
            Manage Markets
          </h3>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            Create and manage traditional farmers markets
          </p>
        </Link>
        <Link
          href={`/${vertical}/admin/users`}
          style={{
            display: 'block',
            padding: '24px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', marginTop: 0, color: branding.colors.primary }}>
            Manage Users
          </h3>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            View all users and their roles
          </p>
        </Link>
      </div>

      {/* Vendor Management Component */}
      <VendorManagement vertical={vertical} branding={branding} />

      {/* Link to Platform Admin - only visible to platform admins */}
      {isPlatformAdmin && (
        <div style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: 20,
          marginTop: 30
        }}>
          <Link
            href="/admin"
            style={{
              color: '#7c3aed',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: 14
            }}
          >
            Go to Platform Admin Dashboard →
          </Link>
        </div>
      )}
    </div>
  )
}
