import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import VendorActions from './VendorActions'
import VendorLocationEditor from './VendorLocationEditor'
import VendorVerificationWrapper from './VendorVerificationWrapper'

interface VendorDetailPageProps {
  params: Promise<{ vendorId: string }>
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { vendorId } = await params
  await requireAdmin()
  const supabase = await createClient()

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
        marginBottom: 30
      }}>
        <div>
          <Link
            href="/admin/vendors"
            style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}
          >
            Back to Vendors
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
        </div>

        <VendorActions
          vendorId={vendorId}
          currentStatus={vendorStatus}
          vendorLatitude={vendorLatitude}
          vendorLongitude={vendorLongitude}
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
                <div style={{ display: 'flex', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Email</div>
                  <div style={{ flex: 1, color: '#333' }}>{userProfile.email as string}</div>
                </div>
                <div style={{ display: 'flex', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Display Name</div>
                  <div style={{ flex: 1, color: '#333' }}>{(userProfile.display_name as string) || 'N/A'}</div>
                </div>
                <div style={{ display: 'flex' }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Account Created</div>
                  <div style={{ flex: 1, color: '#333' }}>
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
        </div>
      </div>
    </div>
  )
}
