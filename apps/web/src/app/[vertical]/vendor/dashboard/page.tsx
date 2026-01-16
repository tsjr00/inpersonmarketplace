import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import EditProfileButton from './EditProfileButton'

interface VendorDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function VendorDashboardPage({ params }: VendorDashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for THIS vertical
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  // If no vendor profile, redirect to vendor signup
  if (vendorError || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get user profile for display name
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('display_name, email')
    .eq('user_id', user.id)
    .single()

  // Parse profile_data JSON
  const profileData = vendorProfile.profile_data as Record<string, unknown>

  // Get draft listings count for approved vendors
  let draftCount = 0
  if (vendorProfile.status === 'approved') {
    const { data: draftListings } = await supabase
      .from('listings')
      .select('id')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'draft')
      .is('deleted_at', null)

    draftCount = draftListings?.length || 0
  }

  // Get active markets/pickup locations from published listings
  interface ActiveMarket {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
    day_of_week: number | null
    start_time: string | null
    end_time: string | null
  }

  let activeMarkets: ActiveMarket[] = []
  if (vendorProfile.status === 'approved') {
    // Get published listings with their markets
    const { data: listingsWithMarkets } = await supabase
      .from('listings')
      .select(`
        id,
        listing_markets (
          market_id,
          markets (
            id,
            name,
            market_type,
            address,
            city,
            state,
            day_of_week,
            start_time,
            end_time
          )
        )
      `)
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'published')
      .is('deleted_at', null)

    // Extract unique markets
    const marketMap = new Map<string, ActiveMarket>()
    listingsWithMarkets?.forEach(listing => {
      const listingMarkets = listing.listing_markets as unknown as Array<{
        market_id: string
        markets: ActiveMarket | null
      }> | null
      listingMarkets?.forEach(lm => {
        if (lm.markets && !marketMap.has(lm.markets.id)) {
          marketMap.set(lm.markets.id, lm.markets)
        }
      })
    })
    activeMarkets = Array.from(marketMap.values())
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const traditionalMarkets = activeMarkets.filter(m => m.market_type === 'traditional')
  const privatePickups = activeMarkets.filter(m => m.market_type === 'private_pickup')

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text
    }}
    className="vendor-dashboard"
    >
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: `2px solid ${branding.colors.primary}`
        }}>
          <h1 style={{
            color: branding.colors.primary,
            margin: 0,
            fontSize: 28,
            fontWeight: 'bold'
          }}>
            Vendor Dashboard
          </h1>
          <p style={{
            fontSize: 14,
            color: branding.colors.secondary,
            margin: '4px 0 0 0'
          }}>
            {branding.brand_name}
          </p>
        </div>

        {/* Status Banner - full width */}
        <div style={{
          padding: 16,
          marginBottom: 24,
          backgroundColor:
            vendorProfile.status === 'approved' ? '#d1fae5' :
            vendorProfile.status === 'submitted' ? '#fef3c7' :
            vendorProfile.status === 'rejected' ? '#fee2e2' : '#e5e7eb',
          border: `1px solid ${
            vendorProfile.status === 'approved' ? '#a7f3d0' :
            vendorProfile.status === 'submitted' ? '#fcd34d' :
            vendorProfile.status === 'rejected' ? '#fecaca' : '#d1d5db'
          }`,
          borderRadius: 8,
          color: '#333'
        }}>
          <div className="status-banner-content" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <strong style={{
                fontSize: 16,
                color: vendorProfile.status === 'approved' ? '#065f46' :
                       vendorProfile.status === 'submitted' ? '#92400e' :
                       vendorProfile.status === 'rejected' ? '#991b1b' : '#374151'
              }}>
                Status: {vendorProfile.status.charAt(0).toUpperCase() + vendorProfile.status.slice(1)}
              </strong>
              <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#666' }}>
                {vendorProfile.status === 'approved' && 'Your vendor profile is approved and active'}
                {vendorProfile.status === 'submitted' && 'Your profile is under review'}
                {vendorProfile.status === 'rejected' && 'Your profile needs updates'}
                {vendorProfile.status === 'suspended' && 'Your profile is currently suspended'}
                {vendorProfile.status === 'draft' && 'Your profile is saved as draft'}
              </p>
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              Submitted: {new Date(vendorProfile.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Draft Listings Notice - for approved vendors with drafts */}
        {draftCount > 0 && vendorProfile.status === 'approved' && (
          <div style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: '#dbeafe',
            border: '1px solid #93c5fd',
            borderRadius: 8,
            color: '#1e40af'
          }}>
            <strong style={{ fontSize: 16 }}>
              You have {draftCount} draft listing{draftCount > 1 ? 's' : ''}!
            </strong>
            <p style={{ margin: '8px 0 12px 0', fontSize: 14 }}>
              Your account is approved. Visit your listings to publish them and make them visible to buyers.
            </p>
            <Link
              href={`/${vertical}/vendor/listings`}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                minHeight: 44
              }}
            >
              View My Listings
            </Link>
          </div>
        )}

        {/* Info Cards - 3 column grid on desktop, 1 column on mobile */}
        <div className="info-grid" style={{
          display: 'grid',
          gap: 16,
          marginBottom: 24
        }}>
          {/* Contact Information */}
          <div style={{
            padding: 16,
            backgroundColor: 'white',
            color: '#333',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16,
              gap: 8
            }}>
              <h2 style={{
                color: branding.colors.primary,
                margin: 0,
                fontSize: 16,
                fontWeight: 600
              }}>
                Contact Information
              </h2>
              <EditProfileButton vertical={vertical} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Legal Name</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 14 }}>
                  {(profileData.legal_name as string) || 'Not provided'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Phone</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 14 }}>
                  {(profileData.phone as string) || 'Not provided'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Email</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 14 }}>
                  {(profileData.email as string) || userProfile?.email || 'Not provided'}
                </p>
              </div>
            </div>
          </div>

          {/* Business Information */}
          <div style={{
            padding: 16,
            backgroundColor: 'white',
            color: '#333',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <h2 style={{
              color: branding.colors.primary,
              margin: '0 0 16px 0',
              fontSize: 16,
              fontWeight: 600
            }}>
              Business Information
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Business Name</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 14 }}>
                  {(profileData.business_name as string) || (profileData.farm_name as string) || 'Not provided'}
                </p>
              </div>

              {vertical === 'fireworks' && (
                <>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Business Type</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: 14 }}>
                      {(profileData.business_type as string) || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Primary County (TX)</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: 14 }}>
                      {(profileData.primary_county as string) || 'Not provided'}
                    </p>
                  </div>
                </>
              )}

              {vertical === 'farmers_market' && (
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Vendor Type</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: 14 }}>
                    {Array.isArray(profileData.vendor_type)
                      ? (profileData.vendor_type as string[]).join(', ')
                      : (profileData.vendor_type as string) || 'Not provided'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Your Plan / Tier Card */}
          <div style={{
            padding: 16,
            backgroundColor: vendorProfile.tier === 'premium' ? '#fef3c7' : vendorProfile.tier === 'featured' ? '#dbeafe' : 'white',
            color: '#333',
            border: `1px solid ${vendorProfile.tier === 'premium' ? '#fcd34d' : vendorProfile.tier === 'featured' ? '#93c5fd' : '#e5e7eb'}`,
            borderRadius: 8
          }}>
            <h2 style={{
              color: branding.colors.primary,
              margin: '0 0 16px 0',
              fontSize: 16,
              fontWeight: 600
            }}>
              Your Plan
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Current Tier</p>
                <p style={{
                  margin: '2px 0 0 0',
                  fontSize: 16,
                  fontWeight: 600,
                  color: vendorProfile.tier === 'premium' ? '#92400e' : vendorProfile.tier === 'featured' ? '#1e40af' : '#374151'
                }}>
                  {vendorProfile.tier === 'premium' ? 'Premium' : vendorProfile.tier === 'featured' ? 'Featured' : 'Standard'}
                </p>
              </div>

              {(!vendorProfile.tier || vendorProfile.tier === 'standard') && (
                <div>
                  <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#666' }}>
                    Upgrade to Premium for priority placement and more visibility!
                  </p>
                  <Link
                    href={`/${vertical}/vendor/dashboard/upgrade`}
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      backgroundColor: branding.colors.primary,
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 6,
                      fontWeight: 600,
                      fontSize: 13
                    }}
                  >
                    Upgrade to Premium
                  </Link>
                </div>
              )}

              {vendorProfile.tier === 'premium' && (
                <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
                  You have priority placement in search results and featured sections.
                </p>
              )}

              {vendorProfile.tier === 'featured' && (
                <p style={{ margin: 0, fontSize: 13, color: '#1e40af' }}>
                  Your listings are featured prominently across the marketplace.
                </p>
              )}
            </div>
          </div>

          {/* Market Info Card */}
          <div style={{
            padding: 16,
            backgroundColor: 'white',
            color: '#333',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16,
              gap: 8
            }}>
              <h2 style={{
                color: branding.colors.primary,
                margin: 0,
                fontSize: 16,
                fontWeight: 600
              }}>
                Active Pickup Locations
              </h2>
              <Link
                href={`/${vertical}/vendor/markets`}
                style={{
                  fontSize: 12,
                  color: branding.colors.primary,
                  textDecoration: 'none'
                }}
              >
                Manage
              </Link>
            </div>

            {vendorProfile.status !== 'approved' ? (
              <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                Available after approval
              </p>
            ) : activeMarkets.length === 0 ? (
              <div>
                <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#666' }}>
                  No active listings with pickup locations yet.
                </p>
                <Link
                  href={`/${vertical}/vendor/markets`}
                  style={{
                    fontSize: 13,
                    color: branding.colors.primary,
                    textDecoration: 'underline'
                  }}
                >
                  Set up markets
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Traditional Markets */}
                {traditionalMarkets.length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 6px 0', fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                      Markets ({traditionalMarkets.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {traditionalMarkets.map(market => (
                        <div key={market.id} style={{
                          padding: 8,
                          backgroundColor: '#f9fafb',
                          borderRadius: 4,
                          fontSize: 13
                        }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{market.name}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {market.day_of_week !== null && `${DAYS[market.day_of_week]} `}
                            {market.start_time && market.end_time && `${market.start_time}-${market.end_time}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Private Pickups */}
                {privatePickups.length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 6px 0', fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                      Private Pickup ({privatePickups.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {privatePickups.map(pickup => (
                        <div key={pickup.id} style={{
                          padding: 8,
                          backgroundColor: '#f9fafb',
                          borderRadius: 4,
                          fontSize: 13
                        }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{pickup.name}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {pickup.city}, {pickup.state}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Cards - 3 column grid */}
        <div className="action-grid" style={{
          display: 'grid',
          gap: 16,
          marginBottom: 24
        }}>
          {/* Your Listings */}
          <Link
            href={`/${vertical}/vendor/listings`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: 16,
              backgroundColor: 'white',
              color: '#333',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
              <h3 style={{
                color: branding.colors.primary,
                margin: '0 0 8px 0',
                fontSize: 16,
                fontWeight: 600
              }}>
                Your Listings
              </h3>
              <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
                Create and manage your product listings
              </p>
            </div>
          </Link>

          {/* Payment Settings */}
          <Link
            href={`/${vertical}/vendor/dashboard/stripe`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: 16,
              backgroundColor: 'white',
              color: '#333',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
              <h3 style={{
                color: branding.colors.primary,
                margin: '0 0 8px 0',
                fontSize: 16,
                fontWeight: 600
              }}>
                Payment Settings
              </h3>
              <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
                Connect your bank account to receive payments
              </p>
            </div>
          </Link>

          {/* Orders */}
          <Link
            href={`/${vertical}/vendor/orders`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: 16,
              backgroundColor: 'white',
              color: '#333',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
              <h3 style={{
                color: branding.colors.primary,
                margin: '0 0 8px 0',
                fontSize: 16,
                fontWeight: 600
              }}>
                Orders
              </h3>
              <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
                Manage incoming orders from customers
              </p>
            </div>
          </Link>
        </div>

        {/* Coming Soon */}
        <div style={{
          padding: 16,
          backgroundColor: '#f9fafb',
          color: '#333',
          border: '1px solid #e5e7eb',
          borderRadius: 8
        }}>
          <h3 style={{
            margin: '0 0 12px 0',
            color: '#6b7280',
            fontSize: 16,
            fontWeight: 600
          }}>
            Coming Soon
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#9ca3af', fontSize: 14 }}>
            <li>Analytics and insights</li>
            <li>Customer messages</li>
          </ul>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-dashboard .info-grid {
          grid-template-columns: 1fr;
        }
        .vendor-dashboard .action-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-dashboard .info-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .action-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendor-dashboard .info-grid {
            grid-template-columns: repeat(4, 1fr);
          }
          .vendor-dashboard .action-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
