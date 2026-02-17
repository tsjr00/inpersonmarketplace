import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import VendorActivityClient from './VendorActivityClient'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'

export const revalidate = 60

interface VendorActivityPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{
    status?: string
    reason?: string
  }>
}

export default async function VendorActivityPage({ params, searchParams }: VendorActivityPageProps) {
  const { vertical } = await params
  const { status = 'pending', reason = '' } = await searchParams

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

  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

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
              Vendor Activity Monitor
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `${spacing['3xs']} 0 0 0` }}>
              {branding.brand_name} - Review flagged inactive vendors
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

        {/* Vendor Activity Client Component */}
        <VendorActivityClient
          vertical={vertical}
          initialStatus={status}
          initialReason={reason}
        />
      </div>
    </div>
  )
}
