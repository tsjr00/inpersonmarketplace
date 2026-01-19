import { createClient } from '@/lib/supabase/server'
import MarketFilters from './MarketFilters'
import MarketsWithLocation from '@/components/markets/MarketsWithLocation'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

// Cache page for 10 minutes - markets change infrequently
export const revalidate = 600

interface MarketsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ type?: string; city?: string; search?: string }>
}

export default async function MarketsPage({ params, searchParams }: MarketsPageProps) {
  const { vertical } = await params
  const { type, city, search } = await searchParams
  const supabase = await createClient()

  // Build query for initial markets (shown before location is set)
  let query = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*),
      market_vendors(count)
    `)
    .eq('vertical_id', vertical)
    .eq('status', 'active')
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
    .eq('status', 'active')
    .not('city', 'is', null)

  const cities = [...new Set(allMarkets?.map(m => m.city).filter(Boolean))] as string[]

  // Transform markets data
  const transformedMarkets = markets?.map(market => ({
    ...market,
    type: market.market_type as 'traditional' | 'private_pickup',
    active: market.active ?? (market.status === 'active'),
    schedules: market.market_schedules,
    vendor_count: market.market_vendors?.[0]?.count || 0,
    market_schedules: undefined,
    market_vendors: undefined,
  })) || []

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      padding: `${spacing.sm} ${spacing.sm}`,
      backgroundColor: colors.surfaceBase,
      minHeight: '100vh'
    }}>
      <h1 style={{
        color: colors.textPrimary,
        marginBottom: spacing['2xs'],
        marginTop: 0,
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold
      }}>
        Markets
      </h1>
      <p style={{
        color: colors.textSecondary,
        marginBottom: spacing.md,
        fontSize: typography.sizes.base
      }}>
        Find farmers markets and pickup locations near you
      </p>

      {/* Filters */}
      <MarketFilters
        currentType={type}
        currentCity={city}
        currentSearch={search}
        cities={cities}
      />

      {/* Markets with Location Filtering */}
      <MarketsWithLocation
        vertical={vertical}
        initialMarkets={transformedMarkets}
        type={type}
        cities={cities}
      />
    </div>
  )
}
