import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import VendorActions from './VendorActions'
import VendorLocationEditor from './VendorLocationEditor'
import VendorVerificationWrapper from './VendorVerificationWrapper'
import VendorFeeOverride from './VendorFeeOverride'

interface VendorDetailPageProps {
  params: Promise<{ vendorId: string }>
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { vendorId } = await params
  await requireAdmin()
  const supabase = createServiceClient()

  // Get vendor details (using id, not vendor_id)
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
    .eq('id', vendorId)
    .single()

  if (error || !vendor) {
    notFound()
  }

  const profileData = vendor.profile_data as Record<string, unknown>
  const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown'
  const userProfile = vendor.user_profiles as Record<string, unknown> | null
  const vendorStatus = vendor.status as string
  const verticalId = vendor.vertical_id as string
  const createdAt = vendor.created_at as string
  const updatedAt = vendor.updated_at as string
  const vendorLatitude = vendor.latitude as number | null
  const vendorLongitude = vendor.longitude as number | null

  // Get vendor's listings count
  const { count: listingsCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorId)
    .is('deleted_at', null)

  // Get vendor verification/onboarding data
  const { data: verification } = await supabase
    .from('vendor_verifications')
    .select('*')
    .eq('vendor_profile_id', vendorId)
    .single()

  const verificationData = verification ? {
    status: (verification.status as string) || 'pending',
    documents: Array.isArray(verification.documents) ? verification.documents as Array<{ url: string; filename: string; type: string; uploaded_at: string }> : [],
    notes: verification.notes as string | null,
    reviewed_at: verification.reviewed_at as string | null,
    requested_categories: (verification.requested_categories || []) as string[],
    category_verifications: (verification.category_verifications || {}) as Record<string, { status: string; doc_type?: string; documents?: Array<{ url: string; filename: string; doc_type: string }>; notes?: string; reviewed_at?: string }>,
    coi_status: (verification.coi_status as string) || 'not_submitted',
    coi_documents: Array.isArray(verification.coi_documents) ? verification.coi_documents as Array<{ url: string; filename: string; uploaded_at: string }> : [],
    coi_verified_at: verification.coi_verified_at as string | null,
    prohibited_items_acknowledged_at: verification.prohibited_items_acknowledged_at as string | null,
    onboarding_completed_at: verification.onboarding_completed_at as string | null,
  } : null

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 30
      }}>
        <div>
          <Link
            href="/admin/vendors"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              color: '#0070f3',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid #0070f3',
              borderRadius: 6,
              backgroundColor: 'white',
              minHeight: 36,
            }}
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
              vendorStatus === 'approved' ? '#d4edda' :
              vendorStatus === 'submitted' ? '#fff3cd' :
              vendorStatus === 'rejected' ? '#f8d7da' : '#e2e3e5',
            color:
              vendorStatus === 'approved' ? '#155724' :
              vendorStatus === 'submitted' ? '#856404' :
              vendorStatus === 'rejected' ? '#721c24' : '#383d41'
          }}>
            {vendorStatus.toUpperCase()}
          </span>
          {vendor.event_approved && (
            <span style={{
              display: 'inline-block',
              marginTop: 10,
              marginLeft: 8,
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: '#d1fae5',
              color: '#065f46',
            }}>
              ✓ EVENT APPROVED
            </span>
          )}
          {!vendor.event_approved && (profileData?.event_readiness as Record<string, unknown>)?.application_status === 'pending_review' && (
            <span style={{
              display: 'inline-block',
              marginTop: 10,
              marginLeft: 8,
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: '#fff3cd',
              color: '#856404',
            }}>
              EVENT APPLICATION PENDING
            </span>
          )}
        </div>

        <VendorActions
          vendorId={vendorId}
          currentStatus={vendorStatus}
          vendorLatitude={vendorLatitude}
          vendorLongitude={vendorLongitude}
          eventApproved={!!(vendor.event_approved)}
          verticalId={verticalId}
          onboardingComplete={!!verificationData?.onboarding_completed_at}
        />
      </div>

      <div className="admin-detail-main-side">
        {/* Main Info */}
        <div style={{ minWidth: 0 }}>
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
                <div key={key} className="admin-data-row">
                  <div className="admin-data-row-label">
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div className="admin-data-row-value">
                    {String(value) || 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Certifications & Documents */}
          {vendor.certifications && Array.isArray(vendor.certifications) && (vendor.certifications as Array<Record<string, unknown>>).length > 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: 8,
              padding: 25,
              marginBottom: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h2 style={{ color: '#333', marginBottom: 20 }}>Certifications & Documents</h2>

              <div style={{ display: 'grid', gap: 12 }}>
                {(vendor.certifications as Array<Record<string, unknown>>).map((cert, i) => (
                  <div key={i} style={{
                    padding: 12,
                    backgroundColor: '#f8f9fa',
                    borderRadius: 6,
                    border: '1px solid #eee'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>
                          {cert.label as string || cert.type as string}
                        </div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                          #{cert.registration_number as string} — {cert.state as string}
                          {cert.expires_at ? ` — Expires: ${new Date(cert.expires_at as string).toLocaleDateString()}` : null}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: cert.verified ? '#d4edda' : '#fff3cd',
                        color: cert.verified ? '#155724' : '#856404'
                      }}>
                        {cert.verified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>
                    {cert.document_url ? (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={cert.document_url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            backgroundColor: '#0070f3',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 12,
                            textDecoration: 'none',
                            fontWeight: 500
                          }}
                        >
                          View Document {(cert.document_url as string).endsWith('.pdf') ? '(PDF)' : '(Image)'}
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Readiness Application */}
          {(profileData?.event_readiness as Record<string, unknown>)?.application_status &&
           (profileData?.event_readiness as Record<string, unknown>)?.application_status !== 'not_applied' && (() => {
            const er = profileData.event_readiness as Record<string, unknown>
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
              <details style={{
                backgroundColor: 'white',
                borderRadius: 8,
                padding: 25,
                marginBottom: 20,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <summary style={{ cursor: 'pointer', color: '#333', fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
                  Event Readiness Application
                  {typeof er.submitted_at === 'string' && (
                    <span style={{ fontSize: 13, fontWeight: 400, color: '#666', marginLeft: 10 }}>
                      Submitted {new Date(er.submitted_at).toLocaleDateString()}
                    </span>
                  )}
                </summary>
                <div style={{ display: 'grid', gap: 10, marginTop: 15 }}>
                  {fieldRows.map((row, i) => (
                    <div key={i} className="admin-data-row">
                      <div className="admin-data-row-label">{row.label}</div>
                      <div className="admin-data-row-value">{row.value}</div>
                    </div>
                  ))}
                </div>
              </details>
            )
          })()}

          {/* Vendor Verification / Onboarding */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 25,
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ color: '#333', marginBottom: 20 }}>Vendor Onboarding</h2>
            <VendorVerificationWrapper
              vendorId={vendorId}
              verification={verificationData}
            />
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
                <div className="admin-data-row">
                  <div className="admin-data-row-label">Email</div>
                  <div className="admin-data-row-value">{userProfile.email as string}</div>
                </div>
                <div className="admin-data-row">
                  <div className="admin-data-row-label">Display Name</div>
                  <div className="admin-data-row-value">{(userProfile.display_name as string) || 'N/A'}</div>
                </div>
                <div className="admin-data-row">
                  <div className="admin-data-row-label">Account Created</div>
                  <div className="admin-data-row-value">
                    {new Date(userProfile.created_at as string).toLocaleDateString()}
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
                {verticalId}
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
                {new Date(createdAt).toLocaleDateString()}
              </div>
            </div>

            <div>
              <div style={{ color: '#666', fontSize: 14 }}>Last Updated</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {new Date(updatedAt).toLocaleDateString()}
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
              {vendorId}
            </code>
          </div>

          {/* Location Editor */}
          <VendorLocationEditor
            vendorId={vendorId}
            currentLatitude={vendorLatitude}
            currentLongitude={vendorLongitude}
          />

          {/* Fee Discount Override */}
          <div style={{ marginTop: 20 }}>
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
