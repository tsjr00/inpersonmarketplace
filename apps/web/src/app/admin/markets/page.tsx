import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import MarketAdminFilters from './MarketAdminFilters'
import DeleteMarketButton from './DeleteMarketButton'

interface MarketsAdminPageProps {
  searchParams: Promise<{ vertical?: string; type?: string; active?: string }>
}

export default async function MarketsAdminPage({ searchParams }: MarketsAdminPageProps) {
  await requireAdmin()
  const { vertical, type, active } = await searchParams
  const supabase = await createClient()

  // Build query
  let query = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(count),
      market_vendors(count)
    `)
    .order('created_at', { ascending: false })

  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  if (type) {
    query = query.eq('type', type)
  }

  if (active !== undefined) {
    query = query.eq('active', active === 'true')
  }

  const { data: markets } = await query

  // Get verticals for filter
  const { data: verticals } = await supabase
    .from('verticals')
    .select('vertical_id, name_public')
    .eq('is_active', true)

  // Transform markets data
  const transformedMarkets = markets?.map(market => ({
    ...market,
    schedule_count: market.market_schedules?.[0]?.count || 0,
    vendor_count: market.market_vendors?.[0]?.count || 0,
  }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#333', margin: 0 }}>Markets Management</h1>
        <Link
          href="/admin/markets/new"
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          + New Market
        </Link>
      </div>

      {/* Filters */}
      <MarketAdminFilters
        currentVertical={vertical}
        currentType={type}
        currentActive={active}
        verticals={verticals || []}
      />

      {/* Results count */}
      <div style={{ marginBottom: 16, color: '#666' }}>
        {transformedMarkets?.length || 0} market{transformedMarkets?.length !== 1 ? 's' : ''} found
      </div>

      {/* Table */}
      {transformedMarkets && transformedMarkets.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666', fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666', fontWeight: 600 }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666', fontWeight: 600 }}>Type</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666', fontWeight: 600 }}>Location</th>
                <th style={{ textAlign: 'center', padding: 15, color: '#666', fontWeight: 600 }}>Vendors</th>
                <th style={{ textAlign: 'center', padding: 15, color: '#666', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'right', padding: 15, color: '#666', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transformedMarkets.map((market) => (
                <tr key={market.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 15 }}>
                    <div style={{ fontWeight: 600, color: '#333' }}>{market.name}</div>
                    {market.description && (
                      <div style={{
                        fontSize: 13,
                        color: '#666',
                        marginTop: 4,
                        maxWidth: 300,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {market.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 15 }}>
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: '#f0f0f0',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {market.vertical_id}
                    </span>
                  </td>
                  <td style={{ padding: 15 }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: market.type === 'traditional' ? '#e8f5e9' : '#fff3e0',
                      color: market.type === 'traditional' ? '#2e7d32' : '#e65100',
                    }}>
                      {market.type === 'traditional' ? 'Traditional' : 'Private Pickup'}
                    </span>
                  </td>
                  <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                    {[market.city, market.state].filter(Boolean).join(', ') || '-'}
                  </td>
                  <td style={{ padding: 15, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: '#e3f2fd',
                      color: '#1565c0',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                      {market.vendor_count}
                    </span>
                  </td>
                  <td style={{ padding: 15, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: market.active ? '#d4edda' : '#f8d7da',
                      color: market.active ? '#155724' : '#721c24',
                    }}>
                      {market.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 15, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Link
                        href={`/admin/markets/${market.id}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f0f0f0',
                          color: '#333',
                          textDecoration: 'none',
                          borderRadius: 4,
                          fontSize: 13,
                        }}
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/markets/${market.id}/edit`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: 4,
                          fontSize: 13,
                        }}
                      >
                        Edit
                      </Link>
                      <DeleteMarketButton marketId={market.id} marketName={market.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center',
        }}>
          <p style={{ color: '#666' }}>No markets found matching filters.</p>
          <Link
            href="/admin/markets/new"
            style={{
              display: 'inline-block',
              marginTop: 16,
              padding: '10px 20px',
              backgroundColor: '#0070f3',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
            }}
          >
            Create First Market
          </Link>
        </div>
      )}
    </div>
  )
}
