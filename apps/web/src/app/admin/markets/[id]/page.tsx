import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ScheduleDisplay from '@/components/markets/ScheduleDisplay'
import ScheduleManager from './ScheduleManager'
import VendorManager from './VendorManager'

interface MarketDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  // Get market with schedules and vendors
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
        notes,
        created_at,
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

  // Transform vendors
  const vendors = market.market_vendors?.map((mv: {
    id: string
    vendor_profile_id: string
    approved: boolean
    booth_number: string | null
    notes: string | null
    created_at: string
    vendor_profiles: { id: string; profile_data: Record<string, unknown>; status: string } | null
  }) => ({
    id: mv.id,
    vendor_profile_id: mv.vendor_profile_id,
    approved: mv.approved,
    booth_number: mv.booth_number,
    notes: mv.notes,
    created_at: mv.created_at,
    business_name: mv.vendor_profiles?.profile_data?.business_name ||
                   mv.vendor_profiles?.profile_data?.farm_name ||
                   'Unknown',
    vendor_status: mv.vendor_profiles?.status,
  }))

  const pendingVendors = vendors?.filter((v: { approved: boolean }) => !v.approved) || []
  const approvedVendors = vendors?.filter((v: { approved: boolean }) => v.approved) || []

  return (
    <div>
      {/* Back link */}
      <Link
        href="/admin/markets"
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#333' }}>{market.name}</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <span style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: market.market_type === 'traditional' ? '#e8f5e9' : '#fff3e0',
              color: market.market_type === 'traditional' ? '#2e7d32' : '#e65100',
            }}>
              {market.market_type === 'traditional' ? 'Traditional' : 'Private Pickup'}
            </span>
            <span style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: market.active ? '#d4edda' : '#f8d7da',
              color: market.active ? '#155724' : '#721c24',
            }}>
              {market.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <Link
          href={`/admin/markets/${id}/edit`}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          Edit Market
        </Link>
      </div>

      {/* Market Info */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#333' }}>
          Market Information
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Description
            </h4>
            <p style={{ margin: 0, color: '#333', lineHeight: 1.6 }}>
              {market.description || '-'}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Location
            </h4>
            <p style={{ margin: 0, color: '#333' }}>
              {market.address || '-'}<br />
              {[market.city, market.state, market.zip].filter(Boolean).join(', ') || '-'}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Contact Email
            </h4>
            <p style={{ margin: 0, color: '#333' }}>
              {market.contact_email || '-'}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Contact Phone
            </h4>
            <p style={{ margin: 0, color: '#333' }}>
              {market.contact_phone || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Schedules - Required for ALL market types */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#333' }}>
          {market.market_type === 'traditional' ? 'Operating Schedule' : 'Pickup Schedule'}
        </h2>

        {/* Warning if no schedules */}
        {(!market.market_schedules || market.market_schedules.length === 0) && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#991b1b' }}>
                  Schedule Required
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#991b1b' }}>
                  This {market.market_type === 'traditional' ? 'market' : 'pickup location'} has no schedule.
                  Without a schedule, the order cutoff system cannot function and listings may not work correctly.
                  Please add at least one schedule below.
                </p>
              </div>
            </div>
          </div>
        )}

        <ScheduleDisplay schedules={market.market_schedules || []} />

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
          <ScheduleManager marketId={id} schedules={market.market_schedules || []} />
        </div>
      </div>

      {/* Pending Vendors */}
      {pendingVendors.length > 0 && (
        <div style={{
          backgroundColor: '#fff3cd',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#856404' }}>
            Pending Applications ({pendingVendors.length})
          </h2>
          <VendorManager marketId={id} vendors={pendingVendors} type="pending" />
        </div>
      )}

      {/* Approved Vendors */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#333' }}>
          Approved Vendors ({approvedVendors.length})
        </h2>
        {approvedVendors.length > 0 ? (
          <VendorManager marketId={id} vendors={approvedVendors} type="approved" />
        ) : (
          <p style={{ color: '#666', margin: 0 }}>No approved vendors yet.</p>
        )}
      </div>
    </div>
  )
}
