/**
 * Vendor detail — server side of the merged vendor detail page (admin UI
 * rebuild phase 4, owner 2026-08-31). Both routes render this:
 * /[vertical]/admin/vendors/[vendorId] (scoped) and /admin/vendors/[vendorId]
 * (any vertical). Superset of the two former details:
 *   from the platform copy — the full profile_data dump, Certifications &
 *   Documents (signed VendorDocLink), the FULL interactive
 *   VendorVerificationPanel, the Location Editor (approval gate), the
 *   Vendor Fee Override (⚠ money — component + API untouched), and the
 *   complete status action set (approve / reject / suspend / reactivate
 *   with the coordinates gate);
 *   from the vertical copy — the design-token layout, the onboarding gate
 *   summary, the public-profile link, tier + Stripe in Quick Stats, and the
 *   event-approval toggle whose rule is the stricter superset
 *   (FT + FM, COI-gated, T-62 not-applied warning) — see
 *   VendorEventApproval; the platform copy's FT-only ungated toggle is
 *   retired in its favor.
 *
 * `vertical === undefined` = platform route (no vertical constraint on the
 * lookup); the scoped route 404s a vendor outside its vertical, as before.
 */

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import VendorStatusActions from '@/components/admin/VendorStatusActions'
import VendorEventApproval from '@/components/admin/VendorEventApproval'
import VendorVerificationWrapper from '@/components/admin/VendorVerificationWrapper'
import VendorLocationEditor from '@/components/admin/VendorLocationEditor'
import VendorFeeOverride from '@/components/admin/VendorFeeOverride'
import VendorDocLink, { extractVendorDocPathFromPublicUrl } from '@/components/shared/VendorDocLink'
import { getEventApplicationState } from '@/lib/vendor-event-application'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface VendorDetailAdminPageProps {
  vendorId: string
  /** Set on the vertical route; constrains the lookup (404 outside). */
  vertical?: string
}

