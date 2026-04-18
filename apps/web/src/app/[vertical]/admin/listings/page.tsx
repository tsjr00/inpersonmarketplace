import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import ListingsTableClient from './ListingsTableClient'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'

// Cache for 2 minutes
export const revalidate = 120

interface AdminListingsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{
    page?: string
    limit?: string
    search?: string
    status?: string
    category?: string
  }>
}

export default async function AdminListingsPage({ params, searchParams }: AdminListingsPageProps) {
  const { vertical } = await params
  const {
    page = '1',
    limit = '20',
    search = '',
    status = '',
    category = ''
  } = await searchParams

  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Verify admin role
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

  // Parse pagination params
  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  // Use service client for full access
  const serviceClient = createServiceClient()

  // Build query with server-side filtering
  let query = serviceClient
    .from('listings')
    .select(`
      id,
      title,
      status,
      price_cents,
      quantity,
      category,
      created_at,
      vendor_profiles!inner (
        id,
        tier,
        profile_data
      )
    `, { count: 'exact' })
    .eq('vertical_id', vertical)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Apply status filter
  if (status) {
    query = query.eq('status', status)
  }

  // Apply category filter
  if (category) {
    query = query.eq('category', category)
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: listings, count, error } = await query

  if (error) {
    console.error('Error fetching listings:', error)
  }

  // Client-side search filter
  let filteredListings = listings || []
  if (search) {
    const searchLower = search.toLowerCase()
    filteredListings = filteredListings.filter(listing => {
      const title = (listing.title as string || '').toLowerCase()
      const vendorProfile = listing.vendor_profiles as unknown as Record<string, unknown> | null
      const profileData = vendorProfile?.profile_data as Record<string, string> | null
      const vendorName = profileData?.business_name?.toLowerCase() || profileData?.farm_name?.toLowerCase() || ''
      return title.includes(searchLower) || vendorName.includes(searchLower)
    })
  }

  // Get unique categories for filter
  const { data: categoriesList } = await serviceClient
    .from('listings')
    .select('category')
    .eq('vertical_id', vertical)
    .is('deleted_at', null)
    .not('category', 'is', null)

  const uniqueCategories = [...new Set(categoriesList?.map(c => c.category as string).filter(Boolean))].sort()

  // Type the listings properly (vendor_profiles comes as array from join, take first)
  const typedListings = filteredListings.map(listing => ({
    id: listing.id as string,
    title: listing.title as string,
    status: listing.status as string,
    price_cents: listing.price_cents as number,
    quantity: (listing as Record<string, unknown>).quantity as number | null,
    category: listing.category as string | null,
    created_at: listing.created_at as string,
    vendor_profiles: (() => {
      const vp = Array.isArray(listing.vendor_profiles)
        ? listing.vendor_profiles[0]
        : listing.vendor_profiles
      if (!vp) return null
      return {
        id: (vp as Record<string, unknown>).id as string,
        tier: (vp as Record<string, unknown>).tier as string | null,
        profile_data: (vp as Record<string, unknown>).profile_data as {
          business_name?: string
          farm_name?: string
        } | null,
      }
    })()
  }))

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary,
      padding: spacing.lg
    }}>
      <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          <div>
            <h1 style={{ color: colors.primary, margin: 0, fontSize: typography.sizes['2xl'] }}>
              Listings Management
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `${spacing['3xs']} 0 0 0` }}>
              {totalCount.toLocaleString()} listings
            </p>
          </div>
          <Link
            href={`/${vertical}/admin`}
            style={{
              color: colors.primary,
              textDecoration: 'none',
              fontWeight: typography.weights.medium,
              fontSize: typography.sizes.sm
            }}
          >
            ← Back to Admin
          </Link>
        </div>

        {/* Admin Navigation */}
        <AdminNav type="vertical" vertical={vertical} />

        {/* Listings Table */}
        <ListingsTableClient
          vertical={vertical}
          listings={typedListings}
          categories={uniqueCategories}
          totalCount={totalCount}
          currentPage={currentPage}
          pageSize={pageSize}
          totalPages={totalPages}
          initialFilters={{ search, status, category }}
        />
      </div>
    </div>
  )
}
