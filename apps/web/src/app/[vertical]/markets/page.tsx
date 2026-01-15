import { createClient } from '@/lib/supabase/server'
import MarketCard from '@/components/markets/MarketCard'
import MarketFilters from './MarketFilters'

interface MarketsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ type?: string; city?: string; search?: string }>
}

export default async function MarketsPage({ params, searchParams }: MarketsPageProps) {
  const { vertical } = await params
  const { type, city, search } = await searchParams
  const supabase = await createClient()

  // Build query
  let query = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*),
      market_vendors(count)
    `)
    .eq('vertical_id', vertical)
    .eq('status' , 'active')
    .order('name', { ascending: true })

  if (type) {
    query = query.eq('market_type', type)
  }

  if (city) {
    query = query.ilike('city', `%${city}%`)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data: markets, error } = await query

  if (error) {
    console.error('Error fetching markets:', error)
  }

  // Get unique cities for filter
  const { data: allMarkets } = await supabase
    .from('markets')
    .select('city')
    .eq('vertical_id', vertical)
    .eq('status' , 'active')
    .not('city', 'is', null)

  const cities = [...new Set(allMarkets?.map(m => m.city).filter(Boolean))] as string[]

  // Transform markets data
  const transformedMarkets = markets?.map(market => ({
    ...market,
    schedules: market.market_schedules,
    vendor_count: market.market_vendors?.[0]?.count || 0,
    market_schedules: undefined,
    market_vendors: undefined,
  }))

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      <h1 style={{ color: '#333', marginBottom: 8, fontSize: 28 }}>Markets</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 16 }}>
        Find farmers markets and pickup locations near you
      </p>

      {/* Filters */}
      <MarketFilters
        currentType={type}
        currentCity={city}
        currentSearch={search}
        cities={cities}
      />

      {/* Results count */}
      <div style={{ marginBottom: 16, color: '#666' }}>
        {transformedMarkets?.length || 0} market{transformedMarkets?.length !== 1 ? 's' : ''} found
      </div>

      {/* Market grid */}
      {transformedMarkets && transformedMarkets.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20,
        }}>
          {transformedMarkets.map(market => (
            <MarketCard key={market.id} market={market} vertical={vertical} />
          ))}
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 60,
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <p style={{ color: '#666', fontSize: 16 }}>No markets found matching your filters.</p>
          <p style={{ color: '#999', fontSize: 14, marginTop: 8 }}>
            Try adjusting your search criteria or check back later.
          </p>
        </div>
      )}
    </div>
  )
}
