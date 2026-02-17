import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import VendorManagementClient from './VendorManagementClient'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'

// Cache for 2 minutes
export const revalidate = 120

interface AdminVendorsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{
    page?: string
    limit?: string
    search?: string
    status?: string
    tier?: string
  }>
}

export default async function AdminVendorsPage({ params, searchParams }: AdminVendorsPageProps) {
  const { vertical } = await params
  const {
    page = '1',
    limit = '20',
    search = '',
    status = '',
    tier = ''
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
    .from('vendor_profiles')
    .select(`
      id,
      user_id,
      status,
      tier,
      created_at,
      profile_data,
      market_vendors (
        market_id,
        markets (
          name
        )
      )
    `, { count: 'exact' })
    .eq('vertical_id', vertical)
    .order('created_at', { ascending: false })

  // Apply status filter
  if (status) {
    if (status === 'pending') {
      query = query.in('status', ['submitted', 'draft'])
    } else {
      query = query.eq('status', status)
    }
  }

  // Apply tier filter
  if (tier) {
    query = query.eq('tier', tier)
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: vendors, count, error } = await query

  if (error) {
    console.error('Error fetching vendors:', error)
  }

  // Client-side search filter (profile_data is JSONB)
  let filteredVendors = vendors || []
  if (search) {
    const searchLower = search.toLowerCase()
    filteredVendors = filteredVendors.filter(vendor => {
      const profileData = vendor.profile_data as Record<string, string> | null
      const businessName = profileData?.business_name?.toLowerCase() || ''
      const legalName = profileData?.legal_name?.toLowerCase() || ''
      const email = profileData?.email?.toLowerCase() || ''
      return businessName.includes(searchLower) ||
             legalName.includes(searchLower) ||
             email.includes(searchLower)
    })
  }

  // Calculate days pending for each vendor
  const vendorsWithDetails = filteredVendors.map(vendor => ({
    id: vendor.id as string,
    user_id: vendor.user_id as string,
    status: vendor.status as string,
    tier: vendor.tier as string | null,
    created_at: vendor.created_at as string,
    profile_data: vendor.profile_data as {
      business_name?: string
      legal_name?: string
      email?: string
      phone?: string
      vendor_type?: string | string[]
    } | null,
    days_pending: Math.floor(
      (new Date().getTime() - new Date(vendor.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ),
    user_email: (vendor.profile_data as Record<string, string> | null)?.email || 'Unknown',
    markets: ((vendor.market_vendors || []) as unknown as Array<{ market_id: string; markets: { name: string } | null }>)
  }))

  // Fetch verification records for all vendors on this page
  const vendorIds = vendorsWithDetails.map(v => v.id)
  const { data: verifications } = vendorIds.length > 0
    ? await serviceClient
        .from('vendor_verifications')
        .select('*')
        .in('vendor_profile_id', vendorIds)
    : { data: [] }

  // Build a map of vendorId → verification data
  const verificationsMap: Record<string, {
    status: string
    documents: Array<{ url: string; filename: string; type: string; uploaded_at: string }>
    notes: string | null
    reviewed_at: string | null
    requested_categories: string[]
    category_verifications: Record<string, { status: string; doc_type?: string; documents?: Array<{ url: string; filename: string; doc_type: string }>; notes?: string; reviewed_at?: string }>
    coi_status: string
    coi_documents: Array<{ url: string; filename: string; uploaded_at: string }>
    coi_verified_at: string | null
    prohibited_items_acknowledged_at: string | null
    onboarding_completed_at: string | null
  }> = {}
  for (const v of (verifications || [])) {
    verificationsMap[v.vendor_profile_id as string] = {
      status: (v.status as string) || 'pending',
      documents: Array.isArray(v.documents) ? v.documents as Array<{ url: string; filename: string; type: string; uploaded_at: string }> : [],
      notes: v.notes as string | null,
      reviewed_at: v.reviewed_at as string | null,
      requested_categories: (v.requested_categories || []) as string[],
      category_verifications: (v.category_verifications || {}) as Record<string, { status: string; doc_type?: string; documents?: Array<{ url: string; filename: string; doc_type: string }>; notes?: string; reviewed_at?: string }>,
      coi_status: (v.coi_status as string) || 'not_submitted',
      coi_documents: Array.isArray(v.coi_documents) ? v.coi_documents as Array<{ url: string; filename: string; uploaded_at: string }> : [],
      coi_verified_at: v.coi_verified_at as string | null,
      prohibited_items_acknowledged_at: v.prohibited_items_acknowledged_at as string | null,
      onboarding_completed_at: v.onboarding_completed_at as string | null,
    }
  }

  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

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
              Vendor Management
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `${spacing['3xs']} 0 0 0` }}>
              {branding.brand_name} - {totalCount.toLocaleString()} vendors
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

        {/* Vendor Management Component */}
        <VendorManagementClient
          vertical={vertical}
          vendors={vendorsWithDetails}
          verifications={verificationsMap}
          totalCount={totalCount}
          currentPage={currentPage}
          pageSize={pageSize}
          totalPages={totalPages}
          initialFilters={{ search, status, tier }}
        />
      </div>
    </div>
  )
}
