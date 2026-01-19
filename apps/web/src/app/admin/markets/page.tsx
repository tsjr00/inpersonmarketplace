import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import MarketAdminFilters from './MarketAdminFilters'
import DeleteMarketButton from './DeleteMarketButton'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
    <div style={{ maxWidth: containers.wide, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <h1 style={{ color: '#333', margin: 0, fontSize: typography.sizes['2xl'] }}>Markets Management</h1>
        <Link
          href="/admin/markets/new"
          style={{
            padding: `${spacing['2xs']} ${spacing.md}`,
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: radius.md,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium,
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
      <div style={{ marginBottom: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>
        {transformedMarkets?.length || 0} market{transformedMarkets?.length !== 1 ? 's' : ''} found
      </div>

      {/* Table */}
      {transformedMarkets && transformedMarkets.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: radius.md,
          boxShadow: shadows.sm,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Name</th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Type</th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Location</th>
                <th style={{ textAlign: 'center', padding: spacing.sm, color: '#666', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Vendors</th>
                <th style={{ textAlign: 'center', padding: spacing.sm, color: '#666', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Status</th>
                <th style={{ textAlign: 'right', padding: spacing.sm, color: '#666', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transformedMarkets.map((market) => (
                <tr key={market.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: spacing.sm }}>
                    <div style={{ fontWeight: typography.weights.semibold, color: '#333' }}>{market.name}</div>
                    {market.description && (
                      <div style={{
                        fontSize: typography.sizes.xs,
                        color: '#666',
                        marginTop: spacing['3xs'],
                        maxWidth: 300,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {market.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: spacing.sm }}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing['2xs']}`,
                      backgroundColor: '#f0f0f0',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                    }}>
                      {market.vertical_id}
                    </span>
                  </td>
                  <td style={{ padding: spacing.sm }}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing['2xs']}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      backgroundColor: market.type === 'traditional' ? '#e8f5e9' : '#fff3e0',
                      color: market.type === 'traditional' ? '#2e7d32' : '#e65100',
                    }}>
                      {market.type === 'traditional' ? 'Traditional' : 'Private Pickup'}
                    </span>
                  </td>
                  <td style={{ padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>
                    {[market.city, market.state].filter(Boolean).join(', ') || '-'}
                  </td>
                  <td style={{ padding: spacing.sm, textAlign: 'center' }}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing['2xs']}`,
                      backgroundColor: '#e3f2fd',
                      color: '#1565c0',
                      borderRadius: radius.lg,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                    }}>
                      {market.vendor_count}
                    </span>
                  </td>
                  <td style={{ padding: spacing.sm, textAlign: 'center' }}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing['2xs']}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      backgroundColor: market.active ? '#d4edda' : '#f8d7da',
                      color: market.active ? '#155724' : '#721c24',
                    }}>
                      {market.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: spacing.sm, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: spacing['2xs'], justifyContent: 'flex-end' }}>
                      <Link
                        href={`/admin/markets/${market.id}`}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: '#f0f0f0',
                          color: '#333',
                          textDecoration: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                        }}
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/markets/${market.id}/edit`}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
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
          borderRadius: radius.md,
          padding: spacing['3xl'],
          textAlign: 'center',
        }}>
          <p style={{ color: '#666', fontSize: typography.sizes.base }}>No markets found matching filters.</p>
          <Link
            href="/admin/markets/new"
            style={{
              display: 'inline-block',
              marginTop: spacing.sm,
              padding: `${spacing['2xs']} ${spacing.md}`,
              backgroundColor: '#0070f3',
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.md,
            }}
          >
            Create First Market
          </Link>
        </div>
      )}
    </div>
  )
}
