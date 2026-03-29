import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import VendorAdminActions from './VendorAdminActions'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface VendorDetailPageProps {
  params: Promise<{ vertical: string; vendorId: string }>
}

export default async function VerticalAdminVendorDetailPage({ params }: VendorDetailPageProps) {
  const { vertical, vendorId } = await params

  const supabase = await createClient()

  // Check auth + admin role
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin') ||
    userProfile?.role === 'platform_admin' || userProfile?.roles?.includes('platform_admin')
  if (!isAdmin) redirect(`/${vertical}/dashboard`)

  // Fetch vendor with user profile
  const serviceClient = createServiceClient()
  const { data: vendor, error } = await serviceClient
    .from('vendor_profiles')
    .select(`
      *,
      user_profiles!vendor_profiles_user_id_fkey (
        email,
        display_name,
        created_at
      )
    `)
    .eq('id', vendorId)
    .eq('vertical_id', vertical)
    .single()

  if (error || !vendor) notFound()

  const profileData = (vendor.profile_data as Record<string, unknown>) || {}
  const businessName = (profileData.business_name as string) || (profileData.farm_name as string) || 'Unknown'
  const userAccount = vendor.user_profiles as Record<string, unknown> | null
  const vendorStatus = vendor.status as string
  const eventApproved = !!(vendor.event_approved)
  const eventReadiness = profileData.event_readiness as Record<string, unknown> | null

  // Fetch listings count + verification in parallel
  const [listingsResult, verificationResult] = await Promise.all([
    serviceClient
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorId)
      .is('deleted_at', null),
    serviceClient
      .from('vendor_verifications')
      .select('status, coi_status, prohibited_items_acknowledged_at, onboarding_completed_at')
      .eq('vendor_profile_id', vendorId)
      .single(),
  ])

  const listingsCount = listingsResult.count || 0
  const verification = verificationResult.data

  // Onboarding gate statuses
  const categoryStatus = (verification?.status as string) || 'pending'
  const coiStatus = (verification?.coi_status as string) || 'not_submitted'
  const prohibitedAck = !!(verification?.prohibited_items_acknowledged_at)
  const onboardingComplete = !!(verification?.onboarding_completed_at)

  const gateStyle = (passed: boolean): React.CSSProperties => ({
    display: 'inline-block',
    padding: `2px ${spacing.xs}`,
    borderRadius: radius.full,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold as React.CSSProperties['fontWeight'],
    backgroundColor: passed ? '#d1fae5' : '#fef3c7',
    color: passed ? '#065f46' : '#92400e',
  })

  const statusBadge = (status: string): React.CSSProperties => {
    const map: Record<string, { bg: string; color: string }> = {
      approved: { bg: '#d1fae5', color: '#065f46' },
      submitted: { bg: '#fef3c7', color: '#92400e' },
      draft: { bg: '#e5e7eb', color: '#374151' },
      rejected: { bg: '#fef2f2', color: '#991b1b' },
      suspended: { bg: '#fef2f2', color: '#991b1b' },
    }
    const s = map[status] || map.draft
    return {
      display: 'inline-block',
      padding: `${spacing['3xs']} ${spacing.sm}`,
      borderRadius: radius.full,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as React.CSSProperties['fontWeight'],
      backgroundColor: s.bg,
      color: s.color,
    }
  }

  // Event readiness field display
  const eventReadinessFields = eventReadiness ? [
    { label: 'Vehicle Type', value: eventReadiness.vehicle_type === 'food_truck' ? 'Food Truck' : 'Food Trailer' },
    { label: 'Vehicle Length', value: `${eventReadiness.vehicle_length_feet} ft` },
    { label: 'Generator Required', value: eventReadiness.requires_generator ? 'Yes' : 'No' },
    ...(eventReadiness.requires_generator ? [
      { label: 'Generator Type', value: eventReadiness.generator_type === 'quiet_inverter' ? 'Quiet / Inverter' : 'Standard' },
      { label: 'Generator Fuel', value: (eventReadiness.generator_fuel as string) || 'N/A' },
    ] : []),
    { label: 'Max Runtime (no ext. power)', value: `${eventReadiness.max_runtime_hours} hours` },
    { label: 'Strong Odors', value: eventReadiness.strong_odors ? `Yes — ${eventReadiness.odor_description || ''}` : 'No' },
    { label: 'Perishability', value: (eventReadiness.food_perishability as string) || 'N/A' },
    { label: 'Packaging', value: (eventReadiness.packaging as string) || 'N/A' },
    { label: 'Utensils Required', value: eventReadiness.utensils_required ? 'Yes' : 'No' },
    { label: 'Seating Recommended', value: eventReadiness.seating_recommended ? 'Yes' : 'No' },
    { label: 'Max Headcount / Wave', value: `${eventReadiness.max_headcount_per_wave} people / 30 min` },
    { label: 'Event Experience', value: eventReadiness.has_event_experience ? `Yes — ${eventReadiness.event_experience_description || ''}` : 'No' },
    ...(eventReadiness.additional_notes ? [{ label: 'Notes', value: eventReadiness.additional_notes as string }] : []),
  ] : []

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.sm,
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: spacing.sm,
  }

  const fieldRow: React.CSSProperties = {
    display: 'flex',
    borderBottom: `1px solid ${colors.borderMuted}`,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: spacing.lg,
    }}>
      <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
        {/* Nav */}
        <AdminNav type="vertical" vertical={vertical} />

        {/* Header */}
        <div style={{ marginBottom: spacing.lg }}>
          <Link
            href={`/${vertical}/admin/vendors`}
            style={{ color: colors.primary, textDecoration: 'none', fontSize: typography.sizes.sm }}
          >
            ← Back to Vendors
          </Link>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.sm }}>
            <div>
              <h1 style={{ color: colors.primary, margin: 0, fontSize: typography.sizes['2xl'] }}>
                {businessName}
              </h1>
              <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                <span style={statusBadge(vendorStatus)}>{vendorStatus.toUpperCase()}</span>
                {eventApproved && (
                  <span style={{ ...statusBadge('approved') }}>EVENT APPROVED</span>
                )}
                {!eventApproved && eventReadiness?.application_status === 'pending_review' && (
                  <span style={{ ...statusBadge('submitted') }}>EVENT APPLICATION PENDING</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <VendorAdminActions
              vendorId={vendorId}
              vertical={vertical}
              currentStatus={vendorStatus}
              eventApproved={eventApproved}
              hasCoiApproved={coiStatus === 'approved'}
            />
          </div>
        </div>

        <div className="admin-grid-2" style={{ gap: spacing.lg }}>
          {/* Main Content */}
          <div>
            {/* Business Info */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Business Information</h2>
              <div style={fieldRow}>
                <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Business Name</div>
                <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{businessName}</div>
              </div>
              {!!profileData.legal_name && String(profileData.legal_name) !== businessName && (
                <div style={fieldRow}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Legal Name</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{String(profileData.legal_name)}</div>
                </div>
              )}
              {!!profileData.email && (
                <div style={fieldRow}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Email</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{String(profileData.email)}</div>
                </div>
              )}
              {!!profileData.phone && (
                <div style={fieldRow}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Phone</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{String(profileData.phone)}</div>
                </div>
              )}
              {!!profileData.vendor_type && (
                <div style={fieldRow}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Type</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>
                    {Array.isArray(profileData.vendor_type) ? (profileData.vendor_type as string[]).join(', ') : String(profileData.vendor_type)}
                  </div>
                </div>
              )}
              {!!profileData.description && (
                <div style={{ ...fieldRow, borderBottom: 'none' }}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Description</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{String(profileData.description)}</div>
                </div>
              )}
              {/* Link to public profile */}
              <div style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${colors.borderMuted}` }}>
                <Link
                  href={`/${vertical}/vendor/${vendorId}/profile`}
                  target="_blank"
                  style={{ color: colors.primary, textDecoration: 'none', fontSize: typography.sizes.sm }}
                >
                  View Public Profile →
                </Link>
              </div>
            </div>

            {/* Event Readiness Application */}
            {eventReadiness && !!eventReadiness.application_status && eventReadiness.application_status !== 'not_applied' && (
              <div style={{
                ...cardStyle,
                borderColor: eventReadiness.application_status === 'pending_review' ? '#fde68a' : colors.border,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Event Readiness Application</h2>
                  <span style={statusBadge(
                    eventReadiness.application_status === 'pending_review' ? 'submitted'
                    : eventReadiness.application_status === 'approved' ? 'approved'
                    : 'rejected'
                  )}>
                    {(eventReadiness.application_status as string).replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                {typeof eventReadiness.submitted_at === 'string' && (
                  <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                    Submitted {new Date(eventReadiness.submitted_at).toLocaleDateString()}
                    {typeof eventReadiness.updated_at === 'string' && eventReadiness.updated_at !== eventReadiness.submitted_at &&
                      ` · Updated ${new Date(eventReadiness.updated_at).toLocaleDateString()}`
                    }
                  </p>
                )}
                <div>
                  {eventReadinessFields.map((field, i) => (
                    <div key={i} style={fieldRow}>
                      <div style={{ width: 200, color: colors.textMuted, fontSize: typography.sizes.sm }}>{field.label}</div>
                      <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{String(field.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Onboarding Status */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Onboarding Status</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>Category Verification</span>
                  <span style={gateStyle(categoryStatus === 'approved')}>{categoryStatus === 'approved' ? 'Approved' : categoryStatus}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>Certificate of Insurance</span>
                  <span style={gateStyle(coiStatus === 'approved')}>{coiStatus === 'approved' ? 'Approved' : coiStatus.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>Prohibited Items Acknowledged</span>
                  <span style={gateStyle(prohibitedAck)}>{prohibitedAck ? 'Done' : 'Pending'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.xs, borderTop: `1px solid ${colors.borderMuted}` }}>
                  <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>Onboarding Complete</span>
                  <span style={gateStyle(onboardingComplete)}>{onboardingComplete ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

            {/* User Account */}
            {userAccount && (
              <div style={cardStyle}>
                <h2 style={sectionTitle}>User Account</h2>
                <div style={fieldRow}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Email</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{userAccount.email as string}</div>
                </div>
                <div style={fieldRow}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Display Name</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{(userAccount.display_name as string) || 'N/A'}</div>
                </div>
                <div style={{ ...fieldRow, borderBottom: 'none' }}>
                  <div style={{ width: 160, color: colors.textMuted, fontSize: typography.sizes.sm }}>Account Created</div>
                  <div style={{ flex: 1, color: colors.textPrimary, fontSize: typography.sizes.sm }}>{new Date(userAccount.created_at as string).toLocaleDateString()}</div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div>
            <div style={cardStyle}>
              <h3 style={{ ...sectionTitle, fontSize: typography.sizes.base }}>Quick Stats</h3>
              <div style={{ marginBottom: spacing.sm }}>
                <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Tier</div>
                <div style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  {(vendor.tier as string || 'free').charAt(0).toUpperCase() + (vendor.tier as string || 'free').slice(1)}
                </div>
              </div>
              <div style={{ marginBottom: spacing.sm }}>
                <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Listings</div>
                <div style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>{listingsCount}</div>
              </div>
              <div style={{ marginBottom: spacing.sm }}>
                <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Stripe Connected</div>
                <div style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  {vendor.stripe_account_id ? 'Yes' : 'No'}
                </div>
              </div>
              <div style={{ marginBottom: spacing.sm }}>
                <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Applied</div>
                <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>{new Date(vendor.created_at).toLocaleDateString()}</div>
              </div>
              <div>
                <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Last Updated</div>
                <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>{new Date(vendor.updated_at).toLocaleDateString()}</div>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ ...sectionTitle, fontSize: typography.sizes.base }}>Vendor ID</h3>
              <code style={{
                fontSize: 10,
                color: colors.textMuted,
                backgroundColor: colors.surfaceMuted,
                padding: spacing.xs,
                borderRadius: radius.sm,
                display: 'block',
                wordBreak: 'break-all',
              }}>
                {vendorId}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
