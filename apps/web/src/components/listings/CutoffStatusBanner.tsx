'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface MarketAvailability {
  market_id: string
  market_name: string
  market_type: string
  is_accepting: boolean
  cutoff_at: string | null
  next_market_at: string | null
  reason: string | null
  cutoff_hours?: number  // Market's cutoff policy (18 for traditional, 10 for private)
}

interface AvailabilityResponse {
  is_accepting_orders: boolean
  reason: string | null
  markets: MarketAvailability[]
  closing_soon?: boolean
  hours_until_cutoff?: number | null
}

interface CutoffStatusBannerProps {
  listingId: string
  onStatusChange?: (isAccepting: boolean) => void
  /** Safety net: force show closed explanation even if availability API returns no data */
  forceShowClosed?: boolean
}

export default function CutoffStatusBanner({ listingId, onStatusChange, forceShowClosed = false }: CutoffStatusBannerProps) {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAvailability() {
      try {
        const response = await fetch(`/api/listings/${listingId}/availability`)
        if (response.ok) {
          const data = await response.json()
          setAvailability(data)
          onStatusChange?.(data.is_accepting_orders)
        }
      } catch (error) {
        console.error('Failed to fetch availability:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAvailability()

    // Refresh every minute to keep cutoff status accurate
    const interval = setInterval(fetchAvailability, 60 * 1000)
    return () => clearInterval(interval)
  }, [listingId, onStatusChange])

  if (loading) {
    return null
  }

  // Safety net: if availability API failed/returned nothing but we know orders are closed,
  // show a generic explanation so buyers aren't left with a grayed button and no reason
  if (!availability && forceShowClosed) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: radius.md,
        marginBottom: spacing.sm
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginBottom: spacing.xs
        }}>
          <span style={{ fontSize: 18 }}>⏰</span>
          <span style={{
            fontWeight: typography.weights.semibold,
            color: '#92400e',
            fontSize: typography.sizes.sm
          }}>
            Pickup Availability
          </span>
        </div>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: '#fee2e2',
          borderRadius: radius.sm,
          marginBottom: spacing.xs
        }}>
          <div style={{
            fontWeight: typography.weights.bold,
            color: '#991b1b',
            fontSize: typography.sizes.sm,
            marginBottom: spacing['3xs']
          }}>
            Orders Currently Closed
          </div>
          <div style={{
            fontSize: typography.sizes.xs,
            color: '#7f1d1d',
            lineHeight: 1.3
          }}>
            Orders automatically close before market / pickup day to give vendors time to prepare their products & orders.
          </div>
        </div>
        <div style={{
          fontSize: typography.sizes.xs,
          color: '#78350f',
          fontStyle: 'italic'
        }}>
          Orders reopen after the scheduled market / pickup time. Check back soon.
        </div>
      </div>
    )
  }

  if (!availability) {
    return null
  }

  // If no markets but orders are closed, still show explanation
  if (availability.markets.length === 0) {
    // Only show box if orders are not being accepted
    if (!availability.is_accepting_orders) {
      return (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: radius.md,
          marginBottom: spacing.sm
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            marginBottom: spacing.xs
          }}>
            <span style={{ fontSize: 18 }}>⏰</span>
            <span style={{
              fontWeight: typography.weights.semibold,
              color: '#92400e',
              fontSize: typography.sizes.sm
            }}>
              Pickup Availability
            </span>
          </div>
          <div style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            backgroundColor: '#fee2e2',
            borderRadius: radius.sm,
            marginBottom: spacing.xs
          }}>
            <div style={{
              fontWeight: typography.weights.bold,
              color: '#991b1b',
              fontSize: typography.sizes.sm,
              marginBottom: spacing['3xs']
            }}>
              Orders Currently Closed
            </div>
            <div style={{
              fontSize: typography.sizes.xs,
              color: '#7f1d1d',
              lineHeight: 1.3
            }}>
              Orders automatically close before market / pickup day to give vendors time to prepare their products & orders.
            </div>
          </div>
          <div style={{
            fontSize: typography.sizes.xs,
            color: '#78350f',
            fontStyle: 'italic'
          }}>
            Orders reopen after the scheduled market / pickup time. Check back soon.
          </div>
        </div>
      )
    }
    // If accepting orders but no markets, don't show anything
    return null
  }

  // Format time until cutoff
  const formatTimeRemaining = (cutoffAt: string): string => {
    const hoursLeft = (new Date(cutoffAt).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursLeft < 1) {
      const minutes = Math.max(1, Math.round(hoursLeft * 60))
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`
    }
    if (hoursLeft < 24) {
      const hours = Math.floor(hoursLeft)
      return `${hours} hour${hours !== 1 ? 's' : ''}`
    }
    const days = Math.floor(hoursLeft / 24)
    return `${days} day${days !== 1 ? 's' : ''}`
  }

  // Format market date with day, date, and time
  const formatMarketDateTime = (dateStr: string, timeStr?: string): string => {
    const date = new Date(dateStr)
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (timeStr) {
      return `${dayName}, ${dateFormatted} at ${timeStr}`
    }
    return `${dayName}, ${dateFormatted}`
  }

  // Format cutoff date/time
  const formatCutoffDateTime = (cutoffAt: string): string => {
    const date = new Date(cutoffAt)
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const timeFormatted = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${dayName}, ${dateFormatted} at ${timeFormatted}`
  }

  // Check if we have mixed status (some open, some closed)
  const openMarkets = availability.markets.filter(m => m.is_accepting)
  const closedMarkets = availability.markets.filter(m => !m.is_accepting)
  const hasMixedStatus = openMarkets.length > 0 && closedMarkets.length > 0

  // Check if any market is closing soon (within the market's cutoff policy)
  const closingSoonMarkets = availability.markets.filter(m => {
    if (!m.is_accepting || !m.cutoff_at) return false
    const hoursUntilCutoff = (new Date(m.cutoff_at).getTime() - Date.now()) / (1000 * 60 * 60)
    // Use market's actual cutoff_hours policy (FT=0, private=10, traditional=18)
    const cutoffThreshold = m.cutoff_hours ?? (m.market_type === 'private_pickup' ? 10 : 18)
    if (cutoffThreshold === 0) return false  // FT: no advance cutoff concept
    return hoursUntilCutoff < cutoffThreshold
  })

  // All markets closed - show yellow container with red sub-boxes for each location
  if (!availability.is_accepting_orders) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: radius.md,
        marginBottom: spacing.sm
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginBottom: spacing.xs
        }}>
          <span style={{ fontSize: 18 }}>⏰</span>
          <span style={{
            fontWeight: typography.weights.semibold,
            color: '#92400e',
            fontSize: typography.sizes.sm
          }}>
            Pickup Availability
          </span>
        </div>

        {/* Red sub-box for each closed market */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {closedMarkets.map(market => {
            const marketTime = market.next_market_at
              ? formatMarketDateTime(market.next_market_at)
              : null

            return (
              <div
                key={market.market_id}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: '#fee2e2',
                  borderRadius: radius.sm,
                }}
              >
                <div style={{
                  fontWeight: typography.weights.bold,
                  color: '#991b1b',
                  fontSize: typography.sizes.sm,
                  marginBottom: spacing['3xs']
                }}>
                  Orders Currently Closed for:
                </div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  color: '#991b1b',
                  fontWeight: typography.weights.medium,
                  marginBottom: spacing['3xs']
                }}>
                  {market.market_name}
                </div>
                {marketTime && (
                  <div style={{
                    fontSize: typography.sizes.xs,
                    color: '#7f1d1d',
                    marginBottom: spacing['3xs']
                  }}>
                    Pickup: {marketTime}
                  </div>
                )}
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: '#7f1d1d',
                  lineHeight: 1.3
                }}>
                  Orders automatically close before market / pickup day to give vendors time to prepare their products & orders.
                </div>
              </div>
            )
          })}
        </div>

        {/* When orders reopen */}
        <div style={{
          marginTop: spacing.xs,
          fontSize: typography.sizes.xs,
          color: '#78350f',
          fontStyle: 'italic'
        }}>
          Orders reopen after the scheduled market / pickup time. Check back soon.
        </div>
      </div>
    )
  }

  // ONLY show banner if closing soon or mixed status - don't show when everything is open
  const shouldShow = closingSoonMarkets.length > 0 || hasMixedStatus

  if (!shouldShow) {
    return null
  }

  // Closing soon - yellow container with yellow sub-box for each closing soon market
  if (closingSoonMarkets.length > 0 && !hasMixedStatus) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: radius.md,
        marginBottom: spacing.sm
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginBottom: spacing.xs
        }}>
          <span style={{ fontSize: 18 }}>⏰</span>
          <span style={{
            fontWeight: typography.weights.semibold,
            color: '#92400e',
            fontSize: typography.sizes.sm
          }}>
            Pickup Availability
          </span>
        </div>

        {/* Yellow sub-box for each closing soon market */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {closingSoonMarkets.map(market => (
            <div
              key={market.market_id}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: '#fef3c7',
                borderRadius: radius.sm,
              }}
            >
              <div style={{
                fontWeight: typography.weights.bold,
                color: '#92400e',
                fontSize: typography.sizes.sm,
                marginBottom: spacing['3xs']
              }}>
                Orders close in {formatTimeRemaining(market.cutoff_at!)}
              </div>
              <div style={{
                fontSize: typography.sizes.xs,
                color: '#78350f'
              }}>
                {formatCutoffDateTime(market.cutoff_at!)}
              </div>
              <div style={{
                fontSize: typography.sizes.xs,
                color: '#92400e',
                marginTop: spacing['3xs']
              }}>
                Pickup at: {market.market_name}
              </div>
              <div style={{
                fontSize: typography.sizes.xs,
                color: '#78350f',
                marginTop: spacing.xs,
                lineHeight: 1.3
              }}>
                Orders automatically close before market / pickup day to give vendors time to prepare their products & orders.
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Mixed status - some open, some closed
  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: radius.md,
      marginBottom: spacing.sm
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs
      }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <span style={{
          fontWeight: typography.weights.semibold,
          color: '#92400e',
          fontSize: typography.sizes.sm
        }}>
          Pickup Availability
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
        {availability.markets.map(market => {
          // Use market's actual cutoff_hours policy (FT=0, private=10, traditional=18)
          const cutoffThreshold = market.cutoff_hours ?? (market.market_type === 'private_pickup' ? 10 : 18)
          const isClosingSoon = cutoffThreshold > 0 && market.is_accepting && market.cutoff_at &&
            (new Date(market.cutoff_at).getTime() - Date.now()) < cutoffThreshold * 60 * 60 * 1000

          // Closed market row
          if (!market.is_accepting) {
            return (
              <div
                key={market.market_id}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: '#fee2e2',
                  borderRadius: radius.sm,
                }}
              >
                <div style={{
                  fontWeight: typography.weights.bold,
                  color: '#991b1b',
                  fontSize: typography.sizes.sm,
                  marginBottom: spacing['3xs']
                }}>
                  Orders Currently Closed for:
                </div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  color: '#991b1b',
                  fontWeight: typography.weights.medium,
                  marginBottom: spacing['3xs']
                }}>
                  {market.market_name}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: '#7f1d1d',
                  lineHeight: 1.3
                }}>
                  Orders automatically close before market / pickup day to give vendors time to prepare their products & orders.
                </div>
              </div>
            )
          }

          // Closing soon market row
          if (isClosingSoon && market.cutoff_at) {
            return (
              <div
                key={market.market_id}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: '#fef3c7',
                  borderRadius: radius.sm,
                }}
              >
                <div style={{
                  fontWeight: typography.weights.bold,
                  color: '#92400e',
                  fontSize: typography.sizes.sm,
                  marginBottom: spacing['3xs']
                }}>
                  Orders close in {formatTimeRemaining(market.cutoff_at)}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: '#78350f'
                }}>
                  {formatCutoffDateTime(market.cutoff_at)}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: '#92400e',
                  marginTop: spacing['3xs']
                }}>
                  Pickup at: {market.market_name}
                </div>
              </div>
            )
          }

          // Open market (not closing soon) - skip showing these
          return null
        })}
      </div>

      {closedMarkets.length > 0 && openMarkets.length > 0 && (
        <div style={{
          marginTop: spacing.xs,
          fontSize: typography.sizes.xs,
          color: '#78350f',
          lineHeight: 1.4
        }}>
          If you missed the cutoff time for pre-orders, please visit the market in person or order this item to be picked up at another location.
        </div>
      )}
    </div>
  )
}