export default async function VendorDetailAdminPage({ vendorId, vertical }: VendorDetailAdminPageProps) {
  const supabase = createServiceClient()

  let vendorQuery = supabase
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
  if (vertical) vendorQuery = vendorQuery.eq('vertical_id', vertical)
  const { data: vendor, error } = await vendorQuery.single()

  if (error || !vendor) {
    notFound()
  }

  const profileData = (vendor.profile_data as Record<string, unknown>) || {}
  const eventApplication = getEventApplicationState(profileData)
  const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown'
  const userAccount = vendor.user_profiles as Record<string, unknown> | null
  const vendorStatus = vendor.status as string
  const verticalId = vendor.vertical_id as string
  const vendorLatitude = vendor.latitude as number | null
  const vendorLongitude = vendor.longitude as number | null
  const eventReadiness = profileData.event_readiness as Record<string, unknown> | null

  const [listingsResult, verificationResult] = await Promise.all([
    supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorId)
      .is('deleted_at', null),
    supabase
      .from('vendor_verifications')
      .select('*')
      .eq('vendor_profile_id', vendorId)
      .single(),
  ])
  const listingsCount = listingsResult.count || 0
  const verification = verificationResult.data

  const verificationData = verification ? {
    status: (verification.status as string) || 'pending',
    documents: Array.isArray(verification.documents) ? verification.documents as Array<{ url: string; path: string; filename: string; type: string; uploaded_at: string }> : [],
    notes: verification.notes as string | null,
    reviewed_at: verification.reviewed_at as string | null,
    requested_categories: (verification.requested_categories || []) as string[],
    category_verifications: (verification.category_verifications || {}) as Record<string, { status: string; doc_type?: string; documents?: Array<{ url: string; path: string; filename: string; doc_type: string }>; notes?: string; reviewed_at?: string }>,
    coi_status: (verification.coi_status as string) || 'not_submitted',
    coi_documents: Array.isArray(verification.coi_documents) ? verification.coi_documents as Array<{ url: string; path: string; filename: string; uploaded_at: string }> : [],
    coi_verified_at: verification.coi_verified_at as string | null,
    prohibited_items_acknowledged_at: verification.prohibited_items_acknowledged_at as string | null,
    onboarding_completed_at: verification.onboarding_completed_at as string | null,
  } : null

  const coiStatus = verificationData?.coi_status || 'not_submitted'

  const badge = (bg: string, color: string, text: string) => (
    <span style={{
      display: 'inline-block',
      padding: `${spacing['3xs']} ${spacing.sm}`,
      borderRadius: radius.full,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      backgroundColor: bg,
      color,
    }}>
      {text}
    </span>
  )

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white',
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: shadows.sm,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: spacing.sm,
  }

  const backHref = vertical ? `/${vertical}/admin/vendors` : `/${verticalId}/admin/vendors`

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.lg }}>
        <Link
          href={backHref}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', color: colors.primary, textDecoration: 'none', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, border: `1px solid ${colors.primary}`, borderRadius: radius.sm, backgroundColor: 'white', minHeight: 36 }}
        >
          ← Back to Vendors
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginTop: spacing.sm }}>
          <div>
            <h1 style={{ color: colors.textPrimary, margin: 0, fontSize: typography.sizes['2xl'] }}>{businessName}</h1>
            <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
              {badge(
                vendorStatus === 'approved' ? '#d1fae5' : vendorStatus === 'rejected' || vendorStatus === 'suspended' ? '#fef2f2' : '#fef3c7',
                vendorStatus === 'approved' ? '#065f46' : vendorStatus === 'rejected' || vendorStatus === 'suspended' ? '#991b1b' : '#92400e',
                vendorStatus.toUpperCase()
              )}
              {!vertical && badge('#f3f4f6', '#374151', verticalId)}
              {!!vendor.event_approved && badge('#d1fae5', '#065f46', '✓ EVENT APPROVED')}
              {!vendor.event_approved && eventApplication.isPendingReview && badge('#fef3c7', '#92400e', 'EVENT APPLICATION PENDING')}
            </div>
          </div>
        </div>

        {/* Actions: account status + event approval */}
        <div style={{ marginTop: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <VendorStatusActions
            vendorId={vendorId}
            currentStatus={vendorStatus}
            vendorLatitude={vendorLatitude}
            vendorLongitude={vendorLongitude}
            onboardingComplete={!!verificationData?.onboarding_completed_at}
          />
          <VendorEventApproval
            vendorId={vendorId}
            vertical={verticalId}
            currentStatus={vendorStatus}
            eventApproved={!!vendor.event_approved}
            hasCoiApproved={coiStatus === 'approved'}
            hasApplied={eventApplication.hasApplied}
          />
        </div>
      </div>

      <div className="admin-detail-main-side">
        {/* Main column */}
        <div style={{ minWidth: 0 }}>
          {/* Business Information — full profile_data dump (platform superset) */}
          <div style={cardStyle}>
            <h2 style={sectionTitle}>Business Information</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {Object.entries(profileData)
                .filter(([key]) => key !== 'event_readiness')
                .map(([key, value]) => (
                  <div key={key} className="admin-data-row">
                    <div className="admin-data-row-label">{key.replace(/_/g, ' ')}</div>
                    <div className="admin-data-row-value">
                      {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '') || 'N/A'}
                    </div>
                  </div>
                ))}
            </div>
            <div style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${colors.borderMuted}` }}>
              <Link
                href={`/${verticalId}/vendor/${vendorId}/profile`}
                target="_blank"
                style={{ color: colors.primary, textDecoration: 'none', fontSize: typography.sizes.sm }}
              >
                View Public Profile →
              </Link>
            </div>
          </div>

          {/* Certifications & Documents (platform superset) */}
          {vendor.certifications && Array.isArray(vendor.certifications) && (vendor.certifications as Array<Record<string, unknown>>).length > 0 && (
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Certifications &amp; Documents</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {(vendor.certifications as Array<Record<string, unknown>>).map((cert, i) => (
                  <div key={i} style={{ padding: 12, backgroundColor: '#f8f9fa', borderRadius: 6, border: '1px solid #eee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>
                          {(cert.label as string) || (cert.type as string)}
                        </div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                          #{cert.registration_number as string} — {cert.state as string}
                          {cert.expires_at ? ` — Expires: ${new Date(cert.expires_at as string).toLocaleDateString()}` : null}
                        </div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: cert.verified ? '#d4edda' : '#fff3cd', color: cert.verified ? '#155724' : '#856404' }}>
                        {cert.verified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>
                    {cert.document_url ? (
                      <div style={{ marginTop: 8 }}>
                        {(() => {
                          const certPath = extractVendorDocPathFromPublicUrl(cert.document_url as string)
                          if (!certPath) {
                            return <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>Document unavailable</span>
                          }
                          return (
                            <VendorDocLink
                              path={certPath}
                              style={{ display: 'inline-block', padding: '4px 10px', backgroundColor: colors.primary, color: 'white', borderRadius: 4, fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
                            >
                              View Document {(cert.document_url as string).endsWith('.pdf') ? '(PDF)' : '(Image)'}
                            </VendorDocLink>
                          )
                        })()}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Readiness Application */}
          {eventReadiness && eventApplication.hasApplied && (() => {
            const er = eventReadiness
            const fieldRows: Array<{ label: string; value: string }> = [
              { label: 'Vehicle Type', value: er.vehicle_type === 'food_truck' ? 'Food Truck' : 'Food Trailer (truck + trailer)' },
              { label: 'Vehicle Length', value: `${er.vehicle_length_feet} feet` },
              { label: 'Requires Generator', value: er.requires_generator ? 'Yes' : 'No' },
              ...(er.requires_generator ? [
                { label: 'Generator Type', value: er.generator_type === 'quiet_inverter' ? 'Quiet / Inverter' : 'Standard' },
                { label: 'Generator Fuel', value: er.generator_fuel === 'propane' ? 'Propane (minimal smell)' : er.generator_fuel === 'gasoline' ? 'Gasoline' : 'Diesel' },
              ] : []),
              { label: 'Max Runtime (no external power)', value: `${er.max_runtime_hours} hours` },
              { label: 'Strong Cooking Odors', value: er.strong_odors ? `Yes — ${er.odor_description || ''}` : 'No' },
              { label: 'Food Perishability', value: er.food_perishability === 'immediate' ? 'Must eat immediately' : er.food_perishability === 'within_15_min' ? 'Best within 15 min' : 'Can sit 30+ min' },
              { label: 'Packaging', value: (er.packaging as string) || 'N/A' },
              { label: 'Utensils Required', value: er.utensils_required ? 'Yes' : 'No' },
              { label: 'Seating Recommended', value: er.seating_recommended ? 'Yes' : 'No' },
              { label: 'Max Headcount Per Wave', value: `${er.max_headcount_per_wave} people / 30 min` },
              { label: 'Event Experience', value: er.has_event_experience ? `Yes — ${er.event_experience_description || ''}` : 'No' },
              ...(er.additional_notes ? [{ label: 'Additional Notes', value: er.additional_notes as string }] : []),
            ]
            return (
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs, flexWrap: 'wrap' }}>
                  <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Event Readiness Application</h2>
                  {typeof er.application_status === 'string' && badge(
                    er.application_status === 'approved' ? '#d1fae5' : er.application_status === 'pending_review' ? '#fef3c7' : '#fef2f2',
                    er.application_status === 'approved' ? '#065f46' : er.application_status === 'pending_review' ? '#92400e' : '#991b1b',
                    er.application_status.replace(/_/g, ' ').toUpperCase()
                  )}
                </div>
                {typeof er.submitted_at === 'string' && (
                  <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                    Submitted {new Date(er.submitted_at).toLocaleDateString()}
                  </p>
                )}
                <div style={{ display: 'grid', gap: 10 }}>
                  {fieldRows.map((row, i) => (
                    <div key={i} className="admin-data-row">
                      <div className="admin-data-row-label">{row.label}</div>
                      <div className="admin-data-row-value">{String(row.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Vendor Onboarding — the FULL interactive panel (platform superset) */}
          <div style={cardStyle}>
            <h2 style={sectionTitle}>Vendor Onboarding</h2>
            <VendorVerificationWrapper
              vendorId={vendorId}
              verification={verificationData}
              vertical={verticalId}
            />
          </div>

          {/* User Account */}
          {userAccount && (
            <div style={cardStyle}>
              <h2 style={sectionTitle}>User Account</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="admin-data-row">
                  <div className="admin-data-row-label">Email</div>
                  <div className="admin-data-row-value">{userAccount.email as string}</div>
                </div>
                <div className="admin-data-row">
                  <div className="admin-data-row-label">Display Name</div>
                  <div className="admin-data-row-value">{(userAccount.display_name as string) || 'N/A'}</div>
                </div>
                <div className="admin-data-row">
                  <div className="admin-data-row-label">Account Created</div>
                  <div className="admin-data-row-value">{new Date(userAccount.created_at as string).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* Quick Stats — union of both copies */}
          <div style={cardStyle}>
            <h3 style={{ ...sectionTitle, fontSize: typography.sizes.base }}>Quick Stats</h3>
            <div style={{ marginBottom: spacing.sm }}>
              <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Vertical</div>
              <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>{verticalId}</div>
            </div>
            <div style={{ marginBottom: spacing.sm }}>
              <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Tier</div>
              <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                {((vendor.tier as string) || 'free').charAt(0).toUpperCase() + ((vendor.tier as string) || 'free').slice(1)}
              </div>
            </div>
            <div style={{ marginBottom: spacing.sm }}>
              <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Listings</div>
              <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>{listingsCount}</div>
            </div>
            <div style={{ marginBottom: spacing.sm }}>
              <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Stripe Connected</div>
              <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: vendor.stripe_account_id ? '#166534' : '#991b1b' }}>
                {vendor.stripe_account_id ? 'Yes' : 'No'}
              </div>
            </div>
            <div style={{ marginBottom: spacing.sm }}>
              <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Applied</div>
              <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>{new Date(vendor.created_at as string).toLocaleDateString()}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Last Updated</div>
              <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>{new Date(vendor.updated_at as string).toLocaleDateString()}</div>
            </div>
          </div>

          {/* Vendor ID */}
          <div style={cardStyle}>
            <h3 style={{ ...sectionTitle, fontSize: typography.sizes.base }}>Vendor ID</h3>
            <code style={{ fontSize: 11, color: colors.textMuted, backgroundColor: colors.surfaceMuted, padding: '8px 12px', borderRadius: 4, display: 'block', wordBreak: 'break-all' }}>
              {vendorId}
            </code>
          </div>

          {/* Location Editor (approval gate lives on these coordinates) */}
          <VendorLocationEditor
            vendorId={vendorId}
            currentLatitude={vendorLatitude}
            currentLongitude={vendorLongitude}
          />

          {/* Fee Discount Override — ⚠ money; component + API untouched */}
          <div style={{ marginTop: spacing.md }}>
            <VendorFeeOverride
              vendorId={vendorId}
              currentOverridePercent={vendor.vendor_fee_override_percent as number | null}
              feeDiscountCode={vendor.fee_discount_code as string | null}
              approvedAt={vendor.fee_discount_approved_at as string | null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
