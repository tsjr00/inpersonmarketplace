import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ScheduleDisplay from '@/components/markets/ScheduleDisplay'
import ApplyToMarketButton from './ApplyToMarketButton'

interface MarketDetailPageProps {
  params: Promise<{ vertical: string; id: string }>
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { vertical, id } = await params
  const supabase = await createClient()

  // Get market with schedules and approved vendors
  const { data: market, error } = await supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*),
      market_vendors(
        id,
        vendor_profile_id,
        approved,
        booth_number,
        vendor_profiles(
          id,
          profile_data,
          status
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !market) {
    notFound()
  }

  // Get current user's vendor profile for this vertical (if any)
  const { data: { user } } = await supabase.auth.getUser()
  let userVendorProfile = null
  let hasApplied = false

  if (user) {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (userProfile) {
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id, profile_data')
        .eq('user_id', userProfile.id)
        .eq('vertical_id', vertical)
        .single()

      if (vendorProfile) {
        userVendorProfile = vendorProfile
        // Check if already applied
        hasApplied = market.market_vendors?.some(
          (mv: { vendor_profile_id: string }) => mv.vendor_profile_id === vendorProfile.id
        )
      }
    }
  }

  // Transform vendors
  const approvedVendors = market.market_vendors
    ?.filter((mv: { approved: boolean }) => mv.approved)
    .map((mv: {
      id: string
      vendor_profile_id: string
      booth_number: string | null
      vendor_profiles: { id: string; profile_data: Record<string, unknown> } | null
    }) => ({
      id: mv.id,
      vendor_profile_id: mv.vendor_profile_id,
      booth_number: mv.booth_number,
      business_name: mv.vendor_profiles?.profile_data?.business_name ||
                     mv.vendor_profiles?.profile_data?.farm_name ||
                     'Unknown',
    }))

  const locationParts = [market.address, market.city, market.state, market.zip].filter(Boolean)
  const fullAddress = locationParts.join(', ')

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
      {/* Back link */}
      <Link
        href={`/${vertical}/markets`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#0070f3',
          textDecoration: 'none',
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Markets
      </Link>

      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: '#333' }}>
              {market.name}
            </h1>
            <span
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: market.type === 'traditional' ? '#e8f5e9' : '#fff3e0',
                color: market.type === 'traditional' ? '#2e7d32' : '#e65100',
              }}
            >
              {market.type === 'traditional' ? 'Farmers Market' : 'Private Pickup'}
            </span>
          </div>

          {/* Apply button for vendors */}
          {userVendorProfile && !hasApplied && (
            <ApplyToMarketButton
              marketId={id}
              vendorProfileId={userVendorProfile.id}
            />
          )}
          {hasApplied && (
            <span style={{
              padding: '8px 16px',
              backgroundColor: '#e8f5e9',
              color: '#2e7d32',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
            }}>
              Applied
            </span>
          )}
        </div>

        {market.description && (
          <p style={{ margin: '0 0 20px 0', fontSize: 16, color: '#555', lineHeight: 1.6 }}>
            {market.description}
          </p>
        )}

        {/* Location */}
        {fullAddress && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" style={{ marginTop: 2 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <div style={{ fontSize: 15, color: '#333' }}>{fullAddress}</div>
            </div>
          </div>
        )}

        {/* Contact */}
        {(market.contact_email || market.contact_phone) && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {market.contact_email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <a href={`mailto:${market.contact_email}`} style={{ color: '#0070f3', fontSize: 14 }}>
                  {market.contact_email}
                </a>
              </div>
            )}
            {market.contact_phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <a href={`tel:${market.contact_phone}`} style={{ color: '#0070f3', fontSize: 14 }}>
                  {market.contact_phone}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule section (for traditional markets) */}
      {market.type === 'traditional' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 600, color: '#333' }}>
            Market Hours
          </h2>
          <ScheduleDisplay schedules={market.market_schedules || []} />
        </div>
      )}

      {/* Vendors section */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 600, color: '#333' }}>
          Vendors ({approvedVendors?.length || 0})
        </h2>

        {approvedVendors && approvedVendors.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {approvedVendors.map((vendor: {
              id: string
              vendor_profile_id: string
              booth_number: string | null
              business_name: string
            }) => (
              <div
                key={vendor.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: 8,
                }}
              >
                <span style={{ fontWeight: 500, color: '#333' }}>
                  {vendor.business_name}
                </span>
                {vendor.booth_number && (
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: '#e3f2fd',
                    color: '#1565c0',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                  }}>
                    Booth {vendor.booth_number}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#666', margin: 0 }}>
            No vendors at this market yet.
          </p>
        )}
      </div>
    </div>
  )
}
