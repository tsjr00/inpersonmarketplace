export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { formatPickupDate } from '@/types/pickup'
import BackLink from '@/components/shared/BackLink'

interface UpcomingPageProps {
  params: Promise<{ vertical: string }>
}

export default async function UpcomingPickupsPage({ params }: UpcomingPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  await enforceVerticalAccess(vertical)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile || vendorProfile.status !== 'approved') {
    redirect(`/${vertical}/vendor/dashboard`)
  }

  // Get upcoming pickups for next 7 days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)

  const { data: upcomingItems } = await supabase
    .from('order_items')
    .select('pickup_date, market_id, markets!market_id(id, name)')
    .eq('vendor_profile_id', vendorProfile.id)
    .not('pickup_date', 'is', null)
    .gte('pickup_date', today.toISOString().split('T')[0])
    .lte('pickup_date', nextWeek.toISOString().split('T')[0])
    .not('status', 'in', '("fulfilled","cancelled")')
    .is('cancelled_at', null)

  // Group by pickup_date + market_id
  interface PickupGroup {
    pickup_date: string
    market_id: string
    market_name: string
    item_count: number
  }
  const pickupMap = new Map<string, PickupGroup>()
  for (const item of upcomingItems || []) {
    if (item.pickup_date && item.market_id) {
      const key = `${item.pickup_date}|${item.market_id}`
      const market = item.markets as unknown as { id: string; name: string } | null
      const existing = pickupMap.get(key)
      if (existing) {
        existing.item_count++
      } else {
        pickupMap.set(key, {
          pickup_date: item.pickup_date,
          market_id: item.market_id,
          market_name: market?.name || 'Pickup Location',
          item_count: 1,
        })
      }
    }
  }
  const pickups = Array.from(pickupMap.values()).sort((a, b) => a.pickup_date.localeCompare(b.pickup_date))

  const todayStr = today.toISOString().split('T')[0]
  const todayPickups = pickups.filter(p => p.pickup_date === todayStr)
  const futurePickups = pickups.filter(p => p.pickup_date !== todayStr)

  return (
    <div style={{ backgroundColor: colors.surfaceBase, color: colors.textPrimary, minHeight: '100vh' }}>
      <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: `${spacing.md} ${spacing.sm}` }}>

        <BackLink fallbackHref={`/${vertical}/vendor/dashboard`} />

        <h1 style={{
          color: colors.primary,
          margin: `${spacing.xs} 0 ${spacing.md} 0`,
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold,
        }}>
          Upcoming Pickups
        </h1>

        {pickups.length === 0 ? (
          /* ── Empty state skeleton ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, opacity: 0.55 }}>

            {/* Today section skeleton */}
            <div>
              <div style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.bold,
                color: colors.primaryDark,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                marginBottom: spacing.xs,
              }}>
                Today — Prep &amp; Pack
              </div>
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.primaryLight,
                borderRadius: radius.md,
                border: `2px dashed ${colors.primary}`,
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing.xs,
                }}>
                  <span style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: colors.primaryDark }}>
                    📍 Your pickup location
                  </span>
                  <span style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.bold,
                    color: colors.primaryDark,
                    backgroundColor: 'white',
                    padding: `2px ${spacing.sm}`,
                    borderRadius: radius.full,
                  }}>
                    — items to prepare
                  </span>
                </div>
                <div style={{ display: 'flex', gap: spacing.xs }}>
                  <div style={{
                    flex: 1,
                    padding: `${spacing.xs} ${spacing.sm}`,
                    backgroundColor: 'white',
                    color: colors.primaryDark,
                    borderRadius: radius.sm,
                    border: `1px solid ${colors.primary}`,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    textAlign: 'center' as const,
                  }}>
                    📋 Prep List
                  </div>
                  <div style={{
                    flex: 1,
                    padding: `${spacing.xs} ${spacing.sm}`,
                    backgroundColor: 'white',
                    color: colors.primaryDark,
                    borderRadius: radius.sm,
                    border: `1px solid ${colors.primary}`,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    textAlign: 'center' as const,
                  }}>
                    🧾 Orders
                  </div>
                </div>
              </div>
            </div>

            {/* Coming Up section skeleton */}
            <div>
              <div style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: colors.textMuted,
                marginBottom: spacing.xs,
              }}>
                Coming Up
              </div>
              <div style={{
                padding: spacing.sm,
                backgroundColor: 'white',
                borderRadius: radius.md,
                border: `1px dashed ${colors.borderMuted}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Tomorrow</span>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginLeft: spacing['2xs'] }}>· Market name</span>
                </div>
                <div style={{ display: 'flex', gap: spacing.xs }}>
                  <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>📋 Prep List</span>
                  <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>🧾 Orders</span>
                </div>
              </div>
            </div>

            <p style={{
              margin: `${spacing.sm} 0 0 0`,
              fontSize: typography.sizes.sm,
              color: colors.textMuted,
              textAlign: 'center',
              fontStyle: 'italic',
            }}>
              Orders will appear here as customers place them
            </p>
          </div>
        ) : (
          /* ── Live data ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>

            {/* Today section */}
            {todayPickups.length > 0 && (
              <div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.bold,
                  color: colors.primaryDark,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                  marginBottom: spacing.xs,
                }}>
                  Today — Prep &amp; Pack
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {todayPickups.map(pickup => (
                    <div
                      key={`${pickup.pickup_date}-${pickup.market_id}`}
                      style={{
                        padding: spacing.sm,
                        backgroundColor: colors.primaryLight,
                        borderRadius: radius.md,
                        border: `2px solid ${colors.primary}`,
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: spacing.xs,
                      }}>
                        <span style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: colors.primaryDark }}>
                          📍 {pickup.market_name}
                        </span>
                        <span style={{
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.bold,
                          color: colors.primaryDark,
                          backgroundColor: 'white',
                          padding: `2px ${spacing.sm}`,
                          borderRadius: radius.full,
                        }}>
                          {pickup.item_count} item{pickup.item_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <Link
                          href={`/${vertical}/vendor/markets/${pickup.market_id}/prep`}
                          style={{
                            flex: 1,
                            padding: `${spacing.xs} ${spacing.sm}`,
                            backgroundColor: 'white',
                            color: colors.primaryDark,
                            borderRadius: radius.sm,
                            border: `1px solid ${colors.primary}`,
                            fontSize: typography.sizes.sm,
                            fontWeight: typography.weights.semibold,
                            textDecoration: 'none',
                            textAlign: 'center',
                          }}
                        >
                          📋 Prep List
                        </Link>
                        <Link
                          href={`/${vertical}/vendor/orders?pickup_date=${pickup.pickup_date}`}
                          style={{
                            flex: 1,
                            padding: `${spacing.xs} ${spacing.sm}`,
                            backgroundColor: 'white',
                            color: colors.primaryDark,
                            borderRadius: radius.sm,
                            border: `1px solid ${colors.primary}`,
                            fontSize: typography.sizes.sm,
                            fontWeight: typography.weights.semibold,
                            textDecoration: 'none',
                            textAlign: 'center',
                          }}
                        >
                          🧾 Orders
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coming Up section */}
            {futurePickups.length > 0 && (
              <div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  color: colors.textMuted,
                  marginBottom: spacing.xs,
                }}>
                  Coming Up
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {futurePickups.map(pickup => (
                    <div
                      key={`${pickup.pickup_date}-${pickup.market_id}`}
                      style={{
                        padding: spacing.sm,
                        backgroundColor: 'white',
                        borderRadius: radius.md,
                        border: `1px solid ${colors.borderMuted}`,
                        boxShadow: shadows.sm,
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: spacing.xs,
                      }}>
                        <div>
                          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                            {pickup.market_name}
                          </span>
                          <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginLeft: spacing['2xs'] }}>
                            · {formatPickupDate(pickup.pickup_date)}
                          </span>
                        </div>
                        <span style={{
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          color: colors.primary,
                          backgroundColor: colors.primaryLight,
                          padding: `2px ${spacing.sm}`,
                          borderRadius: radius.full,
                        }}>
                          {pickup.item_count} item{pickup.item_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <Link
                          href={`/${vertical}/vendor/markets/${pickup.market_id}/prep`}
                          style={{
                            flex: 1,
                            padding: `${spacing['2xs']} ${spacing.sm}`,
                            backgroundColor: colors.surfaceMuted,
                            color: colors.primary,
                            borderRadius: radius.sm,
                            border: `1px solid ${colors.border}`,
                            fontSize: typography.sizes.sm,
                            fontWeight: typography.weights.semibold,
                            textDecoration: 'none',
                            textAlign: 'center',
                          }}
                        >
                          📋 Prep List
                        </Link>
                        <Link
                          href={`/${vertical}/vendor/orders?pickup_date=${pickup.pickup_date}`}
                          style={{
                            flex: 1,
                            padding: `${spacing['2xs']} ${spacing.sm}`,
                            backgroundColor: colors.surfaceMuted,
                            color: colors.primary,
                            borderRadius: radius.sm,
                            border: `1px solid ${colors.border}`,
                            fontSize: typography.sizes.sm,
                            fontWeight: typography.weights.semibold,
                            textDecoration: 'none',
                            textAlign: 'center',
                          }}
                        >
                          🧾 Orders
                        </Link>
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
  )
}
